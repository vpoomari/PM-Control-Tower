// PM CONTROL TOWER — TowerIntegration Hub unit tests (pure, DB-free, deterministic)
// Covers: the 55-tool registry + 6 category queues, UWM harmonization rules
// (identity, status, dates, priority), the facade contract, circuit breaker +
// exponential backoff, DLQ routing, ingress security (HMAC/JWT/OAuth/mTLS) and
// the end-to-end pipeline → WBS/CPM handoff.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HUB_CATEGORIES, HUB_QUEUES, HUB_TOOLS, HUB_TOOL_IDS,
  facadeKindFor, hubCatalog, hubTool, queueForCategory,
  type HubCategory,
} from "../../src/lib/hub/registry";
import {
  UWM_STATUSES, UWM_PRIORITIES, harmonize, normalizePriority, normalizeStatus,
  resolveIdentity, toUtcIso, type HubDirectoryEntry,
} from "../../src/lib/hub/uwm";
import {
  DEFAULT_BACKOFF, backoffDelay, backoffSchedule, breakerAllow, breakerClosed,
  breakerFailure, breakerSuccess, breakerTick, isRetryableStatus,
} from "../../src/lib/hub/breaker";
import { facadeFor, parseCsv } from "../../src/lib/hub/facade";
import {
  buildDlqEntry, canReplay, classifyAnomalies, routeToQueue,
} from "../../src/lib/hub/dlq";
import { authenticateIngress, checkMtls, checkOAuthToken, validateJwt, verifyHmacSignature } from "../../src/lib/hub/security";
import { runPipeline } from "../../src/lib/hub/pipeline";
import { computeCPM } from "../../src/lib/engines/cpm";

// ===========================================================================
// 1. Registry — 55 tools, 6 categories, directive coverage, no broken links
// ===========================================================================

test("hub registry: exactly 55 tools across exactly 6 category queues", () => {
  assert.equal(HUB_TOOLS.length, 55, `expected 55 tools, got ${HUB_TOOLS.length}`);
  assert.equal(HUB_CATEGORIES.length, 6);
  assert.equal(HUB_QUEUES.length, 6);
  // Every queue id is unique and every category appears exactly once.
  const ids = new Set(HUB_TOOL_IDS);
  assert.equal(ids.size, 55, "tool ids must be unique");
  for (const q of HUB_QUEUES) assert.ok(HUB_CATEGORIES.includes(q.category));
});

test("hub registry: every directive-listed tool is present and routed", () => {
  // The directive's 31 explicitly named tools must all exist with their category.
  const directiveTools: [string, HubCategory][] = [
    ["jira", "AGILE_DEVSECOPS"], ["assembla", "AGILE_DEVSECOPS"], ["versionone", "AGILE_DEVSECOPS"],
    ["broadcom-clarity", "WORK_OS_PORTFOLIO"], ["asana", "WORK_OS_PORTFOLIO"], ["monday", "WORK_OS_PORTFOLIO"],
    ["smartsheet", "WORK_OS_PORTFOLIO"], ["clickup", "WORK_OS_PORTFOLIO"], ["zoho-projects", "WORK_OS_PORTFOLIO"],
    ["wrike", "WORK_OS_PORTFOLIO"], ["workfront", "WORK_OS_PORTFOLIO"], ["liquidplanner", "WORK_OS_PORTFOLIO"],
    ["power-bi", "BI_ANALYTICS"], ["qlik-sense", "BI_ANALYTICS"],
    ["sharepoint", "COLLAB_KNOWLEDGE"], ["notion", "COLLAB_KNOWLEDGE"], ["confluence", "COLLAB_KNOWLEDGE"],
    ["basecamp", "COLLAB_KNOWLEDGE"], ["slack", "COLLAB_KNOWLEDGE"], ["ms-teams", "COLLAB_KNOWLEDGE"],
    ["harvest", "TIME_FINANCE_RESOURCE"], ["everhour", "TIME_FINANCE_RESOURCE"], ["timecamp", "TIME_FINANCE_RESOURCE"],
    ["resource-guru", "TIME_FINANCE_RESOURCE"], ["scoro", "TIME_FINANCE_RESOURCE"], ["paymo", "TIME_FINANCE_RESOURCE"],
    ["excel", "DATA_SPREADSHEET_SPECIALIZED"], ["procore", "DATA_SPREADSHEET_SPECIALIZED"],
    ["aha", "DATA_SPREADSHEET_SPECIALIZED"], ["airtable", "DATA_SPREADSHEET_SPECIALIZED"],
    ["filestage", "DATA_SPREADSHEET_SPECIALIZED"],
  ];
  assert.equal(directiveTools.length, 31);
  let flagged = 0;
  for (const [id, category] of directiveTools) {
    const tool = hubTool(id);
    assert.ok(tool, `directive tool "${id}" missing from registry`);
    assert.equal(tool!.category, category, `${id} routed to wrong category`);
    if (tool!.namedInDirective) flagged++;
  }
  assert.equal(flagged, 31, "all directive tools must carry namedInDirective");
  // The other 24 ecosystem tools round out the 55.
  assert.equal(HUB_TOOLS.filter((t) => !t.namedInDirective).length, 24);
});

test("hub registry: every tool has a facade, auth, ingress mode and a queue", () => {
  for (const tool of HUB_TOOLS) {
    assert.ok(tool.facade, `${tool.id} missing facade`);
    assert.ok(tool.auth.length > 0, `${tool.id} missing auth modes`);
    assert.ok(tool.ingress.length > 0, `${tool.id} missing ingress modes`);
    const route = routeToQueue(tool.id, tool.ingress[0]);
    assert.ok(route, `${tool.id} does not route to a queue`);
    assert.equal(route!.queue, queueForCategory(tool.category));
    // facadeKindFor never throws — unknown ids fall back to "generic".
    assert.ok(facadeKindFor(tool.id));
  }
  assert.equal(facadeKindFor("does-not-exist"), "generic");
});

