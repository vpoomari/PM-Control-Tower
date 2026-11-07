// PM CONTROL TOWER — Export-only entities: audit-heavy or workflow-governed records that
// support full-fidelity export (every field) but are not bulk-importable through CSV.

import { db } from "@/lib/db";
import { isoStr, dateStr, projectByCode, required } from "./shared";
import type { EntityDef } from "./shared";
import { toNum, toStr } from "@/lib/csv";
import { rollupWbsActuals } from "@/lib/engines/rollup";

export const timesheets: EntityDef = {
  label: "Timesheets",
  viewPermission: "timesheet.own",
  columns: [
    { key: "id", label: "ID" },
    { key: "resourceCode", label: "Resource Code" },
    { key: "resourceName", label: "Resource Name" },
    { key: "resourceEmail", label: "Resource Email" },
    { key: "weekStart", label: "Week Start" },
    { key: "weekEnd", label: "Week End" },
    { key: "status", label: "Status" },
    { key: "totalHours", label: "Total Hours" },
    { key: "regularHours", label: "Regular Hours" },
    { key: "overtimeHours", label: "Overtime Hours" },
    { key: "billableHours", label: "Billable Hours" },
    { key: "nonBillableHours", label: "Non-Billable Hours" },
    { key: "leaveHours", label: "Leave Hours" },
    { key: "holidayHours", label: "Holiday Hours" },
    { key: "comments", label: "Comments" },
    { key: "approverEmail", label: "Approver Email" },
    { key: "submittedAt", label: "Submitted At" },
    { key: "approvedAt", label: "Approved At" },
    { key: "rejectionReason", label: "Rejection Reason" },
    { key: "lockedAt", label: "Locked At" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: {},
  exportRows: async (ctx) => {
    const rows = await db.timesheet.findMany({
      where: ctx.scopeAll ? {} : { resourceId: ctx.ownResourceId ?? "__none__" },
      include: { resource: true, approver: true },
      orderBy: [{ weekStart: "desc" }, { resourceId: "asc" }],
      take: 5000,
    });
    return rows.map((t) => ({
      id: t.id, resourceCode: t.resource.employeeCode, resourceName: t.resource.name,
      resourceEmail: t.resource.email, weekStart: dateStr(t.weekStart), weekEnd: dateStr(t.weekEnd),
      status: t.status, totalHours: t.totalHours, regularHours: t.regularHours,
      overtimeHours: t.overtimeHours, billableHours: t.billableHours, nonBillableHours: t.nonBillableHours,
      leaveHours: t.leaveHours, holidayHours: t.holidayHours, comments: t.comments ?? "",
      approverEmail: t.approver?.email ?? "", submittedAt: isoStr(t.submittedAt),
      approvedAt: isoStr(t.approvedAt), rejectionReason: t.rejectionReason ?? "",
      lockedAt: isoStr(t.lockedAt), createdAt: isoStr(t.createdAt), updatedAt: isoStr(t.updatedAt),
    }));
  },
  applyRow: async () => { throw new Error("Timesheets are approval-governed — import is not available"); },
};

export const timesheetEntries: EntityDef = {
  label: "Timesheet Entries",
  viewPermission: "timesheet.own",
  columns: [
    { key: "id", label: "ID" },
    { key: "resourceCode", label: "Resource Code" },
    { key: "resourceEmail", label: "Resource Email" },
    { key: "weekStart", label: "Week Start" },
    { key: "entryDate", label: "Entry Date" },
    { key: "projectCode", label: "Project Code" },
    { key: "taskCode", label: "Task Code" },
    { key: "workstream", label: "Workstream" },
    { key: "activity", label: "Activity" },
    { key: "startTime", label: "Start Time" },
    { key: "endTime", label: "End Time" },
    { key: "breakMinutes", label: "Break Minutes" },
    { key: "hours", label: "Hours" },
    { key: "regularHours", label: "Regular Hours" },
    { key: "overtimeHours", label: "Overtime Hours" },
    { key: "billableHours", label: "Billable Hours" },
    { key: "nonBillableHours", label: "Non-Billable Hours" },
    { key: "entryType", label: "Entry Type" },
    { key: "billable", label: "Billable" },
    { key: "comments", label: "Comments" },
    { key: "createdAt", label: "Created At" },
  ],
  example: {},
  exportRows: async (ctx) => {
    const rows = await db.timesheetEntry.findMany({
      where: ctx.scopeAll ? {} : { timesheet: { resourceId: ctx.ownResourceId ?? "__none__" } },
      include: { timesheet: { include: { resource: true } }, project: true, task: true },
      orderBy: [{ entryDate: "desc" }],
      take: 10000,
    });
    return rows.map((e) => ({
      id: e.id, resourceCode: e.timesheet.resource.employeeCode,
      resourceEmail: e.timesheet.resource.email, weekStart: dateStr(e.timesheet.weekStart),
      entryDate: dateStr(e.entryDate), projectCode: e.project?.code ?? "", taskCode: e.task?.code ?? "",
      workstream: e.workstream ?? "", activity: e.activity ?? "", startTime: e.startTime ?? "",
      endTime: e.endTime ?? "", breakMinutes: e.breakMinutes, hours: e.hours,
      regularHours: e.regularHours, overtimeHours: e.overtimeHours, billableHours: e.billableHours,
      nonBillableHours: e.nonBillableHours, entryType: e.entryType,
      billable: e.billable ? "TRUE" : "FALSE", comments: e.comments ?? "", createdAt: isoStr(e.createdAt),
    }));
  },
  applyRow: async () => { throw new Error("Timesheet entries are approval-governed — import is not available"); },
};

export const evmPeriods: EntityDef = {
  label: "EVM Periods",
  viewPermission: "evm.view",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "statusDate", label: "Status Date" },
    { key: "periodStart", label: "Period Start" },
    { key: "periodEnd", label: "Period End" },
    { key: "bac", label: "BAC" },
    { key: "pv", label: "PV" },
    { key: "ev", label: "EV" },
    { key: "ac", label: "AC" },
    { key: "cpi", label: "CPI" },
    { key: "spi", label: "SPI" },
    { key: "eac", label: "EAC" },
    { key: "etc", label: "ETC" },
    { key: "vac", label: "VAC" },
    { key: "tcpi", label: "TCPI" },
    { key: "costVariance", label: "Cost Variance" },
    { key: "scheduleVariance", label: "Schedule Variance" },
    { key: "percentComplete", label: "Percent Complete" },
    { key: "source", label: "Source" },
    { key: "createdAt", label: "Created At" },
  ],
  example: {},
  exportRows: async () => {
    const rows = await db.evmPeriod.findMany({ include: { project: true }, orderBy: [{ projectId: "asc" }, { statusDate: "asc" }] });
    return rows.map((p) => ({
      id: p.id, projectCode: p.project.code, statusDate: dateStr(p.statusDate),
      periodStart: dateStr(p.periodStart), periodEnd: dateStr(p.periodEnd),
      bac: p.bac, pv: p.pv, ev: p.ev, ac: p.ac, cpi: p.cpi, spi: p.spi, eac: p.eac, etc: p.etc,
      vac: p.vac, tcpi: p.tcpi, costVariance: p.costVariance, scheduleVariance: p.scheduleVariance,
      percentComplete: p.percentComplete, source: p.source, createdAt: isoStr(p.createdAt),
    }));
  },
  applyRow: async () => { throw new Error("EVM periods are engine-calculated — import is not available"); },
};

