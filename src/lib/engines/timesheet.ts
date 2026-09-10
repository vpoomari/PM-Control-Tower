// PM CONTROL TOWER — Timesheet Workflow & Actuals Cascade
// Draft → Submitted → Manager Review → Approved / Rejected → Locked
// Approval cascades: Task actuals → WBS roll-up → Project actuals → Resource
// utilization → Labor cost → Budget → EVM → Forecast → Health → Governance.

import { db } from "../db";
import { startOfWeek, addDays, round2 } from "../constants";
import { computeEVM } from "./evm";
import { recalcProjectHealth } from "./health";
import { evaluateGovernance } from "./governance";
import { rollupWbsActuals, rescheduleProject } from "./rollup";
import { emitRealtime, projectRoom } from "../realtime";
import { writeAudit } from "../audit";
import { ApiError } from "../errors";
import { runAutomations } from "./automations";

interface Actor { id: string; name: string; role: string }

export async function ensureWeekTimesheet(resourceId: string, weekStart?: Date | string) {
  const ws = startOfWeek(weekStart || new Date());
  const we = addDays(ws, 6);
  let ts = await db.timesheet.findUnique({
    where: { resourceId_weekStart: { resourceId, weekStart: ws } },
    include: { entries: true, resource: true, approver: true },
  });
  if (!ts) {
    ts = await db.timesheet.create({
      data: { resourceId, weekStart: ws, weekEnd: we, status: "DRAFT" },
      include: { entries: true, resource: true, approver: true },
    });
  }
  return ts;
}

export async function submitTimesheet(id: string, actor: Actor, ip?: string) {
  const ts = await db.timesheet.findUnique({ where: { id }, include: { entries: true } });
  if (!ts) throw new ApiError(404, "Timesheet not found");
  if (!["DRAFT", "REJECTED"].includes(ts.status)) throw new ApiError(409, `Cannot submit from status ${ts.status}`);
  if (!ts.entries.length) throw new ApiError(409, "Cannot submit an empty timesheet");

  const totals = await recomputeTimesheetTotals(id);
  const updated = await db.timesheet.update({
    where: { id },
    data: { status: "SUBMITTED", submittedAt: new Date(), ...totals },
    include: { entries: true, resource: true },
  });

  // Route to approver (resource manager or PMO)
  const approvers = await db.user.findMany({
    where: { isActive: true, userRoles: { some: { role: { code: { in: ["PROJECT_MANAGER", "PROGRAM_MANAGER", "PMO_ADMIN"] } } } } },
    select: { id: true },
  });
  for (const a of approvers) {
    await db.inboxItem.create({
      data: {
        userId: a.id, category: "APPROVALS", title: `Timesheet approval — ${updated.resource.name} (${updated.weekStart.toISOString().slice(0, 10)})`,
        message: `${round2(updated.totalHours)}h submitted across ${updated.entries.length} entries. Review and approve.`,
        entityType: "Timesheet", entityId: id, projectId: updated.entries[0]?.projectId || null,
        priority: "HIGH", actionUrl: "#/timesheets/approvals", sourceType: "TIMESHEET",
      },
    });
    await db.notification.create({
      data: { userId: a.id, notifType: "TIMESHEET", category: "TIMESHEET", title: "Timesheet awaiting approval", message: `${updated.resource.name} submitted ${round2(updated.totalHours)}h.`, entityType: "Timesheet", entityId: id, severity: "INFO", actionUrl: "#/timesheets/approvals" },
    });
  }
  await db.approval.create({
    data: { entityType: "Timesheet", entityId: id, projectId: updated.entries[0]?.projectId || null, approvalType: "TIMESHEET", requesterId: ts.userId, approverId: approvers[0]?.id, status: "PENDING" },
  });
  emitRealtime("timesheet:submitted", { timesheetId: id, resourceId: ts.resourceId, hours: updated.totalHours }, `user:${actor.id}`);
  await writeAudit({ userId: actor.id, userName: actor.name, role: actor.role, action: "SUBMIT", entityType: "Timesheet", entityId: id, entityName: `Week of ${ts.weekStart.toISOString().slice(0, 10)}`, after: { status: "SUBMITTED", hours: updated.totalHours }, ipAddress: ip });
  await runAutomations("TIMESHEET_SUBMITTED", { entityType: "Timesheet", entityId: id, timesheetId: id });
  return updated;
}

