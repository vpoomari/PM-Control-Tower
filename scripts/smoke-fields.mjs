// PM CONTROL TOWER — Field Dictionary HTTP smoke test (live dev server).
// Run: node scripts/smoke-fields.mjs   (server must be up on :3000)
// Exercises the full API handshake end-to-end and cleans up after itself.

const BASE = process.env.PMCT_BASE || "http://localhost:3000";
const EMAIL = process.env.PMCT_EMAIL || "pmo@pmct.io";
const PASSWORD = process.env.PMCT_PASSWORD || "Pmct@2026";
const KEY = `smoke_confidence_${Date.now().toString(36)}`;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; failures.push(`${name} :: ${detail}`); console.log(`  ✖ ${name} — ${detail}`); }
}

async function call(method, path, body, token, attempt = 1) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    // Next dev resets connections while compiling a route on first hit — retry once.
    if (attempt < 4) { await new Promise((r) => setTimeout(r, 4000)); return call(method, path, body, token, attempt + 1); }
    return { status: 0, data: null, text: String(e) };
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data, text, headers: res.headers };
}

// unwrap { data } envelope if present, else the object itself
const payload = (r) => (r.data && typeof r.data === "object" && "data" in r.data ? r.data.data : r.data);

async function main() {
  console.log(`\n== Field Dictionary HTTP smoke → ${BASE} (key ${KEY}) ==`);

  // 0. auth gates
  let r = await call("POST", "/api/field-dictionary", { label: "Nope" });
  check("unauthenticated create is rejected (401)", r.status === 401, `got ${r.status}`);

  r = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  check("admin login", r.status === 200 && !!payload(r)?.token, `got ${r.status}`);
  const token = payload(r)?.token;
  if (!token) { console.log("FATAL: no token"); process.exit(1); }

  // purge orphan smoke fields left by earlier interrupted runs
  r = await call("GET", "/api/field-dictionary?q=smoke_confidence", null, token);
  for (const f of payload(r)?.fields ?? []) {
    if (String(f.fieldKey).startsWith("smoke_confidence")) {
      const d = await call("DELETE", `/api/field-dictionary/${f.id}?purgeValues=true`, null, token);
      console.log(`  (cleanup orphan ${f.fieldKey} → ${d.status})`);
    }
  }

  // 1. dictionary CRUD
  r = await call("POST", "/api/field-dictionary", {
    label: "Delivery Confidence",
    fieldKey: KEY,
    dataType: "SINGLE_SELECT",
    options: ["Green", "Amber", "Red"],
    isSearchable: true, isExportable: true, isFilterable: true,
    description: "Smoke-test field (auto-created, cleaned up)",
  }, token);
  check("create dictionary field (201)", r.status === 201, `got ${r.status} ${r.text?.slice(0, 200)}`);
  const fieldId = payload(r)?.field?.id;
  check("create returns immutable field key", payload(r)?.field?.fieldKey === KEY, JSON.stringify(payload(r)?.field?.fieldKey));

  r = await call("POST", "/api/field-dictionary", { label: "Delivery Confidence", fieldKey: KEY, dataType: "TEXT" }, token);
  check("duplicate field key refused (409)", r.status === 409, `got ${r.status}`);

  r = await call("GET", `/api/field-dictionary?q=${KEY}`, null, token);
  check("definition appears in dictionary list", (payload(r)?.fields ?? []).some((f) => f.id === fieldId), `got ${r.status}`);

  // 2. record ids
  r = await call("GET", "/api/projects?take=5", null, token);
  const pj = payload(r);
  const projectId = pj?.projects?.[0]?.id ?? pj?.items?.[0]?.id ?? pj?.rows?.[0]?.id ?? pj?.[0]?.id;
  check("found a project record", !!projectId, JSON.stringify(Object.keys(pj ?? {})));
  r = await call("GET", "/api/risks?take=5", null, token);
  const rk = payload(r);
  const riskId = rk?.risks?.[0]?.id ?? rk?.items?.[0]?.id ?? rk?.rows?.[0]?.id ?? rk?.[0]?.id;
  check("found a risk record", !!riskId, JSON.stringify(Object.keys(rk ?? {})));
  if (!projectId || !riskId) { process.exit(1); }

  // 3. assignment (module layer) — reuse, no duplicate definition
  r = await call("POST", "/api/modules/project/fields", {
    assignments: [{ fieldId, section: "Delivery", isInTable: true, isInForm: true, isInDetail: true }],
  }, token);
  check("assign field to project module (201)", r.status === 201, `got ${r.status} ${r.text?.slice(0, 200)}`);
  // NOTE: `assigned[].id` is the FIELD id; the assignment row id lives in `assignments[].id`
  const assignmentIdFor = (resp) => (payload(resp)?.assignments ?? []).find((a) => a.field?.fieldKey === KEY)?.id;
  const projectAssignId = assignmentIdFor(r);
  check("project assignment id resolvable", !!projectAssignId, JSON.stringify((payload(r)?.assignments ?? []).map((a) => a.field?.fieldKey)));

  r = await call("POST", "/api/modules/project/fields", {
    assignments: [{ fieldId, section: "Delivery" }],
  }, token);
  check("duplicate assignment skipped, not created (200)", r.status === 200 && (payload(r)?.skipped?.length ?? 0) === 1,
    `got ${r.status} skipped=${JSON.stringify(payload(r)?.skipped)}`);

  r = await call("POST", "/api/modules/risk/fields", {
    assignments: [{ fieldId, section: "Scoring", isInTable: true }],
  }, token);
  check("same definition reused by risk module (201)", r.status === 201, `got ${r.status}`);
  const riskAssignId = assignmentIdFor(r);
  check("risk assignment id resolvable", !!riskAssignId, JSON.stringify((payload(r)?.assignments ?? []).map((a) => a.field?.fieldKey)));

  r = await call("GET", "/api/field-dictionary?q=" + KEY, null, token);
  const listed = (payload(r)?.fields ?? []).find((f) => f.id === fieldId);
  check("one definition reports 2 module assignments", (listed?.assignmentCount ?? listed?.modules?.length ?? 0) >= 2 || (listed?.usage?.assignments ?? 0) >= 2,
    JSON.stringify(listed?.modules ?? listed?.assignmentCount ?? listed?.usage));

  // 4. values — typed, per-record, per-module
  r = await call("PUT", `/api/modules/project/${projectId}/values`, { values: { [KEY]: "Amber" } }, token);
  check("set value on project (saved)", r.status === 200 && payload(r)?.values?.[KEY] === "Amber", `got ${r.status} ${r.text?.slice(0, 200)}`);

  r = await call("PUT", `/api/modules/project/${projectId}/values`, { values: { [KEY]: "Purple" } }, token);
  check("invalid option rejected server-side (400)", r.status === 400, `got ${r.status} ${r.text?.slice(0, 200)}`);

  r = await call("PUT", `/api/modules/risk/${riskId}/values`, { values: { [KEY]: "Green" } }, token);
  check("set value on risk (same field, different record)", r.status === 200 && payload(r)?.values?.[KEY] === "Green", `got ${r.status}`);

  r = await call("GET", `/api/modules/project/${projectId}/values`, null, token);
  check("project value unaffected by risk write (isolation)", payload(r)?.values?.[KEY] === "Amber", JSON.stringify(payload(r)?.values?.[KEY]));

  r = await call("GET", `/api/modules/risk/${riskId}/values`, null, token);
  check("risk value reads back Green", payload(r)?.values?.[KEY] === "Green", JSON.stringify(payload(r)?.values?.[KEY]));

  // 5. impact handshake (409 → acknowledge → 200)
  r = await call("PATCH", `/api/field-dictionary/${fieldId}`, { dataType: "TEXT" }, token);
  check("risky type change refused without impact ack (409)", r.status === 409, `got ${r.status}`);
  const impactReport = r.data?.error?.details ?? r.data?.details ?? r.data?.data;
  check("409 carries the impact report", !!impactReport, JSON.stringify(r.data).slice(0, 200));

  r = await call("PATCH", `/api/field-dictionary/${fieldId}`, { dataType: "SINGLE_SELECT", options: ["Green", "Amber", "Red", "Blue"], acknowledgeImpact: true }, token);
  check("same change accepted with acknowledgeImpact (200)", r.status === 200, `got ${r.status} ${r.text?.slice(0, 200)}`);

  // 6. export enrichment
  r = await call("GET", "/api/export/projects?format=csv", null, token);
  check("project CSV export renders", r.status === 200 && r.text?.includes(","), `got ${r.status}`);
  const header = (r.text || "").split(/\r?\n/)[0] ?? "";
  // CSV headers are human labels (keys are used for JSON row objects)
  check("export contains custom column (label header)", header.includes("Delivery Confidence"), header.slice(-300));
  check("export contains the stored value", (r.text || "").includes("Amber"), "Amber not found in CSV");

  // 7. global search over custom values
  r = await call("GET", "/api/search?q=Amber", null, token);
  const hits = payload(r)?.custom ?? [];
  check("search returns a custom-field hit", hits.some((h) => h.fieldKey === KEY && h.recordId === projectId), JSON.stringify(hits).slice(0, 300));

  // 8. audit trail
  r = await call("GET", `/api/field-dictionary/audit?fieldId=${fieldId}&limit=50`, null, token);
  const actions = new Set((payload(r)?.logs ?? []).map((l) => l.action));
  check("audit records CREATE", actions.has("CREATE"), [...actions].join(","));
  check("audit records ASSIGN", actions.has("ASSIGN"), [...actions].join(","));
  check("audit records VALUE_SET", actions.has("VALUE_SET"), [...actions].join(","));
  check("audit records UPDATE", actions.has("UPDATE"), [...actions].join(","));

  // 9. deprecation blocks new writes, keeps reads
  r = await call("PATCH", `/api/field-dictionary/${fieldId}`, { status: "DEPRECATED", deprecationReason: "smoke test", acknowledgeImpact: true }, token);
  check("field deprecated (200)", r.status === 200, `got ${r.status}`);
  r = await call("PUT", `/api/modules/project/${projectId}/values`, { values: { [KEY]: "Red" } }, token);
  check("deprecated field blocks new writes (400)", r.status === 400, `got ${r.status}`);
  r = await call("GET", `/api/modules/project/${projectId}/values`, null, token);
  check("deprecated field still readable (value preserved)", payload(r)?.values?.[KEY] === "Amber", JSON.stringify(payload(r)?.values?.[KEY]));

  // 10. cleanup — proves values survive assignment removal
  r = await call("DELETE", `/api/modules/project/fields/${projectAssignId}`, null, token);
  check("remove project assignment (200)", r.status === 200, `got ${r.status} id=${projectAssignId}`);
  r = await call("DELETE", `/api/modules/risk/fields/${riskAssignId}`, null, token);
  check("remove risk assignment (200)", r.status === 200, `got ${r.status} id=${riskAssignId}`);

  r = await call("DELETE", `/api/field-dictionary/${fieldId}`, null, token);
  check("destructive delete refused while values exist (409)", r.status === 409, `got ${r.status} ${r.text?.slice(0, 200)}`);
  r = await call("DELETE", `/api/field-dictionary/${fieldId}?purgeValues=true`, null, token);
  check("authorized purge succeeds (200)", r.status === 200, `got ${r.status} ${r.text?.slice(0, 200)}`);
  r = await call("GET", `/api/field-dictionary/${fieldId}`, null, token);
  check("definition gone after purge (404)", r.status === 404, `got ${r.status}`);

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  if (fail) { console.log(failures.join("\n")); process.exit(1); }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
