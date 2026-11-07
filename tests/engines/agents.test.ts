// PM CONTROL TOWER — AI agent runtime structural tests (pure, DB-free, deterministic)
// Guards the agent delivery contract (docs/AI-AGENT-CATALOGUE.md):
//   - exactly 14 agents with the canonical keys, grouped 6/5/3 by phase
//   - catalogue metadata is self-consistent (thresholds ⇄ defaults, approval
//     gates match the phase, run() present on every definition)
//   - Phase 1 monitors are structurally read-only; no definition touches the
//     database directly (all reads flow through src/lib/agents/data.ts)
//   - every action an agent can propose is zod-gated in apply.ts
//   - the runner enforces the enterprise guardrails (kill switch, activation,
//     cadence, token budget, ledger, audit, realtime, alert de-duplication)
//   - schema models AgentProfile/AgentRun exist with their ledger fields
//   - API routes carry admin.config RBAC; the cron route is CRON_SECRET-gated
//   - Settings → AI Agents registration, AI Hub card, realtime fan-out,
//     scheduler + vercel.json wiring, honest narration fallback
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AGENTS, AGENT_BY_KEY, AGENT_PHASES } from "../../src/lib/agents/catalog";
import { AGENT_ACTION_TYPES } from "../../src/lib/agents/apply";

const ROOT = process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string): boolean => fs.existsSync(path.join(ROOT, rel));

const EXPECTED_KEYS = [
  // Phase 1 — monitors
  "deadline-sentinel", "dependency-ripple", "evm-watchdog",
  "capacity-sentinel", "executive-briefing", "data-quality-auditor",
  // Phase 2 — approval-gated drafters
  "cr-intake", "status-report", "risk-brainstormer", "workload-balancer", "gate-readiness",
  // Phase 3 — autonomous within limits
  "import-export-agent", "governance-router", "knowledge-curator",
];

const EXPECTED_ACTIONS = [
  "CHANGE_REQUEST_CREATE", "RISK_MITIGATION_UPDATE", "ASSIGNMENT_REASSIGN",
  "NOTIFY", "KNOWLEDGE_PUBLISH", "EXPORT_PLAN",
];

const CADENCES = new Set(["MANUAL", "HOURLY", "DAILY", "WEEKLY"]);
const ROLES = new Set(["PM", "RM", "DM", "PMO"]);

// ---------------------------------------------------------------------------
// Catalogue contract
// ---------------------------------------------------------------------------

test("agents: catalogue holds exactly the 14 canonical agents", () => {
  assert.equal(AGENTS.length, 14, `expected 14 agents, found ${AGENTS.length}`);
  const keys = AGENTS.map((a) => a.key);
  assert.deepEqual([...keys].sort(), [...EXPECTED_KEYS].sort(), "catalogue keys must match the documented set");
  assert.equal(new Set(keys).size, 14, "agent keys must be unique");
  for (const k of EXPECTED_KEYS) assert.ok(AGENT_BY_KEY[k], `AGENT_BY_KEY missing "${k}"`);
});

test("agents: phase / family / approval-gate contract", () => {
  assert.equal(AGENT_PHASES[1].length, 6, "Phase 1 must hold 6 monitors");
  assert.equal(AGENT_PHASES[2].length, 5, "Phase 2 must hold 5 drafters");
  assert.equal(AGENT_PHASES[3].length, 3, "Phase 3 must hold 3 autonomous agents");

  for (const a of AGENTS) {
    assert.ok(typeof a.run === "function", `${a.key}: must expose run()`);
    assert.ok(CADENCES.has(a.cadence), `${a.key}: invalid cadence ${a.cadence}`);
    assert.ok(ROLES.has(a.role), `${a.key}: invalid role ${a.role}`);
    assert.ok(a.description.length > 40, `${a.key}: needs a real description`);
    assert.ok(a.name.length > 2, `${a.key}: needs a display name`);

    if (a.phase === 1) {
      assert.equal(a.family, "MONITOR", `${a.key}: Phase 1 must be a MONITOR`);
      assert.equal(a.requiresApproval, false, `${a.key}: monitors never propose writes`);
    } else if (a.phase === 2) {
      assert.equal(a.family, "DRAFTING", `${a.key}: Phase 2 must be DRAFTING`);
      assert.equal(a.requiresApproval, true, `${a.key}: Phase 2 must sit behind the approval gate`);
    } else {
      assert.equal(a.family, "AUTONOMOUS", `${a.key}: Phase 3 must be AUTONOMOUS`);
      assert.equal(a.requiresApproval, false, `${a.key}: Phase 3 executes within limits`);
    }
  }
});

