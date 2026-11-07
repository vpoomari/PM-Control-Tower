// PM CONTROL TOWER — Field Dictionary Engine unit tests (pure, DB-free)
// Covers: data-type catalog + legacy mapping, typed value packing/unpacking,
// safe formula evaluation, role-based sensitivity gating, impact analysis
// classification and the 23-module registry.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIELD_MODULES, FIELD_TYPE_META, FIELD_TYPES, MODULE_KEYS, analyseImpact, canEditField, canViewField,
  evaluateFormula, formatValue, formulaRefs, getModule, isFieldType, isModuleKey, isTypeCompatible,
  normalizeType, packValue, unpackValue, EMPTY_PACKED,
  type FieldChange, type FieldUsageSnapshot,
} from "../../src/lib/engines/field-dictionary";

// ---------- module registry ----------
test("registry: exactly 23 supported modules with unique keys", () => {
  assert.equal(FIELD_MODULES.length, 23);
  assert.equal(new Set(MODULE_KEYS).size, 23);
});

test("registry: every module has view/manage permissions, sections and an area", () => {
  for (const m of FIELD_MODULES) {
    assert.ok(m.viewPerm.includes("."), `${m.key} viewPerm`);
    assert.ok(m.managePerm.includes("."), `${m.key} managePerm`);
    assert.ok(m.sections.length > 0, `${m.key} sections`);
    assert.ok(["Portfolio", "Plan", "Execute", "Control", "Administration"].includes(m.area), `${m.key} area`);
    assert.ok(isModuleKey(m.key));
  }
});

test("registry: documented module list matches the spec ordering", () => {
  assert.deepEqual(MODULE_KEYS, [
    "portfolio", "program", "project",
    "requirement", "wbs_node", "task", "milestone", "baseline",
    "resource", "timesheet", "timesheet_entry",
    "budget_line", "evm_period", "health_snapshot", "risk", "issue", "assumption",
    "change_request", "stage_gate", "governance_rule", "governance_alert",
    "user", "audit_trail",
  ]);
  assert.equal(getModule("risk")?.label, "Risks (RAID)");
  assert.equal(getModule("nope"), null);
});

// ---------- data types ----------
test("types: every catalog entry has complete metadata", () => {
  for (const t of FIELD_TYPES) {
    const meta = FIELD_TYPE_META[t];
    assert.ok(meta, `${t} metadata`);
    assert.equal(meta.type, t);
    assert.ok(meta.label.length > 0);
    assert.ok(["valueText", "valueNumber", "valueDate", "valueBool", "valueJson"].includes(meta.column));
    assert.ok(meta.input.length > 0);
  }
});

test("types: legacy v3.2 names map onto the v4.0 catalog", () => {
  assert.equal(normalizeType("NUMBER"), "DECIMAL");
  assert.equal(normalizeType("BOOLEAN"), "CHECKBOX");
  assert.equal(normalizeType("DROPDOWN"), "SINGLE_SELECT");
  assert.equal(normalizeType("TEXT"), "TEXT");
  assert.equal(normalizeType("RICH_TEXT"), "TEXT"); // unknown degrades to TEXT
  assert.equal(isFieldType("CURRENCY"), true);
  assert.equal(isFieldType("wat"), false);
});

// ---------- typed packing ----------
test("packValue: numeric types land in valueNumber and respect range/integer rules", () => {
  const dec = packValue({ label: "Capex", dataType: "DECIMAL", config: { min: 0, max: 1_000_000 } }, "1250.5");
  assert.equal(dec.ok, true);
  if (dec.ok) {
    assert.equal(dec.value, 1250.5);
    assert.equal(dec.packed.valueNumber, 1250.5);
    assert.equal(dec.packed.valueText, null); // never stored as text
  }

  const int = packValue({ label: "Count", dataType: "INTEGER" }, "3.5");
  assert.equal(int.ok, false);

  const currency = packValue({ label: "Budget", dataType: "CURRENCY" }, "1000");
  if (currency.ok) assert.equal(currency.packed.valueNumber, 1000);

  const pct = packValue({ label: "Complete", dataType: "PERCENTAGE", config: { min: 0, max: 100 } }, "150");
  assert.equal(pct.ok, false);
});

