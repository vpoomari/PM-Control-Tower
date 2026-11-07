// PM CONTROL TOWER — multi-dataset import routing unit tests (pure, DB-free, deterministic).
// Covers: parents-first linkage graph, the heuristic plan, single-dataset routing,
// flat multi-block files (row spawns into every dataset it fully describes), spawn
// de-duplication, generic-header leak protection, skip reasons and the pending
// index the linkage pre-flight (checkLinkage) resolves references against.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_ORDER, KEY_COLUMN, LINKAGE_REFS, REQUIRED_COLUMNS,
  buildHeuristicPlan, pendingKeyOf,
  type IoPlan,
} from "../../src/lib/io/model";
import {
  routeRows, buildPendingIndex,
  type RouteEntityMeta,
} from "../../src/lib/io/route-rows";
import type { EntityMeta } from "../../src/lib/io/auto-map";

// ---- Fixtures: column labels mirror src/lib/io/importable-a / importable-b ----

const portfolios: EntityMeta = {
  key: "portfolios", label: "Portfolios",
  columns: [
    { key: "code", label: "Code" }, { key: "name", label: "Name" },
    { key: "description", label: "Description" }, { key: "status", label: "Status" },
    { key: "ownerEmail", label: "Owner Email" }, { key: "strategicObjective", label: "Strategic Objective" },
  ],
};
const programs: EntityMeta = {
  key: "programs", label: "Programs",
  columns: [
    { key: "code", label: "Code" }, { key: "name", label: "Name" },
    { key: "description", label: "Description" }, { key: "portfolioCode", label: "Portfolio Code" },
    { key: "ownerEmail", label: "Owner Email" }, { key: "status", label: "Status" },
    { key: "budget", label: "Budget" },
  ],
};
const projects: EntityMeta = {
  key: "projects", label: "Projects",
  columns: [
    { key: "code", label: "Code" }, { key: "name", label: "Name" },
    { key: "description", label: "Description" }, { key: "portfolioCode", label: "Portfolio Code" },
    { key: "programCode", label: "Program Code" }, { key: "ownerEmail", label: "Owner Email" },
    { key: "status", label: "Status" }, { key: "startDate", label: "Start Date" },
    { key: "endDate", label: "End Date" }, { key: "budget", label: "Budget" },
  ],
};
const tasks: EntityMeta = {
  key: "tasks", label: "Tasks",
  columns: [
    { key: "projectCode", label: "Project Code" }, { key: "code", label: "Code" },
    { key: "name", label: "Name" }, { key: "description", label: "Description" },
    { key: "assigneeEmail", label: "Assignee Email" }, { key: "status", label: "Status" },
  ],
};
const risks: EntityMeta = {
  key: "risks", label: "Risks (RAID)",
  columns: [
    { key: "projectCode", label: "Project Code" }, { key: "code", label: "Code" },
    { key: "title", label: "Title" }, { key: "category", label: "Category" },
    { key: "severity", label: "Severity" },
  ],
};
const users: EntityMeta = {
  key: "users", label: "Users",
  columns: [
    { key: "email", label: "Email" }, { key: "name", label: "Name" },
    { key: "title", label: "Title" }, { key: "department", label: "Department" },
  ],
};
const resources: EntityMeta = {
  key: "resources", label: "Resources",
  columns: [
    { key: "employeeCode", label: "Employee Code" }, { key: "name", label: "Name" },
    { key: "email", label: "Email" }, { key: "title", label: "Title" },
  ],
};

const ENT: RouteEntityMeta[] = [portfolios, programs, projects, tasks, risks, users, resources];

function plan(headers: string[]): IoPlan {
  return buildHeuristicPlan(headers, ENT);
}

// ---- Tests ------------------------------------------------------------------

test("import order is parents-first for every linkage edge", () => {
  for (const [entity, refs] of Object.entries(LINKAGE_REFS)) {
    const at = IMPORT_ORDER.indexOf(entity);
    assert.ok(at >= 0, `${entity} must be in IMPORT_ORDER`);
    for (const ref of refs) {
      const from = IMPORT_ORDER.indexOf(ref.target);
      assert.ok(from >= 0, `${ref.target} must be in IMPORT_ORDER`);
      assert.ok(from < at, `${ref.target} must import before ${entity}`);
    }
  }
});

