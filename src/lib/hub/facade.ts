// PM CONTROL TOWER — TowerIntegration Hub: Facade pattern.
// Vendor-specific payload shapes (Jira REST, MS Graph, Power BI, Zoho, Slack,
// CSV, generic JSON) are parsed ONLY here; everything downstream of a facade
// sees the same NormalizedEnvelope. This decouples the Hub from vendors and
// prevents lock-in: adding tool #56 means registering a facade, not touching
// the pipeline.

import type { FacadeKind, HubIngressMode } from "./registry";
import { toUtcIso } from "./uwm";

/** What every facade emits — pre-UWM, still vendor-neutral. */
export interface NormalizedEnvelope {
  toolId: string;
  mode: HubIngressMode;
  /** One envelope per logical record the payload describes. */
  records: NormalizedRecord[];
  /** Envelope-level anomalies (unparsable payload, missing batch wrapper…). */
  anomalies: string[];
}

export interface NormalizedRecord {
  sourceId: string | null;
  title: string | null;
  status: unknown;
  priority: unknown;
  assignee: unknown;
  startDate: unknown;
  dueDate: unknown;
  updatedAt: unknown;
  url: string | null;
  /** Everything not mapped above — preserved as UWM extension fields. */
  extras: Record<string, unknown>;
}

function rec(partial: Partial<NormalizedRecord>): NormalizedRecord {
  return {
    sourceId: partial.sourceId ?? null,
    title: partial.title ?? null,
    status: partial.status ?? null,
    priority: partial.priority ?? null,
    assignee: partial.assignee ?? null,
    startDate: partial.startDate ?? null,
    dueDate: partial.dueDate ?? null,
    updatedAt: partial.updatedAt ?? null,
    url: partial.url ?? null,
    extras: partial.extras ?? {},
  };
}

export interface FacadeInput {
  toolId: string;
  mode: HubIngressMode;
  /** Parsed JSON when content-type was JSON; otherwise the raw text. */
  payload: unknown;
}

export type HubFacade = (input: FacadeInput) => NormalizedEnvelope;

// ---------------------------------------------------------------------------
// Jira / Atlassian shape (Jira issues, Bitbucket issues, Confluence pages).
// ---------------------------------------------------------------------------

const jiraFacade: HubFacade = ({ toolId, mode, payload }) => {
  const anomalies: string[] = [];
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return { toolId, mode, records: [], anomalies: ["payload_not_object"] };

  // Webhook: {webhookEvent, issue:{...}}  ·  Search: {issues:[{...}]}
  const issues: unknown[] = Array.isArray((p as { issues?: unknown[] }).issues)
    ? ((p as { issues: unknown[] }).issues)
    : p.issue
      ? [p.issue]
      : Array.isArray(p)
        ? (p as unknown[])
        : [];

  if (issues.length === 0) anomalies.push("jira_no_issues_in_payload");

  const records = issues.map((raw) => {
    const issue = raw as Record<string, unknown>;
    const f = (issue.fields ?? {}) as Record<string, unknown>;
    const status = f.status as { name?: string } | undefined;
    const priority = f.priority as { name?: string } | undefined;
    const assignee = f.assignee as Record<string, unknown> | undefined;
    const reporter = f.reporter as Record<string, unknown> | undefined;
    const parent = f.parent as { key?: string } | undefined;
    const sprint = (f.customfield_10014 ?? f.sprint) as { name?: string; state?: string } | string | undefined;
    const storyPoints = (f.customfield_10016 ?? f.story_points ?? f.storyPoints) as number | undefined;
    return rec({
      sourceId: (issue.id as string) ?? (issue.key as string) ?? null,
      title: (f.summary as string) ?? (issue.title as string) ?? null,
      status: status?.name ?? issue.status ?? null,
      priority: priority?.name ?? null,
      assignee: assignee ?? null,
      startDate: f.customfield_10015 ?? f.start_date ?? null,
      dueDate: f.duedate ?? null,
      updatedAt: f.updated ?? issue.updated ?? null,
      url: issue.self as string | undefined ?? null,
      extras: {
        key: issue.key ?? null,
        issueType: (f.issuetype as { name?: string })?.name ?? null,
        projectKey: (f.project as { key?: string })?.key ?? null,
        parentKey: parent?.key ?? null,
        sprint: typeof sprint === "string" ? sprint : sprint?.name ?? null,
        sprintState: typeof sprint === "object" && sprint ? sprint.state ?? null : null,
        storyPoints: typeof storyPoints === "number" ? storyPoints : null,
        labels: f.labels ?? [],
        components: (f.components as { name?: string }[])?.map((c) => c.name) ?? [],
        reporterEmail: (reporter as { emailAddress?: string })?.emailAddress ?? null,
        resolution: (f.resolution as { name?: string })?.name ?? null,
        commentCount: (f.comment as { total?: number })?.total ?? null,
      },
    });
  });
  return { toolId, mode, records, anomalies };
};

