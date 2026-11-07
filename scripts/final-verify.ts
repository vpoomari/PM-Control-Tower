// Final validation state check for PRJ-CZR-FLOW: must be pristine
// (no calendar row, no task constraints/deadlines) with stable engine values.
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const fid = 'cmvi061vv00djzng4rqwt22zn';

async function main() {
  const calendars = await db.projectCalendar.count({ where: { projectId: fid } });
  const constrained = await db.task.count({ where: { projectId: fid, NOT: [{ constraintType: 'ASAP' }] } });
  const withConstraintDate = await db.task.count({ where: { projectId: fid, constraintDate: { not: null } } });
  const withDeadline = await db.task.count({ where: { projectId: fid, deadline: { not: null } } });
  const tasks = await db.task.count({ where: { projectId: fid } });
  const critical = await db.task.count({ where: { projectId: fid, isCritical: true, isSummary: false } });
  const p = await db.project.findUnique({ where: { id: fid } });
  const t = await db.task.findFirst({ where: { projectId: fid, code: 'FLW-001' } });
  console.log(JSON.stringify({
    calendarRows: calendars,
    nonAsapConstraints: constrained,
    constraintDates: withConstraintDate,
    deadlines: withDeadline,
    taskCount: tasks,
    criticalCount: critical,
    projectStart: p?.startDate?.toISOString().slice(0, 10),
    projectFinish: p?.endDate?.toISOString().slice(0, 10),
    flw001: {
      constraintType: t?.constraintType,
      constraintDate: t?.constraintDate ?? null,
      deadline: t?.deadline ?? null,
      earliestStart: t?.earliestStart?.toISOString().slice(0, 10),
      totalFloat: t?.totalFloat,
    },
  }, null, 2));
}
main().finally(() => db.$disconnect());