test("required sets contain the business key; required refs are covered", () => {
  for (const [entity, required] of Object.entries(REQUIRED_COLUMNS)) {
    assert.ok(required.includes(KEY_COLUMN[entity]), `${entity}: key column must be required`);
    assert.ok(IMPORT_ORDER.includes(entity));
  }
  for (const [entity, refs] of Object.entries(LINKAGE_REFS)) {
    for (const ref of refs.filter((r) => r.required)) {
      assert.ok(
        (REQUIRED_COLUMNS[entity] ?? []).includes(ref.column),
        `${entity}.${ref.column} is required linkage and must be a required column`,
      );
    }
  }
});

test("heuristic plan maps one header to several datasets, best first", () => {
  const headers = ["Code", "Name", "Portfolio Code", "Strategic Objective"];
  const p = buildHeuristicPlan(headers, ENT);
  const pc = p.assignments.find((a) => a.header === "Portfolio Code");
  assert.ok(pc);
  const pairs = pc.targets.map((t) => `${t.entity}.${t.column}`);
  assert.ok(pairs.includes("portfolios.code") || pairs.includes("programs.portfolioCode"));
  assert.ok(pairs.includes("projects.portfolioCode"));
  assert.equal(p.targets[0], "portfolios", "Strategic Objective pins Portfolios as the likely dataset");
  assert.equal(p.source, "heuristic");
});

test("single-dataset CSV routes every row to that dataset, label-keyed", () => {
  const headers = ["Code", "Name", "Description", "Status", "Owner Email", "Strategic Objective"];
  const rows = [
    { Code: "PF-1", Name: "Growth", Description: "d", Status: "ACTIVE", "Owner Email": "PMO@pmct.io", "Strategic Objective": "so" },
    { Code: "PF-2", Name: "Run", Description: "d2", Status: "ACTIVE", "Owner Email": "", "Strategic Objective": "" },
  ];
  const out = routeRows(headers, rows, plan(headers), ENT);
  assert.deepEqual(out.datasets.map((d) => d.entity), ["portfolios"]);
  const ds = out.datasets[0];
  assert.equal(ds.rows.length, 2);
  assert.deepEqual(ds.rows[0], rows[0]);
  assert.deepEqual(ds.lines, [2, 3]);
  assert.deepEqual(ds.keys, ["PF-1", "PF-2"]);
  assert.equal(ds.spawnedCount, 0);
  assert.equal(out.skipped.length, 0);
  assert.equal(out.routed, 2);
});

test("flat multi-block line spawns into every dataset it fully names", () => {
  const headers = [
    "Portfolio Code", "Portfolio Name", "Program Code", "Program Name",
    "Project Code", "Project Name", "Task Code", "Task Name",
  ];
  const rows = [{
    "Portfolio Code": "PF-1", "Portfolio Name": "Portfolio One",
    "Program Code": "PGM-1", "Program Name": "Program A",
    "Project Code": "PRJ-1", "Project Name": "Project Alpha",
    "Task Code": "T-1", "Task Name": "Design",
  }];
  const out = routeRows(headers, rows, plan(headers), ENT);
  const byEntity = new Map(out.datasets.map((d) => [d.entity, d]));
  assert.deepEqual([...byEntity.keys()].sort(), ["portfolios", "programs", "projects", "tasks"]);
  // Order follows IMPORT_ORDER (parents first) so callers can apply directly.
  assert.deepEqual(out.datasets.map((d) => d.entity), ["portfolios", "programs", "projects", "tasks"]);

  assert.deepEqual(byEntity.get("portfolios")!.rows[0], { Code: "PF-1", Name: "Portfolio One" });
  assert.deepEqual(byEntity.get("programs")!.rows[0], { Code: "PGM-1", Name: "Program A", "Portfolio Code": "PF-1" });
  assert.deepEqual(byEntity.get("projects")!.rows[0], {
    Code: "PRJ-1", Name: "Project Alpha", "Portfolio Code": "PF-1", "Program Code": "PGM-1",
  });
  assert.deepEqual(byEntity.get("tasks")!.rows[0], { "Project Code": "PRJ-1", Code: "T-1", Name: "Design" });
  for (const d of out.datasets) assert.deepEqual(d.lines, [2]);
  assert.equal(out.skipped.length, 0);
});

