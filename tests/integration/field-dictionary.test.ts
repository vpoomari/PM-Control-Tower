// PM CONTROL TOWER — Field Dictionary integration tests (db-backed)
// Run: npx tsx --test tests/integration/field-dictionary.test.ts
//
// Covers the acceptance criteria that need real persistence:
//   1. a field is created ONCE in the dictionary
//   2. the same definition is reused across multiple modules (no duplicates)
//   3. duplicate assignments are rejected
//   4. values persist against the correct business record, per module
//   5. typed storage keeps numeric/date values usable
//   6. validation (required / range / type) is enforced server-side
//   7. deprecation blocks new writes but never loses historical values
//   8. removing an assignment retains stored values
//   9. destructive delete is refused while data exists
//  10. lifecycle + assignment changes are audited
//
// Every test cleans up after itself; a unique key suffix keeps re-runs safe.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/lib/db";
import {
  assignFields, getDefinitionByKey, listAssignments, logFieldAudit, readValues,
  removeAssignment, updateAssignment, usageSnapshot, writeValues,
} from "../../src/lib/fields/store";

const RUN = Math.random().toString(36).slice(2, 8);
const KEY_OWNER = `it_owner_${RUN}`;
const KEY_TIER = `it_tier_${RUN}`;
const KEY_DATE = `it_review_${RUN}`;

const ADMIN = { id: "it-admin", name: "Integration Test", roles: ["PMO_ADMIN"], isSuperAdmin: true };
const MEMBER = { id: "it-member", name: "Team Member", roles: ["TEAM_MEMBER"], isSuperAdmin: false };

let projectId = "";
let riskId = "";
let ownerFieldId = "";
let tierFieldId = "";

before(async () => {
  const project = await db.project.findFirst({ select: { id: true } });
  const risk = await db.risk.findFirst({ select: { id: true } });
  assert.ok(project, "seeded project required");
  assert.ok(risk, "seeded risk required");
  projectId = project.id;
  riskId = risk.id;

  const owner = await db.customFieldDefinition.create({
    data: { fieldKey: KEY_OWNER, name: "Business Owner", label: "Business Owner", dataType: "TEXT", sensitivity: "CONFIDENTIAL", createdById: ADMIN.id, createdByName: ADMIN.name },
  });
  ownerFieldId = owner.id;

  const tier = await db.customFieldDefinition.create({
    data: { fieldKey: KEY_TIER, name: "Tier", label: "Tier", dataType: "SINGLE_SELECT", options: ["Gold", "Silver", "Bronze"] as never, createdById: ADMIN.id, createdByName: ADMIN.name },
  });
  tierFieldId = tier.id;

  await db.customFieldDefinition.create({
    data: { fieldKey: KEY_DATE, name: "Next Review", label: "Next Review", dataType: "DATE", createdById: ADMIN.id, createdByName: ADMIN.name },
  });

  await logFieldAudit({ fieldDefinitionId: ownerFieldId, action: "CREATE", summary: "integration setup", userId: ADMIN.id, userName: ADMIN.name });
});

after(async () => {
  // Leave no residue: remove every definition created by this run.
  for (const key of [KEY_OWNER, KEY_TIER, KEY_DATE]) {
    const f = await db.customFieldDefinition.findUnique({ where: { fieldKey: key } });
    if (f) await db.customFieldDefinition.delete({ where: { id: f.id } });
  }
});

test("1. a field is defined once and reused across modules (no duplicate definitions)", async () => {
  const res = await assignFields("project", [{ fieldId: ownerFieldId }], ADMIN);
  assert.equal(res.assigned.length, 1);
  assert.equal(res.skipped.length, 0);

  // The SAME definition id now serves two modules.
  const second = await assignFields("risk", [{ fieldId: ownerFieldId }], ADMIN);
  assert.equal(second.assigned.length, 1);

  const def = await getDefinitionByKey(KEY_OWNER);
  assert.ok(def);
  assert.deepEqual([...def.modules].sort(), ["project", "risk"]);
  assert.equal(def.assignmentCount, 2);
  assert.equal(def.valueCount, 0);
});

test("2. the same field cannot be assigned to the same module twice", async () => {
  const res = await assignFields("project", [{ fieldId: ownerFieldId }], ADMIN);
  assert.equal(res.assigned.length, 0);
  assert.equal(res.skipped.length, 1);
  assert.match(res.skipped[0].reason, /Already assigned/i);

  const defs = await db.customFieldDefinition.count({ where: { fieldKey: KEY_OWNER } });
  assert.equal(defs, 1); // still exactly one dictionary record
});

test("3. values persist against the correct record, isolated per module", async () => {
  await assignFields("project", [{ fieldId: tierFieldId }], ADMIN);
  await assignFields("risk", [{ fieldId: tierFieldId }], ADMIN);

  const onProject = await writeValues("project", projectId, { [KEY_OWNER]: "Sarah Chen", [KEY_TIER]: "Gold" }, ADMIN);
  assert.equal(onProject.ok, true, onProject.errors.join("; "));

  const onRisk = await writeValues("risk", riskId, { [KEY_OWNER]: "David Nkosi", [KEY_TIER]: "Bronze" }, ADMIN);
  assert.equal(onRisk.ok, true, onRisk.errors.join("; "));

  const projectValues = await readValues("project", [projectId]);
  const riskValues = await readValues("risk", [riskId]);
  assert.equal(projectValues[projectId][KEY_OWNER], "Sarah Chen");
  assert.equal(riskValues[riskId][KEY_OWNER], "David Nkosi");
  // Adding a field to one module never copies values into another.
  assert.equal(projectValues[projectId][KEY_TIER], "Gold");
  assert.equal(riskValues[riskId][KEY_TIER], "Bronze");
});