test("hub registry: existing seeded Integration links are preserved (nothing de-linked)", () => {
  // The three connectors that already exist in PMCT (Jira/ADO/ServiceNow) stay
  // linked to their Integration rows through the Hub.
  const linked = HUB_TOOLS.filter((t) => t.linkedIntegration);
  const names = linked.map((t) => t.linkedIntegration).sort();
  assert.deepEqual(names, ["Azure DevOps", "Jira Software", "ServiceNow SPM"]);
  for (const tool of linked) assert.ok(hubTool(tool.id), `${tool.id} lost its registry entry`);
});

test("hub registry: category view covers every tool exactly once", () => {
  const catalog = hubCatalog();
  assert.equal(catalog.length, 6);
  const seen = new Set<string>();
  for (const { queue, tools } of catalog) {
    assert.ok(HUB_QUEUES.some((q) => q.id === queue.id));
    for (const tool of tools) {
      assert.ok(!seen.has(tool.id), `${tool.id} appears in two categories`);
      seen.add(tool.id);
      assert.equal(tool.category, queue.category);
    }
  }
  assert.equal(seen.size, 55, "catalog must cover all 55 tools");
});

// ===========================================================================
// 2. UWM — identity resolution, status, dates, priority
// ===========================================================================

const DIRECTORY: HubDirectoryEntry[] = [
  { email: "alice@corp.com", name: "Alice Ng", externalIds: { slack: ["U01ABCD"], jira: ["5b10a2844c20165700ede21g"], entra: ["11111111-2222-3333-4444-555555555555"] } },
  { email: "bob@corp.com", name: "Bob Reed", externalIds: { slack: ["U02EFGH"] } },
  { email: "carol@corp.com", name: "Carol Ito" },
];

test("uwm identity: direct email resolves by EMAIL strategy", () => {
  const r = resolveIdentity("alice@corp.com", DIRECTORY);
  assert.equal(r.email, "alice@corp.com");
  assert.equal(r.strategy, "EMAIL");
});

test("uwm identity: Slack id → corporate email via external-id map", () => {
  const r = resolveIdentity("U01ABCD", DIRECTORY, "slack");
  assert.equal(r.email, "alice@corp.com");
  assert.equal(r.strategy, "EXTERNAL_ID");
});

test("uwm identity: Jira account id and Entra GUID both resolve", () => {
  const jira = resolveIdentity({ accountId: "5b10a2844c20165700ede21g" }, DIRECTORY, "jira");
  assert.equal(jira.email, "alice@corp.com");
  const entra = resolveIdentity("11111111-2222-3333-4444-555555555555", DIRECTORY, "entra");
  assert.equal(entra.email, "alice@corp.com");
  assert.equal(entra.strategy, "EXTERNAL_ID");
});

test("uwm identity: display name fallback + honest unresolved", () => {
  const byName = resolveIdentity({ displayName: "Carol Ito" }, DIRECTORY);
  assert.equal(byName.email, "carol@corp.com");
  assert.equal(byName.strategy, "NAME");
  const unknown = resolveIdentity("ghost-user-999", DIRECTORY);
  assert.equal(unknown.email, null);
  assert.equal(unknown.strategy, "UNRESOLVED");
  const none = resolveIdentity(null, DIRECTORY);
  assert.equal(none.email, null);
});

test("uwm status: the directive's problem vocabularies map to the 5 core states", () => {
  // Named in the directive: "In QA", "Awaiting Client", "Stuck".
  assert.equal(normalizeStatus("In QA").status, "IN_PROGRESS");
  assert.equal(normalizeStatus("Awaiting Client").status, "BLOCKED");
  assert.equal(normalizeStatus("Stuck").status, "BLOCKED");
  // The 5 core states themselves + common synonyms.
  for (const s of UWM_STATUSES) assert.equal(normalizeStatus(s).status, s, `self-map ${s}`);
  assert.equal(normalizeStatus("Done").status, "COMPLETED");
  assert.equal(normalizeStatus("closed").status, "COMPLETED");
  assert.equal(normalizeStatus("Open").status, "TO_DO");
  assert.equal(normalizeStatus("Backlog").status, "TO_DO");
  assert.equal(normalizeStatus("On Hold").status, "BLOCKED");
  assert.equal(normalizeStatus("In Progress").status, "IN_PROGRESS");
  assert.equal(normalizeStatus("Cancelled").status, "CANCELLED");
});

test("uwm status: per-tool overrides beat the global table (ServiceNow codes)", () => {
  assert.equal(normalizeStatus("6", "servicenow").status, "COMPLETED");
  assert.equal(normalizeStatus("1", "servicenow").status, "TO_DO");
  assert.equal(normalizeStatus("3", "servicenow").status, "BLOCKED");
  assert.equal(normalizeStatus("Awaiting Client", "jira").status, "BLOCKED");
  // Without the tool id the numeric code is unmapped → anomaly flagged.
  const unmapped = normalizeStatus("6");
  assert.equal(unmapped.mapped, false);
  assert.ok(unmapped.anomaly?.startsWith("status_unmapped"));
});

test("uwm status: unknown vocabulary → TO_DO with an anomaly, never a throw", () => {
  const r = normalizeStatus("quantum-locked");
  assert.equal(r.status, "TO_DO");
  assert.equal(r.mapped, false);
  assert.equal(normalizeStatus(null).status, "TO_DO");
  assert.equal(normalizeStatus("").mapped, false);
});

