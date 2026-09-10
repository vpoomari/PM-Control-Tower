"use client";
// PM CONTROL TOWER — Shared baselines panel (workspace tab + plan page)
// Versioned performance baselines: create snapshot, activate (supersedes others).

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, EmptyState, SectionCard, StatusChip, StatCard, ConfirmButton } from "@/components/pmct/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate, fmtDateTime, money, num } from "@/lib/constants";
import { Layers, Rocket, History, Wallet, Plus } from "lucide-react";

interface Baseline {
  id: string;
  version: number;
  name: string;
  description: string | null;
  status: string;
  baselineStart: string | null;
  baselineFinish: string | null;
  baselineHours: number;
  baselineCost: number;
  createdBy: string | null;
  activatedAt: string | null;
  createdAt: string;
}
interface BaselinesBundle {
  projectId: string;
  items: Baseline[];
  activeBaselineId: string | null;
  projectBaseline: { baselineStart: string | null; baselineFinish: string | null; baselineBudget: number } | null;
  total: number;
}

export default function BaselinesPanel({ projectId }: { projectId: string }) {
  const bl = useApi<BaselinesBundle>(`/api/projects/${projectId}/baselines`);
  useRealtimeRefetch(bl.refetch, ["baseline:changed", "project:updated"]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const create = async () => {
    setSaving(true);
    try {
      await api.post(`/api/projects/${projectId}/baselines`, {
        name: form.name.trim() || undefined,
        description: form.description.trim() || null,
      });
      toast.success("Baseline snapshot created");
      setOpen(false);
      setForm({ name: "", description: "" });
      await bl.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Snapshot failed");
    } finally {
      setSaving(false);
    }
  };

  const activate = async (b: Baseline) => {
    try {
      await api.post(`/api/projects/${projectId}/baselines/${b.id}/activate`);
      toast.success(`Baseline v${b.version} activated`);
      await bl.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activation failed");
    }
  };

  const items = bl.data?.items || [];
  const active = items.find((b) => b.id === bl.data?.activeBaselineId);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Versions" value={bl.data?.total ?? 0} sub="Snapshot history" icon={<History className="h-4 w-4" />} />
        <StatCard label="Active baseline" value={active ? `v${active.version}` : "—"} sub={active?.name || "No baseline activated"} tone={active ? "info" : "warn"} icon={<Layers className="h-4 w-4" />} />
        <StatCard label="Baseline hours" value={active ? num(active.baselineHours, 0) : "—"} sub="Planned effort at approval" icon={<Rocket className="h-4 w-4" />} />
        <StatCard label="Baseline cost" value={active ? money(active.baselineCost) : "—"} sub="Approved budget at baseline" icon={<Wallet className="h-4 w-4" />} />
      </div>

      <SectionCard
        title="Performance baselines"
        description="Snapshots freeze schedule, effort and cost for variance control. Activation supersedes prior versions."
        actions={<Button size="sm" className="h-8" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Create snapshot</Button>}
      >
        {bl.loading ? <LoadingBlock label="Loading baselines…" />
          : bl.error ? <ErrorBlock message={bl.error} onRetry={bl.refetch} />
          : !items.length ? (
            <EmptyState
              title="No baselines yet"
              description="Create the first snapshot to lock the approved plan."
              action={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Create snapshot</Button>}
            />
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 font-medium">Version</th>
                    <th className="px-3 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Start</th>
                    <th className="px-3 py-2.5 font-medium">Finish</th>
                    <th className="px-3 py-2.5 font-medium text-right">Hours</th>
                    <th className="px-3 py-2.5 font-medium text-right">Cost</th>
                    <th className="px-3 py-2.5 font-medium">Created</th>
                    <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((b) => (
                    <tr key={b.id} className={`border-b border-slate-100 last:border-0 hover:bg-blue-50/40 ${b.id === bl.data?.activeBaselineId ? "bg-emerald-50/30" : ""}`}>
                      <td className="px-3 py-2 font-semibold text-slate-800">v{b.version}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800">{b.name}</p>
                        {b.description && <p className="text-xs text-slate-500 max-w-[280px] truncate">{b.description}</p>}
                      </td>
                      <td className="px-3 py-2"><StatusChip status={b.status} /></td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(b.baselineStart)}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(b.baselineFinish)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{num(b.baselineHours, 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">{money(b.baselineCost)}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap" title={b.activatedAt ? `Activated ${fmtDateTime(b.activatedAt)}` : undefined}>
                        {fmtDate(b.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {b.status === "ACTIVE" ? (
                          <span className="text-xs font-medium text-emerald-700">In use</span>
                        ) : (
                          <ConfirmButton
                            title={`Activate baseline v${b.version}?`}
                            description="All other baselines become SUPERSEDED and the project baseline fields adopt this snapshot."
                            confirmLabel="Activate"
                            onConfirm={() => activate(b)}
                          >
                            <Button variant="outline" size="sm" className="h-7">Activate</Button>
                          </ConfirmButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create baseline snapshot</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="bl-name">Name</Label>
              <Input id="bl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Re-baseline after CR-003 approval" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bl-desc">Description</Label>
              <Input id="bl-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Why this snapshot is taken" />
            </div>
            <p className="text-xs text-slate-500">
              The snapshot captures current project dates, total WBS planned hours and current budget. New snapshots start as DRAFT — activate to enforce.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? "Snapshotting…" : "Create snapshot"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
