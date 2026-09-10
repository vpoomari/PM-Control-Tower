// PM CONTROL TOWER — Importable entities, part A: portfolios, programs, projects,
// requirements, tasks, milestones. Upsert keyed on business codes; empty cells leave
// existing values unchanged on update.

import { db } from "@/lib/db";
import { toBool, toDate, toNum, toStr } from "@/lib/csv";
import { isoStr, dateStr, required, portfolioByCode, programByCode, projectByCode, userByEmail } from "./shared";
import type { EntityDef } from "./shared";

export const portfolios: EntityDef = {
  label: "Portfolios",
  viewPermission: "portfolio.view",
  managePermission: "portfolio.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status" },
    { key: "ownerEmail", label: "Owner Email" },
    { key: "strategicObjective", label: "Strategic Objective" },
    { key: "budgetTarget", label: "Budget Target" },
    { key: "actualCost", label: "Actual Cost" },
    { key: "forecastCost", label: "Forecast Cost" },
    { key: "currency", label: "Currency" },
    { key: "startDate", label: "Start Date" },
    { key: "endDate", label: "End Date" },
    { key: "healthScore", label: "Health Score" },
    { key: "ragStatus", label: "RAG Status" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: { Code: "PRTF-NEW", Name: "New Portfolio", Description: "Strategic change envelope", Status: "ACTIVE", "Owner Email": "ceo@pmct.io", "Strategic Objective": "Digital revenue growth", "Budget Target": "5000000", "Actual Cost": "0", "Forecast Cost": "4800000", Currency: "USD", "Start Date": "2026-01-01", "End Date": "2026-12-31", "Health Score": "100", "RAG Status": "GREEN" },
  exportRows: async () => {
    const rows = await db.portfolio.findMany({ orderBy: { code: "asc" } });
    const ownerIds = rows.map((p) => p.ownerId).filter((v): v is string => Boolean(v));
    const owners = ownerIds.length ? await db.user.findMany({ where: { id: { in: ownerIds } } }) : [];
    const emailById = new Map(owners.map((u) => [u.id, u.email]));
    return rows.map((p) => ({
      id: p.id, code: p.code, name: p.name, description: p.description ?? "", status: p.status,
      ownerEmail: emailById.get(p.ownerId ?? "") ?? "", strategicObjective: p.strategicObjective ?? "",
      budgetTarget: p.budgetTarget, actualCost: p.actualCost, forecastCost: p.forecastCost,
      currency: p.currency, startDate: dateStr(p.startDate), endDate: dateStr(p.endDate),
      healthScore: p.healthScore, ragStatus: p.ragStatus, createdAt: isoStr(p.createdAt), updatedAt: isoStr(p.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const code = required(row, "Code");
    const name = required(row, "Name");
    const owner = await userByEmail(tx, toStr(row["Owner Email"]));
    const data = {
      name,
      description: toStr(row.Description),
      status: toStr(row.Status) ?? "ACTIVE",
      ownerId: owner?.id ?? null,
      strategicObjective: toStr(row["Strategic Objective"]),
      budgetTarget: toNum(row["Budget Target"], 0),
      forecastCost: toNum(row["Forecast Cost"], 0),
      currency: toStr(row.Currency) ?? "USD",
      startDate: toDate(row["Start Date"]), endDate: toDate(row["End Date"]),
      ragStatus: toStr(row["RAG Status"]) ?? "GREEN",
    };
    const existing = await tx.portfolio.findUnique({ where: { code } });
    if (existing) {
      const p = await tx.portfolio.update({ where: { code }, data });
      return { action: "updated" as const, id: p.id, name: p.name };
    }
    const p = await tx.portfolio.create({ data: { code, ...data } });
    return { action: "created" as const, id: p.id, name: p.name };
  },
};

export const programs: EntityDef = {
  label: "Programs",
  viewPermission: "program.view",
  managePermission: "program.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "portfolioCode", label: "Portfolio Code" },
    { key: "ownerEmail", label: "Owner Email" },
    { key: "status", label: "Status" },
    { key: "budget", label: "Budget" },
    { key: "actualCost", label: "Actual Cost" },
    { key: "forecastCost", label: "Forecast Cost" },
    { key: "healthScore", label: "Health Score" },
    { key: "ragStatus", label: "RAG Status" },
    { key: "startDate", label: "Start Date" },
    { key: "endDate", label: "End Date" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: { Code: "PRG-NEW", Name: "New Program", Description: "Coordinated delivery", "Portfolio Code": "PRTF-ENT", "Owner Email": "pmo@pmct.io", Status: "ACTIVE", Budget: "1000000", "Actual Cost": "0", "Forecast Cost": "950000", "Health Score": "100", "RAG Status": "GREEN", "Start Date": "2026-01-01", "End Date": "2026-12-31" },
  exportRows: async () => {
    const rows = await db.program.findMany({ include: { portfolio: true }, orderBy: { code: "asc" } });
    const ownerIds = rows.map((p) => p.ownerId).filter((v): v is string => Boolean(v));
    const owners = ownerIds.length ? await db.user.findMany({ where: { id: { in: ownerIds } } }) : [];
    const emailById = new Map(owners.map((u) => [u.id, u.email]));
    return rows.map((p) => ({
      id: p.id, code: p.code, name: p.name, description: p.description ?? "",
      portfolioCode: p.portfolio?.code ?? "", ownerEmail: emailById.get(p.ownerId ?? "") ?? "", status: p.status,
      budget: p.budget, actualCost: p.actualCost, forecastCost: p.forecastCost,
      healthScore: p.healthScore, ragStatus: p.ragStatus,
      startDate: dateStr(p.startDate), endDate: dateStr(p.endDate),
      createdAt: isoStr(p.createdAt), updatedAt: isoStr(p.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const code = required(row, "Code");
    const name = required(row, "Name");
    const portfolio = await portfolioByCode(tx, toStr(row["Portfolio Code"]));
    if (!portfolio) throw new Error("Portfolio Code is required");
    const owner = await userByEmail(tx, toStr(row["Owner Email"]));
    const data = {
      name, description: toStr(row.Description), portfolioId: portfolio.id,
      ownerId: owner?.id ?? null, status: toStr(row.Status) ?? "ACTIVE",
      budget: toNum(row.Budget, 0), forecastCost: toNum(row["Forecast Cost"], 0),
      ragStatus: toStr(row["RAG Status"]) ?? "GREEN",
      startDate: toDate(row["Start Date"]), endDate: toDate(row["End Date"]),
    };
    const existing = await tx.program.findUnique({ where: { code } });
    if (existing) {
      const p = await tx.program.update({ where: { code }, data });
      return { action: "updated" as const, id: p.id, name: p.name };
    }
    const p = await tx.program.create({ data: { code, ...data } });
    return { action: "created" as const, id: p.id, name: p.name };
  },
};

export const projects: EntityDef = {
  label: "Projects",
  viewPermission: "project.view",
  managePermission: "project.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "portfolioCode", label: "Portfolio Code" },
    { key: "programCode", label: "Program Code" },
    { key: "ownerEmail", label: "Owner Email" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "phase", label: "Phase" },
    { key: "methodology", label: "Methodology" },
    { key: "riskLevel", label: "Risk Level" },
    { key: "billingType", label: "Billing Type" },
    { key: "currency", label: "Currency" },
    { key: "startDate", label: "Start Date" },
    { key: "endDate", label: "End Date" },
    { key: "baselineStart", label: "Baseline Start" },
    { key: "baselineFinish", label: "Baseline Finish" },
    { key: "baselineBudget", label: "Baseline Budget" },
    { key: "currentBudget", label: "Current Budget" },
    { key: "actualCost", label: "Actual Cost" },
    { key: "forecastCost", label: "Forecast Cost" },
    { key: "plannedHours", label: "Planned Hours" },
    { key: "actualHours", label: "Actual Hours" },
    { key: "progress", label: "Progress" },
    { key: "healthScore", label: "Health Score" },
    { key: "ragStatus", label: "RAG Status" },
    { key: "charter", label: "Charter" },
    { key: "objectives", label: "Objectives" },
    { key: "successCriteria", label: "Success Criteria" },
    { key: "statusDate", label: "Status Date" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: { Code: "PRJ-NEW-001", Name: "New Project", Description: "Delivery project", "Portfolio Code": "PRTF-ENT", "Program Code": "PRG-DATA", "Owner Email": "pm.sarah@pmct.io", Status: "ACTIVE", Priority: "HIGH", Phase: "INITIATION", Methodology: "AGILE", "Risk Level": "MEDIUM", "Billing Type": "NON_BILLABLE", Currency: "USD", "Start Date": "2026-01-05", "End Date": "2026-12-18", "Baseline Start": "2026-01-05", "Baseline Finish": "2026-12-18", "Baseline Budget": "500000", "Current Budget": "500000", "Actual Cost": "0", "Forecast Cost": "0", "Planned Hours": "6000", "Actual Hours": "0", Progress: "0", "Health Score": "100", "RAG Status": "GREEN", Charter: "", Objectives: "", "Success Criteria": "", "Status Date": "2026-01-05" },
  exportRows: async () => {
    const rows = await db.project.findMany({ include: { portfolio: true, program: true, owner: true }, orderBy: { code: "asc" } });
    return rows.map((p) => ({
      id: p.id, code: p.code, name: p.name, description: p.description ?? "",
      portfolioCode: p.portfolio?.code ?? "", programCode: p.program?.code ?? "",
      ownerEmail: p.owner?.email ?? "", status: p.status, priority: p.priority, phase: p.phase,
      methodology: p.methodology, riskLevel: p.riskLevel, billingType: p.billingType, currency: p.currency,
      startDate: dateStr(p.startDate), endDate: dateStr(p.endDate),
      baselineStart: dateStr(p.baselineStart), baselineFinish: dateStr(p.baselineFinish),
      baselineBudget: p.baselineBudget, currentBudget: p.currentBudget, actualCost: p.actualCost,
      forecastCost: p.forecastCost, plannedHours: p.plannedHours, actualHours: p.actualHours,
      progress: p.progress, healthScore: p.healthScore, ragStatus: p.ragStatus,
      charter: p.charter ?? "", objectives: p.objectives ?? "", successCriteria: p.successCriteria ?? "",
      statusDate: dateStr(p.statusDate), createdAt: isoStr(p.createdAt), updatedAt: isoStr(p.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const code = required(row, "Code");
    const name = required(row, "Name");
    const portfolio = await portfolioByCode(tx, toStr(row["Portfolio Code"]));
    const program = await programByCode(tx, toStr(row["Program Code"]));
    const owner = await userByEmail(tx, toStr(row["Owner Email"]));
    const data = {
      name, description: toStr(row.Description),
      portfolioId: portfolio?.id ?? null, programId: program?.id ?? null, ownerId: owner?.id ?? null,
      status: toStr(row.Status) ?? undefined, priority: toStr(row.Priority) ?? undefined,
      phase: toStr(row.Phase) ?? undefined, methodology: toStr(row.Methodology) ?? undefined,
      riskLevel: toStr(row["Risk Level"]) ?? undefined, billingType: toStr(row["Billing Type"]) ?? undefined,
      currency: toStr(row.Currency) ?? undefined,
      startDate: toDate(row["Start Date"]), endDate: toDate(row["End Date"]),
      baselineStart: toDate(row["Baseline Start"]), baselineFinish: toDate(row["Baseline Finish"]),
      baselineBudget: row["Baseline Budget"] === "" ? undefined : toNum(row["Baseline Budget"], 0),
      currentBudget: row["Current Budget"] === "" ? undefined : toNum(row["Current Budget"], 0),
      forecastCost: row["Forecast Cost"] === "" ? undefined : toNum(row["Forecast Cost"], 0),
      plannedHours: row["Planned Hours"] === "" ? undefined : toNum(row["Planned Hours"], 0),
      progress: row.Progress === "" ? undefined : toNum(row.Progress, 0),
      ragStatus: toStr(row["RAG Status"]) ?? undefined,
      charter: toStr(row.Charter), objectives: toStr(row.Objectives), successCriteria: toStr(row["Success Criteria"]),
      statusDate: toDate(row["Status Date"]),
    };
    const existing = await tx.project.findUnique({ where: { code } });
    if (existing) {
      const p = await tx.project.update({ where: { code }, data });
      return { action: "updated" as const, id: p.id, name: p.name };
    }
    const p = await tx.project.create({ data: { code, ...data } });
    return { action: "created" as const, id: p.id, name: p.name };
  },
};

export const requirements: EntityDef = {
  label: "Requirements",
  viewPermission: "project.view",
  managePermission: "project.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "reqCode", label: "Req Code" },
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "reqType", label: "Req Type" },
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "acceptanceCriteria", label: "Acceptance Criteria" },
    { key: "source", label: "Source" },
    { key: "ownerName", label: "Owner Name" },
    { key: "effortEstimate", label: "Effort Estimate" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: { "Project Code": "PRJ-ERP-001", "Req Code": "REQ-101", Title: "Single sign-on", Description: "SSO across modules", "Req Type": "FUNCTIONAL", Priority: "HIGH", Status: "APPROVED", "Acceptance Criteria": "User logs in once", Source: "Workshop 3", "Owner Name": "Sarah Chen", "Effort Estimate": "80" },
  exportRows: async () => {
    const rows = await db.requirement.findMany({ include: { project: true }, orderBy: [{ projectId: "asc" }, { reqCode: "asc" }] });
    return rows.map((r) => ({
      id: r.id, projectCode: r.project.code, reqCode: r.reqCode, title: r.title,
      description: r.description ?? "", reqType: r.reqType, priority: r.priority, status: r.status,
      acceptanceCriteria: r.acceptanceCriteria ?? "", source: r.source ?? "", ownerName: r.ownerName ?? "",
      effortEstimate: r.effortEstimate, createdAt: isoStr(r.createdAt), updatedAt: isoStr(r.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const project = await projectByCode(tx, toStr(row["Project Code"]));
    const reqCode = required(row, "Req Code");
    const title = required(row, "Title");
    const data = {
      projectId: project.id, title, description: toStr(row.Description),
      reqType: toStr(row["Req Type"]) ?? "FUNCTIONAL", priority: toStr(row.Priority) ?? "MEDIUM",
      status: toStr(row.Status) ?? "DRAFT", acceptanceCriteria: toStr(row["Acceptance Criteria"]),
      source: toStr(row.Source), ownerName: toStr(row["Owner Name"]),
      effortEstimate: toNum(row["Effort Estimate"], 0),
    };
    const existing = await tx.requirement.findFirst({ where: { projectId: project.id, reqCode } });
    if (existing) {
      const r = await tx.requirement.update({ where: { id: existing.id }, data });
      return { action: "updated" as const, id: r.id, name: `${reqCode} ${r.title}` };
    }
    const r = await tx.requirement.create({ data: { reqCode, ...data } });
    return { action: "created" as const, id: r.id, name: `${reqCode} ${r.title}` };
  },
};

export const tasks: EntityDef = {
  label: "Tasks",
  viewPermission: "project.view",
  managePermission: "wbs.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "parentCode", label: "Parent Code" },
    { key: "assigneeEmail", label: "Assignee Email" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "criticality", label: "Criticality" },
    { key: "startDate", label: "Start Date" },
    { key: "endDate", label: "End Date" },
    { key: "durationDays", label: "Duration Days" },
    { key: "progress", label: "Progress" },
    { key: "plannedHours", label: "Planned Hours" },
    { key: "actualHours", label: "Actual Hours" },
    { key: "remainingHours", label: "Remaining Hours" },
    { key: "plannedCost", label: "Planned Cost" },
    { key: "actualCost", label: "Actual Cost" },
    { key: "isCritical", label: "Is Critical" },
    { key: "isSummary", label: "Is Summary" },
    { key: "constraintType", label: "Constraint Type" },
    { key: "notes", label: "Notes" },
    { key: "totalFloat", label: "Total Float" },
    { key: "freeFloat", label: "Free Float" },
    { key: "earliestStart", label: "Earliest Start" },
    { key: "earliestFinish", label: "Earliest Finish" },
    { key: "latestStart", label: "Latest Start" },
    { key: "latestFinish", label: "Latest Finish" },
    { key: "createdAt", label: "Created At" },
    { key: "updatedAt", label: "Updated At" },
  ],
  example: { "Project Code": "PRJ-ERP-001", Code: "T-100", Name: "Design API contract", Description: "", "Parent Code": "", "Assignee Email": "liam@pmct.io", Status: "NOT_STARTED", Priority: "HIGH", Criticality: "HIGH", "Start Date": "2026-01-05", "End Date": "2026-01-20", "Duration Days": "12", Progress: "0", "Planned Hours": "80", "Actual Hours": "0", "Remaining Hours": "80", "Planned Cost": "6400", "Actual Cost": "0", "Is Critical": "TRUE", "Is Summary": "FALSE", "Constraint Type": "ASAP", Notes: "" },
  exportRows: async () => {
    const rows = await db.task.findMany({ include: { project: true, assignee: true, parent: true }, orderBy: [{ projectId: "asc" }, { code: "asc" }] });
    return rows.map((t) => ({
      id: t.id, projectCode: t.project.code, code: t.code, name: t.name,
      description: t.description ?? "", parentCode: t.parent?.code ?? "",
      assigneeEmail: t.assignee?.email ?? "", status: t.status, priority: t.priority, criticality: t.criticality,
      startDate: dateStr(t.startDate), endDate: dateStr(t.endDate),
      durationDays: t.durationDays, progress: t.progress, plannedHours: t.plannedHours,
      actualHours: t.actualHours, remainingHours: t.remainingHours, plannedCost: t.plannedCost, actualCost: t.actualCost,
      isCritical: t.isCritical ? "TRUE" : "FALSE", isSummary: t.isSummary ? "TRUE" : "FALSE",
      constraintType: t.constraintType, notes: t.notes ?? "",
      totalFloat: t.totalFloat, freeFloat: t.freeFloat,
      earliestStart: isoStr(t.earliestStart), earliestFinish: isoStr(t.earliestFinish),
      latestStart: isoStr(t.latestStart), latestFinish: isoStr(t.latestFinish),
      createdAt: isoStr(t.createdAt), updatedAt: isoStr(t.updatedAt),
    }));
  },
  applyRow: async (tx, row) => {
    const project = await projectByCode(tx, toStr(row["Project Code"]));
    const code = required(row, "Code");
    const name = required(row, "Name");
    const assignee = await userByEmail(tx, toStr(row["Assignee Email"]));
    let parentId: string | null = null;
    const parentCode = toStr(row["Parent Code"]);
    if (parentCode) {
      const parent = await tx.task.findFirst({ where: { projectId: project.id, code: parentCode } });
      if (!parent) throw new Error(`Parent task "${parentCode}" not found in ${project.code}`);
      parentId = parent.id;
    }
    const data = {
      name, description: toStr(row.Description), parentId,
      assigneeId: assignee?.id ?? null,
      status: toStr(row.Status) ?? undefined, priority: toStr(row.Priority) ?? undefined,
      criticality: toStr(row.Criticality) ?? undefined,
      startDate: toDate(row["Start Date"]), endDate: toDate(row["End Date"]),
      durationDays: row["Duration Days"] === "" ? undefined : toNum(row["Duration Days"], 1),
      progress: row.Progress === "" ? undefined : toNum(row.Progress, 0),
      plannedHours: row["Planned Hours"] === "" ? undefined : toNum(row["Planned Hours"], 0),
      remainingHours: row["Remaining Hours"] === "" ? undefined : toNum(row["Remaining Hours"], 0),
      plannedCost: row["Planned Cost"] === "" ? undefined : toNum(row["Planned Cost"], 0),
      isCritical: row["Is Critical"] === "" ? undefined : toBool(row["Is Critical"], false),
      isSummary: row["Is Summary"] === "" ? undefined : toBool(row["Is Summary"], false),
      constraintType: toStr(row["Constraint Type"]) ?? undefined, notes: toStr(row.Notes),
    };
    const existing = await tx.task.findFirst({ where: { projectId: project.id, code } });
    if (existing) {
      const t = await tx.task.update({ where: { id: existing.id }, data });
      return { action: "updated" as const, id: t.id, name: `${code} ${t.name}` };
    }
    const t = await tx.task.create({
      data: { projectId: project.id, code, ...data,
        actualHours: toNum(row["Actual Hours"], 0), actualCost: toNum(row["Actual Cost"], 0) },
    });
    return { action: "created" as const, id: t.id, name: `${code} ${t.name}` };
  },
};

export const milestones: EntityDef = {
  label: "Milestones",
  viewPermission: "project.view",
  managePermission: "schedule.manage",
  columns: [
    { key: "id", label: "ID" },
    { key: "projectCode", label: "Project Code" },
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "dueDate", label: "Due Date" },
    { key: "baselineDate", label: "Baseline Date" },
    { key: "status", label: "Status" },
    { key: "isCritical", label: "Is Critical" },
    { key: "completedAt", label: "Completed At" },
    { key: "createdAt", label: "Created At" },
  ],
  example: { "Project Code": "PRJ-ERP-001", Code: "MS-KO", Name: "Kick-off", Description: "Project kick-off complete", "Due Date": "2026-01-15", "Baseline Date": "2026-01-15", Status: "PENDING", "Is Critical": "TRUE", "Completed At": "" },
  exportRows: async () => {
    const rows = await db.milestone.findMany({ include: { project: true }, orderBy: [{ projectId: "asc" }, { code: "asc" }] });
    return rows.map((m) => ({
      id: m.id, projectCode: m.project.code, code: m.code, name: m.name,
      description: m.description ?? "", dueDate: dateStr(m.dueDate), baselineDate: dateStr(m.baselineDate),
      status: m.status, isCritical: m.isCritical ? "TRUE" : "FALSE",
      completedAt: dateStr(m.completedAt), createdAt: isoStr(m.createdAt),
    }));
  },
  applyRow: async (tx, row) => {
    const project = await projectByCode(tx, toStr(row["Project Code"]));
    const code = required(row, "Code");
    const name = required(row, "Name");
    const data = {
      name, description: toStr(row.Description),
      dueDate: toDate(row["Due Date"]), baselineDate: toDate(row["Baseline Date"]),
      status: toStr(row.Status) ?? "PENDING",
      isCritical: row["Is Critical"] === "" ? undefined : toBool(row["Is Critical"], false),
      completedAt: toDate(row["Completed At"]),
    };
    const existing = await tx.milestone.findFirst({ where: { projectId: project.id, code } });
    if (existing) {
      const m = await tx.milestone.update({ where: { id: existing.id }, data });
      return { action: "updated" as const, id: m.id, name: `${code} ${m.name}` };
    }
    const m = await tx.milestone.create({ data: { projectId: project.id, code, ...data } });
    return { action: "created" as const, id: m.id, name: `${code} ${m.name}` };
  },
};