test("agents: thresholds and defaults are internally consistent", () => {
  for (const a of AGENTS) {
    assert.ok(a.thresholds.length >= 1, `${a.key}: declare at least one tunable threshold`);
    const seen = new Set<string>();
    for (const t of a.thresholds) {
      assert.ok(!seen.has(t.key), `${a.key}: duplicate threshold key ${t.key}`);
      seen.add(t.key);
      assert.ok(t.label.length > 2, `${a.key}.${t.key}: threshold needs a label`);
      assert.ok(t.min < t.max, `${a.key}.${t.key}: min must be < max`);
      assert.ok(t.step > 0, `${a.key}.${t.key}: step must be > 0`);
      const v = a.defaults[t.key];
      assert.equal(typeof v, "number", `${a.key}: default for ${t.key} must be a number`);
      assert.ok((v as number) >= t.min && (v as number) <= t.max,
        `${a.key}: default ${String(v)} outside [${t.min}, ${t.max}] for ${t.key}`);
    }
    for (const k of Object.keys(a.defaults)) {
      assert.ok(seen.has(k), `${a.key}: default ${k} has no matching threshold declaration`);
    }
  }
});

// ---------------------------------------------------------------------------
// Read-only guarantees
// ---------------------------------------------------------------------------

const DEFINITION_FILES = [
  "src/lib/agents/definitions/monitors.ts",
  "src/lib/agents/definitions/drafters.ts",
  "src/lib/agents/definitions/autonomous.ts",
];

test("agents: Phase 1 monitors are structurally read-only", () => {
  const src = read("src/lib/agents/definitions/monitors.ts");
  for (const verb of [".create(", ".createMany(", ".update(", ".updateMany(", ".upsert(", ".delete(", ".deleteMany(", ".execute("]) {
    assert.ok(!src.includes(verb), `monitors.ts must not contain ${verb} — monitors only read`);
  }
  assert.ok(!src.includes("@/lib/db"), "monitors.ts must not import the database directly");
});

test("agents: no definition touches the database directly", () => {
  for (const rel of DEFINITION_FILES) {
    const src = read(rel);
    assert.ok(!src.includes('from "@/lib/db"'), `${rel}: definitions read through data.ts only`);
    assert.ok(!/\bdb\.\w+\.(create|update|upsert|delete)/.test(src), `${rel}: no direct writes`);
  }
});

// ---------------------------------------------------------------------------
// Action layer
// ---------------------------------------------------------------------------

