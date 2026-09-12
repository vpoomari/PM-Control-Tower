// v1.2.0 delta verification against the live server
const BASE = "http://127.0.0.1:3000";
import fs from "fs";

async function api(path, opts = {}, token) {
  const res = await fetch(BASE + path, { ...opts, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...(opts.headers || {}) } });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return { status: res.status, body: await res.json() };
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
}

(async () => {
  const login = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "pmo@pmct.io", password: "Pmct@2026" }) });
  const token = login.body.data.token;
  const projects = await api("/api/projects", {}, token);
  const pid = projects.body.data.items[0].id;
  console.log("project:", projects.body.data.items[0].code);

  // A. async simulation queue
  const q = await api("/api/integrity/simulate", { method: "POST", body: JSON.stringify({ projectId: pid, seed: 777, iterations: 1000 }) }, token);
  console.log("A. enqueue →", q.body.data.status, q.body.data.runId);
  let run;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const runs = await api(`/api/integrity/simulate?projectId=${pid}`, {}, token);
    run = runs.body.data.runs.find((x) => x.id === q.body.data.runId);
    if (run && (run.status === "COMPLETE" || run.status === "FAILED")) break;
  }
  console.log("A. worker →", run.status, "| P50 day", run.result?.finish?.p50, "P80 day", run.result?.finish?.p80, "| start:", run.result?.projectStart?.slice(0, 10));

  // B. evidence ZIP download
  const bundles = await api("/api/integrity/evidence", {}, token);
  const bid = bundles.body.data.bundles[0].id;
  const dl = await api(`/api/integrity/evidence/${bid}/download`, {}, token);
  const isZip = dl.buf[0] === 0x50 && dl.buf[1] === 0x4b;
  const hasIndex = dl.buf.toString("latin1").includes("INDEX.txt");
  const hasManifest = dl.buf.toString("latin1").includes("manifest.json");
  fs.writeFileSync("sales-deck/evidence-sample.zip", dl.buf);
  console.log("B. zip →", dl.buf.length, "bytes | PK:", isZip, "| INDEX:", hasIndex, "| manifest:", hasManifest);

  // C. config + grace window
  const cfg = await api("/api/integrity/config", {}, token);
  console.log("C. config → warn", cfg.body.data.freshnessWarn, "degrade", cfg.body.data.freshnessDegrade, "critical", cfg.body.data.freshnessCritical, "grace", cfg.body.data.freshnessGraceHours + "h");
  const upd = await api("/api/integrity/config", { method: "POST", body: JSON.stringify({ freshnessGraceHours: 48 }) }, token);
  console.log("C. grace updated →", upd.body.data.freshnessGraceHours + "h");
  const fresh = await api("/api/integrity/freshness?projectId=" + pid, {}, token);
  console.log("C. freshness w/ grace →", fresh.body.data.level, fresh.body.data.score, "| graceApplied feeds:", fresh.body.data.feeds.filter((f) => f.graceApplied).length);

  // D. approval deep link roundtrip
  const link = await api("/api/integrity/approvals", { method: "POST", body: JSON.stringify({ projectId: pid, ttlMinutes: 60 }) }, token);
  console.log("D. link →", link.body.data.status, "|", link.body.data.title);
  const page = await fetch(BASE + link.body.data.url);
  const html = await page.text();
  console.log("D. GET link →", page.status, "| page has Approve:", html.includes("Approve"));
  const m = link.body.data.url.match(/token$|\/([^/]+)$/);
  const act = await fetch(BASE + link.body.data.url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "decision=APPROVED" });
  const actHtml = await act.text();
  console.log("D. approve via link →", act.status, "| recorded:", actHtml.includes("APPROVED"));

  // E. rebase merge (drift: change a task AFTER forking)
  const fork = await api("/api/integrity/scenarios", { method: "POST", body: JSON.stringify({ projectId: pid, name: "Rebase drift test" }) }, token);
  const sid = fork.body.data.scenarioId;
  const list = await api("/api/integrity/scenarios", {}, token);
  const sc = list.body.data.scenarios.find((x) => x.id === sid);
  const longest = [...sc.summary.tasks].sort((a, b) => b.durationDays - a.durationDays)[0];
  await api("/api/integrity/scenarios", { method: "PATCH", body: JSON.stringify({ id: sid, overrides: { durationChanges: { [longest.id]: longest.durationDays * 2 } } }) }, token);
  // simulate drift: bump the same task's production duration by +5d directly
  await fetch(BASE + "/api/tasks/" + longest.id, { method: "PATCH", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ durationDays: longest.durationDays + 5 }) }).catch(() => undefined);
  const merge = await api(`/api/integrity/scenarios/${sid}/merge`, { method: "POST" }, token);
  const desc = merge.body.data?.changeRequest?.description || "";
  console.log("E. rebase merge →", merge.body.success ? "merged " + merge.body.data.changeRequest.code : merge.body.error);
  console.log("E. rebase note in CR:", desc.includes("Rebase:") ? desc.split("Rebase: ")[1].split(".")[0].slice(0, 90) : "(clean)");
  // restore task duration
  await fetch(BASE + "/api/tasks/" + longest.id, { method: "PATCH", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ durationDays: longest.durationDays }) }).catch(() => undefined);

  console.log("ALL DELTA CHECKS DONE");
})().catch((e) => { console.error("VERIFY FAILED:", e.message); process.exit(1); });