test("packValue: date types land in valueDate, checkbox in valueBool", () => {
  const d = packValue({ label: "Due", dataType: "DATE" }, "2026-03-14");
  assert.equal(d.ok, true);
  if (d.ok) {
    assert.ok(d.packed.valueDate instanceof Date);
    assert.equal(d.value, "2026-03-14");
  }
  assert.equal(packValue({ label: "Due", dataType: "DATE" }, "not-a-date").ok, false);

  const b = packValue({ label: "Approved", dataType: "CHECKBOX" }, true);
  if (b.ok) assert.equal(b.packed.valueBool, true);
  const b2 = packValue({ label: "Approved", dataType: "CHECKBOX" }, "false");
  if (b2.ok) assert.equal(b2.packed.valueBool, false);
  assert.equal(packValue({ label: "Approved", dataType: "CHECKBOX" }, "maybe").ok, false);
});

test("packValue: selects validate against options, multi-select dedupes into valueJson", () => {
  const s = packValue({ label: "Region", dataType: "SINGLE_SELECT", options: ["EMEA", "APAC"] }, "EMEA");
  if (s.ok) assert.equal(s.packed.valueText, "EMEA");
  assert.equal(packValue({ label: "Region", dataType: "SINGLE_SELECT", options: ["EMEA", "APAC"] }, "LATAM").ok, false);

  const m = packValue({ label: "Tags", dataType: "MULTI_SELECT", options: ["a", "b", "c"] }, ["a", "b", "a"]);
  assert.equal(m.ok, true);
  if (m.ok) {
    assert.deepEqual(m.value, ["a", "b"]);
    assert.deepEqual(m.packed.valueJson, ["a", "b"]);
    assert.equal(m.packed.valueText, "a, b"); // denormalised for search/export
  }
});

test("packValue: formats are enforced (email/url/phone) and empty clears the field", () => {
  assert.equal(packValue({ label: "Email", dataType: "EMAIL" }, "nope").ok, false);
  assert.equal(packValue({ label: "Email", dataType: "EMAIL" }, "a@b.co").ok, true);
  assert.equal(packValue({ label: "Url", dataType: "URL" }, "not a url").ok, false);
  assert.equal(packValue({ label: "Url", dataType: "URL" }, "example.com/x").ok, true);
  assert.equal(packValue({ label: "Phone", dataType: "PHONE" }, "12").ok, false);
  assert.equal(packValue({ label: "Phone", dataType: "PHONE" }, "+44 20 7946 0958").ok, true);

  const cleared = packValue({ label: "Text", dataType: "TEXT" }, "");
  assert.equal(cleared.ok, true);
  if (cleared.ok) {
    assert.equal(cleared.value, null);
    assert.deepEqual(cleared.packed, EMPTY_PACKED);
  }
});

test("packValue: formula fields refuse direct submission", () => {
  assert.equal(packValue({ label: "Total", dataType: "FORMULA" }, 12).ok, false);
});

test("packValue: assignment validation overrides tighten the global rules", () => {
  const def = { label: "Score", dataType: "DECIMAL", config: { min: 0, max: 100 } };
  assert.equal(packValue(def, 250, { max: 50 }).ok, false); // tighter max wins
  assert.equal(packValue(def, 40, { max: 50 }).ok, true);
});

test("unpackValue: reads the typed columns back into a flat value", () => {
  assert.equal(unpackValue({ ...EMPTY_PACKED, valueNumber: 42 }), 42);
  assert.equal(unpackValue({ ...EMPTY_PACKED, valueBool: false }), false);
  assert.deepEqual(unpackValue({ ...EMPTY_PACKED, valueJson: ["x", "y"] }), ["x", "y"]);
  assert.equal(unpackValue({ ...EMPTY_PACKED, valueText: "hello" }), "hello");
  assert.equal(unpackValue(EMPTY_PACKED), null);
});