export async function approveTimesheet(id: string, actor: Actor, comments?: string, ip?: string) {
  const ts = await db.timesheet.findUnique({ where: { id }, include: { entries: true, resource: true } });
  if (!ts) throw new ApiError(404, "Timesheet not found");
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(ts.status)) throw new ApiError(409, `Cannot approve from status ${ts.status}`);

  await db.timesheet.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), reviewedAt: new Date(), approverId: actor.id, comments: comments || ts.comments } });
  await db.approval.updateMany({ where: { entityType: "Timesheet", entityId: id, status: "PENDING" }, data: { status: "APPROVED", decision: "APPROVED", decisionDate: new Date(), approverId: actor.id, comments } });

  // ---- THE CASCADE: approved actuals flow through the source of truth ----
  const affectedProjects = new Set<string>();
  for (const e of ts.entries) {
    if (!e.projectId || e.entryType === "LEAVE" || e.entryType === "HOLIDAY") continue;
    affectedProjects.add(e.projectId);
    const costRate = ts.resource.costRate || 0;
    if (e.taskId) {
      const task = await db.task.findUnique({ where: { id: e.taskId } });
      if (task) {
        await db.task.update({
          where: { id: e.taskId },
          data: {
            actualHours: round2(task.actualHours + e.hours),
            actualCost: round2(task.actualCost + e.hours * costRate),
            status: task.status === "NOT_STARTED" ? "IN_PROGRESS" : task.status,
            progress: task.plannedHours > 0 ? Math.min(100, round2(((task.actualHours + e.hours) / task.plannedHours) * 100)) : task.progress,
          },
        });
      }
    }
    if (e.wbsId) {
      await db.wBSNode.update({ where: { id: e.wbsId }, data: { actualHours: { increment: e.hours }, actualCost: { increment: e.hours * costRate } } }).catch(() => undefined);
    }
    await db.assignment.updateMany({
      where: { projectId: e.projectId, resourceId: ts.resourceId },
      data: { actualHours: { increment: e.hours } },
    });
  }

  // Project-level actuals + labor budget lines + EVM + Health + Governance
  for (const pid of affectedProjects) {
    const laborHours = ts.entries.filter((e) => e.projectId === pid).reduce((s, e) => s + e.hours, 0);
    const laborCost = laborHours * (ts.resource.costRate || 0);
    await db.project.update({ where: { id: pid }, data: { actualHours: { increment: laborHours }, actualCost: { increment: laborCost } } });
    const bl = await db.budgetLine.findFirst({ where: { projectId: pid, category: "LABOR", name: "Labor (actualized)" } });
    if (bl) await db.budgetLine.update({ where: { id: bl.id }, data: { actualAmount: { increment: laborCost } } });
    else await db.budgetLine.create({ data: { projectId: pid, category: "LABOR", name: "Labor (actualized)", actualAmount: laborCost } });

    const project = await db.project.findUnique({ where: { id: pid }, include: { tasks: true } });
    if (project) {
      // Current EVM state reflects the new actuals immediately (computed on read);
      // historical EVM periods are persisted via explicit snapshots / period close.
      const evm = computeEVM(project.tasks, project.actualCost, project.currentBudget || project.baselineBudget || null, project.statusDate || new Date());
      await rollupWbsActuals(pid);
      await rescheduleProject(pid);
      await recalcProjectHealth(pid, "TIMESHEET_APPROVAL");
      await evaluateGovernance(pid);
      emitRealtime("actuals:changed", { projectId: pid, hours: laborHours, cost: laborCost }, projectRoom(pid));
      emitRealtime("evm:changed", { projectId: pid, cpi: evm.cpi, spi: evm.spi, eac: evm.eac }, projectRoom(pid));
    }
  }

  emitRealtime("timesheet:approved", { timesheetId: id, resourceId: ts.resourceId }, projectRoom(affectedProjects.values().next().value || ""));
  await writeAudit({ userId: actor.id, userName: actor.name, role: actor.role, action: "APPROVE", entityType: "Timesheet", entityId: id, before: { status: ts.status }, after: { status: "APPROVED", projects: [...affectedProjects] }, ipAddress: ip });
  await runAutomations("TIMESHEET_APPROVED", { entityType: "Timesheet", entityId: id, timesheetId: id, projects: [...affectedProjects] });
  return db.timesheet.findUnique({ where: { id }, include: { entries: true } });
}

