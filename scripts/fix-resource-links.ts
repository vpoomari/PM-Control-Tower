// PM CONTROL TOWER — One-off fix: link resource profiles to PMO/PM logins so
// the "My timesheet" editor (and New Timesheet Entry quick action) works for
// the demo admin/project-manager accounts. Idempotent: upserts by email.
import { db } from "../src/lib/db";

const defs = [
  { code: "EMP-010", name: "Jordan Blake", email: "pmo@pmct.io", title: "Head of PMO", dept: "PMO", seniority: "PRINCIPAL", skill: "Portfolio Governance, PPM, EVM", rate: 130, bill: 165, loc: "Singapore" },
  { code: "EMP-011", name: "Sarah Okafor", email: "pm.sarah@pmct.io", title: "Senior Project Manager", dept: "Delivery", seniority: "PRINCIPAL", skill: "ERP, Program Delivery, Vendor Management", rate: 135, bill: 175, loc: "London" },
  { code: "EMP-012", name: "David Kim", email: "pm.david@pmct.io", title: "Project Manager", dept: "Delivery", seniority: "SENIOR", skill: "Data Platforms, Agile Delivery", rate: 125, bill: 170, loc: "Singapore" },
];

async function main() {
  for (const r of defs) {
    const user = await db.user.findUnique({ where: { email: r.email }, select: { id: true } });
    if (!user) { console.log(`  ! user not found for ${r.email} — skipped`); continue; }
    const existing = await db.resource.findFirst({ where: { email: r.email } });
    if (existing) {
      await db.resource.update({ where: { id: existing.id }, data: { userId: user.id } });
      console.log(`  ~ linked existing resource ${r.name} (${r.email}) → user`);
    } else {
      await db.resource.create({
        data: {
          employeeCode: r.code, name: r.name, email: r.email, title: r.title, department: r.dept,
          resourceType: "EMPLOYEE", seniority: r.seniority, primarySkill: r.skill.split(",")[0],
          skills: r.skill, capacityHoursPerWeek: 40, costRate: r.rate, billableRate: r.bill,
          location: r.loc, userId: user.id,
        },
      });
      console.log(`  + created resource ${r.name} (${r.email})`);
    }
  }
  const total = await db.resource.count();
  console.log(`Done. Resources now: ${total}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
