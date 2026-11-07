// PM CONTROL TOWER — Dynamic Field Configuration Engine unit tests (pure, DB-free)
// Covers: deep merge semantics (tab updates never clobber sibling keys),
// graceful JSON parsing, per-datatype value validation/coercion, and
// required-field enforcement scoped to submitted keys.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deepMerge, parseCustomData, validateCustomData, coerceValue, missingRequired,
  normalizeOptions, isFieldDataType, normalizeFieldConfig, fieldDefault, computeFieldStats, ruleSummary,
  MAX_TEXT_LENGTH, type FieldDef, type CustomData,
} from "../../src/lib/engines/custom-fields";

// ---------- helpers ----------
const def = (over: Partial<FieldDef> & { fieldKey: string }): FieldDef => ({
  id: `id-${over.fieldKey}`,
  label: over.fieldKey,
  dataType: "TEXT",
  options: null,
  description: null,
  isActive: true,
  ...over,
});

// ---------- DATA TYPES ----------
test("field types: isFieldDataType accepts the six supported types only", () => {
  for (const t of ["TEXT", "NUMBER", "DATE", "BOOLEAN", "DROPDOWN", "USER_LOOKUP"]) {
    assert.equal(isFieldDataType(t), true);
  }
  assert.equal(isFieldDataType("RICH_TEXT"), false);
  assert.equal(isFieldDataType(42), false);
  assert.equal(isFieldDataType(null), false);
});

// ---------- DEEP MERGE ----------
test("deepMerge: sibling keys from another tab survive a single-tab patch", () => {
  const existing: CustomData = { region: "EMEA", owner_ref: "u-1", capex: 1200 };
  const patch: CustomData = { region: "APAC" }; // this tab owns `region` only
  assert.deepEqual(deepMerge(existing, patch), { region: "APAC", owner_ref: "u-1", capex: 1200 });
});

test("deepMerge: nested plain objects merge recursively (keys added, not replaced)", () => {
  const out = deepMerge(
    { a: { x: 1, y: 2 } },
    { a: { y: 9, z: 3 } },
  );
  assert.deepEqual(out, { a: { x: 1, y: 9, z: 3 } });
});

test("deepMerge: arrays are replaced (not concatenated) and undefined patch values are ignored", () => {
  const out = deepMerge(
    { list: [1, 2, 3], keep: "yes" },
    { list: [9], keep: undefined },
  );
  assert.deepEqual(out, { list: [9], keep: "yes" });
});

test("deepMerge: null patch value clears a key; base object is not mutated", () => {
  const base = { k: "old" };
  const out = deepMerge(base, { k: null });
  assert.deepEqual(out, { k: null });
  assert.deepEqual(base, { k: "old" });
});

// ---------- PARSE (graceful JSON handling) ----------
test("parseCustomData: keeps primitives, drops nested garbage, survives non-objects", () => {
  assert.deepEqual(
    parseCustomData({ a: "s", b: 1, c: true, d: null, e: { nested: 1 }, f: [1, 2] }),
    { a: "s", b: 1, c: true, d: null },
  );
  assert.deepEqual(parseCustomData(null), {});
  assert.deepEqual(parseCustomData("[1,2]"), {});
  assert.deepEqual(parseCustomData("not json"), {});
  assert.deepEqual(parseCustomData(undefined), {});
});

// ---------- OPTIONS ----------
test("normalizeOptions: filters empty/non-string entries and trims", () => {
  assert.deepEqual(normalizeOptions([" A ", "B", "", 3, "  "]), ["A", "B"]);
  assert.deepEqual(normalizeOptions("garbage"), []);
  assert.deepEqual(normalizeOptions(null), []);
});

// ---------- COERCION ----------
test("coerceValue: TEXT trims, enforces max length, rejects non-strings", () => {
  assert.deepEqual(coerceValue(def({ fieldKey: "t", dataType: "TEXT" }), "  hi  "), { ok: true, value: "hi" });
  assert.deepEqual(coerceValue(def({ fieldKey: "t", dataType: "TEXT" }), ""), { ok: true, value: null });
  assert.equal(coerceValue(def({ fieldKey: "t", dataType: "TEXT" }), "x".repeat(MAX_TEXT_LENGTH + 1)).ok, false);
  assert.equal(coerceValue(def({ fieldKey: "t", dataType: "TEXT" }), 7).ok, false);
});