export const stageGates: EntityDef = {
  label: "Stage Gates",
  viewPermission: "project.view",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "code", label: "Code" },
    { key: "sequence", label: "Sequence" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "criteria", label: "Criteria" },
    { key: "plannedDate", label: "Planned Date" },
    { key: "decisionStatus", label: "Decision Status" },
    { key: "decisionDate", label: "Decision Date" },
    { key: "approverName", label: "Approver Name" },
    { key: "evidence", label: "Evidence" },
    { key: "comments", label: "Comments" },
    { key: "createdAt", label: "Created At" },
  ],
  example: {},
  exportRows: async () => {
    const rows = await db.stageGate.findMany({ include: { project: true }, orderBy: [{ projectId: "asc" }, { sequence: "asc" }] });
    return rows.map((g) => ({
      id: g.id, projectCode: g.project.code, code: g.code, sequence: g.sequence, name: g.name,
      description: g.description ?? "", criteria: g.criteria ?? "", plannedDate: dateStr(g.plannedDate),
      decisionStatus: g.decisionStatus, decisionDate: dateStr(g.decisionDate),
      approverName: g.approverName ?? "", evidence: g.evidence ?? "", comments: g.comments ?? "",
      createdAt: isoStr(g.createdAt),
    }));
  },
  applyRow: async () => { throw new Error("Stage gates are decision records — import is not available"); },
};