// ---------------------------------------------------------------------------
// Microsoft Graph shape (SharePoint list items, Teams messages, Entra change
// notifications, Microsoft Project tasks).
// ---------------------------------------------------------------------------

const msGraphFacade: HubFacade = ({ toolId, mode, payload }) => {
  const anomalies: string[] = [];
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return { toolId, mode, records: [], anomalies: ["payload_not_object"] };

  // Graph change notification: {value:[{resourceId|changeType, ...}]}
  const value = Array.isArray(p.value) ? (p.value as unknown[]) : [p];
  const records = value.map((raw) => {
    const e = raw as Record<string, unknown>;
    const fields = (e.fields ?? (e.listItem as Record<string, unknown> | undefined)?.fields ?? e.item ?? {}) as Record<string, unknown>;
    // Teams message body, SharePoint column values, Project task — one accessor chain.
    const body = (e.body ?? e.bodyPreview ?? fields.Body ?? fields.Title) as { content?: string } | string | undefined;
    const title =
      (fields.Title as string) ??
      (fields.FileLeafRef as string) ??
      (e.subject as string) ??
      (typeof body === "string" ? body.slice(0, 120) : body?.content?.slice(0, 120)) ??
      (e.displayName as string) ??
      null;
    return rec({
      sourceId:
        (e.id as string) ??
        (e.resourceId as string) ??
        (e.itemId as string) ??
        (fields.GUID as string) ??
        null,
      title: title ?? null,
      status: fields.Status ?? (fields.PercentComplete != null ? fields.PercentComplete : null),
      priority: fields.Priority ?? e.importance ?? null,
      assignee: fields.AssignedTo ?? fields.Owner ?? e.from ?? e.user ?? null,
      startDate: fields.StartDate ?? e.startDateTime ?? null,
      dueDate: fields.DueDate ?? fields.TaskDueDate ?? e.endDateTime ?? null,
      updatedAt: fields.Modified ?? e.lastModifiedDateTime ?? e.createdDateTime ?? null,
      url: (e.webUrl as string) ?? (e["web-url"] as string) ?? null,
      extras: {
        resource: (e.resource as string) ?? null,
        changeType: (e.changeType as string) ?? null,
        subscriptionId: (e.subscriptionId as string) ?? null,
        siteId: (e.siteId as string) ?? null,
        listId: (e.listId as string) ?? null,
        percentComplete: fields.PercentComplete ?? null,
        conversationId: (e.conversationId as string) ?? null,
        channel: (e.channel as { displayName?: string })?.displayName ?? null,
        tenantId: (e.tenantId as string) ?? null,
        clientState: (e.clientState as string) ?? null,
      },
    });
  });
  if (records.length === 0 || records.every((r) => !r.sourceId && !r.title)) anomalies.push("graph_no_records_in_payload");
  return { toolId, mode, records, anomalies };
};

// ---------------------------------------------------------------------------
// Power BI shape — dataset refresh events, tile/dax query results.
// ---------------------------------------------------------------------------