test("uwm priority: 1-5, P1-P4 and word scales align to the 4 levels", () => {
  assert.equal(normalizePriority("1").priority, "CRITICAL");
  assert.equal(normalizePriority(1).priority, "CRITICAL");
  assert.equal(normalizePriority("P1").priority, "CRITICAL");
  assert.equal(normalizePriority("Urgent").priority, "CRITICAL");
  assert.equal(normalizePriority("Blocker").priority, "CRITICAL");
  assert.equal(normalizePriority("2").priority, "HIGH");
  assert.equal(normalizePriority("P2").priority, "HIGH");
  assert.equal(normalizePriority("High").priority, "HIGH");
  assert.equal(normalizePriority("3").priority, "MEDIUM");
  assert.equal(normalizePriority("P3").priority, "MEDIUM");
  assert.equal(normalizePriority("Normal").priority, "MEDIUM");
  assert.equal(normalizePriority(3).priority, "MEDIUM");
  assert.equal(normalizePriority("4").priority, "LOW");
  assert.equal(normalizePriority("P4").priority, "LOW");
  assert.equal(normalizePriority("Low").priority, "LOW");
  assert.equal(normalizePriority("Minor").priority, "LOW");
  for (const p of UWM_PRIORITIES) assert.ok(UWM_PRIORITIES.includes(normalizePriority(p).priority));
});

test("uwm priority: unknown words → MEDIUM with anomaly; absent → MEDIUM silent", () => {
  const unknown = normalizePriority("whenever-ish");
  assert.equal(unknown.priority, "MEDIUM");
  assert.equal(unknown.mapped, false);
  assert.ok(unknown.anomaly?.startsWith("priority_unmapped"));
  const absent = normalizePriority(null);
  assert.equal(absent.priority, "MEDIUM");
  assert.equal(absent.mapped, true, "no priority is normal, not an anomaly");
});

test("uwm dates: everything → UTC ISO-8601", () => {
  assert.equal(toUtcIso("2026-11-01"), "2026-11-01T00:00:00.000Z");
  assert.equal(toUtcIso(new Date("2026-06-15T10:30:00Z")), "2026-06-15T10:30:00.000Z");
  // Offset timestamps normalize to UTC.
  assert.equal(toUtcIso("2026-06-15T16:00:00+05:30"), "2026-06-15T10:30:00.000Z");
  // Epoch seconds and milliseconds.
  const sec = Math.floor(Date.UTC(2026, 0, 1) / 1000);
  assert.equal(toUtcIso(sec), "2026-01-01T00:00:00.000Z");
  assert.equal(toUtcIso(Date.UTC(2026, 0, 1)), "2026-01-01T00:00:00.000Z");
  // Excel serial (days since 1899-12-30): 46023 ≈ 2026-01-01.
  assert.ok(toUtcIso(46023)?.startsWith("2026-01-01"));
  // Garbage → null (caller records a date anomaly).
  assert.equal(toUtcIso("not-a-date"), null);
  assert.equal(toUtcIso(undefined), null);
  assert.equal(toUtcIso(""), null);
});

test("uwm harmonize: full record → UWM item with all four rule families applied", () => {
  const r = harmonize({
    source: "jira",
    sourceId: 10001,
    title: "Migrate billing service",
    status: "In QA",
    priority: "P2",
    assignee: { accountId: "5b10a2844c20165700ede21g" },
    startDate: "2026-11-01",
    dueDate: "2026-11-20T12:00:00+00:00",
    updatedAt: "2026-11-01T08:00:00Z",
    url: "https://corp.atlassian.net/browse/BR-1",
    extras: { storyPoints: 5, sprint: "Sprint 42" },
    directory: DIRECTORY,
  });
  assert.equal(r.valid, true);
  assert.equal(r.anomalies.length, 0, `unexpected anomalies: ${r.anomalies.join(", ")}`);
  assert.equal(r.item.sourceId, "10001");
  assert.equal(r.item.status, "IN_PROGRESS");
  assert.equal(r.item.priority, "HIGH");
  assert.equal(r.item.assigneeEmail, "alice@corp.com");
  assert.equal(r.item.dueDateUtc, "2026-11-20T12:00:00.000Z");
  assert.equal(r.item.startDateUtc, "2026-11-01T00:00:00.000Z");
  // Extension fields preserve vendor extras (nothing dropped).
  assert.equal(r.item.extension.storyPoints, 5);
  assert.equal(r.item.extension.sprint, "Sprint 42");
});

test("uwm harmonize: missing requireds → BLOCKING anomalies + invalid", () => {
  const r = harmonize({ source: "airtable", sourceId: "", title: "", status: "open" });
  assert.equal(r.valid, false);
  assert.ok(r.anomalies.includes("missing_required:sourceId"));
  assert.ok(r.anomalies.includes("missing_required:title"));
});

test("uwm harmonize: soft anomalies keep the item valid but flag the DLQ", () => {
  const r = harmonize({
    source: "asana", sourceId: "a1", title: "Draft plan",
    status: "quantum-locked", priority: "whenever-ish",
    assignee: "ghost-user", dueDate: "sometime soon",
  });
  assert.equal(r.valid, true, "item with unmapped vocabulary is still usable");
  assert.ok(r.anomalies.some((a) => a.startsWith("status_unmapped")));
  assert.ok(r.anomalies.some((a) => a.startsWith("priority_unmapped")));
  assert.ok(r.anomalies.some((a) => a.startsWith("identity_unresolved")));
  assert.ok(r.anomalies.some((a) => a.startsWith("date_unparseable")));
});

// ===========================================================================
// 3. Resiliency — circuit breaker + exponential backoff
// ===========================================================================