export const baselines: EntityDef = {
  label: "Baselines",
  viewPermission: "project.view",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "version", label: "Version" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status" },
    { key: "baselineStart", label: "Baseline Start" },
    { key: "baselineFinish", label: "Baseline Finish" },
    { key: "baselineHours", label: "Baseline Hours" },
    { key: "baselineCost", label: "Baseline Cost" },
    { key: "activatedAt", label: "Activated At" },
    { key: "createdBy", label: "Created By" },
    { key: "createdAt", label: "Created At" },
  ],
  example: {},
  exportRows: async () => {
    const rows = await db.baseline.findMany({ include: { project: true }, orderBy: [{ projectId: "asc" }, { version: "desc" }] });
    return rows.map((b) => ({
      id: b.id, projectCode: b.project.code, version: b.version, name: b.name,
      description: b.description ?? "", status: b.status,
      baselineStart: dateStr(b.baselineStart), baselineFinish: dateStr(b.baselineFinish),
      baselineHours: b.baselineHours, baselineCost: b.baselineCost,
      activatedAt: isoStr(b.activatedAt), createdBy: b.createdBy ?? "",
      createdAt: isoStr(b.createdAt),
    }));
  },
  applyRow: async () => { throw new Error("Baselines are versioned snapshots — import is not available"); },
};

