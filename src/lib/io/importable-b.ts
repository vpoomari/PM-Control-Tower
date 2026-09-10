// PM CONTROL TOWER — Importable entities, part B: resources, risks, issues, assumptions,
// change requests, budget lines, users. Upsert keyed on business codes.

import { db } from "@/lib/db";
import { hash } from "bcryptjs";
import { toBool, toDate, toNum, toStr } from "@/lib/csv";
import { isoStr, dateStr, required, projectByCode, userByEmail } from "./shared";
import type { EntityDef } from "./shared";

const IMPORT_DEFAULT_PASSWORD = "Welcome@2026";

export const resources: EntityDef = {
  label: "Resources",
  viewPermission: "resource.view",
  managePermission: "resource.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "employeeCode", label: "Employee Code" },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "title", label: "Title" },
    { key: "department", label: "Department" },
    { key: "resourceType", label: "Resource Type" },
    { key: "seniority", label: "Seniority" },
    { key: "primarySkill", label: "Primary Skill" },
    { key: "skills", label: "Skills" },
    { key: "capacityHoursPerWeek", label: "Capacity Hours/Week" },
    { key: "costRate", label: "Cost Rate" },
    { key: "billableRate", label: "Billable Rate" },
    { key: "currency", label: "Currency" },
    { key: "availabilityStatus", label: "Availability Status" },
    { key: "location", label: "Location" },
    { key: "managerName", label: "Manager Name" },
    { key: "isActive", label: "Is Active" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: { "Employee Code": "EMP-100", Name: "New Resource", Email: "new.res@pmct.io", Title: "Engineer", Department: "Delivery", "Resource Type": "EMPLOYEE", Seniority: "MID", "Primary Skill": "Java", Skills: "Java, SQL", "Capacity Hours/Week": "40", "Cost Rate": "60", "Billable Rate": "90", Currency: "USD", "Availability Status": "AVAILABLE", Location: "Remote", "Manager Name": "Sarah Chen", "Is Active": "TRUE" },
  exportRows: async () => {
    const rows = await db.resource.findMany({ orderBy: { employeeCode: "asc" } });
    return rows.map((r) => ({
      id: r.id, employeeCode: r.employeeCode, name: r.name, email: r.email, title: r.title ?? "",
      department: r.department ?? "", resourceType: r.resourceType, seniority: r.seniority,
      primarySkill: r.primarySkill ?? "", skills: r.skills ?? "",
      capacityHoursPerWeek: r.capacityHoursPerWeek, costRate: r.costRate, billableRate: r.billableRate,
      currency: r.currency, availabilityStatus: r.availabilityStatus, location: r.location ?? "",
      managerName: r.managerName ?? "", isActive: r.isActive ? "TRUE" : "FALSE",
      createdAt: isoStr(r.createdAt), updatedAt: isoStr(r.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const employeeCode = required(row, "Employee Code");
    const name = required(row, "Name");
    const email = required(row, "Email").trim().toLowerCase();
    const data = {
      name, email, title: toStr(row.Title), department: toStr(row.Department),
      resourceType: toStr(row["Resource Type"]) ?? "EMPLOYEE", seniority: toStr(row.Seniority) ?? "MID",
      primarySkill: toStr(row["Primary Skill"]), skills: toStr(row.Skills),
      capacityHoursPerWeek: toNum(row["Capacity Hours/Week"], 40),
      costRate: toNum(row["Cost Rate"], 0), billableRate: toNum(row["Billable Rate"], 0),
      currency: toStr(row.Currency) ?? "USD", availabilityStatus: toStr(row["Availability Status"]) ?? "AVAILABLE",
      location: toStr(row.Location), managerName: toStr(row["Manager Name"]),
      isActive: row["Is Active"] === "" ? undefined : toBool(row["Is Active"], true),
    };
    // Link to a login automatically by email when one exists.
    const user = await tx.user.findUnique({ where: { email } }).catch(() => null);
    const withUser = { ...data, userId: user?.id ?? undefined };
    const existing = await tx.resource.findUnique({ where: { employeeCode } });
    if (existing) {
      const r = await tx.resource.update({ where: { employeeCode }, data: withUser });
      return { action: "updated" as const, id: r.id, name: `${r.employeeCode} ${r.name}` };
    }
    const r = await tx.resource.create({ data: { employeeCode, userId: user?.id ?? null, ...data } });
    return { action: "created" as const, id: r.id, name: `${r.employeeCode} ${r.name}` };
  },
};

export const risks: EntityDef = {
  label: "Risks (RAID)",
  viewPermission: "project.view",
  managePermission: "raid.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "code", label: "Code" },
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "probability", label: "Probability" },
    { key: "impact", label: "Impact" },
    { key: "score", label: "Score" },
    { key: "severity", label: "Severity" },
    { key: "status", label: "Status" },
    { key: "ownerName", label: "Owner Name" },
    { key: "responseStrategy", label: "Response Strategy" },
    { key: "mitigation", label: "Mitigation" },
    { key: "contingency", label: "Contingency" },
    { key: "residualProbability", label: "Residual Probability" },
    { key: "residualImpact", label: "Residual Impact" },
    { key: "escalationLevel", label: "Escalation Level" },
    { key: "identifiedAt", label: "Identified At" },
    { key: "dueDate", label: "Due Date" },
    { key: "closedAt", label: "Closed At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: { "Project Code": "PRJ-ERP-001", Code: "R-101", Title: "Legacy data quality", Description: "Migration may expose bad records", Category: "TECHNICAL", Probability: "4", Impact: "4", Score: "16", Severity: "HIGH", Status: "OPEN", "Owner Name": "Sarah Chen", "Response Strategy": "MITIGATE", Mitigation: "Early profiling sprints", Contingency: "Fallback manual cleanse", "Residual Probability": "2", "Residual Impact": "3", "Escalation Level": "NONE", "Identified At": "2026-01-10", "Due Date": "2026-06-30", "Closed At": "" },
  exportRows: async () => {
    const rows = await db.risk.findMany({ include: { project: true }, orderBy: [{ projectId: "asc" }, { code: "asc" }] });
    return rows.map((r) => ({
      id: r.id, projectCode: r.project.code, code: r.code, title: r.title, description: r.description ?? "",
      category: r.category, probability: r.probability, impact: r.impact, score: r.score, severity: r.severity,
      status: r.status, ownerName: r.ownerName ?? "", responseStrategy: r.responseStrategy,
      mitigation: r.mitigation ?? "", contingency: r.contingency ?? "",
      residualProbability: r.residualProbability, residualImpact: r.residualImpact,
      escalationLevel: r.escalationLevel, identifiedAt: dateStr(r.identifiedAt),
      dueDate: dateStr(r.dueDate), closedAt: dateStr(r.closedAt), updatedAt: isoStr(r.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const project = await projectByCode(tx, toStr(row["Project Code"]));
    const code = required(row, "Code");
    const title = required(row, "Title");
    const probability = toNum(row.Probability, 3);
    const impact = toNum(row.Impact, 3);
    const data = {
      title, description: toStr(row.Description), category: toStr(row.Category) ?? "TECHNICAL",
      probability, impact, score: Math.max(1, Math.round(probability * impact)),
      severity: toStr(row.Severity) ?? "MEDIUM", status: toStr(row.Status) ?? "OPEN",
      ownerName: toStr(row["Owner Name"]), responseStrategy: toStr(row["Response Strategy"]) ?? "MITIGATE",
      mitigation: toStr(row.Mitigation), contingency: toStr(row.Contingency),
      residualProbability: toNum(row["Residual Probability"], 3), residualImpact: toNum(row["Residual Impact"], 3),
      escalationLevel: toStr(row["Escalation Level"]) ?? "NONE",
      identifiedAt: toDate(row["Identified At"]) ?? new Date(),
      dueDate: toDate(row["Due Date"]), closedAt: toDate(row["Closed At"]),
    };
    const existing = await tx.risk.findFirst({ where: { projectId: project.id, code } });
    if (existing) {
      const r = await tx.risk.update({ where: { id: existing.id }, data });
      return { action: "updated" as const, id: r.id, name: `${code} ${r.title}` };
    }
    const r = await tx.risk.create({ data: { projectId: project.id, code, ...data } });
    return { action: "created" as const, id: r.id, name: `${code} ${r.title}` };
  },
};

export const issues: EntityDef = {
  label: "Issues (RAID)",
  viewPermission: "project.view",
  managePermission: "raid.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "code", label: "Code" },
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "priority", label: "Priority" },
    { key: "severity", label: "Severity" },
    { key: "status", label: "Status" },
    { key: "ownerName", label: "Owner Name" },
    { key: "raisedBy", label: "Raised By" },
    { key: "impact", label: "Impact" },
    { key: "resolution", label: "Resolution" },
    { key: "escalationLevel", label: "Escalation Level" },
    { key: "raisedAt", label: "Raised At" },
    { key: "dueDate", label: "Due Date" },
    { key: "resolvedAt", label: "Resolved At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: { "Project Code": "PRJ-ERP-001", Code: "I-101", Title: "Test env down", Description: "Env unavailable since Monday", Category: "TECHNICAL", Priority: "HIGH", Severity: "HIGH", Status: "OPEN", "Owner Name": "Liam Foster", "Raised By": "Liam Foster", Impact: "Testing blocked", Resolution: "", "Escalation Level": "PM", "Raised At": "2026-02-01", "Due Date": "2026-02-10", "Resolved At": "" },
  exportRows: async () => {
    const rows = await db.issue.findMany({ include: { project: true }, orderBy: [{ projectId: "asc" }, { code: "asc" }] });
    return rows.map((i) => ({
      id: i.id, projectCode: i.project.code, code: i.code, title: i.title, description: i.description ?? "",
      category: i.category, priority: i.priority, severity: i.severity, status: i.status,
      ownerName: i.ownerName ?? "", raisedBy: i.raisedBy ?? "", impact: i.impact ?? "",
      resolution: i.resolution ?? "", escalationLevel: i.escalationLevel,
      raisedAt: dateStr(i.raisedAt), dueDate: dateStr(i.dueDate), resolvedAt: dateStr(i.resolvedAt),
      updatedAt: isoStr(i.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const project = await projectByCode(tx, toStr(row["Project Code"]));
    const code = required(row, "Code");
    const title = required(row, "Title");
    const data = {
      title, description: toStr(row.Description), category: toStr(row.Category) ?? "TECHNICAL",
      priority: toStr(row.Priority) ?? "MEDIUM", severity: toStr(row.Severity) ?? "MEDIUM",
      status: toStr(row.Status) ?? "OPEN", ownerName: toStr(row["Owner Name"]), raisedBy: toStr(row["Raised By"]),
      impact: toStr(row.Impact), resolution: toStr(row.Resolution),
      escalationLevel: toStr(row["Escalation Level"]) ?? "NONE",
      raisedAt: toDate(row["Raised At"]) ?? new Date(),
      dueDate: toDate(row["Due Date"]), resolvedAt: toDate(row["Resolved At"]),
    };
    const existing = await tx.issue.findFirst({ where: { projectId: project.id, code } });
    if (existing) {
      const i = await tx.issue.update({ where: { id: existing.id }, data });
      return { action: "updated" as const, id: i.id, name: `${code} ${i.title}` };
    }
    const i = await tx.issue.create({ data: { projectId: project.id, code, ...data } });
    return { action: "created" as const, id: i.id, name: `${code} ${i.title}` };
  },
};

export const assumptions: EntityDef = {
  label: "Assumptions (RAID)",
  viewPermission: "project.view",
  managePermission: "raid.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "code", label: "Code" },
    { key: "description", label: "Description" },
    { key: "rationale", label: "Rationale" },
    { key: "impactIfFalse", label: "Impact If False" },
    { key: "status", label: "Status" },
    { key: "ownerName", label: "Owner Name" },
    { key: "validationDate", label: "Validation Date" },
    { key: "dueDate", label: "Due Date" },
    { key: "createdAt", label: "Created At" },
  ],
  example: { "Project Code": "PRJ-ERP-001", Code: "A-101", Description: "Client SMEs available 2 days/week", Rationale: "Agreed in steering committee", "Impact If False": "Design phase slips 3 weeks", Status: "VALID", "Owner Name": "Sarah Chen", "Validation Date": "2026-01-20", "Due Date": "2026-03-31" },
  exportRows: async () => {
    const rows = await db.assumption.findMany({ include: { project: true }, orderBy: [{ projectId: "asc" }, { code: "asc" }] });
    return rows.map((a) => ({
      id: a.id, projectCode: a.project.code, code: a.code, description: a.description,
      rationale: a.rationale ?? "", impactIfFalse: a.impactIfFalse ?? "", status: a.status,
      ownerName: a.ownerName ?? "", validationDate: dateStr(a.validationDate),
      dueDate: dateStr(a.dueDate), createdAt: isoStr(a.createdAt),
    }));
  },
  applyRow: async (tx, row) => {
    const project = await projectByCode(tx, toStr(row["Project Code"]));
    const code = required(row, "Code");
    const description = required(row, "Description");
    const data = {
      description, rationale: toStr(row.Rationale), impactIfFalse: toStr(row["Impact If False"]),
      status: toStr(row.Status) ?? "VALID", ownerName: toStr(row["Owner Name"]),
      validationDate: toDate(row["Validation Date"]), dueDate: toDate(row["Due Date"]),
    };
    const existing = await tx.assumption.findFirst({ where: { projectId: project.id, code } });
    if (existing) {
      const a = await tx.assumption.update({ where: { id: existing.id }, data });
      return { action: "updated" as const, id: a.id, name: `${code} ${a.description.slice(0, 40)}` };
    }
    const a = await tx.assumption.create({ data: { projectId: project.id, code, ...data } });
    return { action: "created" as const, id: a.id, name: `${code} ${a.description.slice(0, 40)}` };
  },
};

export const changes: EntityDef = {
  label: "Change Requests",
  viewPermission: "project.view",
  managePermission: "change.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "code", label: "Code" },
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "reason", label: "Reason" },
    { key: "category", label: "Category" },
    { key: "requesterName", label: "Requester Name" },
    { key: "impactHours", label: "Impact Hours" },
    { key: "impactCost", label: "Impact Cost" },
    { key: "scheduleImpactDays", label: "Schedule Impact Days" },
    { key: "riskImpact", label: "Risk Impact" },
    { key: "status", label: "Status" },
    { key: "decision", label: "Decision" },
    { key: "decisionDate", label: "Decision Date" },
    { key: "decidedBy", label: "Decided By" },
    { key: "dueDate", label: "Due Date" },
    { key: "priority", label: "Priority" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: { "Project Code": "PRJ-ERP-001", Code: "CR-104", Title: "Extra reporting module", Description: "Finance needs 5 more reports", Reason: "New regulation", Category: "SCOPE", "Requester Name": "Morgan Lee", "Impact Hours": "120", "Impact Cost": "9600", "Schedule Impact Days": "10", "Risk Impact": "MEDIUM", Status: "SUBMITTED", Decision: "", "Decision Date": "", "Decided By": "", "Due Date": "2026-05-01", Priority: "HIGH" },
  exportRows: async () => {
    const rows = await db.changeRequest.findMany({ include: { project: true }, orderBy: [{ projectId: "asc" }, { code: "asc" }] });
    return rows.map((c) => ({
      id: c.id, projectCode: c.project.code, code: c.code, title: c.title, description: c.description ?? "",
      reason: c.reason ?? "", category: c.category, requesterName: c.requesterName ?? "",
      impactHours: c.impactHours, impactCost: c.impactCost, scheduleImpactDays: c.scheduleImpactDays,
      riskImpact: c.riskImpact, status: c.status, decision: c.decision ?? "",
      decisionDate: dateStr(c.decisionDate), decidedBy: c.decidedBy ?? "", dueDate: dateStr(c.dueDate),
      priority: c.priority, createdAt: isoStr(c.createdAt), updatedAt: isoStr(c.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const project = await projectByCode(tx, toStr(row["Project Code"]));
    const code = required(row, "Code");
    const title = required(row, "Title");
    const data = {
      title, description: toStr(row.Description), reason: toStr(row.Reason),
      category: toStr(row.Category) ?? "SCOPE", requesterName: toStr(row["Requester Name"]),
      impactHours: toNum(row["Impact Hours"], 0), impactCost: toNum(row["Impact Cost"], 0),
      scheduleImpactDays: toNum(row["Schedule Impact Days"], 0),
      riskImpact: toStr(row["Risk Impact"]) ?? "LOW", status: toStr(row.Status) ?? "DRAFT",
      decision: toStr(row.Decision), decisionDate: toDate(row["Decision Date"]),
      decidedBy: toStr(row["Decided By"]), dueDate: toDate(row["Due Date"]),
      priority: toStr(row.Priority) ?? "MEDIUM",
    };
    const existing = await tx.changeRequest.findFirst({ where: { projectId: project.id, code } });
    if (existing) {
      const c = await tx.changeRequest.update({ where: { id: existing.id }, data });
      return { action: "updated" as const, id: c.id, name: `${code} ${c.title}` };
    }
    const c = await tx.changeRequest.create({ data: { projectId: project.id, code, ...data } });
    return { action: "created" as const, id: c.id, name: `${code} ${c.title}` };
  },
};

export const budgetLines: EntityDef = {
  label: "Budget Lines",
  viewPermission: "financial.view",
  managePermission: "financial.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "category", label: "Category" },
    { key: "name", label: "Name" },
    { key: "baselineAmount", label: "Baseline Amount" },
    { key: "currentAmount", label: "Current Amount" },
    { key: "actualAmount", label: "Actual Amount" },
    { key: "forecastAmount", label: "Forecast Amount" },
    { key: "period", label: "Period" },
    { key: "notes", label: "Notes" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: { "Project Code": "PRJ-ERP-001", Category: "LABOR", Name: "Engineering Q1", "Baseline Amount": "120000", "Current Amount": "120000", "Actual Amount": "30000", "Forecast Amount": "118000", Period: "2026-Q1", Notes: "" },
  exportRows: async () => {
    const rows = await db.budgetLine.findMany({ include: { project: true }, orderBy: [{ projectId: "asc" }, { name: "asc" }] });
    return rows.map((b) => ({
      id: b.id, projectCode: b.project.code, category: b.category, name: b.name,
      baselineAmount: b.baselineAmount, currentAmount: b.currentAmount, actualAmount: b.actualAmount,
      forecastAmount: b.forecastAmount, period: b.period ?? "", notes: b.notes ?? "",
      createdAt: isoStr(b.createdAt), updatedAt: isoStr(b.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const project = await projectByCode(tx, toStr(row["Project Code"]));
    const name = required(row, "Name");
    const data = {
      category: toStr(row.Category) ?? "LABOR", name,
      baselineAmount: toNum(row["Baseline Amount"], 0), currentAmount: toNum(row["Current Amount"], 0),
      actualAmount: toNum(row["Actual Amount"], 0), forecastAmount: toNum(row["Forecast Amount"], 0),
      period: toStr(row.Period), notes: toStr(row.Notes),
    };
    const existing = await tx.budgetLine.findFirst({
      where: { projectId: project.id, name, category: data.category },
    });
    if (existing) {
      const b = await tx.budgetLine.update({ where: { id: existing.id }, data });
      return { action: "updated" as const, id: b.id, name: `${b.category}/${b.name}` };
    }
    const b = await tx.budgetLine.create({ data: { projectId: project.id, ...data } });
    return { action: "created" as const, id: b.id, name: `${b.category}/${b.name}` };
  },
};

export const users: EntityDef = {
  label: "Users",
  viewPermission: "admin.users",
  managePermission: "admin.users",
  columns: [
    { key: "id", label: "ID" },
    { key: "email", label: "Email" },
    { key: "name", label: "Name" },
    { key: "title", label: "Title" },
    { key: "department", label: "Department" },
    { key: "phone", label: "Phone" },
    { key: "roles", label: "Roles" },
    { key: "isActive", label: "Is Active" },
    { key: "isSuperAdmin", label: "Is Super Admin" },
    { key: "lastLoginAt", label: "Last Login At" },
    { key: "createdAt", label: "Created At" },
  ],
  example: { Email: "new.pm@pmct.io", Name: "New PM", Title: "Project Manager", Department: "Delivery", Phone: "", Roles: "PROJECT_MANAGER,TEAM_MEMBER", "Is Active": "TRUE", "Is Super Admin": "FALSE", "Last Login At": "" },
  exportRows: async () => {
    const rows = await db.user.findMany({ include: { userRoles: { include: { role: true } } }, orderBy: { email: "asc" } });
    return rows.map((u) => ({
      id: u.id, email: u.email, name: u.name, title: u.title ?? "", department: u.department ?? "",
      phone: u.phone ?? "", roles: u.userRoles.map((ur) => ur.role.code).join("|"),
      isActive: u.isActive ? "TRUE" : "FALSE", isSuperAdmin: u.isSuperAdmin ? "TRUE" : "FALSE",
      lastLoginAt: isoStr(u.lastLoginAt), createdAt: isoStr(u.createdAt),
    }));
  },
  applyRow: async (tx, row) => {
    const email = required(row, "Email").trim().toLowerCase();
    const name = required(row, "Name");
    const roleCodes = (row.Roles ?? "").split(/[|,;]/).map((s) => s.trim()).filter(Boolean);
    const data = {
      name, title: toStr(row.Title), department: toStr(row.Department), phone: toStr(row.Phone),
      isActive: row["Is Active"] === "" ? undefined : toBool(row["Is Active"], true),
    };
    const existing = await tx.user.findUnique({ where: { email } });
    let userId: string;
    let action: "created" | "updated";
    if (existing) {
      const u = await tx.user.update({ where: { email }, data });
      userId = u.id; action = "updated";
    } else {
      const passwordHash = await hash(IMPORT_DEFAULT_PASSWORD, 10);
      const u = await tx.user.create({ data: { email, passwordHash, name, title: toStr(row.Title), department: toStr(row.Department), phone: toStr(row.Phone) } });
      userId = u.id; action = "created";
    }
    if (roleCodes.length) {
      const roles = await tx.role.findMany({ where: { code: { in: roleCodes } } });
      const found = new Set(roles.map((r) => r.code));
      const missing = roleCodes.filter((c) => !found.has(c));
      if (missing.length) throw new Error(`Unknown role code(s): ${missing.join(", ")}`);
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId, roleId: r.id })) });
    }
    return {
      action, id: userId, name: `${name} <${email}>`,
      // message surfaces on the result card for created users only
      ...(action === "created" ? { message: `Initial password: ${IMPORT_DEFAULT_PASSWORD}` } : {}),
    } as { action: "created" | "updated"; id: string; name: string; message?: string };
  },
};

export { userByEmail };