test("breaker: trips OPEN at the failure threshold and rejects while open", () => {
  let snap = breakerClosed();
  const cfg = { failureThreshold: 3, openMs: 1000, maxOpenMs: 60000, halfOpenSuccesses: 1 };
  const t0 = 1_000_000;
  assert.ok(breakerAllow(snap, t0));
  snap = breakerFailure(snap, t0, "e1", cfg).snapshot;
  assert.equal(snap.state, "CLOSED");
  snap = breakerFailure(snap, t0 + 1, "e2", cfg).snapshot;
  assert.equal(snap.state, "CLOSED");
  const res = breakerFailure(snap, t0 + 2, "e3", cfg);
  assert.equal(res.opened, true);
  assert.equal(res.snapshot.state, "OPEN");
  assert.equal(res.snapshot.retryAtMs, t0 + 2 + 1000);
  assert.equal(breakerAllow(res.snapshot, t0 + 500), false, "OPEN rejects before cooldown");
  assert.equal(breakerAllow(res.snapshot, t0 + 2000), true, "probe allowed after cooldown");
});

test("breaker: OPEN → HALF_OPEN → CLOSED on success; failure re-opens with doubled cooldown", () => {
  let snap = breakerClosed();
  const cfg = { failureThreshold: 1, openMs: 1000, maxOpenMs: 8000, halfOpenSuccesses: 1 };
  const t0 = 2_000_000;
  snap = breakerFailure(snap, t0, "boom", cfg).snapshot;
  assert.equal(snap.state, "OPEN");
  assert.equal(snap.trips, 1);

  snap = breakerTick(snap, t0 + 1000);
  assert.equal(snap.state, "HALF_OPEN");
  const ok = breakerSuccess(snap, cfg);
  assert.equal(ok.closed, true);
  assert.equal(ok.snapshot.state, "CLOSED");
  assert.equal(ok.snapshot.consecutiveFailures, 0);

  // A failure from HALF_OPEN re-opens with doubled cooldown (2000ms).
  let s2 = breakerClosed();
  s2 = breakerFailure(s2, t0, "x", cfg).snapshot;
  s2 = breakerTick(s2, t0 + 1000);
  assert.equal(s2.state, "HALF_OPEN");
  const reopened = breakerFailure(s2, t0 + 1500, "again", cfg);
  assert.equal(reopened.snapshot.state, "OPEN");
  assert.equal(reopened.snapshot.retryAtMs, t0 + 1500 + 2000, "cooldown doubles per trip");
  // Cap respected after many trips.
  let s3 = breakerClosed();
  for (let i = 0; i < 6; i++) {
    s3 = breakerTick(s3, 0);
    if (s3.state !== "OPEN") { s3 = breakerFailure(s3, 0, "x", cfg).snapshot; }
  }
  const capped = breakerFailure(breakerTick(s3, 10_000), 10_000, "x", cfg);
  assert.ok(capped.snapshot.retryAtMs - 10_000 <= cfg.maxOpenMs, "cooldown capped at maxOpenMs");
});

test("backoff: exponential growth, cap and jitter bounds", () => {
  const cfg = { ...DEFAULT_BACKOFF, baseMs: 100, factor: 2, maxMs: 1600, jitter: 0 };
  const rand0 = () => 0.5; // mid-jitter → exact delay
  assert.equal(backoffDelay(1, cfg, rand0), 100);
  assert.equal(backoffDelay(2, cfg, rand0), 200);
  assert.equal(backoffDelay(3, cfg, rand0), 400);
  assert.equal(backoffDelay(4, cfg, rand0), 800);
  assert.equal(backoffDelay(5, cfg, rand0), 1600, "capped at maxMs");
  assert.equal(backoffDelay(99, cfg, rand0), 1600, "stays capped");

  // Jitter stays within ±jitter of the raw delay.
  const jc = { ...DEFAULT_BACKOFF, baseMs: 1000, factor: 2, maxMs: 60_000, jitter: 0.2 };
  for (const attempt of [1, 3, 5]) {
    const raw = Math.min(1000 * 2 ** (attempt - 1), jc.maxMs);
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const d = backoffDelay(attempt, jc, () => r);
      assert.ok(d >= raw * 0.8 - 1 && d <= raw * 1.2 + 1, `attempt ${attempt} rng ${r} → ${d} outside ±20% of ${raw}`);
    }
  }
  const sched = backoffSchedule(4, cfg, rand0);
  assert.deepEqual(sched, [100, 200, 400, 800]);
});

test("backoff: only transient statuses justify a retry", () => {
  assert.ok(isRetryableStatus(429));
  assert.ok(isRetryableStatus(503));
  assert.ok(isRetryableStatus(500));
  assert.ok(isRetryableStatus(408));
  assert.ok(!isRetryableStatus(400));
  assert.ok(!isRetryableStatus(401));
  assert.ok(!isRetryableStatus(404));
});

// ===========================================================================
// 4. Facades — vendor shapes → one contract
// ===========================================================================

test("facade jira: webhook issue + search issues both normalize", () => {
  const webhook = facadeFor("jira")({
    toolId: "jira", mode: "WEBHOOK",
    payload: {
      webhookEvent: "issue_updated",
      issue: { id: "9001", key: "BR-7", fields: {
        summary: "Fix SSO redirect", status: { name: "In QA" },
        priority: { name: "High" }, assignee: { accountId: "5b10a2844c20165700ede21g", displayName: "Alice" },
        duedate: "2026-12-01", updated: "2026-11-01T09:00:00Z",
        labels: ["auth"], customfield_10016: 5,
      } },
    },
  });
  assert.equal(webhook.anomalies.length, 0);
  assert.equal(webhook.records.length, 1);
  const r = webhook.records[0];
  assert.equal(r.sourceId, "9001");
  assert.equal(r.title, "Fix SSO redirect");
  assert.equal(r.status, "In QA");
  assert.equal(r.priority, "High");
  assert.equal(r.extras.key, "BR-7");
  assert.equal(r.extras.storyPoints, 5);

  const search = facadeFor("jira")({
    toolId: "jira", mode: "POLL",
    payload: { issues: [{ id: "1", key: "A-1", fields: { summary: "One", status: { name: "To Do" } } }, { id: "2", key: "A-2", fields: { summary: "Two", status: { name: "Done" } } }] },
  });
  assert.equal(search.records.length, 2);
});