// ---------- formatting (display / export) ----------
test("formatValue: currency, percentage, checkbox and multi-select", () => {
  assert.equal(formatValue({ dataType: "CURRENCY" }, 1250, "USD"), "$1,250.00");
  assert.equal(formatValue({ dataType: "PERCENTAGE" }, 87), "87%");
  assert.equal(formatValue({ dataType: "CHECKBOX" }, true), "Yes");
  assert.equal(formatValue({ dataType: "CHECKBOX" }, false), "No");
  assert.equal(formatValue({ dataType: "MULTI_SELECT" }, ["a", "b"]), "a, b");
  assert.equal(formatValue({ dataType: "TEXT" }, null), "");
});

// ---------- formulas ----------
test("formula: arithmetic, precedence, parentheses and unary minus", () => {
  assert.deepEqual(evaluateFormula("2 + 3 * 4", {}), { ok: true, value: 14 });
  assert.deepEqual(evaluateFormula("(2 + 3) * 4", {}), { ok: true, value: 20 });
  assert.deepEqual(evaluateFormula("-5 + 10", {}), { ok: true, value: 5 });
  assert.deepEqual(evaluateFormula("10 % 3", {}), { ok: true, value: 1 });
});

test("formula: resolves sibling custom field keys from the record scope", () => {
  const res = evaluateFormula("capex + opex", { capex: 100, opex: 25.5 });
  assert.deepEqual(res, { ok: true, value: 125.5 });
  // unknown refs evaluate to 0 rather than failing the whole calculation
  assert.deepEqual(evaluateFormula("capex + missing", { capex: 10 }), { ok: true, value: 10 });
});

test("formula: division by zero and malformed input surface as errors, never throw", () => {
  assert.equal(evaluateFormula("10 / 0", {}).ok, false);
  assert.equal(evaluateFormula("10 % 0", {}).ok, false);
  assert.equal(evaluateFormula("2 +", {}).ok, false);
  assert.equal(evaluateFormula("(1 + 2", {}).ok, false);
  assert.equal(evaluateFormula("", {}).ok, false);
  assert.equal(evaluateFormula("process.exit()", {}).ok, false); // injection attempt
  assert.equal(evaluateFormula("alert(1)", {}).ok, false);
});

test("formula: formulaRefs lists the referenced field keys", () => {
  const refs = formulaRefs("capex + opex * contingency_rate");
  assert.ok(refs.includes("capex"));
  assert.ok(refs.includes("opex"));
  assert.ok(refs.includes("contingency_rate"));
});

// ---------- sensitivity / role gating ----------
test("sensitivity: unrestricted fields are visible to everyone, restricted ones honour roles", () => {
  const open = { sensitivity: "INTERNAL", visibleRolesJson: null, editableRolesJson: null, isReadOnly: false };
  assert.equal(canViewField(open, { roles: ["TEAM_MEMBER"], isSuperAdmin: false }), true);

  const board = { sensitivity: "CONFIDENTIAL", visibleRolesJson: "EXECUTIVE,FINANCE", editableRolesJson: "EXECUTIVE", isReadOnly: false };
  assert.equal(canViewField(board, { roles: ["EXECUTIVE"], isSuperAdmin: false }), true);
  assert.equal(canViewField(board, { roles: ["TEAM_MEMBER"], isSuperAdmin: false }), false);
  assert.equal(canViewField(board, { roles: ["TEAM_MEMBER"], isSuperAdmin: true }), true); // superadmin bypasses
  assert.equal(canViewField(board, null), false);

  assert.equal(canEditField(board, { roles: ["EXECUTIVE"], isSuperAdmin: false }), true);
  assert.equal(canEditField(board, { roles: ["FINANCE"], isSuperAdmin: false }), false); // visible but not editable
  assert.equal(canEditField({ ...open, isReadOnly: true }, { roles: ["PMO_ADMIN"], isSuperAdmin: false }), false);
});