test("agents: every proposed action is zod-gated in apply.ts", () => {
  assert.deepEqual([...AGENT_ACTION_TYPES].sort(), [...EXPECTED_ACTIONS].sort(), "action type registry mismatch");
  const src = read("src/lib/agents/apply.ts");
  for (const type of EXPECTED_ACTIONS) {
    assert.ok(src.includes(`case "${type}"`), `apply.ts must handle ${type}`);
  }
  assert.ok((src.match(/z\.object\(/g) ?? []).length >= EXPECTED_ACTIONS.length,
    "each action type needs its own zod schema");
  assert.ok(src.includes("z.ZodError"), "zod failures must become { ok: false, detail }");
  assert.ok(src.includes("writeAudit("), "every apply must be audited");
});

test("agents: definitions only propose registered action types", () => {
  for (const rel of DEFINITION_FILES) {
    const src = read(rel);
    const used = [...src.matchAll(/type:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
    for (const t of used) {
      assert.ok((EXPECTED_ACTIONS as string[]).includes(t), `${rel}: unregistered action type "${t}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// Runner guardrails
// ---------------------------------------------------------------------------

test("agents: runner enforces the enterprise guardrails", () => {
  const src = read("src/lib/agents/runner.ts");
  assert.ok(src.includes('"AGENT_RUNTIME"'), "global kill switch (FeatureFlag AGENT_RUNTIME)");
  assert.ok(src.includes('profile.status !== "ACTIVE"'), "paused agents must never run");
  assert.ok(src.includes("isDue("), "cadence due-check required for scheduled sweeps");
  assert.ok(src.includes("spentTokens("), "lifetime token budget gate required");
  assert.ok(src.includes("narrate("), "every run must be narrated");
  assert.ok(src.includes("applyAction("), "writes must funnel through apply.ts");
  assert.ok(src.includes('"PENDING_APPROVAL"'), "approval-gated agents must park on PENDING_APPROVAL");
  assert.ok(src.includes("raiseAlerts("), "monitors must raise de-duplicated alerts");
  assert.ok(src.includes('writeAudit('), "every run must hit the audit ledger");
  assert.ok(src.includes('emitRealtime("agent:run"'), "runs must fan out over realtime");
  assert.ok(src.includes("db.agentRun.create("), "every run must be ledgered on AgentRun");
  assert.ok(src.includes("sweepAgents"), "scheduled sweep entry point required");
  assert.ok(/catch/.test(src), "runAgent must never throw");
});

test("agents: narration falls back honestly and never throws", () => {
  const narrate = read("src/lib/agents/narrate.ts");
  assert.ok(narrate.includes("askAISystem("), "narration must use the system AI call");
  assert.ok(narrate.includes('"HEURISTIC"'), "heuristic fallback must be labelled");
  assert.ok(narrate.includes("catch"), "narration must never throw");
  assert.ok(narrate.includes("source:"), "narration must report its source");

  const service = read("src/lib/ai/ai-service.ts");
  assert.ok(service.includes("export async function askAISystem"), "system AI entry point required");
  assert.ok(service.includes("userId: null"), "system calls are recorded without a user session");
  assert.ok(service.includes("AGENT:"), "system calls must be scoped AGENT:<actor>");
});

// ---------------------------------------------------------------------------
// Persistence contract
// ---------------------------------------------------------------------------

test("agents: schema ships AgentProfile + AgentRun with ledger fields", () => {
  const schema = read("prisma/schema.prisma");
  const profile = schema.slice(schema.indexOf("model AgentProfile"), schema.indexOf("model AgentRun"));
  const run = schema.slice(schema.indexOf("model AgentRun"), schema.indexOf("model AgentRun") + 1200);
  assert.ok(profile.length > 100, "model AgentProfile missing");
  assert.ok(run.length > 100, "model AgentRun missing");
  for (const f of ["key          String    @unique", "status", "configJson", "budgetTokens", "runCount", "lastRunAt"]) {
    assert.ok(profile.includes(f), `AgentProfile must declare ${f}`);
  }
  for (const f of ["agentKey", "trigger", "status", "findingsJson", "actionType", "actionJson", "narrationSource", "tokens", "approvedBy", "errorMessage"]) {
    assert.ok(run.includes(f), `AgentRun must declare ${f}`);
  }
});

// ---------------------------------------------------------------------------
// API + wiring
// ---------------------------------------------------------------------------

test("agents: API routes are RBAC-gated and the cron is secret-gated", () => {
  assert.ok(exists("src/app/api/agents/route.ts"), "roster route missing");
  assert.ok(exists("src/app/api/agents/[key]/route.ts"), "manual run route missing");
  assert.ok(exists("src/app/api/agents/runs/route.ts"), "run ledger route missing");
  assert.ok(exists("src/app/api/agents/runs/[id]/route.ts"), "approval route missing");
  assert.ok(exists("src/app/api/cron/agents/route.ts"), "cron sweep route missing");

  for (const rel of ["src/app/api/agents/route.ts", "src/app/api/agents/[key]/route.ts", "src/app/api/agents/runs/route.ts", "src/app/api/agents/runs/[id]/route.ts"]) {
    const src = read(rel);
    assert.ok(src.includes('permission: "admin.config"'), `${rel}: must require admin.config`);
    assert.ok(src.includes("withApi("), `${rel}: must use the withApi guard`);
  }

  const run = read("src/app/api/agents/[key]/route.ts");
  assert.ok(run.includes("runAgent("), "manual route must call the runner");
  assert.ok(run.includes('trigger: "MANUAL"'), "manual route must use the MANUAL trigger");

  const decide = read("src/app/api/agents/runs/[id]/route.ts");
  assert.ok(decide.includes('"APPROVE"') && decide.includes('"REJECT"'), "approval route needs both decisions");
  assert.ok(decide.includes("applyAction("), "approve must execute through apply.ts");
  assert.ok(decide.includes("agentsRuntimeEnabled("), "the kill switch must block approvals too");

  const cron = read("src/app/api/cron/agents/route.ts");
  assert.ok(cron.includes("CRON_SECRET"), "cron must be CRON_SECRET gated");
  assert.ok(cron.includes("auth: false"), "cron has no session — secret is the only gate");
  assert.ok(cron.includes("secretMatches"), "constant-time secret comparison required");
  assert.ok(cron.includes("sweepAgents("), "cron must run the sweep");
});

test("agents: settings, AI Hub and realtime are wired", () => {
  const hub = read("src/views/admin/settings-hub.tsx");
  assert.ok(hub.includes('label: "AI Agents"'), "Settings must register the AI Agents section");
  assert.ok(hub.includes('import("./agents")'), "Settings must lazy-load the agents view");

  const view = read("src/views/admin/agents.tsx");
  for (const needle of ["Run now", "Approve", "PAUSED", "PENDING_APPROVAL", "Token budget", "Run history"]) {
    assert.ok(view.includes(needle), `agents settings view must contain "${needle}"`);
  }

  const aiHub = read("src/views/ai/hub.tsx");
  assert.ok(aiHub.includes("tab=agents"), "AI Hub must deep-link to the AI Agents settings tab");
  assert.ok(aiHub.includes('"agent:run"'), "AI Hub must refetch on agent runs");

  assert.ok(read("src/lib/realtime.ts").includes('"agent:run"'), "server realtime union must declare agent:run");
  assert.ok(read("src/components/pmct/realtime.tsx").includes('"agent:run"'), "client fan-out must deliver agent:run");
});

test("agents: schedulers are wired (vercel cron + local scheduler)", () => {
  const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string }> };
  assert.ok(vercel.crons.some((c) => c.path === "/api/cron/agents"), "vercel.json must schedule /api/cron/agents");

  const scheduler = read("mini-services/scheduler/index.ts");
  assert.ok(scheduler.includes("sweepAgents"), "local scheduler must sweep agents");
  assert.ok(scheduler.includes("agent sweep failed"), "agent sweep must be isolated from the e-mail engine");
});