export const wbsNodes: EntityDef = {
  label: "WBS Nodes",
  viewPermission: "project.view",
  managePermission: "wbs.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "parentCode", label: "Parent Code" },
    { key: "nodeType", label: "Node Type" },
    { key: "level", label: "Level" },
    { key: "orderIndex", label: "Order Index" },
    { key: "ownerName", label: "Owner Name" },
    { key: "plannedHours", label: "Planned Hours" },
    { key: "plannedCost", label: "Planned Cost" },
    { key: "actualHours", label: "Actual Hours" },
    { key: "actualCost", label: "Actual Cost" },
    { key: "progress", label: "Progress" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: {
    "Project Code": "PRJ-ERP-001", Code: "1", Name: "Phase 1 — Foundation", Description: "Example summary row",
    "Parent Code": "", "Node Type": "SUMMARY", Level: "1", "Order Index": "1", "Owner Name": "",
    "Planned Hours": "0", "Planned Cost": "0", "Actual Hours": "0", "Actual Cost": "0", Progress: "0",
    "Created At": "", "Updated At": "",
  },
  exportRows: async () => {
    const rows = await db.wBSNode.findMany({ include: { project: true, parent: true }, orderBy: [{ projectId: "asc" }, { orderIndex: "asc" }] });
    return rows.map((w) => ({
      id: w.id, projectCode: w.project.code, code: w.code, name: w.name,
      description: w.description ?? "", parentCode: w.parent?.code ?? "", nodeType: w.nodeType,
      level: w.level, orderIndex: w.orderIndex, ownerName: w.ownerName ?? "",
      plannedHours: w.plannedHours, plannedCost: w.plannedCost, actualHours: w.actualHours,
      actualCost: w.actualCost, progress: w.progress, createdAt: isoStr(w.createdAt), updatedAt: isoStr(w.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const project = await projectByCode(tx, toStr(row["Project Code"]));
    const code = required(row, "Code");
    const name = required(row, "Name");

    const nodeType = toStr(row["Node Type"]);
    if (nodeType && nodeType !== "SUMMARY" && nodeType !== "WORK_PACKAGE") {
      throw new Error(`Node Type must be SUMMARY or WORK_PACKAGE (got "${nodeType}")`);
    }
    const progressRaw = toStr(row["Progress"]);
    let progress: number | undefined;
    if (progressRaw !== null) {
      progress = toNum(progressRaw, 0);
      if (progress < 0 || progress > 100) throw new Error(`Progress must be between 0 and 100 (got "${progressRaw}")`);
    }
    const orderRaw = toStr(row["Order Index"]);
    let orderIndex: number | undefined;
    if (orderRaw !== null) {
      orderIndex = Number(orderRaw);
      if (!Number.isInteger(orderIndex) || orderIndex < 0) {
        throw new Error(`Order Index must be a non-negative integer (got "${orderRaw}")`);
      }
    }

    const existing = await tx.wBSNode.findFirst({ where: { projectId: project.id, code } });
    const parentCode = toStr(row["Parent Code"]);

    // Resolve the parent: an earlier row of this file (already written in this transaction)
    // or a node that exists already. Empty Parent Code keeps the current parent on update.
    let parent: { id: string; level: number } | null = null;
    if (parentCode) {
      if (parentCode === code) throw new Error("A node cannot be its own parent");
      const p = await tx.wBSNode.findFirst({ where: { projectId: project.id, code: parentCode }, select: { id: true, level: true, parentId: true } });
      if (!p) throw new Error(`Parent node "${parentCode}" not found in ${project.code} — parent rows must appear before their children (or exist already)`);
      // Cycle guard, mirroring the PATCH move: walk the proposed parent's ancestor chain.
      let cursor = p.parentId;
      let depth = 0;
      while (cursor && depth < 100) {
        if (existing && cursor === existing.id) throw new Error(`Move rejected: parent "${parentCode}" is a descendant of "${code}" (cycle)`);
        const up = await tx.wBSNode.findUnique({ where: { id: cursor }, select: { parentId: true } });
        cursor = up?.parentId ?? null;
        depth += 1;
      }
      parent = { id: p.id, level: p.level };
    }

    if (existing) {
      // Reparenting only happens when Parent Code is provided; level always follows the
      // (new) parent. Order Index defaults to max+1 among the new siblings on a move.
      let orderIndexFinal = orderIndex;
      if (parent && orderIndexFinal === undefined && parent.id !== existing.parentId) {
        const siblings = await tx.wBSNode.findMany({ where: { projectId: project.id, parentId: parent.id, NOT: { id: existing.id } }, select: { orderIndex: true } });
        orderIndexFinal = siblings.reduce((m, s) => Math.max(m, s.orderIndex), 0) + 1;
      }
      const n = await tx.wBSNode.update({
        where: { id: existing.id },
        data: {
          name,
          description: toStr(row.Description),
          nodeType: nodeType ?? undefined,
          ...(parent ? { parentId: parent.id, level: parent.level + 1 } : {}),
          ...(orderIndexFinal !== undefined ? { orderIndex: orderIndexFinal } : {}),
          ownerName: toStr(row["Owner Name"]),
          plannedHours: row["Planned Hours"] === "" ? undefined : toNum(row["Planned Hours"], 0),
          plannedCost: row["Planned Cost"] === "" ? undefined : toNum(row["Planned Cost"], 0),
          ...(progress !== undefined ? { progress } : {}),
        },
      });
      return { action: "updated" as const, id: n.id, name: `${code} ${n.name}` };
    }

    const level = parent ? parent.level + 1 : 1;
    let orderIndexFinal = orderIndex;
    if (orderIndexFinal === undefined) {
      const siblings = await tx.wBSNode.findMany({ where: { projectId: project.id, parentId: parent?.id ?? null }, select: { orderIndex: true } });
      orderIndexFinal = siblings.reduce((m, s) => Math.max(m, s.orderIndex), 0) + 1;
    }
    const n = await tx.wBSNode.create({
      data: {
        projectId: project.id, code, parentId: parent?.id ?? null, name,
        description: toStr(row.Description),
        nodeType: nodeType ?? "WORK_PACKAGE",
        level, orderIndex: orderIndexFinal,
        ownerName: toStr(row["Owner Name"]),
        plannedHours: toNum(row["Planned Hours"], 0),
        plannedCost: toNum(row["Planned Cost"], 0),
        actualHours: toNum(row["Actual Hours"], 0),
        actualCost: toNum(row["Actual Cost"], 0),
        progress: progress ?? 0,
      },
    });
    return { action: "created" as const, id: n.id, name: `${code} ${n.name}` };
  },
  finalize: async (tx, rows) => {
    // Summary nodes carry rolled-up hours/cost/progress — recompute per affected project
    // so imported trees are consistent with their children (and project planned hours).
    const projectCodes = new Set(rows.map((r) => toStr(r["Project Code"])).filter((c): c is string => Boolean(c)));
    for (const projectCode of projectCodes) {
      const p = await tx.project.findUnique({ where: { code: projectCode }, select: { id: true } });
      if (p) await rollupWbsActuals(p.id, tx);
    }
  },
};

export const healthSnapshots: EntityDef = {
  label: "Health Snapshots",
  viewPermission: "evm.view",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "capturedAt", label: "Captured At" },
    { key: "healthScore", label: "Health Score" },
    { key: "ragStatus", label: "RAG Status" },
    { key: "cpi", label: "CPI" },
    { key: "spi", label: "SPI" },
    { key: "costVariance", label: "Cost Variance" },
    { key: "scheduleVariance", label: "Schedule Variance" },
    { key: "eac", label: "EAC" },
    { key: "bac", label: "BAC" },
    { key: "openRisks", label: "Open Risks" },
    { key: "openIssues", label: "Open Issues" },
    { key: "overdueMilestones", label: "Overdue Milestones" },
    { key: "resourceUtilization", label: "Resource Utilization" },
    { key: "triggeredBy", label: "Triggered By" },
    { key: "notes", label: "Notes" },
  ],
  example: {},
  exportRows: async () => {
    const rows = await db.projectHealthSnapshot.findMany({ include: { project: true }, orderBy: { capturedAt: "desc" }, take: 10000 });
    return rows.map((s) => ({
      id: s.id, projectCode: s.project.code, capturedAt: isoStr(s.capturedAt),
      healthScore: s.healthScore, ragStatus: s.ragStatus, cpi: s.cpi, spi: s.spi,
      costVariance: s.costVariance, scheduleVariance: s.scheduleVariance, eac: s.eac, bac: s.bac,
      openRisks: s.openRisks, openIssues: s.openIssues, overdueMilestones: s.overdueMilestones,
      resourceUtilization: s.resourceUtilization, triggeredBy: s.triggeredBy, notes: s.notes ?? "",
    }));
  },
  applyRow: async () => { throw new Error("Health snapshots are engine-generated — import is not available"); },
};

export const governanceRules: EntityDef = {
  label: "Governance Rules",
  viewPermission: "project.view",
  columns: [
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "metric", label: "Metric" },
    { key: "operator", label: "Operator" },
    { key: "threshold", label: "Threshold" },
    { key: "severity", label: "Severity" },
    { key: "scopeType", label: "Scope Type" },
    { key: "scopeProjectCode", label: "Scope Project Code" },
    { key: "isActive", label: "Is Active" },
    { key: "actionNotify", label: "Action Notify" },
    { key: "actionInbox", label: "Action Inbox" },
    { key: "actionRecalcHealth", label: "Action Recalc Health" },
    { key: "executionCount", label: "Execution Count" },
    { key: "lastTriggeredAt", label: "Last Triggered At" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: {},
  exportRows: async () => {
    const rows = await db.governanceRule.findMany({ orderBy: { name: "asc" } });
    const projectIds = rows.map((r) => r.scopeId).filter((v): v is string => Boolean(v));
    const projects = projectIds.length ? await db.project.findMany({ where: { id: { in: projectIds } } }) : [];
    const codeById = new Map(projects.map((p) => [p.id, p.code]));
    return rows.map((r) => ({
      id: r.id, name: r.name, description: r.description ?? "", metric: r.metric, operator: r.operator,
      threshold: r.threshold, severity: r.severity, scopeType: r.scopeType,
      scopeProjectCode: codeById.get(r.scopeId ?? "") ?? "", isActive: r.isActive ? "TRUE" : "FALSE",
      actionNotify: r.actionNotify ? "TRUE" : "FALSE", actionInbox: r.actionInbox ? "TRUE" : "FALSE",
      actionRecalcHealth: r.actionRecalcHealth ? "TRUE" : "FALSE",
      executionCount: r.executionCount, lastTriggeredAt: isoStr(r.lastTriggeredAt),
      createdAt: isoStr(r.createdAt), updatedAt: isoStr(r.updatedAt),
    }));
  },
  applyRow: async () => { throw new Error("Governance rules are controlled in the Governance Center — import is not available"); },
};

export const alerts: EntityDef = {
  label: "Governance Alerts",
  viewPermission: "project.view",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "ruleName", label: "Rule Name" },
    { key: "alertType", label: "Alert Type" },
    { key: "severity", label: "Severity" },
    { key: "title", label: "Title" },
    { key: "message", label: "Message" },
    { key: "metricValue", label: "Metric Value" },
    { key: "threshold", label: "Threshold" },
    { key: "status", label: "Status" },
    { key: "acknowledgedBy", label: "Acknowledged By" },
    { key: "acknowledgedAt", label: "Acknowledged At" },
    { key: "resolvedAt", label: "Resolved At" },
    { key: "source", label: "Source" },
    { key: "createdAt", label: "Created At" },
  ],
  example: {},
  exportRows: async () => {
    const rows = await db.alertEvent.findMany({ include: { project: true }, orderBy: { createdAt: "desc" }, take: 10000 });
    const ruleIds = rows.map((a) => a.ruleId).filter((v): v is string => Boolean(v));
    const rules = ruleIds.length ? await db.governanceRule.findMany({ where: { id: { in: ruleIds } } }) : [];
    const nameById = new Map(rules.map((r) => [r.id, r.name]));
    return rows.map((a) => ({
      id: a.id, projectCode: a.project?.code ?? "", ruleName: nameById.get(a.ruleId ?? "") ?? "",
      alertType: a.alertType, severity: a.severity, title: a.title, message: a.message ?? "",
      metricValue: a.metricValue ?? "", threshold: a.threshold ?? "", status: a.status,
      acknowledgedBy: a.acknowledgedBy ?? "", acknowledgedAt: isoStr(a.acknowledgedAt),
      resolvedAt: isoStr(a.resolvedAt), source: a.source, createdAt: isoStr(a.createdAt),
    }));
  },
  applyRow: async () => { throw new Error("Alerts are engine-generated — import is not available"); },
};

export const auditEvents: EntityDef = {
  label: "Audit Trail",
  viewPermission: "admin.audit",
  columns: [
    { key: "id", label: "ID" },
    { key: "action", label: "Action" },
    { key: "entityType", label: "Entity Type" },
    { key: "entityId", label: "Entity ID" },
    { key: "entityName", label: "Entity Name" },
    { key: "userName", label: "User Name" },
    { key: "role", label: "Role" },
    { key: "severity", label: "Severity" },
    { key: "context", label: "Context" },
    { key: "ipAddress", label: "IP Address" },
    { key: "createdAt", label: "Created At" },
  ],
  example: {},
  exportRows: async () => {
    const rows = await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 10000 });
    return rows.map((a) => ({
      id: a.id, action: a.action, entityType: a.entityType, entityId: a.entityId ?? "",
      entityName: a.entityName ?? "", userName: a.userName ?? "", role: a.role ?? "",
      severity: a.severity, context: a.context ?? "", ipAddress: a.ipAddress ?? "",
      createdAt: isoStr(a.createdAt),
    }));
  },
  applyRow: async () => { throw new Error("Audit events are immutable — import is not available"); },
};