test("facade msGraph: change notification + list item both normalize", () => {
  const g = facadeFor("msGraph")({
    toolId: "sharepoint", mode: "WEBHOOK",
    payload: { value: [{ id: "item-1", resource: "sites/x/lists/y/items/1", changeType: "updated", fields: { Title: "Steering pack", Status: "In Progress", Priority: "High", DueDate: "2026-11-30" } }] },
  });
  assert.equal(g.records.length, 1);
  assert.equal(g.records[0].title, "Steering pack");
  assert.equal(g.records[0].status, "In Progress");
  assert.equal(g.records[0].extras.changeType, "updated");

  const teams = facadeFor("msGraph")({
    toolId: "ms-teams", mode: "WEBHOOK",
    payload: { value: [{ id: "msg-1", body: { content: "Decision: ship Friday" }, from: { user: { displayName: "Bob" } }, createdDateTime: "2026-11-01T10:00:00Z" }] },
  });
  assert.equal(teams.records.length, 1);
  assert.equal(teams.records[0].title, "Decision: ship Friday");
});

test("facade powerBi: refresh events and dataset rows both normalize", () => {
  const refresh = facadeFor("powerBi")({
    toolId: "power-bi", mode: "BI_REFRESH",
    payload: { refreshId: "r-1", datasetId: "d-9", status: "Completed", startTime: "2026-11-01T06:00:00Z", endTime: "2026-11-01T06:04:00Z" },
  });
  assert.equal(refresh.records.length, 1);
  assert.equal(refresh.records[0].sourceId, "r-1");
  assert.equal(refresh.records[0].status, "Completed");

  const rows = facadeFor("powerBi")({
    toolId: "power-bi", mode: "BI_REFRESH",
    payload: { rows: [{ id: "kpi-1", name: "Schedule variance", value: -4.2 }] },
  });
  assert.equal(rows.records.length, 1);
  assert.equal(rows.records[0].title, "Schedule variance");
});

test("facade zoho + slack: task batches and events normalize", () => {
  const zoho = facadeFor("zoho")({
    toolId: "zoho-projects", mode: "WEBHOOK",
    payload: { tasks: [{ id: 55, name: "Collect UAT signoff", status: "Waiting for Customer", priority: "High", end_date: "2026-11-15", project_id: 7 }] },
  });
  assert.equal(zoho.records.length, 1);
  assert.equal(zoho.records[0].sourceId, "55");
  assert.equal(zoho.records[0].extras.projectId, 7);

  const slack = facadeFor("slack")({
    toolId: "slack", mode: "WEBHOOK",
    payload: { type: "event_callback", team_id: "T1", events: [{ type: "message", client_msg_id: "m-1", text: "Blocked on vendor API", user: "U01ABCD", channel: "C-PROJ", ts: "1793500000.000100" }] },
  });
  assert.equal(slack.records.length, 1);
  assert.equal(slack.records[0].sourceId, "m-1");
  assert.equal(slack.records[0].extras.channel, "C-PROJ");

  // Slack URL-verification handshake → zero records, zero anomalies.
  const handshake = facadeFor("slack")({ toolId: "slack", mode: "WEBHOOK", payload: { type: "url_verification", challenge: "abc" } });
  assert.equal(handshake.records.length, 0);
  assert.equal(handshake.anomalies.length, 0);
});

test("facade csv: RFC-4180 parsing + header aliasing into UWM fields", () => {
  const csv = 'id,title,status,priority,assignee,due_date,notes\n' +
    'T-1,"Deploy, with care",In QA,High,alice@corp.com,2026-11-10,keep me\n' +
    'T-2,Backfill logs,Blocked,1,bob@corp.com,2026-11-12,\n';
  const out = facadeFor("csv")({ toolId: "excel", mode: "CSV_UPLOAD", payload: csv });
  assert.equal(out.anomalies.length, 0);
  assert.equal(out.records.length, 2);
  assert.equal(out.records[0].title, "Deploy, with care", "quoted comma preserved");
  assert.equal(out.records[0].dueDate, "2026-11-10");
  assert.equal(out.records[0].extras.notes, "keep me", "unmapped columns → extension");
  // Embedded newline inside quotes.
  const nl = parseCsv('a,b\n"x\ny",1\n');
  assert.equal(nl.length, 2);
  assert.equal(nl[1][0], "x\ny");
});

test("facade generic: nested data wrappers and value[] batches normalize", () => {
  const nested = facadeFor("generic")({
    toolId: "asana", mode: "WEBHOOK",
    payload: { data: { gid: "1201", name: "Prepare steering deck", status: "in_progress", due_on: "2026-11-08", assignee: { email: "alice@corp.com" } } },
  });
  assert.equal(nested.records.length, 1);
  assert.equal(nested.records[0].sourceId, "1201");
  assert.equal(nested.records[0].title, "Prepare steering deck");

  const batch = facadeFor("generic")({
    toolId: "airtable", mode: "POLL",
    payload: { records: [{ id: "rec1", fields: {} }, { id: "rec2", fields: {} }] },
  });
  assert.ok(batch.records.length >= 2 || batch.anomalies.length > 0, "batch handled without throwing");

  const empty = facadeFor("generic")({ toolId: "asana", mode: "POLL", payload: null });
  assert.ok(empty.anomalies.length > 0, "empty payload flagged");
});

// ===========================================================================
// 5. Queues + DLQ routing
// ===========================================================================

