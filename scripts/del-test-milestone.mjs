import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const r = await db.milestone.deleteMany({ where: { code: "MS-IMP-TEST" } });
console.log("deleted test milestones:", r.count);
await db.$disconnect();