test("coerceValue: NUMBER accepts numeric strings, rejects NaN/objects", () => {
  assert.deepEqual(coerceValue(def({ fieldKey: "n", dataType: "NUMBER" }), "42.5"), { ok: true, value: 42.5 });
  assert.deepEqual(coerceValue(def({ fieldKey: "n", dataType: "NUMBER" }), 0), { ok: true, value: 0 });
  assert.equal(coerceValue(def({ fieldKey: "n", dataType: "NUMBER" }), "abc").ok, false);
  assert.equal(coerceValue(def({ fieldKey: "n", dataType: "NUMBER" }), NaN).ok, false);
  assert.equal(coerceValue(def({ fieldKey: "n", dataType: "NUMBER" }), { v: 1 }).ok, false);
});

test("coerceValue: DATE normalizes to yyyy-mm-dd, rejects invalid dates", () => {
  assert.deepEqual(coerceValue(def({ fieldKey: "d", dataType: "DATE" }), "2027-06-01"), { ok: true, value: "2027-06-01" });
  assert.deepEqual(coerceValue(def({ fieldKey: "d", dataType: "DATE" }), "2027-06-01T10:00:00Z"), { ok: true, value: "2027-06-01" });
  assert.equal(coerceValue(def({ fieldKey: "d", dataType: "DATE" }), "not-a-date").ok, false);
});

test("coerceValue: BOOLEAN accepts booleans and 'true'/'false' strings", () => {
  assert.deepEqual(coerceValue(def({ fieldKey: "b", dataType: "BOOLEAN" }), true), { ok: true, value: true });
  assert.deepEqual(coerceValue(def({ fieldKey: "b", dataType: "BOOLEAN" }), "false"), { ok: true, value: false });
  assert.equal(coerceValue(def({ fieldKey: "b", dataType: "BOOLEAN" }), "yes").ok, false);
});

test("coerceValue: DROPDOWN enforces membership in options; USER_LOOKUP passes ids through", () => {
  const dd = def({ fieldKey: "r", dataType: "DROPDOWN", options: ["EMEA", "APAC"] });
  assert.deepEqual(coerceValue(dd, "EMEA"), { ok: true, value: "EMEA" });
  assert.equal(coerceValue(dd, "LATAM").ok, false);
  // empty options → every non-empty value is invalid (config bug surfaced loudly)
  assert.equal(coerceValue(def({ fieldKey: "r2", dataType: "DROPDOWN", options: [] }), "X").ok, false);

  const ul = def({ fieldKey: "u", dataType: "USER_LOOKUP" });
  assert.deepEqual(coerceValue(ul, "user-123"), { ok: true, value: "user-123" });
});

test("coerceValue: unknown dataType is an error; empty clears any type to null", () => {
  assert.equal(coerceValue(def({ fieldKey: "x", dataType: "WEIRD" }), "v").ok, false);
  for (const dataType of ["TEXT", "NUMBER", "DATE", "BOOLEAN", "DROPDOWN", "USER_LOOKUP"]) {
    assert.deepEqual(coerceValue(def({ fieldKey: "x", dataType }), ""), { ok: true, value: null });
  }
});

// ---------- VALIDATION ----------
test("validateCustomData: unknown keys and inactive fields are hard errors", () => {
  const defs = [def({ fieldKey: "known", dataType: "TEXT" }), def({ fieldKey: "dead", isActive: false })];
  const { values, errors } = validateCustomData(defs, { known: "ok", ghost: 1, dead: "x" });
  assert.deepEqual(values, { known: "ok" });
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => e.includes("Unknown field")));
  assert.ok(errors.some((e) => e.includes("inactive")));
});

test("validateCustomData: required enforcement applies ONLY to submitted keys", () => {
  const defs = [def({ fieldKey: "a", dataType: "TEXT" }), def({ fieldKey: "b", dataType: "TEXT" })];
  const required = new Set(["a", "b"]);
  // submitting only `b` (non-empty) must pass even though `a` is required but absent
  const okRes = validateCustomData(defs, { b: "v" }, { requiredKeys: required });
  assert.deepEqual(okRes.errors, []);
  assert.deepEqual(okRes.values, { b: "v" });
  // submitting `a` empty fails
  const bad = validateCustomData(defs, { a: "" }, { requiredKeys: required });
  assert.equal(bad.errors.length, 1);
  assert.ok(bad.errors[0].includes("required"));
});