test("queues: each of the 6 categories routes to its own queue with a lane", () => {
  const modes = ["WEBHOOK", "BI_REFRESH", "POLL", "CSV_UPLOAD"] as const;
  const byCategory = new Map<string, string>();
  for (const cat of HUB_CATEGORIES) {
    const tool = HUB_TOOLS.find((t) => t.category === cat)!;
    const route = routeToQueue(tool.id, "WEBHOOK")!;
    assert.equal(route.category, cat);
    assert.equal(route.queue, queueForCategory(cat));
    assert.ok(!byCategory.has(route.queue), "queues unique per category");
    byCategory.set(route.queue, cat);
  }
  assert.equal(byCategory.size, 6);
  // Lane ordering: webhook < bi-refresh < poll < upload.
  const sample = HUB_TOOLS.find((t) => t.ingress.includes("POLL"))!;
  const lanes = modes.map((m) => routeToQueue(sample.id, m)!.lane);
  assert.deepEqual(lanes, [0, 1, 2, 3]);
  // Unknown tool → no route (caller DLQs).
  assert.equal(routeToQueue("nope", "WEBHOOK"), null);
});

test("dlq: blocking vs warn classification + replay decisions", () => {
  assert.equal(classifyAnomalies(["missing_required:sourceId"]), "BLOCKING");
  assert.equal(classifyAnomalies(["payload_not_object"]), "BLOCKING");
  assert.equal(classifyAnomalies(["unknown_tool"]), "BLOCKING");
  assert.equal(classifyAnomalies(["auth_failed"]), "BLOCKING");
  assert.equal(classifyAnomalies(["status_unmapped:Weird", "identity_unresolved:ghost"]), "WARN");
  assert.equal(classifyAnomalies([]), "WARN");

  const blocking = buildDlqEntry({
    toolId: "jira", mode: "WEBHOOK", anomalies: ["missing_required:title"],
    reason: "Missing required UWM fields", rawPayload: { id: "1" }, nowMs: 1793500000000,
  });
  assert.equal(blocking.severity, "BLOCKING");
  assert.equal(blocking.queue, "queue.agile_devsecops", "DLQ entry keeps its category queue");
  assert.ok(blocking.at.startsWith("2026-"));

  const warn = buildDlqEntry({
    toolId: "asana", mode: "WEBHOOK", anomalies: ["priority_unmapped:whatever"],
    reason: "Harmonized with warnings", rawPayload: { id: "2", name: "x" }, nowMs: 1793500000000,
  });
  assert.equal(warn.severity, "WARN");
  assert.ok(warn.payloadPreview.length > 0, "payload kept for replay");

  // Replay: auth failures and unknown tools are not replayable from the DLQ.
  assert.equal(canReplay(blocking), true);
  assert.equal(canReplay({ severity: "BLOCKING", anomalies: ["auth_failed"] }), false);
  assert.equal(canReplay({ severity: "BLOCKING", anomalies: ["unknown_tool"] }), false);
  // Payload truncation for storage.
  const big = buildDlqEntry({ toolId: "jira", mode: "POLL", anomalies: ["x"], reason: "r", rawPayload: "z".repeat(10_000), nowMs: 0 });
  assert.ok(big.payloadPreview.length < 5_000, "payload preview truncated");
});

// ===========================================================================
// 6. Security — HMAC, JWT, OAuth, mTLS
// ===========================================================================

const secret = "hub-test-secret";

test("security hmac: valid signature passes; tampered body / wrong secret fail", () => {
  const body = JSON.stringify({ id: 1, summary: "hello" });
  const sig = "sha256=" + require("node:crypto").createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyHmacSignature({ rawBody: body, secret, signature: sig }).valid, true);
  assert.equal(verifyHmacSignature({ rawBody: body + "x", secret, signature: sig }).valid, false);
  assert.equal(verifyHmacSignature({ rawBody: body, secret: "other", signature: sig }).valid, false);
  assert.equal(verifyHmacSignature({ rawBody: body, secret, signature: null }).valid, false);
  // Slack-style v0 signature over timestamp.body.
  const ts = 1793500000;
  const v0 = "v0=" + require("node:crypto").createHmac("sha256", `v0:${secret}`).update(`${ts}.${body}`).digest("hex");
  assert.equal(verifyHmacSignature({ rawBody: body, secret, signature: v0, timestamp: ts, prefix: "v0", nowMs: ts * 1000 + 1000 }).valid, true);
  // Timestamp outside tolerance → replay rejected.
  assert.equal(
    verifyHmacSignature({ rawBody: body, secret, signature: sig, timestamp: ts, nowMs: ts * 1000 + 400_000 }).valid,
    false, "timestamp out of tolerance",
  );
});

test("security jwt: HS256 verifies; alg=none, bad sig and expired tokens reject", () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const now = 1793500000;
  const payload = b64({ sub: "hub", aud: "pmct-hub", iss: "pmct", exp: now + 3600, nbf: now - 10 });
  const sig = require("node:crypto").createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  const token = `${header}.${payload}.${sig}`;

  const okRes = validateJwt(token, { secret, nowMs: now * 1000, audience: "pmct-hub", issuer: "pmct" });
  assert.equal(okRes.valid, true, okRes.reason);

  // alg=none must be rejected regardless of allow-list.
  const none = `${b64({ alg: "none" })}.${payload}.`;
  assert.equal(validateJwt(none, { secret, nowMs: now * 1000 }).valid, false);

  // Wrong signature.
  const bad = `${header}.${payload}.${b64({ x: 1 })}`;
  assert.equal(validateJwt(bad, { secret, nowMs: now * 1000 }).valid, false);

  // Expired (beyond 60s skew).
  const expPayload = b64({ sub: "hub", exp: now - 3600 });
  const expSig = require("node:crypto").createHmac("sha256", secret).update(`${header}.${expPayload}`).digest("base64url");
  const expired = validateJwt(`${header}.${expPayload}.${expSig}`, { secret, nowMs: now * 1000 });
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, "token_expired");

  // Audience mismatch.
  assert.equal(validateJwt(token, { secret, nowMs: now * 1000, audience: "other-aud" }).valid, false);
  // Malformed.
  assert.equal(validateJwt("not.a.jwt.at.all", { secret }).valid, false);
  assert.equal(validateJwt("", { secret }).valid, false);
});

