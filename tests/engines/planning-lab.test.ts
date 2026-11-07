// PM CONTROL TOWER — Planning Lab engine unit tests (pure, DB-free, deterministic)
// Covers: working-time calendars, constraint/deadline clamps in CPM, leveling
// prescriptions and Schedule Doctor findings + health index.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCPM } from "../../src/lib/engines/cpm";
import { configFrom, isWorkingDay, addWorkingDays, WorkingIndex, DEFAULT_CALENDAR } from "../../src/lib/engines/calendars";
import { computeDailyLoad, prescribeLeveling, LevTaskInput } from "../../src/lib/engines/leveling";
import { runDoctor, DocTask } from "../../src/lib/engines/doctor";
import type { CpmResult } from "../../src/lib/engines/cpm";

// ---------- CALENDARS ----------
test("calendar: default config keeps every day working (legacy 7-day math)", () => {
  const cal = configFrom(null, null, null);
  assert.deepEqual(cal, { ...DEFAULT_CALENDAR });
  for (let i = 0; i < 10; i++) assert.equal(isWorkingDay(new Date(2026, 0, 5 + i), cal), true);
});
test("calendar: 5-day week + holidays", () => {
  const cal = configFrom(JSON.stringify([1, 2, 3, 4, 5]), 8, JSON.stringify(["2026-12-25"]));
  // 2026-12-25 is a Friday (UTC)
  assert.equal(isWorkingDay("2026-12-25T00:00:00Z", cal), false);
  assert.equal(isWorkingDay("2026-12-24T00:00:00Z", cal), true); // Thursday
  assert.equal(isWorkingDay("2026-12-26T00:00:00Z", cal), false); // Saturday
  // 3 working days from Mon 2026-12-21 → Thu 2026-12-24 (Fri is a holiday)
  assert.equal(addWorkingDays("2026-12-21T00:00:00Z", 3, cal).toISOString().slice(0, 10), "2026-12-24");
  // Next working day after the holiday Friday is Monday 28th
  assert.equal(addWorkingDays("2026-12-24T00:00:00Z", 1, cal).toISOString().slice(0, 10), "2026-12-28");
  // negative direction: Wednesday 23rd back 5 working days → Wed 16th? check: 23,22,21 are work → 18 Fri is work → 17 Thu is work
  assert.equal(addWorkingDays("2026-12-23T00:00:00Z", -4, cal).toISOString().slice(0, 10), "2026-12-17");
});
test("calendar: WorkingIndex maps epoch days to compact working indexes", () => {
  const cal = configFrom(JSON.stringify([1, 2, 3, 4, 5]), 8, "[]");
  const wi = new WorkingIndex("2026-01-05T00:00:00Z", 30, cal); // Monday
  // First index = Monday itself
  assert.equal(wi.toIndex(Math.floor(new Date("2026-01-05T00:00:00Z").getTime() / 86400000)), 0);
  // Saturday/Sunday collapse: Monday Jan 12 = index 5
  assert.equal(wi.toIndex(Math.floor(new Date("2026-01-12T00:00:00Z").getTime() / 86400000)), 5);
  assert.equal(wi.toDay(0), Math.floor(new Date("2026-01-05T00:00:00Z").getTime() / 86400000));
  assert.equal(wi.toDay(5), Math.floor(new Date("2026-01-12T00:00:00Z").getTime() / 86400000));
});
test("calendar: 7-day WorkingIndex is identity-offset (backward compatible)", () => {
  const wi = new WorkingIndex("2026-01-01T00:00:00Z", 60, DEFAULT_CALENDAR);
  const base = Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 86400000);
  assert.equal(wi.toDay(7), base + 7);
});

// ---------- CPM CONSTRAINTS ----------
const baseTask = (id: string, dur = 1, extra: Partial<Parameters<typeof computeCPM>[0][number]> = {}) => ({ id, durationDays: dur, ...extra });
const dayNumOf = (s: string) => Math.floor(new Date(s).getTime() / 86_400_000);
const START = dayNumOf("2026-01-01T00:00:00Z");
const rel = (cpm: Map<string, CpmResult>, id: string, field: "es" | "ef" | "ls" | "lf", base = START) =>
  Math.round(cpm.get(id)![field] - base);

