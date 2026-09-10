"use client";
// PM CONTROL TOWER — CONNECT · Notification Center (in-app, severity-grouped, mark-read)

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, SectionCard, StatCard, Button, Badge, LoadingBlock, ErrorBlock,
  EmptyState, SeverityDot, StatusChip, cn,
} from "@/components/pmct/kit";
import { fmtDateTime } from "@/lib/constants";
import { Bell, Mail, MessageSquare, CheckCheck, ExternalLink, RefreshCw, Inbox } from "lucide-react";

interface Notification {
  id: string; userId: string; notifType: string; category: string; title: string; message: string;
  entityType: string | null; entityId: string | null; projectId: string | null;
  channel: string; severity: string; actionUrl: string | null;
  readAt: string | null; createdAt: string;
}

/** Derive the project code from the notification text (engine embeds codes in titles). */
function projectCodeOf(n: Notification): string | null {
  return n.title.match(/PRJ-[A-Z0-9]+(?:-[A-Z0-9]+)*/)?.[0] ?? null;
}
interface NotificationsData {
  notifications: Notification[];
  counts: { total: number; unread: number; read: number };
}

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: "bg-red-500", WARNING: "bg-amber-500", INFO: "bg-blue-500",
};

export default function NotificationsView() {
  const list = useApi<NotificationsData>("/api/notifications");
  useRealtimeRefetch(list.refetch, ["notification:created", "alert:created"]);

  const [tab, setTab] = useState<"ALL" | "UNREAD">("ALL");
  const [marking, setMarking] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const notifications = list.data?.notifications ?? [];
  const counts = list.data?.counts;

  const filtered = useMemo(() => {
    const base = tab === "UNREAD" ? notifications.filter((n) => !n.readAt) : notifications;
    // severity then recency: CRITICAL first, then WARNING, INFO — newest within group
    const order: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return base.slice().sort((a, b) =>
      (order[a.severity] ?? 3) - (order[b.severity] ?? 3) || b.createdAt.localeCompare(a.createdAt));
  }, [notifications, tab]);

  const unread = notifications.filter((n) => !n.readAt);

  const markRead = async (n: Notification) => {
    setMarking(n.id);
    try {
      await api.patch(`/api/notifications/${n.id}`, { read: true });
      list.refetch();
    } catch (e) {
      toast.error("Could not mark as read", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setMarking(null); }
  };

  const markAllRead = async () => {
    if (unread.length === 0) return;
    setMarkingAll(true);
    let ok = 0, fail = 0;
    for (const n of unread) {
      try { await api.patch(`/api/notifications/${n.id}`, { read: true }); ok += 1; }
      catch { fail += 1; }
    }
    setMarkingAll(false);
    if (fail === 0) toast.success(`Marked ${ok} notifications as read`);
    else toast.warning(`Marked ${ok} read — ${fail} failed`);
    list.refetch();
  };

  const openLink = (n: Notification) => {
    if (!n.actionUrl) return;
    window.location.hash = n.actionUrl.startsWith("#") ? n.actionUrl.slice(1) : n.actionUrl;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notification Center"
        breadcrumb={["Connect", "Notifications"]}
        subtitle="In-app alerts raised by governance rules, automations, approvals and escalations. Email and instant-message delivery channels are configured in the Integration Hub."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={list.refetch}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
            <Button size="sm" onClick={markAllRead} disabled={markingAll || unread.length === 0}>
              <CheckCheck className="h-4 w-4 mr-1.5" /> {markingAll ? "Marking…" : `Mark all read (${unread.length})`}
            </Button>
          </>
        }
      />

      {/* Channel note */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white shadow-sm px-4 py-3">
        <Inbox className="h-4 w-4 text-blue-600" />
        <span className="text-xs font-semibold text-slate-700">Delivery channels:</span>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">In-app — active</Badge>
        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">Email — configure in Integration Hub</Badge>
        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">Instant messaging — configure in Integration Hub</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total" value={counts?.total ?? "—"} icon={<Bell className="h-4 w-4" />} />
        <StatCard label="Unread" value={counts?.unread ?? "—"} tone={counts && counts.unread > 0 ? "warn" : "good"} icon={<Mail className="h-4 w-4" />} />
        <StatCard label="Read" value={counts?.read ?? "—"} tone="good" icon={<CheckCheck className="h-4 w-4" />} />
      </div>

      <SectionCard
        title="Notifications"
        description="Grouped by severity — critical first"
        actions={
          <div className="flex rounded-md border border-slate-200 overflow-hidden">
            {(["ALL", "UNREAD"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn("px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === t ? "bg-[#0b1f3a] text-white" : "bg-white text-slate-500 hover:bg-slate-50")}
              >
                {t === "ALL" ? "All" : "Unread"}
              </button>
            ))}
          </div>
        }
      >
        {list.loading && !list.data ? <LoadingBlock label="Loading notifications…" />
          : list.error ? <ErrorBlock message={list.error} onRetry={list.refetch} />
          : filtered.length === 0 ? (
            <EmptyState
              title={tab === "UNREAD" ? "No unread notifications" : "No notifications"}
              description={tab === "UNREAD" ? "You are all caught up." : "Alerts, escalations and approvals will appear here."}
            />
          ) : (
            <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto rounded-md border border-slate-100">
              {filtered.map((n) => {
                const isUnread = !n.readAt;
                const ChannelIcon = n.channel === "EMAIL" ? Mail : MessageSquare;
                return (
                  <div key={n.id} className={cn("flex items-start gap-3 px-4 py-3 transition-colors", isUnread ? "bg-blue-50/30" : "bg-white hover:bg-slate-50/60")}>
                    <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full shrink-0", SEVERITY_DOT[n.severity] || "bg-blue-500")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("text-sm truncate", isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>{n.title}</p>
                        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-normal">{n.category.replace(/_/g, " ")}</Badge>
                        {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" title="Unread" />}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1"><ChannelIcon className="h-3 w-3" />{n.channel.toLowerCase()}</span>
                        <span className="tabular-nums">{fmtDateTime(n.createdAt)}</span>
                        {projectCodeOf(n) && <span className="font-medium text-slate-500">{projectCodeOf(n)}</span>}
                        {n.readAt && <span className="text-emerald-600">read {fmtDateTime(n.readAt)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {n.actionUrl && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openLink(n)}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Open
                        </Button>
                      )}
                      {isUnread && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markRead(n)} disabled={marking === n.id}>
                          {marking === n.id ? "…" : "Mark read"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </SectionCard>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 px-1">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Critical</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Warning</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Info</span>
        <span className="ml-auto flex items-center gap-1.5"><SeverityDot severity="INFO" /> severity is assigned by the raising engine</span>
        <span className="flex items-center gap-1.5"><StatusChip status="NEW" /> unread items keep a blue marker</span>
      </div>
    </div>
  );
}