test("validateCustomData: mixed payload produces coerced values and per-key errors", () => {
  const defs = [
    def({ fieldKey: "capex", dataType: "NUMBER" }),
    def({ fieldKey: "region", dataType: "DROPDOWN", options: ["EMEA"] }),
  ];
  const { values, errors } = validateCustomData(defs, { capex: "1500", region: "APAC" });
  assert.deepEqual(values, { capex: 1500 });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("not a valid option"));
});

// ---------- REQUIRED (form-level) ----------
test("missingRequired: reports required fields with empty values only", () => {
  const fields = [
    { isRequired: true, field: def({ fieldKey: "a" }) },
    { isRequired: false, field: def({ fieldKey: "b" }) },
    { isRequired: true, field: def({ fieldKey: "c" }) },
  ];
  assert.deepEqual(missingRequired(fields, { a: "x", c: null }), ["c"]);
  assert.deepEqual(missingRequired(fields, { a: "", b: "y", c: "z" }), ["a"]);
  assert.deepEqual(missingRequired(fields, { a: "1", b: "2", c: "3" }), []);
});

test("missingRequired: an empty MULTI_SELECT selection counts as missing", () => {
  const fields = [{ isRequired: true, field: def({ fieldKey: "m", dataType: "MULTI_SELECT" }) }];
  assert.deepEqual(missingRequired(fields, { m: [] }), ["m"]);
  assert.deepEqual(missingRequired(fields, { m: ["ISO"] }), []);
});

// ---------- EXTENDED DATA TYPES ----------
test("field types: EMAIL / URL / PHONE / MULTI_SELECT are supported, lookalikes are not", () => {
  for (const t of ["EMAIL", "URL", "PHONE", "MULTI_SELECT"]) {
    assert.equal(isFieldDataType(t), true);
  }
  assert.equal(isFieldDataType("RATING"), false);
  assert.equal(isFieldDataType("CURRENCY"), false);
  assert.equal(isFieldDataType("MULTILINE"), false);
});

test("coerceValue: EMAIL / URL / PHONE enforce their format", () => {
  assert.deepEqual(coerceValue(def({ fieldKey: "e", dataType: "EMAIL" }), "a.b+tag@corp.example"), { ok: true, value: "a.b+tag@corp.example" });
  assert.equal(coerceValue(def({ fieldKey: "e", dataType: "EMAIL" }), "not-an-email").ok, false);
  assert.equal(coerceValue(def({ fieldKey: "e", dataType: "EMAIL" }), "a@b").ok, false);

  assert.deepEqual(coerceValue(def({ fieldKey: "u", dataType: "URL" }), "example.com/x"), { ok: true, value: "example.com/x" });
  assert.deepEqual(coerceValue(def({ fieldKey: "u", dataType: "URL" }), "https://example.com/a?b=1"), { ok: true, value: "https://example.com/a?b=1" });
  assert.equal(coerceValue(def({ fieldKey: "u", dataType: "URL" }), "javascript:alert(1)").ok, false);
  assert.equal(coerceValue(def({ fieldKey: "u", dataType: "URL" }), "not a url").ok, false);

  assert.deepEqual(coerceValue(def({ fieldKey: "p", dataType: "PHONE" }), "+44 20 7946 0958"), { ok: true, value: "+44 20 7946 0958" });
  assert.equal(coerceValue(def({ fieldKey: "p", dataType: "PHONE" }), "12-34").ok, false);
  assert.equal(coerceValue(def({ fieldKey: "p", dataType: "PHONE" }), "call me").ok, false);
});

test("coerceValue: MULTI_SELECT validates membership, de-dupes and clears on empty", () => {
  const ms = def({ fieldKey: "m", dataType: "MULTI_SELECT", options: ["A", "B", "C"] });
  assert.deepEqual(coerceValue(ms, ["A", "C", "A ", ""]), { ok: true, value: ["A", "C"] });
  assert.equal(coerceValue(ms, ["A", "Z"]).ok, false);
  assert.equal(coerceValue(ms, "A").ok, false);
  assert.equal(coerceValue(ms, [1, 2]).ok, false);
  assert.deepEqual(coerceValue(ms, []), { ok: true, value: null });
  assert.deepEqual(coerceValue(ms, ""), { ok: true, value: null });
});