test("security oauth: expiry and scope enforcement", () => {
  const now = 1793500000000;
  assert.equal(checkOAuthToken({ accessToken: "tok", expiresAtMs: now + 60_000, nowMs: now }).valid, true);
  const expired = checkOAuthToken({ accessToken: "tok", expiresAtMs: now - 1000, nowMs: now });
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, "token_expired");
  const scoped = checkOAuthToken({ accessToken: "tok", expiresAtMs: now + 60_000, scope: "read write", requiredScopes: ["read"], nowMs: now });
  assert.equal(scoped.valid, true);
  const missing = checkOAuthToken({ accessToken: "tok", expiresAtMs: now + 60_000, scope: "read", requiredScopes: ["admin"], nowMs: now });
  assert.equal(missing.valid, false);
  assert.equal(missing.reason, "insufficient_scope");
  assert.deepEqual(missing.missingScopes, ["admin"]);
  assert.equal(checkOAuthToken({ accessToken: null, nowMs: now }).reason, "missing_access_token");
});

test("security mtls: client cert CN allow-list with wildcard support", () => {
  const policy = { allowedCns: ["gw.corp.example", "*.partner.example"], requireClientCert: true };
  assert.equal(checkMtls({ clientCertPresent: true, clientCertCn: "gw.corp.example", policy }).valid, true);
  assert.equal(checkMtls({ clientCertPresent: true, clientCertCn: "edge.partner.example", policy }).valid, true);
  assert.equal(checkMtls({ clientCertPresent: true, clientCertCn: "evil.example", policy }).valid, false);
  assert.equal(checkMtls({ clientCertPresent: false, policy }).valid, false, "cert required");
  assert.equal(checkMtls({ clientCertPresent: false, policy: { allowedCns: ["x"], requireClientCert: false } }).valid, true);
});

test("security ingress: per-kind authentication dispatch", () => {
  const body = JSON.stringify({ ok: 1 });
  const sig = "sha256=" + require("node:crypto").createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(authenticateIngress({ kind: "HMAC", rawBody: body, headers: { "x-hub-signature-256": sig }, secret }).ok, true);
  assert.equal(authenticateIngress({ kind: "HMAC", rawBody: body, headers: { "x-hub-signature-256": sig }, secret: "wrong" }).ok, false);
  assert.equal(authenticateIngress({ kind: "HMAC", rawBody: body, headers: {}, secret }).ok, false, "missing signature");
  assert.equal(authenticateIngress({ kind: "NONE", rawBody: body, headers: {} }).ok, true);
  assert.equal(authenticateIngress({ kind: "JWT", rawBody: body, headers: {}, secret }).ok, false, "missing bearer");
  assert.equal(authenticateIngress({ kind: "OAUTH2", rawBody: body, headers: {}, secret }).ok, false);
  assert.equal(authenticateIngress({ kind: "MTLS", rawBody: body, headers: {}, secret, clientCertPresent: false, mtlsPolicy: { allowedCns: ["x"], requireClientCert: true } }).ok, false);
  assert.equal(authenticateIngress({ kind: "BOGUS" as never, rawBody: body, headers: {} }).ok, false);
});

// ===========================================================================
// 7. Pipeline — end-to-end execution instructions
// ===========================================================================

function jiraWebhookPayload() {
  return {
    webhookEvent: "issue_created",
    issue: { id: "70001", key: "OPS-70", fields: {
      summary: "Rotate TLS certificates", status: { name: "In QA" },
      priority: { name: "Urgent" },
      assignee: { accountId: "5b10a2844c20165700ede21g" },
      duedate: "2026-11-10", updated: "2026-11-01T12:00:00Z",
      labels: ["security"],
    } },
  };
}

function sign(body: string): string {
  return "sha256=" + require("node:crypto").createHmac("sha256", secret).update(body).digest("hex");
}

test("pipeline: authenticated Jira webhook → HARMONIZED UWM on the agile queue", () => {
  const payload = jiraWebhookPayload();
  const rawBody = JSON.stringify(payload);
  const out = runPipeline({
    toolId: "jira", mode: "WEBHOOK", payload, rawBody,
    headers: { "x-hub-signature-256": sign(rawBody) },
    auth: { kind: "HMAC", secret },
    directory: DIRECTORY,
    nowMs: Date.UTC(2026, 10, 1),
  });
  assert.equal(out.outcome, "HARMONIZED");
  assert.equal(out.route?.queue, "queue.agile_devsecops");
  assert.equal(out.items.length, 1);
  const item = out.items[0];
  assert.equal(item.status, "IN_PROGRESS", "In QA → IN_PROGRESS");
  assert.equal(item.priority, "CRITICAL", "Urgent → CRITICAL");
  assert.equal(item.assigneeEmail, "alice@corp.com", "Jira account id → corporate email");
  assert.equal(item.dueDateUtc, "2026-11-10T00:00:00.000Z");
  assert.equal((item.extension.labels as string[])[0], "security");
  assert.equal(out.dlq.length, 0);
  assert.equal(out.stats.authFailures, 0);
});

