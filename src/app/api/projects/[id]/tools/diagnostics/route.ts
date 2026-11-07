// PM CONTROL TOWER — Planning Lab: Schedule Doctor API
// GET /api/projects/[id]/tools/diagnostics — full plan audit over LIVE data:
//   fresh CPM pass (constraints/deadlines honored) + working-calendar context +
//   9 diagnostic findings + unique Schedule Health Index (0-100).

import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { scheduleInputs } from "@/lib/engines/rollup";
import { runDoctor, DoctorResult } from "@/lib/engines/doctor";

export const GET = withApi(async (ctx) => {
  const { id } = ctx.params;
  const inputs = await scheduleInputs(id);
  if (!inputs || !inputs.project) throw new ApiError(404, "Project not found (or has no schedulable tasks)");
  const { project, cal, calOn, cpm } = inputs;

  const docTasks = project.tasks.map((t) => {
    const r = cpm.get(t.id);
    return {
      id: t.id, code: t.code, name: t.name, durationDays: t.durationDays,
      status: t.status, progress: t.progress, plannedHours: t.plannedHours,
      assigneeId: t.assigneeId, wbsId: t.wbsId,
      constraintType: (r?.violationDays ?? 0) > 0 ? (t.constraintType || "ASAP") : null,
      constraintDate: t.constraintDate,
      deadline: t.deadline,
      startDate: t.startDate, endDate: t.endDate,
      earliestStart: t.earliestStart, earliestFinish: t.earliestFinish,
      totalFloat: t.totalFloat, freeFloat: t.freeFloat, isCritical: t.isCritical, isSummary: t.isSummary,
      violationDays: r?.violationDays ?? 0,
    };
  });
  const deps = project.dependencies.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId }));
  const doctor: DoctorResult = runDoctor(docTasks, deps, calOn ? cal : null, project.statusDate);

  const leaves = docTasks.filter((t) => !t.isSummary);
  const stats = {
    leafTasks: leaves.length,
    summaryTasks: docTasks.length - leaves.length,
    criticalCount: leaves.filter((t) => t.isCritical).length,
    flaggedCount: doctor.findings.reduce((s, f) => s + f.items.length, 0),
    constrainedCount: project.tasks.filter((t) => (t.constraintType || "ASAP") !== "ASAP" && t.constraintDate).length,
    deadlinedCount: project.tasks.filter((t) => t.deadline).length,
    calendarName: cal.name ?? "Continuous (7-day)",
    calendarConfigured: calOn,
    projectStart: project.startDate?.toISOString() ?? null,
    projectFinish: project.endDate?.toISOString() ?? null,
    statusDate: project.statusDate?.toISOString() ?? null,
  };

  return ok({ projectId: id, doctor, stats });
}, { permission: "project.view", rateLimit: { limit: 120, windowMs: 60_000 } });