test("validateCustomData: MULTI_SELECT values are coerced per field and bad members error", () => {
  const defs = [def({ fieldKey: "stds", dataType: "MULTI_SELECT", options: ["ISO", "SOC2"] })];
  const good = validateCustomData(defs, { stds: ["ISO", "SOC2"] });
  assert.deepEqual(good.errors, []);
  assert.deepEqual(good.values, { stds: ["ISO", "SOC2"] });

  const bad = validateCustomData(defs, { stds: ["NOPE"] });
  assert.equal(bad.errors.length, 1);
  assert.ok(bad.errors[0].includes("not a valid option"));
});

test("parseCustomData: keeps MULTI_SELECT string arrays, still drops other arrays", () => {
  assert.deepEqual(
    parseCustomData({ picks: ["A", "B"], mixed: ["A", 1], nested: { a: 1 } }),
    { picks: ["A", "B"] },
  );
});

// ---------- FIELD CONFIG (validation rules) ----------
test("coerceValue: NUMBER honours configured min/max/integer", () => {
  const n = def({ fieldKey: "n", dataType: "NUMBER", config: { min: 0, max: 100, integer: true } });
  assert.deepEqual(coerceValue(n, 50), { ok: true, value: 50 });
  assert.equal(coerceValue(n, 50.5).ok, false);
  assert.equal(coerceValue(n, -1).ok, false);
  assert.equal(coerceValue(n, 101).ok, false);
  assert.deepEqual(coerceValue(n, ""), { ok: true, value: null }); // empty still clears
});

test("coerceValue: TEXT honours configured min/maxLength", () => {
  const t = def({ fieldKey: "t", dataType: "TEXT", config: { minLength: 3, maxLength: 5 } });
  assert.deepEqual(coerceValue(t, "abc"), { ok: true, value: "abc" });
  assert.equal(coerceValue(t, "ab").ok, false);
  assert.equal(coerceValue(t, "abcdef").ok, false);
});

test("normalizeFieldConfig: keeps sane rules, drops garbage and impossible ranges", () => {
  assert.deepEqual(normalizeFieldConfig("junk"), {});
  assert.deepEqual(normalizeFieldConfig(null), {});
  assert.deepEqual(normalizeFieldConfig(undefined), {});
  assert.deepEqual(normalizeFieldConfig({ what: 1, min: "x", unit: 7 }), {});

  const cfg = normalizeFieldConfig({
    min: 5, max: 9, step: 0.5, unit: " % ", placeholder: "  enter  ",
    multiline: true, integer: true, minLength: 2, maxLength: 4000, defaultValue: "x",
  });
  assert.equal(cfg.min, 5);
  assert.equal(cfg.max, 9);
  assert.equal(cfg.step, 0.5);
  assert.equal(cfg.unit, "%");
  assert.equal(cfg.placeholder, "enter");
  assert.equal(cfg.multiline, true);
  assert.equal(cfg.integer, true);
  assert.equal(cfg.minLength, 2);
  assert.equal(cfg.maxLength, 2000); // clamped to MAX_TEXT_LENGTH
  assert.equal(cfg.defaultValue, "x");

  // inverted ranges are dropped rather than enforced (a bad config never locks a field)
  const bad = normalizeFieldConfig({ min: 10, max: 1, minLength: 20, maxLength: 5 });
  assert.equal(bad.min, undefined);
  assert.equal(bad.max, undefined);
  assert.equal(bad.minLength, undefined);
  assert.equal(bad.maxLength, undefined);
});

