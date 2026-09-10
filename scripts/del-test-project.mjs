import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const p = await db.project.deleteMany({ where: { code: "MS-IMP-TEST" } });
console.log("deleted stray test projects:", p.count);
await db.$disconnect();