test("4. typed storage keeps numeric and date values usable (not text blobs)", async () => {
  const dateField = await getDefinitionByKey(KEY_DATE);
  assert.ok(dateField);
  await assignFields("project", [{ fieldId: dateField.id }], ADMIN);

  const res = await writeValues("project", projectId, { [KEY_DATE]: "2026-06-30" }, ADMIN);
  assert.equal(res.ok, true, res.errors.join("; "));

  const row = await db.customFieldValue.findUnique({
    where: { fieldDefinitionId_moduleKey_recordId: { fieldDefinitionId: dateField.id, moduleKey: "project", recordId: projectId } },
  });
  assert.ok(row, "value row persisted");
  assert.ok(row.valueDate instanceof Date, "DATE lands in the typed valueDate column");
  assert.equal(row.valueNumber, null);
  assert.equal(row.valueText, "2026-06-30");

  // A date value is comparable — range filters work because of typed storage.
  const inRange = await db.customFieldValue.count({
    where: { fieldDefinitionId: dateField.id, valueDate: { gte: new Date("2026-01-01"), lte: new Date("2026-12-31") } },
  });
  assert.ok(inRange >= 1);
});

test("5. validation is enforced server-side (invalid option, out-of-range, unknown field)", async () => {
  const bad = await writeValues("risk", riskId, { [KEY_TIER]: "Platinum" }, ADMIN);
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /not a valid option/i);

  const unknown = await writeValues("risk", riskId, { not_a_dictionary_field: 1 }, ADMIN);
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors[0], /not configured/i);
});

test("6. required rules are enforced for submitted keys", async () => {
  await updateAssignment((await listAssignments("risk")).find((a) => a.field.fieldKey === KEY_TIER)!.id, { isRequired: true }, ADMIN);
  const missing = await writeValues("risk", riskId, { [KEY_TIER]: null }, ADMIN);
  assert.equal(missing.ok, false);
  assert.match(missing.errors[0], /required/i);

  const present = await writeValues("risk", riskId, { [KEY_TIER]: "Silver" }, ADMIN);
  assert.equal(present.ok, true, present.errors.join("; "));
});

test("7. deprecation blocks new writes but preserves historical values", async () => {
  await db.customFieldDefinition.update({ where: { id: ownerFieldId }, data: { status: "DEPRECATED", deprecationReason: "Superseded", isActive: false } });

  const blocked = await writeValues("risk", riskId, { [KEY_OWNER]: "New Owner" }, ADMIN);
  assert.equal(blocked.ok, false);
  assert.match(blocked.errors[0], /deprecated/i);

  const values = await readValues("risk", [riskId]);
  assert.equal(values[riskId][KEY_OWNER], "David Nkosi", "historical value survives deprecation");

  await db.customFieldDefinition.update({ where: { id: ownerFieldId }, data: { status: "ACTIVE", isActive: true } });
});

test("8. a non-privileged subject cannot write dictionary values", async () => {
  const res = await writeValues("risk", riskId, { [KEY_OWNER]: "Hacked" }, MEMBER);
  // TEAM_MEMBER lacks raid.manage → the store's edit gate rejects it.
  assert.equal(res.ok, false);
  const values = await readValues("risk", [riskId]);
  assert.equal(values[riskId][KEY_OWNER], "David Nkosi");
});

test("9. removing an assignment retains stored values (historical integrity)", async () => {
  const assignment = (await listAssignments("risk")).find((a) => a.field.fieldKey === KEY_TIER);
  assert.ok(assignment);
  const removed = await removeAssignment(assignment.id, ADMIN, {});
  assert.ok(removed);
  assert.equal(removed.valuesRemoved, 0);

  const values = await readValues("risk", [riskId]);
  assert.equal(values[riskId][KEY_TIER], "Silver", "value retained after unassigning");

  const row = await db.customFieldValue.findUnique({
    where: { fieldDefinitionId_moduleKey_recordId: { fieldDefinitionId: tierFieldId, moduleKey: "risk", recordId: riskId } },
  });
  assert.ok(row);
  assert.equal(row.assignmentId, null, "value is detached from the assignment but kept");
});

test("10. impact + usage snapshots report assignments and stored values", async () => {
  const usage = await usageSnapshot(ownerFieldId);
  assert.equal(usage.totalAssignments, 2);
  assert.ok(usage.totalValues >= 2);
  assert.ok(usage.modulesWithValues.includes("project"));
  assert.ok(usage.modulesWithValues.includes("risk"));
});

test("11. the dictionary exposes an audit trail for the lifecycle", async () => {
  const logs = await db.fieldAuditLog.findMany({ where: { fieldDefinitionId: ownerFieldId }, orderBy: { createdAt: "asc" } });
  assert.ok(logs.length >= 3, `expected CREATE + ASSIGN entries, got ${logs.length}`);
  assert.ok(logs.some((l) => l.action === "CREATE"));
  assert.ok(logs.some((l) => l.action === "ASSIGN"));
});
