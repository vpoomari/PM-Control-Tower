import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const r = await db.portfolio.deleteMany({ where: { code: "PRTF-IMP-1" } });
console.log("deleted test portfolios:", r.count);
await db.$disconnect();