// ---------- impact analysis ----------
const usage = (over: Partial<FieldUsageSnapshot> = {}): FieldUsageSnapshot => ({
  assignments: [{ moduleKey: "project", count: 1, sections: ["general"] }, { moduleKey: "risk", count: 1, sections: ["ownership"] }],
  totalAssignments: 2,
  totalValues: 12,
  recordsWithValue: 12,
  modulesWithValues: ["project", "risk"],
  ...over,
});

test("impact: relabelling is always safe (no migration, no approval)", () => {
  const before: FieldChange = { label: "Biz Owner", description: "old" };
  const after: FieldChange = { label: "Business Owner", description: "new" };
  const findings = analyseImpact(before, after, usage());
  assert.equal(findings.some((f) => f.requiresMigration || f.requiresApproval), false);
  assert.ok(findings.some((f) => f.code === "LABEL_CHANGED"));
});

test("impact: changing the immutable key demands migration + approval", () => {
  const findings = analyseImpact({ fieldKey: "owner" }, { fieldKey: "business_owner" }, usage());
  const key = findings.find((f) => f.code === "KEY_CHANGED");
  assert.ok(key);
  assert.equal(key.severity, "high");
  assert.equal(key.requiresMigration, true);
  assert.equal(key.requiresApproval, true);
});

test("impact: incompatible type changes are flagged high with migration", () => {
  const findings = analyseImpact({ dataType: "TEXT" }, { dataType: "CHECKBOX" }, usage());
  const t = findings.find((f) => f.code === "TYPE_CHANGED");
  assert.ok(t);
  assert.equal(t.severity, "high");
  assert.equal(t.requiresMigration, true);
});

test("impact: compatible type changes are only medium severity", () => {
  const findings = analyseImpact({ dataType: "TEXT" }, { dataType: "LONG_TEXT" }, usage());
  const t = findings.find((f) => f.code === "TYPE_CHANGED");
  assert.ok(t);
  assert.equal(t.severity, "medium");
});

test("impact: removing options that still hold data is high severity", () => {
  const findings = analyseImpact({ options: ["a", "b", "c"] }, { options: ["a"] }, usage());
  const o = findings.find((f) => f.code === "OPTIONS_REMOVED");
  assert.ok(o);
  assert.equal(o.severity, "high");
  assert.equal(o.requiresMigration, true);
});

test("impact: making a field required with existing blank data needs remediation", () => {
  const findings = analyseImpact({ isRequired: false }, { isRequired: true }, usage());
  const r = findings.find((f) => f.code === "NOW_REQUIRED");
  assert.ok(r);
  assert.equal(r.requiresMigration, true);
});

test("impact: deprecation preserves history", () => {
  const findings = analyseImpact({ status: "ACTIVE" }, { status: "DEPRECATED" }, usage());
  const s = findings.find((f) => f.code === "STATUS_TIGHTENED");
  assert.ok(s);
  assert.equal(s.requiresMigration, false);
});

test("impact: tightening sensitivity needs approval", () => {
  const findings = analyseImpact({ sensitivity: "INTERNAL" }, { sensitivity: "RESTRICTED" }, usage());
  const s = findings.find((f) => f.code === "SENSITIVITY_CHANGED");
  assert.ok(s);
  assert.equal(s.requiresApproval, true);
});

test("type compatibility: numbers convert between numeric types, text does not become a checkbox", () => {
  assert.equal(isTypeCompatible(normalizeType("INTEGER"), normalizeType("DECIMAL")), true);
  assert.equal(isTypeCompatible(normalizeType("CURRENCY"), normalizeType("DECIMAL")), true);
  assert.equal(isTypeCompatible(normalizeType("SINGLE_SELECT"), normalizeType("MULTI_SELECT")), true);
  assert.equal(isTypeCompatible(normalizeType("TEXT"), normalizeType("CHECKBOX")), false);
});