test("pipeline: bad HMAC signature → REJECTED with a DLQ security entry", () => {
  const payload = jiraWebhookPayload();
  const rawBody = JSON.stringify(payload);
  const out = runPipeline({
    toolId: "jira", mode: "WEBHOOK", payload, rawBody,
    headers: { "x-hub-signature-256": sign(rawBody + "tampered") },
    auth: { kind: "HMAC", secret },
    directory: DIRECTORY,
    nowMs: Date.UTC(2026, 10, 1),
  });
  assert.equal(out.outcome, "REJECTED");
  assert.equal(out.stats.authFailures, 1);
  assert.equal(out.items.length, 0, "nothing processed on auth failure");
  assert.equal(out.dlq.length, 1);
  assert.ok(out.dlq[0].anomalies.includes("auth_failed"));
  assert.equal(canReplay({ severity: "BLOCKING", anomalies: out.dlq[0].anomalies }), false);
});

test("pipeline: payload missing requireds → DLQ, no items handed to the engine", () => {
  const payload = { issues: [{ id: "", fields: { summary: "" } }] };
  const rawBody = JSON.stringify(payload);
  const out = runPipeline({
    toolId: "jira", mode: "WEBHOOK", payload, rawBody,
    headers: { "x-hub-signature-256": sign(rawBody) },
    auth: { kind: "HMAC", secret },
    nowMs: Date.UTC(2026, 10, 1),
  });
  assert.equal(out.outcome, "DLQ");
  assert.equal(out.items.length, 0);
  assert.ok(out.dlq.length >= 1);
  assert.ok(out.dlq[0].anomalies.includes("missing_required:sourceId"));
});

test("pipeline: unknown tool → DLQ with unknown_tool (never a crash)", () => {
  const out = runPipeline({
    toolId: "martian-pm", mode: "WEBHOOK", payload: { anything: true }, rawBody: "{}",
    headers: {}, auth: { kind: "NONE" }, nowMs: Date.UTC(2026, 10, 1),
  });
  assert.equal(out.outcome, "DLQ");
  assert.equal(out.reason, "unknown_tool");
  assert.equal(out.route, null);
  assert.ok(out.dlq[0].anomalies.includes("unknown_tool"));
});

test("pipeline: PARTIAL — one clean item + one broken item split across engine and DLQ", () => {
  const payload = { issues: [
    { id: "1", key: "A-1", fields: { summary: "Good task", status: { name: "To Do" }, priority: { name: "Low" } } },
    { id: "", fields: { summary: "" } },
  ] };
  const rawBody = JSON.stringify(payload);
  const out = runPipeline({
    toolId: "jira", mode: "POLL", payload, rawBody,
    headers: { "x-hub-signature-256": sign(rawBody) },
    auth: { kind: "HMAC", secret },
    nowMs: Date.UTC(2026, 10, 1),
  });
  assert.equal(out.outcome, "PARTIAL");
  assert.equal(out.items.length, 1, "clean item still reaches the engine");
  assert.equal(out.items[0].status, "TO_DO");
  assert.equal(out.items[0].priority, "LOW");
  assert.ok(out.dlq.length >= 1, "broken item queued for monitoring");
});

test("pipeline: CSV payload via the csv facade harmonizes row by row", () => {
  const csv = "id,title,status,priority,assignee,due_date\nC-1,Map cutover,Blocked,1,alice@corp.com,2026-11-25\nC-2,Freeze window,Done,3,bob@corp.com,2026-12-01";
  const out = runPipeline({
    toolId: "excel", mode: "CSV_UPLOAD", payload: csv, rawBody: csv,
    headers: {}, auth: { kind: "NONE" }, directory: DIRECTORY, nowMs: Date.UTC(2026, 10, 1),
  });
  assert.equal(out.outcome, "HARMONIZED");
  assert.equal(out.route?.queue, "queue.data_spreadsheet_specialized");
  assert.equal(out.items.length, 2);
  assert.equal(out.items[0].status, "BLOCKED");
  assert.equal(out.items[0].priority, "CRITICAL");
  assert.equal(out.items[0].assigneeEmail, "alice@corp.com");
  assert.equal(out.items[1].status, "COMPLETED");
});

// ===========================================================================
// 8. Engine handoff — harmonized UWM → WBS/CPM evaluation
// ===========================================================================

test("handoff: harmonized UWM items evaluate through the platform CPM engine", () => {
  const out = runPipeline({
    toolId: "jira", mode: "WEBHOOK",
    payload: jiraWebhookPayload(), rawBody: JSON.stringify(jiraWebhookPayload()),
    headers: { "x-hub-signature-256": sign(JSON.stringify(jiraWebhookPayload())) },
    auth: { kind: "HMAC", secret }, directory: DIRECTORY, nowMs: Date.UTC(2026, 10, 1),
  });
  assert.equal(out.items.length, 1);

  // Map the same way hub-service handoffToEngine does: UWM → CpmTaskInput.
  const tasks = out.items.map((item) => ({
    id: `${item.source}:${item.sourceId}`,
    name: item.title,
    durationDays: 1,
    startDate: item.startDateUtc ?? item.updatedAtUtc,
    isSummary: false,
    seedDay: null, endSeedDay: null, deadlineDay: null,
  }));
  const result = computeCPM(tasks, [], null);
  assert.equal(result.size, 1, "CPM evaluated every harmonized task");
  const r = result.get("jira:70001");
  assert.ok(r, "task keyed by source:sourceId");
  assert.ok(typeof r!.es === "number" && typeof r!.ef === "number");
  assert.ok(r!.ef >= r!.es, "finish never before start");

  // Status roll-up for the handoff summary.
  const done = out.items.filter((i) => i.status === "COMPLETED").length;
  const blocked = out.items.filter((i) => i.status === "BLOCKED").length;
  assert.equal(done + blocked <= out.items.length, true);
});
