const fs = require("fs");
let s = fs.readFileSync("src/lib/engines/scenario.ts", "utf8");
// Replace the whole rebase function (from marker comment to end) with a clean version
const marker = "// ---- Rebase on current actuals ----";
const idx = s.indexOf(marker);
if (idx >= 0) {
  s = s.slice(0, idx) + `// ---- Rebase on current actuals ----
// Live data may drift between branch creation and merge. Instead of failing or
// blindly overwriting, duration overrides are REBASED: the override's DELTA
// relative to the branch snapshot is applied to the CURRENT duration. Assignment
// removals that already happened in production are skipped. The merge response
// reports every rebase/skip decision.

export interface RebaseDecision { taskId?: string; kind: string; note: string }

export function rebaseOverrides(
  snapshot: ScenarioSnapshot,
  overrides: ScenarioOverrides,
  current: { tasks: ScenarioTask[]; assignmentIds: Set<string> }
): { rebased: ScenarioOverrides; decisions: RebaseDecision[] } {
  const decisions: RebaseDecision[] = [];
  const durationChanges: Record<string, number> = {};
  if (overrides.durationChanges) {
    for (const [taskId, overrideDays] of Object.entries(overrides.durationChanges)) {
      const snap = snapshot.tasks.find((t) => t.id === taskId);
      const cur = current.tasks.find((t) => t.id === taskId);
      if (!cur) { decisions.push({ taskId, kind: "SKIPPED", note: "task no longer exists in production" }); continue; }
      const snapDays = snap?.durationDays ?? cur.durationDays;
      if (cur.durationDays === snapDays) { durationChanges[taskId] = overrideDays; decisions.push({ taskId, kind: "APPLIED", note: "no drift" }); continue; }
      const delta = overrideDays - snapDays;
      const rebased = Math.max(0.5, Math.round((cur.durationDays + delta) * 10) / 10);
      durationChanges[taskId] = rebased;
      decisions.push({ taskId, kind: "REBASED", note: "branch base " + snapDays + "d -> current " + cur.durationDays + "d; delta applied -> " + rebased + "d" });
    }
  }
  let removeAssignments = overrides.removeAssignments?.filter((aid) => {
    const exists = current.assignmentIds.has(aid);
    if (!exists) decisions.push({ kind: "SKIPPED", note: "assignment already removed in production" });
    return exists;
  });
  return { rebased: { ...overrides, durationChanges, removeAssignments }, decisions };
}
`;
}
fs.writeFileSync("src/lib/engines/scenario.ts", s);

// Append v1.2.0 tests
let t = fs.readFileSync("tests/engines/integrity.test.ts", "utf8");
if (!t.includes("v1.2.0 DELTAS")) {
  t += `
// ---------- v1.2.0 DELTAS ----------
import { buildZip, crc32 } from "../../src/lib/engines/zip";
import { rebaseOverrides } from "../../src/lib/engines/scenario";
import { computeFreshness as cf2 } from "../../src/lib/engines/freshness";

test("zip: crc32 known vector + archive structure", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const zip = buildZip([{ name: "index.txt", content: "hello evidence" }, { name: "manifest.json", content: "{}" }]);
  assert.equal(zip[0], 0x50); assert.equal(zip[1], 0x4b);
  const tail = zip.slice(zip.length - 22);
  assert.equal(tail[0], 0x50); assert.equal(tail[3], 0x06);
});
test("zip: deterministic output", () => {
  const a = buildZip([{ name: "a.txt", content: "same" }]);
  const b = buildZip([{ name: "a.txt", content: "same" }]);
  assert.equal(Buffer.from(a).compare(Buffer.from(b)), 0);
});
test("freshness: grace window suppresses degradation for young feeds", () => {
  const r = cf2([{ feed: "gates", lastUpdate: daysAgo(1), expectedCadenceDays: 7 }], now, { graceHours: 48 });
  assert.equal(r.level, "CURRENT");
  assert.equal(r.feeds[0].graceApplied, true);
  const r2 = cf2([{ feed: "gates", lastUpdate: daysAgo(3), expectedCadenceDays: 7 }], now, { graceHours: 48 });
  assert.equal(r2.level, "WARN");
});
test("freshness: configurable thresholds are honored", () => {
  const strict = { warn: 0.5, degrade: 0.8, critical: 1.2 };
  const r = cf2([{ feed: "tasks", lastUpdate: daysAgo(2), expectedCadenceDays: 7 }], now, { thresholds: strict, graceHours: 0 });
  assert.equal(r.level, "DEGRADE");
});
test("scenario: rebase applies duration delta to drifted current", () => {
  const current = {
    tasks: snap.tasks.map((t) => (t.id === "B" ? { ...t, durationDays: 30 } : t)),
    assignmentIds: new Set(snap.assignments.map((a) => a.id)),
  };
  const { rebased, decisions } = rebaseOverrides(snap, { durationChanges: { B: 45 }, removeAssignments: ["a1"] }, current);
  assert.equal(rebased.durationChanges["B"], 55);
  assert.equal(rebased.removeAssignments.length, 1);
  assert.ok(decisions.some((d) => d.kind === "REBASED"));
});
test("scenario: rebase skips assignments already gone in production", () => {
  const current = { tasks: snap.tasks, assignmentIds: new Set() };
  const { rebased, decisions } = rebaseOverrides(snap, { removeAssignments: ["a1"] }, current);
  assert.equal(rebased.removeAssignments.length, 0);
  assert.ok(decisions.some((d) => d.kind === "SKIPPED"));
});
`;
}
fs.writeFileSync("tests/engines/integrity.test.ts", t);
console.log("patched. rebase fn:", s.includes("REBASED"), "| tests:", t.includes("v1.2.0 DELTAS"));