const powerBiFacade: HubFacade = ({ toolId, mode, payload }) => {
  const anomalies: string[] = [];
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return { toolId, mode, records: [], anomalies: ["payload_not_object"] };

  // Refresh event: {refreshId, datasetId, status, startTime, endTime}
  if (p.refreshId || p.datasetId) {
    return {
      toolId, mode, anomalies,
      records: [rec({
        sourceId: (p.refreshId as string) ?? (p.datasetId as string) ?? null,
        title: `Power BI refresh ${(p.status as string) ?? ""}`.trim(),
        status: p.status === "Completed" ? "Completed" : p.status === "Failed" ? "Failed" : p.status ?? null,
        updatedAt: (p.endTime as string) ?? (p.startTime as string) ?? null,
        extras: {
          datasetId: p.datasetId ?? null,
          refreshType: p.refreshType ?? null,
          startTime: p.startTime ?? null,
          endTime: p.endTime ?? null,
          serviceExceptionJson: p.serviceExceptionJson ?? null,
          metrics: p.metrics ?? null,
        },
      })],
    };
  }
  // DAX/visual result rows: {results:[{tables:[{rows:[...]}]}]} or {rows:[...]}
  const rows: unknown[] = Array.isArray(p.rows)
    ? (p.rows as unknown[])
    : ((p.results as { tables?: { rows?: unknown[] }[] }[])?.[0]?.tables?.[0]?.rows ?? []);
  if (rows.length === 0) anomalies.push("powerbi_no_rows_in_payload");
  const records = rows.map((row, i) => {
    const r = row as Record<string, unknown>;
    return rec({
      sourceId: (r.id as string) ?? (r.Id as string) ?? `row-${i}`,
      title: (r.name as string) ?? (r.Name as string) ?? (r.title as string) ?? `Power BI metric ${i + 1}`,
      status: r.status ?? r.Status ?? null,
      priority: r.priority ?? r.Priority ?? null,
      updatedAt: r.updatedAt ?? r.Timestamp ?? null,
      extras: { ...r, datasetId: p.datasetId ?? null },
    });
  });
  return { toolId, mode, records, anomalies };
};

// ---------------------------------------------------------------------------
// Zoho shape — Zoho Projects tasks/issues ({tasks:[{...}]} or {issue:{...}}).
// ---------------------------------------------------------------------------

const zohoFacade: HubFacade = ({ toolId, mode, payload }) => {
  const anomalies: string[] = [];
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return { toolId, mode, records: [], anomalies: ["payload_not_object"] };

  const list: unknown[] = Array.isArray(p.tasks)
    ? (p.tasks as unknown[])
    : Array.isArray(p.issues)
      ? (p.issues as unknown[])
      : p.task || p.issue
        ? [p.task ?? p.issue]
        : Array.isArray(p.value)
          ? (p.value as unknown[])
          : [];
  if (list.length === 0) anomalies.push("zoho_no_records_in_payload");

  const records = list.map((raw) => {
    const e = raw as Record<string, unknown>;
    return rec({
      sourceId: e.id != null ? String(e.id) : e.task_id != null ? String(e.task_id) : e.issue_id != null ? String(e.issue_id) : null,
      title: (e.name as string) ?? (e.subject as string) ?? (e.title as string) ?? null,
      status: e.status ?? e.state ?? null,
      priority: e.priority ?? null,
      assignee: e.assignee ?? e.assigned_to ?? e.owner ?? null,
      startDate: e.start_date ?? e.start_date_time ?? null,
      dueDate: e.end_date ?? e.due_date ?? e.due_date_time ?? null,
      updatedAt: e.last_updated_time ?? e.modified_time ?? null,
      url: (e.permalink as string | undefined) ?? null,
      extras: {
        projectId: e.project_id ?? null,
        milestone: e.milestone_name ?? null,
        percentComplete: e.percent_complete ?? null,
        billingType: e.billing_type ?? null,
        logTimeInMinutes: e.log_time_in_minutes ?? null,
      },
    });
  });
  return { toolId, mode, records, anomalies };
};

// ---------------------------------------------------------------------------
// Slack shape — events API callbacks (message, app_mention, reaction…).
// ---------------------------------------------------------------------------

const slackFacade: HubFacade = ({ toolId, mode, payload }) => {
  const anomalies: string[] = [];
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return { toolId, mode, records: [], anomalies: ["payload_not_object"] };

  // URL-verification handshake — answer shape, zero records.
  if (p.type === "url_verification") return { toolId, mode, records: [], anomalies: [] };

  const events: unknown[] = Array.isArray(p.events) ? (p.events as unknown[]) : [p];
  const records = events.map((raw) => {
    const e = raw as Record<string, unknown>;
    return rec({
      sourceId: (e.client_msg_id as string) ?? (e.ts as string) ?? (e.event_ts as string) ?? null,
      title: typeof e.text === "string" ? e.text.slice(0, 200) : null,
      // Slack has no workflow status: a message is an in-flight communication.
      status: "In Progress",
      assignee: (e.user as string) ?? (e.bot_id as string) ?? null,
      updatedAt: (e.event_ts as string) ?? (e.ts as string) ?? null,
      extras: {
        channel: e.channel ?? null,
        threadTs: e.thread_ts ?? null,
        eventType: e.type ?? p.type ?? null,
        team: p.team_id ?? e.team ?? null,
        files: Array.isArray(e.files) ? (e.files as { name?: string }[]).map((f) => f.name ?? "file") : [],
      },
    });
  });
  if (records.length === 0) anomalies.push("slack_no_events_in_payload");
  return { toolId, mode, records, anomalies };
};