test("cpm: SNET pushes the start later; float shrinks", () => {
  const tasks = [baseTask("a", 5), baseTask("b", 5, { constraintType: "SNET", constraintDay: START + 10 })];
  const cpm = computeCPM(tasks, [], new Date("2026-01-01T00:00:00Z"));
  assert.equal(rel(cpm, "a", "es"), 0);
  assert.equal(rel(cpm, "b", "es"), 10);
  assert.equal(cpm.get("b")!.totalFloat, 0); // SNET at finish, project finish = 15 for b
  assert.equal((cpm.get("b")!.violationDays ?? 0), 0);
});
test("cpm: FNLT pulls the late finish earlier and creates a resolvable clamp", () => {
  // FS chain a(5) -> b(5); FNLT on b at day 8 (b would naturally run 5..10 — clamped finish 8 => conflict)
  const tasks = [
    baseTask("a", 5),
    baseTask("b", 5, { constraintType: "FNLT", constraintDay: START + 8 }),
  ];
  const deps = [{ predecessorId: "a", successorId: "b", depType: "FS", lagDays: 0 }];
  const cpm = computeCPM(tasks, deps, new Date("2026-01-01T00:00:00Z"));
  assert.equal(rel(cpm, "b", "es"), 5);      // forward unchanged
  assert.ok(cpm.get("b")!.lf <= START + 8);  // backward clamp respected
  assert.ok((cpm.get("b")!.violationDays ?? 0) > 0); // flagged conflict
});
test("cpm: MSO locks the start and reports the network conflict", () => {
  // a(5) -> b(5); MSO forces b to start day 0 — before its predecessor finishes: violation
  const tasks = [
    baseTask("a", 5),
    baseTask("b", 5, { constraintType: "MSO", constraintDay: START }),
  ];
  const deps = [{ predecessorId: "a", successorId: "b", depType: "FS", lagDays: 0 }];
  const cpm = computeCPM(tasks, deps, new Date("2026-01-01T00:00:00Z"));
  assert.equal(rel(cpm, "b", "es"), 0);   // forward locked
  assert.ok((cpm.get("b")!.violationDays ?? 0) > 0);
  assert.equal(cpm.get("b")!.totalFloat, 0);
});
test("cpm: deadline breach flag fires only after the deadline", () => {
  const tasks = [
    baseTask("a", 5, { deadlineDay: START + 3 }), // finishes day 5 > 3 → breach
    baseTask("b", 5, { deadlineDay: START + 9 }), // finishes day 5 ≤ 9 → ok
  ];
  const cpm = computeCPM(tasks, [], new Date("2026-01-01T00:00:00Z"));
  assert.equal(cpm.get("a")!.deadlineBreach, true);
  assert.equal(cpm.get("b")!.deadlineBreach, false);
});
test("cpm: backward compatibility — no constraints yields identical relative dates", () => {
  const tasks = [baseTask("a", 5), baseTask("b", 3), baseTask("c", 2)];
  const deps = [{ predecessorId: "a", successorId: "b", depType: "FS", lagDays: 0 }, { predecessorId: "b", successorId: "c", depType: "FS", lagDays: 0 }];
  const cpm = computeCPM(tasks, deps, new Date("2026-01-01T00:00:00Z"));
  assert.equal(rel(cpm, "a", "es"), 0);
  assert.equal(rel(cpm, "b", "es"), 5);
  assert.equal(rel(cpm, "c", "es"), 8);
  assert.equal(cpm.get("c")!.critical, true);
  assert.equal(cpm.get("c")!.totalFloat, 0);
});

