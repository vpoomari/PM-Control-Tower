"use client";
// PM CONTROL TOWER — ADMIN · Audit Trail (filterable, expandable before/after diff)

import { useCallback, useMemo, useState } from "react";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, SectionCard, StatusChip, Button, Badge, Input, LoadingBlock, ErrorBlock,
  EmptyState, SeverityDot, cn,
} from "@/components/pmct/kit";
import { fmtDateTime, fromJson } from "@/lib/constants";
import {
  ScrollText, RefreshCw, ChevronDown, ChevronRight, FilterX, Search,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface AuditEvent {
  id: string; userId: string | null; userName: string | null; role: string | null;
  action: string; entityType: string; entityId: string | null; entityName: string | null;
  beforeJson: string | null; afterJson: string | null; ipAddress: string | null;
  userAgent: string | null; context: string | null; severity: string; createdAt: string;
}

const TAKE = 25;

const SEVERITY_DOT_MAP: Record<string, string> = {
  CRITICAL: "bg-red-500", WARNING: "bg-amber-500", INFO: "bg-blue-500",
};

function JsonBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  const parsed = fromJson<unknown>(value, value);
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <pre className={cn(
        "text-[10px] leading-relaxed font-mono rounded-md p-2.5 overflow-auto max-h-44 whitespace-pre-wrap",
        label === "Before" ? "bg-red-50/60 border border-red-100 text-red-900" : "bg-emerald-50/60 border border-emerald-100 text-emerald-900",
      )}>
        {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
      </pre>
    </div>
  );
}

