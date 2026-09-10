"use client";
// PM CONTROL TOWER — Timesheets (core execute module)
// Role-aware: "My timesheet" editor for users with a resource record, approval queue for
// timesheet.approve holders, plus a full status-filtered register. Week starts Monday.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { addDays, fmtDateTime, num, round2, startOfWeek } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatusChip, Toolbar, LoadingBlock, ErrorBlock, EmptyState,
  ConfirmButton, Button, Badge, Input, Metric,
} from "@/components/pmct/kit";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DAY_HEADERS, ProjectSelect, TaskSelect, WeekNav, hasPerm, useMe, useProjectOptions, weekLabel,
} from "@/views/execute/shared/pickers";
import { Trash2, Plus, Send, Save, Lock, ClipboardCheck, CalendarDays } from "lucide-react";

// ---- Types (mirror API payloads) ----
interface TSResourceLite { id: string; name: string; employeeCode: string; department: string }
interface TSListItem {
  id: string; resourceId: string; resource: TSResourceLite; userId: string | null;
  weekStart: string; weekEnd: string; status: string;
  totalHours: number; regularHours: number; overtimeHours: number;
  billableHours: number; nonBillableHours: number;
  comments: string | null; rejectionReason: string | null;
  submittedAt: string | null; approvedAt: string | null; lockedAt: string | null;
  approverName: string | null; entriesCount: number; isOwn: boolean; canEdit: boolean;
}
interface TSListData { scope: string; timesheets: TSListItem[]; total: number; statusCounts: Record<string, number> }
interface TSEntry {
  id: string; entryDate: string; projectId: string | null; taskId: string | null;
  activity: string | null; startTime: string | null; endTime: string | null; breakMinutes: number;
  hours: number; regularHours: number; overtimeHours: number; billableHours: number; nonBillableHours: number;
  entryType: string; billable: boolean; comments: string | null;
}
interface TSDetail { timesheet: TSListItem & { entries: TSEntry[] } }
interface ResLite { id: string; name: string; email: string; userId: string | null }

const EDITABLE = ["DRAFT", "REJECTED"];
const STATUS_TABS = ["ALL", "DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "LOCKED"] as const;

interface EditorRow {
  key: string; date: string; projectId: string; taskId: string; activity: string;
  startTime: string; endTime: string; breakMinutes: number; hours: number;
  overtime: number; billable: boolean; comment: string;
}

let rowSeq = 0;
// New rows default to 0 hours so an untouched row never blocks save — buildEntries()
// filters empty rows out and validation only inspects rows with hours/project/activity.
function newRow(date: string): EditorRow {
  rowSeq += 1;
  return { key: `r${Date.now()}-${rowSeq}`, date, projectId: "", taskId: "", activity: "", startTime: "", endTime: "", breakMinutes: 0, hours: 0, overtime: 0, billable: true, comment: "" };
}

function calcHours(start: string, end: string, breakMinutes: number): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  const mins = eh * 60 + em - (sh * 60 + sm) - (breakMinutes || 0);
  return mins > 0 ? round2(mins / 60) : null;
}

function dayIso(weekStart: Date, index: number): string {
  return addDays(weekStart, index).toISOString().slice(0, 10);
}

