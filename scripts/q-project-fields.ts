import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const p = await db.project.findUnique({ where: { id: 'cmvi061vv00djzng4rqwt22zn' } });
  console.log(JSON.stringify({
    phase: p?.phase, methodology: p?.methodology, riskLevel: p?.riskLevel,
    billingType: p?.billingType, currency: p?.currency, status: p?.status, priority: p?.priority,
    programId: p?.programId, portfolioId: p?.portfolioId, ownerId: p?.ownerId,
    managerId: p?.managerId, sponsorId: p?.sponsorId,
    startDate: p?.startDate?.toISOString().slice(0, 10), endDate: p?.endDate?.toISOString().slice(0, 10),
    baselineStart: p?.baselineStart?.toISOString().slice(0, 10), baselineFinish: p?.baselineFinish?.toISOString().slice(0, 10),
    statusDate: p?.statusDate?.toISOString().slice(0, 10),
    currentBudget: p?.currentBudget, baselineBudget: p?.baselineBudget, forecastCost: p?.forecastCost,
    charter: (p?.charter || '').slice(0, 40), objectives: (p?.objectives || '').slice(0, 40), successCriteria: (p?.successCriteria || '').slice(0, 40),
    description: (p?.description || '').slice(0, 40),
  }, null, 1));
}
main().finally(() => db.$disconnect());