test("fieldDefault: resolves a usable default and ignores invalid ones", () => {
  assert.equal(fieldDefault(def({ fieldKey: "t", dataType: "TEXT" })), undefined);
  assert.equal(fieldDefault(def({ fieldKey: "t", dataType: "TEXT", config: { defaultValue: "hello" } })), "hello");
  assert.equal(fieldDefault(def({ fieldKey: "n", dataType: "NUMBER", config: { defaultValue: 42 } })), 42);
  assert.equal(fieldDefault(def({ fieldKey: "n", dataType: "NUMBER", config: { defaultValue: 5, min: 10 } })), undefined);
  assert.equal(fieldDefault(def({ fieldKey: "d", dataType: "DROPDOWN", options: ["A"], config: { defaultValue: "A" } })), "A");
  assert.equal(fieldDefault(def({ fieldKey: "d", dataType: "DROPDOWN", options: ["A"], config: { defaultValue: "B" } })), undefined);
  assert.deepEqual(
    fieldDefault(def({ fieldKey: "m", dataType: "MULTI_SELECT", options: ["A", "B"], config: { defaultValue: ["A", "Z", "A"] } })),
    ["A"],
  );
  assert.equal(fieldDefault(def({ fieldKey: "b", dataType: "BOOLEAN", config: { defaultValue: true } })), true);
  assert.equal(fieldDefault(def({ fieldKey: "e", dataType: "EMAIL", config: { defaultValue: 7 } })), undefined);
});

test("ruleSummary: renders ranges, lengths, placeholder and default; empty config has no rules", () => {
  assert.equal(ruleSummary(null), null);
  assert.equal(ruleSummary(undefined), null);
  assert.equal(ruleSummary({}), null);
  assert.equal(ruleSummary({ min: 0, max: 100, unit: "%", integer: true }), "0–100 % · whole");
  assert.equal(ruleSummary({ maxLength: 40 }), "≤40 chars");
  assert.equal(ruleSummary({ minLength: 3, maxLength: 40 }), "≥3 chars · ≤40 chars");
  assert.equal(ruleSummary({ unit: "hrs" }), "hrs");
  assert.equal(ruleSummary({ multiline: true, placeholder: "notes" }), "long text · placeholder “notes”");
  assert.equal(ruleSummary({ defaultValue: "EMEA" }), "default EMEA");
  assert.equal(ruleSummary({ defaultValue: ["A", "B"] }), "default A, B");
});

// ---------- REPORTING ----------
test("computeFieldStats: coverage, fill rate and top values for a choice field", () => {
  const row = computeFieldStats(
    def({ fieldKey: "region", dataType: "DROPDOWN", options: ["EMEA", "APAC"] }),
    ["EMEA", "EMEA", "APAC", null, ""],
  );
  assert.equal(row.total, 5);
  assert.equal(row.filled, 3);
  assert.equal(row.fillRatePct, 60);
  assert.equal(row.distinct, 2);
  assert.deepEqual(row.topValues[0], { value: "EMEA", count: 2, pct: 67 });
  assert.equal(row.numeric, null);
  assert.equal(row.dates, null);
});

test("computeFieldStats: NUMBER min/max/avg/sum and DATE range", () => {
  const n = computeFieldStats(def({ fieldKey: "n", dataType: "NUMBER" }), [10, 20, 30, null]);
  assert.deepEqual(n.numeric, { min: 10, max: 30, avg: 20, sum: 60 });
  assert.equal(n.filled, 3);

  const d = computeFieldStats(def({ fieldKey: "d", dataType: "DATE" }), ["2027-03-05", "2026-12-31", null, "not-a-date"]);
  assert.deepEqual(d.dates, { earliest: "2026-12-31", latest: "2027-03-05" });
  assert.equal(d.filled, 3);
});

test("computeFieldStats: MULTI_SELECT counts each member; BOOLEAN reports Yes/No", () => {
  const m = computeFieldStats(
    def({ fieldKey: "std", dataType: "MULTI_SELECT", options: ["ISO 27001", "SOC 2", "GDPR"] }),
    [["ISO 27001", "SOC 2"], ["ISO 27001"], [], null],
  );
  assert.equal(m.filled, 2);
  assert.equal(m.distinct, 2);
  assert.deepEqual(m.topValues[0], { value: "ISO 27001", count: 2, pct: 100 });

  const b = computeFieldStats(def({ fieldKey: "b", dataType: "BOOLEAN" }), [true, false, true, null]);
  assert.equal(b.filled, 3);
  assert.deepEqual(b.topValues[0], { value: "Yes", count: 2, pct: 67 });
});

test("computeFieldStats: an empty scan reports zeros instead of NaN", () => {
  const row = computeFieldStats(def({ fieldKey: "x", dataType: "NUMBER" }), []);
  assert.equal(row.total, 0);
  assert.equal(row.fillRatePct, 0);
  assert.equal(row.filled, 0);
  assert.equal(row.numeric, null);
  assert.equal(row.dates, null);
  assert.deepEqual(row.topValues, []);
});