export default function TimesheetsView() {
  const me = useMe();
  const canApprove = hasPerm(me, "timesheet.approve");
  const canOwn = hasPerm(me, "timesheet.own");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const weekKey = weekStart.toISOString().slice(0, 10);

  const { options: projectOptions } = useProjectOptions();

  // My resource record (determines whether the personal editor is shown)
  const [myResource, setMyResource] = useState<ResLite | null>(null);
  const [resourceChecked, setResourceChecked] = useState(false);
  useEffect(() => {
    if (!me) return;
    let alive = true;
    api.get<{ resources: ResLite[] }>("/api/resources")
      .then((d) => {
        if (!alive) return;
        const mine = d.resources.find((r) => r.userId === me.id) || d.resources.find((r) => r.email === me.email) || null;
        setMyResource(mine ? { id: mine.id, name: mine.name, email: mine.email, userId: mine.userId } : null);
      })
      .catch(() => { /* no access — editor stays hidden */ })
      .finally(() => { if (alive) setResourceChecked(true); });
    return () => { alive = false; };
  }, [me]);

  // ---- Listing (scope: all for approvers, mine for filers; none without either) ----
  const scope = canApprove ? "all" : canOwn ? "mine" : null;
  const list = useApi<TSListData>(scope ? `/api/timesheets?scope=${scope}` : null);
  useRealtimeRefetch(list.refetch, ["timesheet:submitted", "timesheet:approved", "actuals:changed"]);

  const [statusTab, setStatusTab] = useState<(typeof STATUS_TABS)[number]>("ALL");
  const registerRows = useMemo(() => {
    const rows = list.data?.timesheets ?? [];
    return statusTab === "ALL" ? rows : rows.filter((t) => t.status === statusTab);
  }, [list.data, statusTab]);

  // ---- My timesheet for the selected week ----
  const mineForWeek = useMemo(() => {
    if (!myResource) return null;
    return (list.data?.timesheets ?? []).find((t) => t.resourceId === myResource.id && t.weekStart.slice(0, 10) === weekKey) ?? null;
  }, [list.data, myResource, weekKey]);

  const mineDetail = useApi<TSDetail>(mineForWeek ? `/api/timesheets/${mineForWeek.id}` : null);
  const editable = Boolean(mineForWeek && EDITABLE.includes(mineForWeek.status));

  // ---- Editor state ----
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [weekComments, setWeekComments] = useState("");
  const [loadedTsId, setLoadedTsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ts = mineDetail.data?.timesheet;
    if (!ts || !editable) return;
    if (loadedTsId === ts.id) return;
    setRows(ts.entries.map((e) => {
      rowSeq += 1;
      return {
        key: `e${e.id}-${rowSeq}`, date: e.entryDate.slice(0, 10), projectId: e.projectId ?? "",
        taskId: e.taskId ?? "", activity: e.activity ?? "", startTime: e.startTime ?? "", endTime: e.endTime ?? "",
        breakMinutes: e.breakMinutes ?? 0, hours: e.hours ?? 0, overtime: e.overtimeHours ?? 0,
        billable: e.billable, comment: e.comments ?? "",
      };
    }));
    setWeekComments(ts.comments ?? "");
    setLoadedTsId(ts.id);
  }, [mineDetail.data, editable, loadedTsId]);

  // Fresh editor when there is no existing timesheet for the week
  useEffect(() => {
    if (mineForWeek === null && myResource) {
      setRows([newRow(dayIso(weekStart, 0))]);
      setWeekComments("");
      setLoadedTsId(null);
    }
  }, [mineForWeek, myResource, weekStart]);

  // ---- "Add new time entry" intent (quick-create menu / command palette) ----
  // If the displayed week is locked (submitted/approved/locked) the editor is read-only,
  // so we jump to the nearest week that is open (no timesheet yet, or DRAFT/REJECTED),
  // then scroll the editor into view. Triggered by #/timesheets?new=1 or the
  // pmct:timesheet-new event so it also works when already on this page.
  const startNewEntry = useCallback(() => {
    const mine = (list.data?.timesheets ?? []).filter((t) => t.isOwn);
    const statusFor = (d: Date) => {
      const iso = d.toISOString().slice(0, 10);
      return mine.find((t) => t.weekStart.slice(0, 10) === iso)?.status ?? null;
    };
    let target: Date | null = null;
    // Without list data (e.g. load error) prefer next week — the usual reason someone
    // invokes "new entry" is that the current week is already filed/approved.
    const offsets = mine.length ? [0, 7, -7, 14, -14, 21, -21, 28, -28] : [7, 14, 0, -7, -14];
    for (const off of offsets) {
      const st = statusFor(addDays(weekStart, off));
      if (!st || EDITABLE.includes(st)) { target = addDays(weekStart, off); break; }
    }
    const next = target ?? addDays(weekStart, 7);
    setWeekStart(next);
    setLoadedTsId(null);
    toast.success(`Week of ${next.toISOString().slice(0, 10)} opened — add your entries`);
    setTimeout(() => document.getElementById("my-timesheet-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [list.data, weekStart]);

  // Intent is deferred until the timesheet list has loaded — otherwise statusFor()
  // sees no data and would wrongly keep the (often locked) current week.
  const [pendingNew, setPendingNew] = useState(false);

  useEffect(() => {
    const raw = window.location.hash || "";
    if (/[?&]new=1/.test(raw)) {
      history.replaceState(null, "", `${location.pathname}${location.search}#/timesheets`);
      setPendingNew(true);
    }
    const onNew = () => setPendingNew(true);
    window.addEventListener("pmct:timesheet-new", onNew);
    return () => window.removeEventListener("pmct:timesheet-new", onNew);
  }, []);

  useEffect(() => {
    if (!pendingNew) return;
    // Wait until the list query has actually resolved: the list path itself is null
    // while `me` (permissions) is still loading, so loading=false + data=null here
    // means "not ready", not "empty".
    if (list.loading) return;
    if (!list.data && !list.error) return;
    setPendingNew(false);
    startNewEntry();
  }, [pendingNew, list.loading, list.data, list.error, startNewEntry]);

  const updateRow = (key: string, patch: Partial<EditorRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const onTimeField = (row: EditorRow, patch: Partial<EditorRow>) => {
    const next = { ...row, ...patch };
    const auto = calcHours(next.startTime, next.endTime, next.breakMinutes);
    if (auto !== null) next.hours = auto;
    updateRow(row.key, next);
  };

  const totals = useMemo(() => {
    const valid = rows.filter((r) => r.hours > 0);
    const total = round2(valid.reduce((s, r) => s + r.hours, 0));
    const overtime = round2(valid.reduce((s, r) => s + (r.overtime || 0), 0));
    const billable = round2(valid.filter((r) => r.billable).reduce((s, r) => s + r.hours, 0));
    return { total, regular: round2(Math.max(0, total - overtime)), overtime, billable, nonBillable: round2(total - billable), count: valid.length };
  }, [rows]);

  const buildEntries = useCallback(() => {
    return rows
      .filter((r) => r.hours > 0 || r.projectId || r.activity)
      .map((r) => ({
        entryDate: r.date,
        projectId: r.projectId || null,
        taskId: r.taskId || null,
        activity: r.activity || null,
        startTime: r.startTime || null,
        endTime: r.endTime || null,
        breakMinutes: r.breakMinutes || 0,
        hours: r.hours || 0,
        overtimeHours: r.overtime || 0,
        billable: r.billable,
        comments: r.comment || null,
      }));
  }, [rows]);

  const validate = (): string | null => {
    const entries = buildEntries();
    if (!entries.length) return "Add at least one entry with hours before saving.";
    const withHours = entries.filter((e) => e.hours > 0);
    if (!withHours.length) return "Entries need hours greater than zero.";
    if (withHours.some((e) => !e.projectId)) return "Every entry with hours must reference a project.";
    for (const e of withHours) {
      if (e.overtimeHours && e.overtimeHours > (e.hours ?? 0)) return "Overtime cannot exceed the entry hours.";
      if ((e.startTime && !e.endTime) || (!e.startTime && e.endTime)) return "Entries with times need both start and end (or clear both).";
    }
    return null;
  };

  const saveDraft = async (thenSubmit = false): Promise<string | null> => {
    const err = validate();
    if (err) { toast.error(err); return null; }
    if (!myResource) return null;
    setSaving(true);
    try {
      const body = { resourceId: myResource.id, weekStart: weekStart.toISOString(), comments: weekComments || null, entries: buildEntries() };
      let tsId = loadedTsId;
      if (mineForWeek && EDITABLE.includes(mineForWeek.status)) tsId = mineForWeek.id;
      if (tsId) {
        await api.patch(`/api/timesheets/${tsId}`, { comments: weekComments || null, entries: buildEntries() });
      } else {
        const d = await api.post<{ timesheet: { id: string } }>("/api/timesheets", body);
        tsId = d.timesheet.id;
      }
      toast.success(thenSubmit ? "Saved — submitting…" : "Draft saved");
      if (thenSubmit && tsId) {
        await api.post(`/api/timesheets/${tsId}/submit`);
        toast.success("Timesheet submitted for approval");
      }
      setLoadedTsId(tsId);
      await list.refetch();
      if (tsId) await mineDetail.refetch();
      return tsId;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteDraft = async () => {
    if (!mineForWeek) return;
    try {
      await api.del(`/api/timesheets/${mineForWeek.id}`);
      toast.success("Draft deleted");
      setRows([newRow(dayIso(weekStart, 0))]);
      setLoadedTsId(null);
      await list.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  // ---- Approvals ----
  const [approvalView, setApprovalView] = useState<"PENDING" | "APPROVED">("PENDING");
  const pending = useMemo(() => (list.data?.timesheets ?? []).filter((t) => ["SUBMITTED", "UNDER_REVIEW"].includes(t.status)), [list.data]);
  const approved = useMemo(() => (list.data?.timesheets ?? []).filter((t) => t.status === "APPROVED"), [list.data]);
  const [rejectTarget, setRejectTarget] = useState<TSListItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useApi<TSDetail>(detailId ? `/api/timesheets/${detailId}` : null);
  const detailTs = detail.data?.timesheet ?? null;

  // Task-name map for read-only tables (entries carry ids only)
  const [taskLabels, setTaskLabels] = useState<Record<string, string>>({});
  const [projectLabels, setProjectLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    projectOptions.forEach((p) => { map[p.id] = p.code; });
    setProjectLabels(map);
  }, [projectOptions]);

  const loadTaskLabels = useCallback(async (entries: TSEntry[]) => {
    const projectIds = [...new Set(entries.map((e) => e.projectId).filter((p): p is string => Boolean(p)))];
    const taskIds = [...new Set(entries.map((e) => e.taskId).filter((t): t is string => Boolean(t)))];
    if (!taskIds.length) return;
    for (const pid of projectIds) {
      try {
        const d = await api.get<{ items: { id: string; code: string; name: string }[] }>(`/api/projects/${pid}/tasks`);
        setTaskLabels((prev) => {
          const next = { ...prev };
          d.items.forEach((t) => { next[t.id] = t.code; });
          return next;
        });
      } catch { /* label lookup best-effort */ }
    }
  }, []);

  useEffect(() => {
    const ts = detail.data?.timesheet;
    if (ts) void loadTaskLabels(ts.entries);
  }, [detail.data, loadTaskLabels]);

  useEffect(() => {
    const ts = mineDetail.data?.timesheet;
    if (ts) void loadTaskLabels(ts.entries);
  }, [mineDetail.data, loadTaskLabels]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      toast.success(okMsg);
      await list.refetch();
      if (detailId) await detail.refetch();
      if (mineForWeek) await mineDetail.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const counts = list.data?.statusCounts ?? {};

  if (!me || (list.loading && !list.data)) return <LoadingBlock label="Loading timesheets…" />;
  if (list.error && !list.data) return <ErrorBlock message={list.error} onRetry={list.refetch} />;

  const showMine = canOwn && Boolean(myResource) && resourceChecked;
  const ts = mineDetail.data?.timesheet ?? null;
  const locked = Boolean(mineForWeek && ["APPROVED", "LOCKED", "SUBMITTED", "UNDER_REVIEW"].includes(mineForWeek.status));

  return (
    <div className="space-y-5">
      <PageHeader
        io="timesheets"
        title="Timesheets"
        subtitle="Capture effort, submit for approval and govern the actuals that feed cost, EVM and health."
        breadcrumb={["Home", "Execute", "Timesheets"]}
        actions={<WeekNav weekStart={weekStart} onChange={(d) => { setWeekStart(d); setLoadedTsId(null); }} />}
      />

      {/* MY TIMESHEET */}
      {showMine && (
        <div id="my-timesheet-editor" className="scroll-mt-20">
        <SectionCard
          title="My timesheet"
          description={`Filing as ${myResource?.name} · week of ${weekKey}`}
          actions={
            mineForWeek ? (
              <div className="flex items-center gap-2">
                <StatusChip status={mineForWeek.status} />
                <Badge variant="outline" className="border-slate-200 text-slate-500">{num(mineForWeek.totalHours)}h</Badge>
              </div>
            ) : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">No timesheet yet — create one</Badge>
          }
        >
          {mineDetail.loading && !mineDetail.data ? <LoadingBlock label="Loading your week…" /> : (
            <>
              {mineForWeek?.status === "REJECTED" && mineForWeek.rejectionReason && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span className="font-semibold">Rejected by {mineForWeek.approverName || "approver"}:</span> {mineForWeek.rejectionReason} — update your entries and resubmit.
                </div>
              )}
              {locked && ts ? (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>
                      This week is <span className="font-semibold">{(mineForWeek?.status ?? "locked").toLowerCase()}</span> — entries are read-only. To add new time entries, switch to an open week.
                    </span>
                    <Button variant="outline" size="sm" className="ml-auto h-7 shrink-0 text-xs" onClick={startNewEntry}>
                      <Plus className="h-3 w-3 mr-1" />Add entries in an open week
                    </Button>
                  </div>
                  <ReadOnlyWeek ts={ts} projectLabels={projectLabels} taskLabels={taskLabels} />
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    {DAY_HEADERS.map((label, idx) => {
                      const iso = dayIso(weekStart, idx);
                      const dayRows = rows.filter((r) => r.date === iso);
                      const dayTotal = round2(dayRows.reduce((s, r) => s + (r.hours || 0), 0));
                      return (
                        <div key={iso} className="rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between px-3 py-2 bg-slate-50/70 border-b border-slate-100 rounded-t-lg">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-xs font-semibold text-slate-700">{label} <span className="text-slate-400 font-normal">{iso.slice(5)}</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs tabular-nums ${dayTotal > 24 ? "text-red-600 font-semibold" : "text-slate-500"}`}>{num(dayTotal)}h</span>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600" onClick={() => setRows((p) => [...p, newRow(iso)])}>
                                <Plus className="h-3 w-3 mr-1" />Entry
                              </Button>
                            </div>
                          </div>
                          {dayRows.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-400">No entries</p>
                          ) : (
                            <div className="p-3 space-y-2">
                              {dayRows.map((r) => (
                                <div key={r.key} className="rounded-md border border-slate-200 bg-white p-2.5 space-y-2">
                                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                                    <ProjectSelect value={r.projectId} onChange={(v) => updateRow(r.key, { projectId: v, taskId: "" })} options={projectOptions} />
                                    <TaskSelect projectId={r.projectId} value={r.taskId} onChange={(v) => updateRow(r.key, { taskId: v })} />
                                    <Input value={r.activity} onChange={(e) => updateRow(r.key, { activity: e.target.value })} placeholder="Activity" className="h-9" />
                                    <div className="flex items-center justify-end">
                                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-600" onClick={() => setRows((p) => p.filter((x) => x.key !== r.key))} aria-label="Remove entry">
                                        <Trash2 className="h-3.5 w-3.5 mr-1" />Remove
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 md:grid-cols-6 xl:grid-cols-7 gap-2 items-center">
                                    <div>
                                      <label className="text-[10px] uppercase text-slate-400">Start</label>
                                      <Input type="time" aria-label="Start time" value={r.startTime} onChange={(e) => onTimeField(r, { startTime: e.target.value })} className="h-8" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] uppercase text-slate-400">End</label>
                                      <Input type="time" aria-label="End time" value={r.endTime} onChange={(e) => onTimeField(r, { endTime: e.target.value })} className="h-8" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] uppercase text-slate-400">Break (m)</label>
                                      <Input type="number" aria-label="Break minutes" min={0} value={r.breakMinutes || ""} onChange={(e) => onTimeField(r, { breakMinutes: Number(e.target.value) || 0 })} className="h-8" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] uppercase text-slate-400">Hours {calcHours(r.startTime, r.endTime, r.breakMinutes) !== null && <span className="text-blue-500 normal-case">(auto)</span>}</label>
                                      <Input type="number" aria-label="Entry hours" min={0} max={24} step={0.25} value={r.hours || ""} onChange={(e) => updateRow(r.key, { hours: Number(e.target.value) || 0 })} className="h-8" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] uppercase text-slate-400">Overtime</label>
                                      <Input type="number" aria-label="Overtime hours" min={0} max={24} step={0.25} value={r.overtime || ""} onChange={(e) => updateRow(r.key, { overtime: Number(e.target.value) || 0 })} className="h-8" />
                                    </div>
                                    <div className="flex items-center gap-1.5 pt-4">
                                      <Checkbox checked={r.billable} onCheckedChange={(c) => updateRow(r.key, { billable: c === true })} id={`b-${r.key}`} />
                                      <label htmlFor={`b-${r.key}`} className="text-xs text-slate-600">Billable</label>
                                    </div>
                                    <div className="col-span-3 md:col-span-6 xl:col-span-1">
                                      <label className="text-[10px] uppercase text-slate-400">Comment</label>
                                      <Input value={r.comment} onChange={(e) => updateRow(r.key, { comment: e.target.value })} placeholder="Note" className="h-8" />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals footer */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <Metric label="Total" value={`${num(totals.total)}h`} />
                    <Metric label="Regular" value={`${num(totals.regular)}h`} />
                    <Metric label="Overtime" value={`${num(totals.overtime)}h`} tone={totals.overtime > 0 ? "text-amber-600" : "text-slate-800"} />
                    <Metric label="Billable" value={`${num(totals.billable)}h`} tone="text-emerald-600" />
                    <Metric label="Non-billable" value={`${num(totals.nonBillable)}h`} />
                    <Metric label="Entries" value={totals.count} />
                    <div className="flex-1 min-w-56">
                      <Input value={weekComments} onChange={(e) => setWeekComments(e.target.value)} placeholder="Week comments (optional)" className="h-9 bg-white" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={saving} onClick={() => void saveDraft(false)}>
                        <Save className="h-3.5 w-3.5 mr-1.5" />Save as draft
                      </Button>
                      <Button size="sm" disabled={saving} onClick={() => void saveDraft(true)}>
                        <Send className="h-3.5 w-3.5 mr-1.5" />Submit for approval
                      </Button>
                      {mineForWeek?.status === "DRAFT" && (
                        <ConfirmButton onConfirm={() => void deleteDraft()} variant="destructive" title="Delete draft timesheet?" description="Entries for this week will be permanently removed.">
                          Delete draft
                        </ConfirmButton>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </SectionCard>
        </div>
      )}

      {/* NO RESOURCE PROFILE — honest fallback instead of silently hidden editor */}
      {canOwn && resourceChecked && !myResource && (
        <SectionCard title="My timesheet" description="Personal time capture">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <p className="font-semibold text-amber-800">Time capture isn&apos;t available for your account yet.</p>
            <p className="mt-1 text-amber-700">
              Timesheet entry requires a resource profile linked to your login, and none was found
              (&ldquo;New Timesheet Entry&rdquo; in the ⌘K quick-create menu opens this page). Ask a PMO
              administrator to add you via <button className="underline font-medium hover:text-amber-900" onClick={() => { window.location.hash = "/resources"; }}>Resources → Add resource</button> —
              the profile will link to your account automatically by email.
            </p>
          </div>
        </SectionCard>
      )}

      {/* ROLE WITHOUT TIMESHEET ACCESS — executives, finance, auditors */}
      {!canApprove && !canOwn && (
        <SectionCard title="My timesheet" description="Role access">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">Timesheets aren&apos;t part of your role.</p>
            <p className="mt-1">
              Your current role doesn&apos;t include time capture or approval permissions, so the personal
              editor and the register are hidden. If you believe this is wrong, ask a PMO administrator to
              grant <code className="rounded bg-white px-1 py-0.5 text-xs border border-slate-200">timesheet.own</code> or{" "}
              <code className="rounded bg-white px-1 py-0.5 text-xs border border-slate-200">timesheet.approve</code> via Roles &amp; Permissions.
            </p>
          </div>
        </SectionCard>
      )}

      {/* APPROVALS */}
      {canApprove && (
        <SectionCard
          title="Approvals"
          description="Review submitted effort — approvals cascade into actual cost, EVM and health."
          actions={
            <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-white">
              {(["PENDING", "APPROVED"] as const).map((v) => (
                <button key={v} onClick={() => setApprovalView(v)}
                  className={`px-2.5 py-1 text-xs font-medium rounded ${approvalView === v ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-700"}`}>
                  {v === "PENDING" ? `Pending (${pending.length})` : `Approved (${approved.length})`}
                </button>
              ))}
            </div>
          }
        >
          {approvalView === "PENDING" ? (
            pending.length === 0 ? <EmptyState title="Approval queue is clear" description="Submitted timesheets land here for review." /> : (
              <div className="space-y-2">
                {pending.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                    <div className="min-w-44 flex-1">
                      <p className="text-sm font-medium text-slate-800">{t.resource.name} <span className="text-xs text-slate-400">{t.resource.employeeCode} · {t.resource.department}</span></p>
                      <p className="text-xs text-slate-500">Week of {t.weekStart.slice(0, 10)} · submitted {t.submittedAt ? fmtDateTime(t.submittedAt) : "—"}</p>
                    </div>
                    <StatusChip status={t.status} />
                    <div className="flex items-center gap-4 text-xs text-slate-600 tabular-nums">
                      <span>{num(t.totalHours)}h total</span>
                      <span>{num(t.billableHours)}h billable</span>
                      <span>{t.entriesCount} entries</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDetailId(t.id)}>Review</Button>
                      <ConfirmButton onConfirm={() => void act(() => api.post(`/api/timesheets/${t.id}/approve`), `Approved ${t.resource.name}'s week`)} title="Approve timesheet?" description={`${t.resource.name} · week of ${t.weekStart.slice(0, 10)} · ${num(t.totalHours)}h. Actuals cascade into project cost and EVM.`}>
                        Approve
                      </ConfirmButton>
                      <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setRejectTarget(t); setRejectReason(""); }}>
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : approved.length === 0 ? <EmptyState title="Nothing awaiting lock" description="Approved timesheets can be locked to freeze the period." /> : (
            <div className="space-y-2">
              {approved.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="min-w-44 flex-1">
                    <p className="text-sm font-medium text-slate-800">{t.resource.name}</p>
                    <p className="text-xs text-slate-500">Week of {t.weekStart.slice(0, 10)} · approved {t.approvedAt ? fmtDateTime(t.approvedAt) : "—"}{t.approverName ? ` by ${t.approverName}` : ""}</p>
                  </div>
                  <StatusChip status={t.status} />
                  <span className="text-xs text-slate-600 tabular-nums">{num(t.totalHours)}h · {t.entriesCount} entries</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDetailId(t.id)}>Review</Button>
                    <ConfirmButton onConfirm={() => void act(() => api.post(`/api/timesheets/${t.id}/lock`), "Timesheet locked — period frozen")}
                      title="Lock timesheet?" description="Locked periods are immutable and cannot be edited or re-approved." variant="outline">
                      <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />Lock</span>
                    </ConfirmButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* REGISTER */}
      {(canApprove || canOwn) && (
      <SectionCard title="Timesheet register" description={`${list.data?.total ?? 0} timesheets in your visibility scope`}>
        <Toolbar className="mb-3">
          {STATUS_TABS.map((s) => (
            <button key={s}
              onClick={() => setStatusTab(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${statusTab === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"}`}>
              {s === "ALL" ? "All" : s.replace("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
              {s !== "ALL" && counts[s] !== undefined && <span className="ml-1 opacity-70 tabular-nums">{counts[s]}</span>}
            </button>
          ))}
        </Toolbar>
        {registerRows.length === 0 ? <EmptyState title="No timesheets match" description="Adjust the status filter or pick another week." /> : (
          <div className="rounded-lg border border-slate-200 overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1]">
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Resource", "Week", "Status", "Total", "Regular", "Overtime", "Billable", "Entries", "Approver", ""].map((h) => (
                    <th key={h} className="text-left font-medium text-slate-500 px-3 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registerRows.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40 cursor-pointer" onClick={() => setDetailId(t.id)}>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-slate-800">{t.resource.name}</span>
                      <span className="block text-xs text-slate-400">{t.resource.employeeCode}{t.isOwn ? " · you" : ""}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 tabular-nums whitespace-nowrap">{t.weekStart.slice(0, 10)}</td>
                    <td className="px-3 py-2.5"><StatusChip status={t.status} /></td>
                    <td className="px-3 py-2.5 tabular-nums font-medium">{num(t.totalHours)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">{num(t.regularHours)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">{num(t.overtimeHours)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">{num(t.billableHours)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">{t.entriesCount}</td>
                    <td className="px-3 py-2.5 text-slate-500">{t.approverName || "—"}</td>
                    <td className="px-3 py-2.5 text-right"><ClipboardCheck className="h-4 w-4 text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      )}

      {/* Reject dialog */}
      <Dialog open={Boolean(rejectTarget)} onOpenChange={(o) => { if (!o) setRejectTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject timesheet</DialogTitle>
            <DialogDescription>
              {rejectTarget ? `${rejectTarget.resource.name} · week of ${rejectTarget.weekStart.slice(0, 10)} · ${num(rejectTarget.totalHours)}h. The resource will be able to edit and resubmit.` : ""}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (required, shared with the resource)" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={rejectReason.trim().length < 3} onClick={() => {
              const t = rejectTarget;
              setRejectTarget(null);
              if (t) void act(() => api.post(`/api/timesheets/${t.id}/reject`, { reason: rejectReason.trim() }), "Timesheet rejected");
            }}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      <Sheet open={Boolean(detailId)} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Timesheet detail</SheetTitle>
            <SheetDescription>Full week breakdown with entries and workflow state.</SheetDescription>
          </SheetHeader>
          {detail.loading && !detailTs ? <LoadingBlock /> : detail.error ? <ErrorBlock message={detail.error} onRetry={detail.refetch} /> : detailTs ? (
            <div className="px-4 pb-6 space-y-4">
              <ReadOnlyWeek ts={detailTs} projectLabels={projectLabels} taskLabels={taskLabels} actions={canApprove && (
                <div className="flex gap-2 mt-3">
                  {["SUBMITTED", "UNDER_REVIEW"].includes(detailTs.status) && (
                    <>
                      <ConfirmButton onConfirm={() => void act(() => api.post(`/api/timesheets/${detailTs.id}/approve`), "Approved")} title="Approve timesheet?">Approve</ConfirmButton>
                      <Button variant="outline" size="sm" className="text-red-600 border-red-200" onClick={() => { setRejectTarget(detailTs); }}>Reject</Button>
                    </>
                  )}
                  {detailTs.status === "APPROVED" && (
                    <ConfirmButton onConfirm={() => void act(() => api.post(`/api/timesheets/${detailTs.id}/lock`), "Locked")} title="Lock timesheet?" variant="outline">Lock</ConfirmButton>
                  )}
                </div>
              )} />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---- Read-only week renderer (submitted/approved/locked + detail sheet) ----
function ReadOnlyWeek({ ts, projectLabels, taskLabels, actions }: {
  ts: TSListItem & { entries: TSEntry[] };
  projectLabels: Record<string, string>;
  taskLabels: Record<string, string>;
  actions?: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
        <Metric label="Resource" value={ts.resource.name} />
        <Metric label="Week" value={`${ts.weekStart.slice(0, 10)} → ${ts.weekEnd.slice(0, 10)}`} />
        <Metric label="Status" value={<StatusChip status={ts.status} />} />
        <Metric label="Total" value={`${num(ts.totalHours)}h`} />
        <Metric label="Overtime" value={`${num(ts.overtimeHours)}h`} />
        <Metric label="Billable" value={`${num(ts.billableHours)}h`} />
        {ts.comments && <Metric label="Comments" value={<span className="text-xs font-normal">{ts.comments}</span>} />}
      </div>
      {ts.rejectionReason && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Rejected: {ts.rejectionReason}</div>
      )}
      {ts.entries.length === 0 ? <EmptyState title="No entries recorded" /> : (
        <div className="rounded-lg border border-slate-200 overflow-auto max-h-80">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1]">
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Day", "Project", "Task", "Activity", "Time", "Hours", "Billable", "Note"].map((h) => (
                  <th key={h} className="text-left font-medium text-slate-500 px-3 py-2 whitespace-nowrap text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...ts.entries].sort((a, b) => a.entryDate.localeCompare(b.entryDate)).map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{new Date(e.entryDate).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} {e.entryDate.slice(5, 10)}</td>
                  <td className="px-3 py-2 font-medium text-slate-700">{e.projectId ? projectLabels[e.projectId] || "Project" : "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{e.taskId ? taskLabels[e.taskId] || "Task" : "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{e.activity || "—"}</td>
                  <td className="px-3 py-2 text-slate-500 tabular-nums whitespace-nowrap">{e.startTime && e.endTime ? `${e.startTime}–${e.endTime}${e.breakMinutes ? ` (-${e.breakMinutes}m)` : ""}` : "—"}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{num(e.hours)}</td>
                  <td className="px-3 py-2">{e.billable ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200" variant="outline">Yes</Badge> : <Badge variant="outline" className="border-slate-200 text-slate-400">No</Badge>}</td>
                  <td className="px-3 py-2 text-slate-500 max-w-40 truncate">{e.comments || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {actions}
      <p className="text-xs text-slate-400 mt-3">Submitted {fmtDateTime(ts.submittedAt)}{ts.approvedAt ? ` · approved ${fmtDateTime(ts.approvedAt)}` : ""}{ts.lockedAt ? ` · locked ${fmtDateTime(ts.lockedAt)}` : ""}</p>
    </div>
  );
}
