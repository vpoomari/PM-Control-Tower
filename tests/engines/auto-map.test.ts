// PM CONTROL TOWER — CSV auto-mapping unit tests (pure, DB-free, deterministic).
// Covers header normalization, synonym + containment matching, entity detection
// scoring/tie-breaking, override application and duplicate-column protection.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHeader, matchColumn, detectEntityAndMap, applyMapping, mapRows, IGNORE_SENTINEL,
  type EntityMeta,
} from "../../src/lib/io/auto-map";

const projects: EntityMeta = {
  key: "projects",
  label: "Projects",
  columns: [
    { key: "code", label: "Project Code" },
    { key: "name", label: "Project Name" },
    { key: "status", label: "Status" },
    { key: "startDate", label: "Start Date" },
    { key: "endDate", label: "End Date" },
    { key: "budget", label: "Budget (USD)" },
  ],
};
const users: EntityMeta = {
  key: "users",
  label: "Users",
  columns: [
    { key: "email", label: "Email" },
    { key: "name", label: "Full Name" },
    { key: "title", label: "Job Title" },
    { key: "employeeCode", label: "Employee Code" },
  ],
};

test("auto-map: normalizeHeader strips punctuation, spacing and case", () => {
  assert.equal(normalizeHeader("  Project Code "), "projectcode");
  assert.equal(normalizeHeader("Start-Date (planned)"), "startdateplanned");
  assert.equal(normalizeHeader("ÉMAIL"), "mail");
});

test("auto-map: exact key, label and normalized matches are strong", () => {
  assert.equal(matchColumn("code", projects.columns)?.confidence, "strong");
  assert.equal(matchColumn("Project Code", projects.columns)?.confidence, "strong");
  assert.equal(matchColumn("project_code", projects.columns)?.key, "code");
  assert.equal(matchColumn("START DATE", projects.columns)?.key, "startDate");
});

test("auto-map: synonyms resolve id/ref/title", () => {
  assert.equal(matchColumn("ID", projects.columns)?.key, "code");
  assert.equal(matchColumn("Ref#", projects.columns)?.key, "code");
  assert.equal(matchColumn("Ref#", users.columns), null); // no code-like column in users
  assert.equal(matchColumn("Title", users.columns)?.key, "title"); // exact key beats synonym
  assert.equal(matchColumn("Title", projects.columns)?.key, "name"); // synonym when no title column
});

test("auto-map: containment is a weak match with a sensible direction", () => {
  const m = matchColumn("Project", projects.columns);
  assert.equal(m?.confidence, "weak");
  assert.equal(m?.key, "code"); // projectCode contains "project"; checked before name
  assert.equal(matchColumn("ab", projects.columns), null); // too short to contain-match
  assert.equal(matchColumn("Completely Unrelated Column", projects.columns), null);
});

test("auto-map: detects the target entity from mixed-style headers", () => {
  const headers = ["Project Code", "Name", "Status", "Start Date", "budget_usd", "mystery"];
  const d = detectEntityAndMap(headers, [projects, users]);
  assert.ok(d);
  assert.equal(d.entity, "projects");
  assert.equal(d.mappedCount, 5);
  assert.equal(d.strongCount, 5); // budget_usd normalizes to "budgetusd" — exact normalized match
  assert.deepEqual(d.matches.filter((m) => !m.columnKey).map((m) => m.header), ["mystery"]);
});

test("auto-map: prefers the entity with the higher score (users file → users)", () => {
  const headers = ["Email", "Full Name", "Job Title"];
  const d = detectEntityAndMap(headers, [projects, users]);
  assert.ok(d);
  assert.equal(d.entity, "users");
  assert.equal(d.strongCount, 3);
});

test("auto-map: returns null when nothing matches any entity", () => {
  assert.equal(detectEntityAndMap(["foo", "bar"], [projects, users]), null);
});

test("auto-map: applyMapping honors overrides and blocks duplicate targets", () => {
  const headers = ["Proj Code", "Name", "Title"];
  const { matches, duplicates } = applyMapping(headers, users.columns, { "Proj Code": "employeeCode", Title: "name" });
  assert.deepEqual(matches.map((m) => m.columnKey), ["employeeCode", "name", null]);
  assert.deepEqual(duplicates, ["Title"]); // "name" already taken by "Name"
  assert.equal(matches[2].header, "Title");
});

test("auto-map: applyMapping ignores overrides for unknown columns", () => {
  const { matches } = applyMapping(["Email"], users.columns, { Email: "not-a-column" });
  assert.equal(matches[0].columnKey, "email"); // falls back to automatic matching
});

test("auto-map: the ignore sentinel forces a column out even if it auto-matches", () => {
  const { matches, duplicates } = applyMapping(["Email", "Name"], users.columns, { Email: IGNORE_SENTINEL });
  assert.equal(matches[0].columnKey, null);
  assert.equal(matches[1].columnKey, "name");
  assert.deepEqual(duplicates, []);
});

test("auto-map: mapRows re-keys rows, drops unmapped fields and empty rows", () => {
  const matches = [
    { header: "Project Code", columnKey: "code", confidence: "strong" as const },
    { header: "Name", columnKey: "name", confidence: "strong" as const },
    { header: "mystery", columnKey: null, confidence: null },
  ];
  const rows = [
    { "Project Code": "P-001", Name: "Alpha", mystery: "ignored" },
    { "Project Code": "", Name: "", mystery: "only-unmapped" },
  ];
  const out = mapRows(rows, matches);
  assert.deepEqual(out, [{ code: "P-001", name: "Alpha" }]);
});