// ---------- LEVELING ----------
const DAY = 86_400_000;
const d = (iso: string) => new Date(iso);
test("leveling: detects over-allocation above capacity on working days", () => {
  const tasks: LevTaskInput[] = [
    { id: "t1", code: "T-1", name: "Bridge", durationDays: 5, startDate: d("2026-01-05T00:00:00Z"), endDate: d("2026-01-09T00:00:00Z"), totalFloat: 10, isCritical: false },
    { id: "t2", code: "T-2", name: "Tunnel", durationDays: 5, startDate: d("2026-01-05T00:00:00Z"), endDate: d("2026-01-09T00:00:00Z"), totalFloat: 10, isCritical: false },
  ];
  const assignments = [
    { id: "a1", resourceId: "r1", taskId: "t1", startDate: null, endDate: null, allocationPercent: 100, plannedHours: 50 },
    { id: "a2", resourceId: "r1", taskId: "t2", startDate: null, endDate: null, allocationPercent: 100, plannedHours: 50 },
  ];
  const { series, over } = computeDailyLoad(tasks, assignments, [{ id: "r1", name: "Al", capacityHoursPerWeek: 40 }], DEFAULT_CALENDAR);
  assert.equal(series.length, 1);
  // 100h over 5 days = 20h/day vs 8h/day capacity
  assert.equal(over.length, 5);
  assert.equal(over[0].hours, 20);
  assert.equal(over[0].capacity, 8);
});
test("leveling: prescriptions never touch critical tasks and honor float", () => {
  const tasks: LevTaskInput[] = [
    { id: "t1", code: "T-1", name: "Bridge", durationDays: 5, startDate: d("2026-01-05T00:00:00Z"), endDate: d("2026-01-09T00:00:00Z"), totalFloat: 10, isCritical: false },
    { id: "t2", code: "T-2", name: "Tunnel", durationDays: 5, startDate: d("2026-01-05T00:00:00Z"), endDate: d("2026-01-09T00:00:00Z"), totalFloat: 0, isCritical: true },
  ];
  const assignments = [
    { id: "a1", resourceId: "r1", taskId: "t1", startDate: null, endDate: null, allocationPercent: 100, plannedHours: 50 },
    { id: "a2", resourceId: "r1", taskId: "t2", startDate: null, endDate: null, allocationPercent: 100, plannedHours: 50 },
  ];
  const { over } = computeDailyLoad(tasks, assignments, [{ id: "r1", name: "Al", capacityHoursPerWeek: 40 }], DEFAULT_CALENDAR);
  const rx = prescribeLeveling(over, tasks, assignments);
  assert.equal(rx.length >= 1, true);
  for (const p of rx) {
    assert.equal(p.taskId !== "t2", true); // critical never moves
    assert.ok(p.shiftDays >= 1 && p.shiftDays <= 10);
  }
});

// ---------- SCHEDULE DOCTOR ----------
const doc = (over: Partial<DocTask> & { id: string; code: string }): DocTask => ({
  name: "task", durationDays: 1, status: "NOT_STARTED", progress: 0, plannedHours: 0,
  assigneeId: null, wbsId: null, constraintType: null, constraintDate: null, deadline: null,
  startDate: null, endDate: null, earliestStart: null, earliestFinish: null,
  totalFloat: 0, freeFloat: 0, isCritical: false, isSummary: false, violationDays: 0, ...over,
});
test("doctor: detects orphan, deadline breach and unassigned effort", () => {
  const tasks = [
    doc({ id: "t1", code: "T-1", deadline: "2026-01-05T00:00:00Z", earliestFinish: "2026-01-09T00:00:00Z", plannedHours: 8, totalFloat: 500 }),
    doc({ id: "t2", code: "T-2" }),
  ];
  const r = runDoctor(tasks, [], null, null);
  const codes = r.findings.map((f) => f.code);
  assert.ok(codes.includes("NO_CONNECTION"));
  assert.ok(codes.includes("DEADLINE_BREACH"));
  assert.ok(codes.includes("UNASSIGNED_EFFORT"));
  assert.ok(codes.includes("FLOAT_SUSPECT"));
  assert.ok(r.healthIndex < 100);
});
test("doctor: healthy connected plan scores 100", () => {
  const tasks = [
    doc({ id: "t1", code: "T-1", assigneeId: "u1", wbsId: "w1", earliestStart: "2026-01-05T00:00:00Z", earliestFinish: "2026-01-06T00:00:00Z", totalFloat: 0, isCritical: true }),
    doc({ id: "t2", code: "T-2", assigneeId: "u2", wbsId: "w1", totalFloat: 30, earliestStart: "2026-01-07T00:00:00Z", earliestFinish: "2026-01-09T00:00:00Z" }),
  ];
  const deps = [{ predecessorId: "t1", successorId: "t2" }];
  const r = runDoctor(tasks, deps, null, null);
  assert.equal(r.findings.length, 0, JSON.stringify(r.findings));
  assert.equal(r.healthIndex, 100);
});