test("repeated parent blocks de-duplicate to one spawned row", () => {
  const headers = ["Portfolio Code", "Portfolio Name", "Task Code", "Task Name", "Project Code", "Project Name"];
  const rows = [1, 2, 3].map((i) => ({
    "Portfolio Code": "PF-1", "Portfolio Name": "Portfolio One",
    "Task Code": `T-${i}`, "Task Name": `Design ${i}`,
    "Project Code": "PRJ-1", "Project Name": "Project Alpha",
  }));
  const out = routeRows(headers, rows, plan(headers), ENT);
  const pf = out.datasets.find((d) => d.entity === "portfolios");
  const prj = out.datasets.find((d) => d.entity === "projects");
  const t = out.datasets.find((d) => d.entity === "tasks");
  assert.ok(pf && prj && t);
  assert.equal(pf.rows.length, 1, "one spawned portfolio row, not one per line");
  assert.equal(prj.rows.length, 1);
  assert.equal(t.rows.length, 3, "primary dataset keeps every line");
  assert.equal(t.keys.filter((k) => k === "T-1").length, 1);
});

test("generic headers never leak a child row into a look-alike parent", () => {
  // Programs template: "Code"/"Name" belong to the PROGRAM; the portfolio is only
  // referenced by code — no portfolio row may be spawned (its name would be wrong).
  const headers = ["Code", "Name", "Portfolio Code", "Description", "Status"];
  const rows = [{ Code: "PGM-1", Name: "Program A", "Portfolio Code": "PF-1", Description: "d", Status: "ACTIVE" }];
  const out = routeRows(headers, rows, plan(headers), ENT);
  assert.deepEqual(out.datasets.map((d) => d.entity), ["programs"]);
  assert.equal(out.datasets[0].rows[0].Code, "PGM-1");
  assert.equal(out.datasets[0].rows[0]["Portfolio Code"], "PF-1");
});

test("a row with no eligible dataset is skipped with a actionable reason", () => {
  const headers = ["Code", "Name", "Owner Email"];
  const rows = [{ Code: "PF-9", Name: "", "Owner Email": "x@y.com" }];
  const out = routeRows(headers, rows, plan(headers), ENT);
  assert.equal(out.datasets.length, 0);
  assert.equal(out.skipped.length, 1);
  assert.match(out.skipped[0].reason, /missing/i);
  assert.match(out.skipped[0].reason, /Name/);
});

test("empty rows are skipped, not routed", () => {
  const headers = ["Code", "Name"];
  const rows = [{ Code: "", Name: "" }];
  const out = routeRows(headers, rows, plan(headers), ENT);
  assert.equal(out.datasets.length, 0);
  assert.match(out.skipped[0].reason, /empty/i);
});

test("an ignored header (empty targets) drops its column from routing", () => {
  const headers = ["Code", "Name"];
  const p = plan(headers);
  p.assignments = p.assignments.map((a) => ({ ...a, targets: a.header === "Name" ? [] : a.targets }));
  const out = routeRows(headers, [{ Code: "PF-1", Name: "Growth" }], p, ENT);
  assert.equal(out.datasets.length, 0, "portfolios needs Name — with it ignored nothing is eligible");
  assert.equal(out.skipped.length, 1);
});

test("pending index carries normalized keys and usable stubs", () => {
  const headers = ["Code", "Name", "Email"];
  const out = routeRows(
    headers,
    [
      { Code: "PF-1", Name: "Growth", Email: "" },
      { Code: "", Name: "Platform Admin", Email: "PMO@PMCT.io" },
    ],
    plan(headers),
    ENT,
  );
  const pending = buildPendingIndex(out.datasets, ENT);
  const pf = pending.keys.get("portfolios")?.get("PF-1");
  assert.ok(pf);
  assert.equal(pf.id, "__pmct_pending__:portfolios:PF-1");
  assert.equal(pf.code, "PF-1");
  assert.equal(pf.name, "Growth");
  const u = pending.keys.get("users")?.get("pmo@pmct.io");
  assert.ok(u, "user keys are trimmed + lowercased like userByEmail queries");
  assert.equal(u.email, "pmo@pmct.io");
});

test("pendingKeyOf mirrors the applyRow lookup semantics", () => {
  assert.equal(pendingKeyOf("users", "  A@B.Com "), "a@b.com");
  assert.equal(pendingKeyOf("projects", " PRJ-1 "), "PRJ-1");
  assert.equal(pendingKeyOf("projects", "PRJ-1"), "PRJ-1"); // codes are case-sensitive
  assert.equal(pendingKeyOf("projects", "   "), "");
});