export async function rejectTimesheet(id: string, actor: Actor, reason: string, ip?: string) {
  const ts = await db.timesheet.findUnique({ where: { id }, include: { resource: true } });
  if (!ts) throw new ApiError(404, "Timesheet not found");
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(ts.status)) throw new ApiError(409, `Cannot reject from status ${ts.status}`);
  await db.timesheet.update({ where: { id }, data: { status: "REJECTED", rejectionReason: reason, reviewedAt: new Date(), approverId: actor.id } });
  await db.approval.updateMany({ where: { entityType: "Timesheet", entityId: id, status: "PENDING" }, data: { status: "REJECTED", decision: "REJECTED", decisionDate: new Date(), approverId: actor.id, comments: reason } });
  if (ts.userId) {
    await db.notification.create({
      data: { userId: ts.userId, notifType: "TIMESHEET", category: "TIMESHEET", title: "Timesheet rejected", message: reason, entityType: "Timesheet", entityId: id, severity: "WARNING", actionUrl: "#/timesheets" },
    });
    await db.inboxItem.create({
      data: { userId: ts.userId, category: "ACTION_REQUIRED", title: `Timesheet rejected — week of ${ts.weekStart.toISOString().slice(0, 10)}`, message: reason, entityType: "Timesheet", entityId: id, priority: "HIGH", actionUrl: "#/timesheets", sourceType: "TIMESHEET" },
    });
  }
  emitRealtime("timesheet:submitted", { timesheetId: id, status: "REJECTED" });
  await writeAudit({ userId: actor.id, userName: actor.name, role: actor.role, action: "REJECT", entityType: "Timesheet", entityId: id, after: { status: "REJECTED", reason }, ipAddress: ip });
  return db.timesheet.findUnique({ where: { id }, include: { entries: true } });
}

export async function lockTimesheet(id: string, actor: Actor, ip?: string) {
  const ts = await db.timesheet.findUnique({ where: { id } });
  if (!ts) throw new ApiError(404, "Timesheet not found");
  if (ts.status !== "APPROVED") throw new ApiError(409, "Only approved timesheets can be locked");
  await db.timesheet.update({ where: { id }, data: { status: "LOCKED", lockedAt: new Date() } });
  await writeAudit({ userId: actor.id, userName: actor.name, role: actor.role, action: "UPDATE", entityType: "Timesheet", entityId: id, after: { status: "LOCKED" }, ipAddress: ip });
  return db.timesheet.findUnique({ where: { id }, include: { entries: true } });
}

export async function recomputeTimesheetTotals(id: string) {
  const ts = await db.timesheet.findUnique({ where: { id }, include: { entries: true } });
  if (!ts) throw new ApiError(404, "Timesheet not found");
  const total = ts.entries.reduce((s, e) => s + e.hours, 0);
  const overtime = ts.entries.reduce((s, e) => s + (e.overtimeHours || 0), 0);
  const billable = ts.entries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0);
  const leave = ts.entries.filter((e) => e.entryType === "LEAVE").reduce((s, e) => s + e.hours, 0);
  const holiday = ts.entries.filter((e) => e.entryType === "HOLIDAY").reduce((s, e) => s + e.hours, 0);
  return {
    totalHours: round2(total),
    regularHours: round2(Math.max(0, total - overtime)),
    overtimeHours: round2(overtime),
    billableHours: round2(billable),
    nonBillableHours: round2(total - billable),
    leaveHours: round2(leave),
    holidayHours: round2(holiday),
  };
}
