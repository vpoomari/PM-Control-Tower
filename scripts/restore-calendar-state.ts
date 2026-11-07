// Restore FLOW to pristine calendar state: remove the validation calendar row
// and run one final legacy-space reschedule so persisted values are stable.
import { PrismaClient } from '@prisma/client';
import { rescheduleProject } from '../src/lib/engines/rollup';

const db = new PrismaClient();
async function main() {
  const fid = 'cmvi061vv00djzng4rqwt22zn';
  const del = await db.projectCalendar.deleteMany({ where: { projectId: fid } });
  console.log('calendar rows deleted:', del.count);
  const r = await rescheduleProject(fid);
  console.log('final reschedule:', JSON.stringify(r));
  const p = await db.project.findUnique({ where: { id: fid } });
  console.log('finish:', p?.endDate?.toISOString().slice(0, 10));
  const t = await db.task.findFirst({ where: { projectId: fid, code: 'FLW-272' } });
  console.log('FLW-272:', t?.earliestStart?.toISOString().slice(0, 10), '->', t?.earliestFinish?.toISOString().slice(0, 10), 'float', t?.totalFloat);
}
main().finally(() => db.$disconnect());