export default function AdminAuditView() {
  const [page, setPage] = useState(0);
  const [entityType, setEntityType] = useState("ALL");
  const [action, setAction] = useState("ALL");
  const [severity, setSeverity] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [freeText, setFreeText] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("take", String(TAKE));
    p.set("skip", String(page * TAKE));
    if (entityType !== "ALL") p.set("entityType", entityType);
    if (action !== "ALL") p.set("action", action);
    if (severity !== "ALL") p.set("severity", severity);
    if (freeText.trim()) p.set("q", freeText.trim());
    if (fromDate) p.set("from", new Date(`${fromDate}T00:00:00`).toISOString());
    if (toDate) p.set("to", new Date(`${toDate}T23:59:59`).toISOString());
    return `/api/audit?${p.toString()}`;
  }, [page, entityType, action, severity, fromDate, toDate, freeText]);

  const list = useApi<{ events: AuditEvent[]; count: number }>(query);
  useRealtimeRefetch(list.refetch, ["audit:created"]);

  // Derive filter options from the loaded window (bounded, honest — no fabricated lists)
  const entityTypes = useMemo(() => Array.from(new Set((list.data?.events ?? []).map((e) => e.entityType))).sort(), [list.data]);
  const actions = useMemo(() => Array.from(new Set((list.data?.events ?? []).map((e) => e.action))).sort(), [list.data]);

  const resetFilters = useCallback(() => {
    setEntityType("ALL"); setAction("ALL"); setSeverity("ALL");
    setFromDate(""); setToDate(""); setFreeText("");
    setPage(0);
    setExpanded(null);
  }, []);

  const events = list.data?.events ?? [];
  // The API returns only the fetched window (count = page size, not a global total) —
  // a full page means more rows may exist, so "Next" stays available. Honest, no fabricated totals.
  const hasNext = events.length === TAKE;
  const filtersActive = entityType !== "ALL" || action !== "ALL" || severity !== "ALL" || Boolean(freeText) || fromDate || toDate;

  return (
    <div className="space-y-5">
      <PageHeader
        io="audit-events"
        title="Audit Trail"
        breadcrumb={["Administration", "Audit"]}
        subtitle="Immutable record of every privileged action — who, what, when, from where, and the exact before/after values. Read-only by design."
        actions={<Button variant="outline" size="sm" onClick={list.refetch}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>}
      />

      <SectionCard title="Filters" description="Server-side filtering — results are exact, not client-trimmed">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={freeText} onChange={(e) => { setFreeText(e.target.value); setPage(0); }} placeholder="Search user, entity, action…" className="pl-8 h-9 w-56 bg-white" />
          </div>
          <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-40 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All entity types</SelectItem>
              {entityTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-40 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All actions</SelectItem>
              {actions.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-32 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["ALL", "INFO", "WARNING", "CRITICAL"].map((s) => <SelectItem key={s} value={s}>{s === "ALL" ? "All severities" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0); }} className="h-9 w-36 bg-white" aria-label="From date" />
            <span className="text-xs text-slate-400">→</span>
            <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0); }} className="h-9 w-36 bg-white" aria-label="To date" />
          </div>
          {filtersActive && (
            <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={resetFilters}><FilterX className="h-3.5 w-3.5 mr-1" /> Clear</Button>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Audit events"
        description={`${events.length} events on page ${page + 1}${hasNext ? " · more available" : ""}`}
      >
        {list.loading && !list.data ? <LoadingBlock label="Querying audit ledger…" />
          : list.error ? <ErrorBlock message={list.error} onRetry={list.refetch} />
          : events.length === 0 ? <EmptyState title="No audit events match" description="Widen the filters or clear them to see the full trail." />
          : (
          <div className="space-y-2">
            {events.map((ev) => {
              const open = expanded === ev.id;
              const hasDiff = ev.beforeJson || ev.afterJson;
              return (
                <div key={ev.id} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <button
                    className={cn("w-full text-left px-3.5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 transition-colors", open ? "bg-slate-50" : "hover:bg-slate-50/60", hasDiff && "cursor-pointer")}
                    onClick={() => hasDiff && setExpanded(open ? null : ev.id)}
                    aria-expanded={open}
                  >
                    {hasDiff && (open
                      ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />)}
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className={cn("h-2 w-2 rounded-full", SEVERITY_DOT_MAP[ev.severity] || "bg-slate-300")} />
                      <span className="text-[11px] tabular-nums text-slate-500 w-32">{fmtDateTime(ev.createdAt)}</span>
                    </span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-normal shrink-0">{ev.action.replace(/_/g, " ")}</Badge>
                    <span className="text-xs text-slate-600 min-w-0">
                      <span className="font-medium text-slate-700">{ev.userName ?? "system"}</span>
                      {ev.role && <span className="text-slate-400"> · {ev.role}</span>}
                    </span>
                    <span className="text-xs text-slate-500 min-w-0 truncate">
                      {ev.entityType}{ev.entityName ? ` — ${ev.entityName}` : ev.entityId ? ` — ${ev.entityId.slice(0, 10)}…` : ""}
                    </span>
                    <span className="ml-auto flex items-center gap-3 shrink-0">
                      <StatusChip status={ev.severity} />
                      <span className="text-[11px] text-slate-400 tabular-nums hidden md:inline">{ev.ipAddress ?? ""}</span>
                    </span>
                  </button>
                  {open && hasDiff && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 grid gap-3 md:grid-cols-2 bg-slate-50/40">
                      <JsonBlock label="Before" value={ev.beforeJson} />
                      <JsonBlock label="After" value={ev.afterJson} />
                      {!ev.beforeJson && <p className="text-xs text-slate-400 self-center">No before state recorded (creation event).</p>}
                      {!ev.afterJson && <p className="text-xs text-slate-400 self-center">No after state recorded (deletion event).</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {events.length > 0 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Page {page + 1} · rows {page * TAKE + 1}–{page * TAKE + events.length}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={page === 0 || list.loading} onClick={() => { setPage((p) => Math.max(0, p - 1)); setExpanded(null); }}>← Previous</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!hasNext || list.loading} onClick={() => { setPage((p) => p + 1); setExpanded(null); }}>Next →</Button>
            </div>
          </div>
        )}
      </SectionCard>

      <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1">
        <ScrollText className="h-3.5 w-3.5" />
        Severity: <SeverityDot severity="CRITICAL" /> critical — privileged changes · <SeverityDot severity="WARNING" /> warning — configuration & access · <SeverityDot severity="INFO" /> info — routine activity
      </div>
    </div>
  );
}
