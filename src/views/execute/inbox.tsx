"use client";
// PM CONTROL TOWER — Work inbox: categorized action stream with status filter and quick actions.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { useRoute } from "@/lib/router";
import { fmtDate, fmtDateTime } from "@/lib/constants";
import {
  PageHeader, SectionCard, StatusChip, LoadingBlock, ErrorBlock, EmptyState, Button, Badge, cn,
} from "@/components/pmct/kit";
import { Inbox, ExternalLink, CheckCircle2, XCircle, Clock } from "lucide-react";

interface InboxItem {
  id: string; userId: string; category: string; title: string; message: string;
  entityType: string; entityId: string | null; projectId: string | null;
  priority: string; dueDate: string | null; status: string; actionUrl: string | null;
  sourceType: string; completedAt: string | null; createdAt: string;
  project: { id: string; code: string; name: string } | null;
}
interface InboxData {
  items: InboxItem[];
  unreadCounts: Record<string, number>;
  total: number; category: string; status: string;
}

const CATEGORIES = [
  { key: "ALL", label: "All", icon: Inbox },
  { key: "ACTION_REQUIRED", label: "Action Required", icon: CheckCircle2 },
  { key: "MENTIONS", label: "Mentions", icon: ExternalLink },
  { key: "APPROVALS", label: "Approvals", icon: CheckCircle2 },
  { key: "ALERTS", label: "Alerts", icon: XCircle },
  { key: "GOVERNANCE", label: "Governance", icon: Clock },
  { key: "ESCALATIONS", label: "Escalations", icon: XCircle },
] as const;

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
type StatusFilter = "ANY" | "OPEN" | "DONE";

/** Pure sort — critical first, then newest. */
function priorityFirst(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
    if (pr !== 0) return pr;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export default function InboxView() {
  const { navigate } = useRoute();
  const [category, setCategory] = useState<string>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ANY");

  // The API only accepts OPEN | DONE | DISMISSED — "ANY" means the param is omitted.
  const inbox = useApi<InboxData>(`/api/inbox?category=${category}${status !== "ANY" ? `&status=${status}` : ""}`);
  useRealtimeRefetch(inbox.refetch, ["inbox:changed", "alert:created", "timesheet:submitted"]);

  const items = useMemo(() => priorityFirst(inbox.data?.items ?? []), [inbox.data]);

  const counts = inbox.data?.unreadCounts ?? {};

  const act = async (item: InboxItem, next: "DONE" | "DISMISSED", msg: string) => {
    try {
      await api.patch(`/api/inbox/${item.id}`, { status: next });
      toast.success(msg);
      await inbox.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const openItem = (item: InboxItem) => {
    if (item.actionUrl) {
      // actionUrl is a hash route ("#/governance" or "/projects/<id>") — the router normalizes it.
      navigate(item.actionUrl);
    } else {
      toast.info("This item has no linked destination");
    }
  };

  if (inbox.loading && !inbox.data) return <LoadingBlock label="Loading your inbox…" />;
  if (inbox.error && !inbox.data) return <ErrorBlock message={inbox.error} onRetry={inbox.refetch} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Work Inbox"
        subtitle="Everything that needs your attention — approvals, alerts, governance and escalations in one stream."
        breadcrumb={["Home", "Execute", "Work Inbox"]}
        actions={<Badge variant="outline" className="border-slate-200 text-slate-500">{counts.ALL ?? inbox.data?.total ?? 0} open</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-4 items-start">
        {/* Category sidebar */}
        <SectionCard title="Categories" bodyClass="p-2">
          <nav aria-label="Inbox categories" className="space-y-0.5">
            {CATEGORIES.map((c) => (
              <button key={c.key} onClick={() => setCategory(c.key)}
                className={cn("w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
                  category === c.key ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50")}>
                <c.icon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="flex-1 text-left">{c.label}</span>
                {counts[c.key] !== undefined && (
                  <span className={cn("text-xs tabular-nums rounded-full px-1.5 py-0.5",
                    counts[c.key] > 0 ? "bg-blue-600 text-white" : "text-slate-400")}>{counts[c.key]}</span>
                )}
              </button>
            ))}
          </nav>
        </SectionCard>

        {/* List */}
        <SectionCard
          title={CATEGORIES.find((c) => c.key === category)?.label ?? "All"}
          description={`${items.length} items · critical first`}
          actions={
            <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-white">
              {(["ANY", "OPEN", "DONE"] as const).map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={cn("px-2.5 py-1 text-xs font-medium rounded", status === s ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-700")}>
                  {s === "ANY" ? "All" : s === "OPEN" ? "Open" : "Done"}
                </button>
              ))}
            </div>
          }
        >
          {items.length === 0 ? (
            <EmptyState title="Inbox zero" description="Nothing waiting in this view — new items appear in real time." />
          ) : (
            <div className="space-y-2 max-h-[42rem] overflow-y-auto pr-0.5 pmct-scroll">
              {items.map((it) => (
                <div key={it.id} className={cn("rounded-lg border px-3.5 py-3 transition-colors",
                  it.status === "DONE" ? "border-slate-100 bg-slate-50/60" : it.priority === "CRITICAL" && it.status === "OPEN" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white hover:border-blue-200")}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("text-sm font-medium truncate", it.status === "DONE" ? "text-slate-400 line-through" : "text-slate-800")}>{it.title}</p>
                        <StatusChip status={it.priority} />
                        <StatusChip status={it.status} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{it.message}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-400">
                        {it.project && <span className="font-medium text-slate-500">{it.project.code}</span>}
                        <span className="capitalize">{it.category.replace(/_/g, " ").toLowerCase()}</span>
                        <span>{it.sourceType.replace(/_/g, " ").toLowerCase()}</span>
                        <span>{fmtDateTime(it.createdAt)}</span>
                        {it.dueDate && <span className={cn(new Date(it.dueDate) < new Date() && it.status === "OPEN" && "text-red-500 font-medium")}>due {fmtDate(it.dueDate)}</span>}
                        {it.completedAt && <span className="text-emerald-600">done {fmtDateTime(it.completedAt)}</span>}
                      </div>
                    </div>
                    {it.status === "OPEN" && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {it.actionUrl && (
                          <Button variant="outline" size="sm" onClick={() => openItem(it)}>
                            Open<ExternalLink className="h-3 w-3 ml-1.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => void act(it, "DONE", "Marked done")} aria-label="Mark done">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600" onClick={() => void act(it, "DISMISSED", "Dismissed")} aria-label="Dismiss">
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