// ---------------------------------------------------------------------------
// CSV shape — tabular payloads (Excel/Sheets exports, direct CSV uploads).
// RFC-4180-ish parser: quoted fields, embedded commas/newlines, "" escapes.
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const CSV_HEADER_ALIASES: Record<string, keyof NormalizedRecord | "skip"> = {
  id: "sourceId", "external id": "sourceId", "key": "sourceId", "issue key": "sourceId", "task id": "sourceId",
  title: "title", name: "title", summary: "title", task: "title", subject: "title",
  status: "status", state: "status", "task status": "status",
  priority: "priority", severity: "priority",
  assignee: "assignee", owner: "assignee", "assigned to": "assignee", "assigned_to": "assignee",
  "start date": "startDate", start: "startDate", "start_date": "startDate", "begin": "startDate",
  "due date": "dueDate", deadline: "dueDate", "due_date": "dueDate", "end date": "dueDate", finish: "dueDate",
  "updated at": "updatedAt", updated: "updatedAt", "modified": "updatedAt",
  url: "url", link: "url",
};

const csvFacade: HubFacade = ({ toolId, mode, payload }) => {
  const anomalies: string[] = [];
  const text = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
  if (!text.trim()) return { toolId, mode, records: [], anomalies: ["csv_empty_payload"] };

  // JSON-wrapped CSV ({csv: "..."}) or a JSON array of row objects.
  if (typeof payload === "object" && payload !== null) {
    const p = payload as Record<string, unknown>;
    if (typeof p.csv === "string") return csvFacade({ toolId, mode, payload: p.csv });
    const arr = Array.isArray(payload) ? payload : Array.isArray(p.rows) ? (p.rows as unknown[]) : null;
    if (arr) {
      const records = arr.map((row) => {
        const r = row as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          const target = CSV_HEADER_ALIASES[k.toLowerCase().trim()] ?? "skip";
          if (target !== "skip") out[target] = v;
          else (out.extras ??= {}) && ((out.extras as Record<string, unknown>)[k] = v);
        }
        return rec({
          sourceId: out.sourceId != null ? String(out.sourceId) : null,
          title: out.title != null ? String(out.title) : null,
          status: out.status ?? null,
          priority: out.priority ?? null,
          assignee: out.assignee ?? null,
          startDate: out.startDate ?? null,
          dueDate: out.dueDate ?? null,
          updatedAt: out.updatedAt ?? null,
          url: out.url != null ? String(out.url) : null,
          extras: (out.extras as Record<string, unknown>) ?? {},
        });
      });
      if (records.length === 0) anomalies.push("csv_no_rows");
      return { toolId, mode, records, anomalies };
    }
  }

  const rows = parseCsv(text);
  if (rows.length < 2) return { toolId, mode, records: [], anomalies: ["csv_no_data_rows"] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((cells) => {
    const out: Partial<NormalizedRecord> & { extras: Record<string, unknown> } = { extras: {} };
    header.forEach((h, i) => {
      const value = cells[i]?.trim() ?? "";
      const target = CSV_HEADER_ALIASES[h] ?? "skip";
      if (target === "skip") { if (value) out.extras[rows[0][i]] = value; return; }
      if (target === "sourceId") out.sourceId = value || null;
      else if (target === "title") out.title = value || null;
      else if (target === "url") out.url = value || null;
      else (out as Record<string, unknown>)[target] = value || null;
    });
    return rec(out);
  });
  if (records.length === 0) anomalies.push("csv_no_rows");
  return { toolId, mode, records, anomalies };
};

// ---------------------------------------------------------------------------
// Generic JSON shape — anything from Asana to Airtable: common field names,
// nested {data:{...}} wrappers, and value[] batches are understood.
// ---------------------------------------------------------------------------

const GENERIC_FIELD_MAP: Record<string, keyof NormalizedRecord | "skip"> = {
  id: "sourceId", gid: "sourceId", guid: "sourceId", uuid: "sourceId", "record_id": "sourceId", sys_id: "sourceId",
  title: "title", name: "title", summary: "title", subject: "title", headline: "title",
  status: "status", state: "status", "task_status": "status", "column": "status", "stage": "status",
  priority: "priority", severity: "priority", "rank": "priority",
  assignee: "assignee", owner: "assignee", "assigned_to": "assignee", "responsible": "assignee", "user": "assignee", "assignee_id": "assignee",
  "start_date": "startDate", "start": "startDate", "begin_at": "startDate", "planned_start": "startDate",
  "due_date": "dueDate", deadline: "dueDate", "due": "dueDate", "end_date": "dueDate", "planned_end": "dueDate", "target_date": "dueDate",
  "updated_at": "updatedAt", "modified_at": "updatedAt", "last_modified": "updatedAt", "updated": "updatedAt",
  url: "url", permalink: "url", html_url: "url", web_url: "url",
};

function mapGenericObject(o: Record<string, unknown>): NormalizedRecord {
  const extras: Record<string, unknown> = {};
  const out: Partial<NormalizedRecord> & { extras: Record<string, unknown> } = { extras };
  for (const [k, v] of Object.entries(o)) {
    const target = GENERIC_FIELD_MAP[k.toLowerCase()] ?? GENERIC_FIELD_MAP[k] ?? "skip";
    if (target === "skip") { extras[k] = v; continue; }
    if (target === "sourceId") out.sourceId = v == null ? null : String(v);
    else if (target === "title") out.title = v == null ? null : String(v);
    else if (target === "url") out.url = v == null ? null : String(v);
    else (out as Record<string, unknown>)[target] = v ?? null;
  }
  // Nested common wrappers (Asana {data}, Zoho-style {task}).
  if (!out.sourceId && typeof o.data === "object" && o.data) {
    const inner = mapGenericObject(o.data as Record<string, unknown>);
    return { ...inner, extras: { ...extras, ...inner.extras } };
  }
  return rec(out);
}

const genericFacade: HubFacade = ({ toolId, mode, payload }) => {
  const anomalies: string[] = [];
  if (payload === null || payload === undefined) return { toolId, mode, records: [], anomalies: ["payload_empty"] };

  let list: unknown[];
  if (Array.isArray(payload)) list = payload;
  else if (typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    const batchKey = ["data", "items", "records", "issues", "tasks", "value", "results", "entries", "rows", "events", "activities"]
      .find((k) => Array.isArray(p[k]));
    list = batchKey ? (p[batchKey] as unknown[]) : [payload];
  } else if (typeof payload === "string") {
    // Bare JSON text that arrived as a string body.
    try { return genericFacade({ toolId, mode, payload: JSON.parse(payload) }); }
    catch { return { toolId, mode, records: [], anomalies: ["payload_not_json"] }; }
  } else return { toolId, mode, records: [], anomalies: ["payload_not_object"] };

  const records = list.map((raw) =>
    raw && typeof raw === "object" ? mapGenericObject(raw as Record<string, unknown>) : rec({}),
  );
  if (records.length === 0) anomalies.push("generic_no_records_in_payload");
  if (records.every((r) => !r.sourceId && !r.title)) anomalies.push("generic_records_missing_identity");
  return { toolId, mode, records, anomalies };
};

// ---------------------------------------------------------------------------
// Facade registry — resolve by FacadeKind (never throws; unknown → generic).
// ---------------------------------------------------------------------------

const FACADES: Record<FacadeKind, HubFacade> = {
  jira: jiraFacade,
  msGraph: msGraphFacade,
  powerBi: powerBiFacade,
  zoho: zohoFacade,
  slack: slackFacade,
  csv: csvFacade,
  generic: genericFacade,
};

export function facadeFor(kind: FacadeKind): HubFacade {
  return FACADES[kind] ?? genericFacade;
}

export const FACADE_KINDS = Object.keys(FACADES) as FacadeKind[];
