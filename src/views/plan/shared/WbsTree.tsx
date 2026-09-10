"use client";
// PM CONTROL TOWER — Shared WBS tree (workspace tab + plan page)
// Indented tree rows with per-node rollups, add/edit/delete with server-side guards.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, EmptyState, SectionCard, StatusChip, ProgressBar, ConfirmButton } from "@/components/pmct/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { num } from "@/lib/constants";
import { FolderTree, Plus, Pencil, Trash2 } from "lucide-react";

interface WbsNode {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  description: string | null;
  nodeType: string;
  level: number;
  orderIndex: number;
  ownerName: string | null;
  plannedHours: number;
  plannedCost: number;
  actualHours: number;
  actualCost: number;
  progress: number;
  taskCount: number;
  taskRollup?: { plannedHours: number; actualHours: number; avgProgress: number };
  children: WbsNode[];
}
interface WbsBundle { projectId: string; tree: WbsNode[]; flatCount: number }

interface FlatRow { node: WbsNode; depth: number }
function flatten(nodes: WbsNode[], depth = 0, out: FlatRow[] = []): FlatRow[] {
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.children?.length) flatten(n.children, depth + 1, out);
  }
  return out;
}

interface NodeForm {
  id?: string;
  parentId: string | null;
  name: string;
  nodeType: string;
  ownerName: string;
  plannedHours: string;
  description: string;
}

export default function WbsTree({ projectId }: { projectId: string }) {
  const wbs = useApi<WbsBundle>(`/api/projects/${projectId}/wbs`);
  useRealtimeRefetch(wbs.refetch, ["wbs:changed", "task:changed", "project:updated"]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NodeForm | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => (wbs.data ? flatten(wbs.data.tree) : []), [wbs.data]);

  const openCreate = (parentId: string | null) => {
    setForm({ parentId, name: "", nodeType: "WORK_PACKAGE", ownerName: "", plannedHours: "", description: "" });
    setDialogOpen(true);
  };
  const openEdit = (n: WbsNode) => {
    setForm({ id: n.id, parentId: n.parentId, name: n.name, nodeType: n.nodeType, ownerName: n.ownerName || "", plannedHours: String(n.plannedHours || ""), description: n.description || "" });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form || !form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        nodeType: form.nodeType,
        ownerName: form.ownerName.trim() || null,
        plannedHours: form.plannedHours === "" ? undefined : Number(form.plannedHours),
        description: form.description.trim() || null,
      };
      if (form.id) {
        await api.patch(`/api/projects/${projectId}/wbs/${form.id}`, body);
        toast.success("WBS node updated");
      } else {
        await api.post(`/api/projects/${projectId}/wbs`, { ...body, parentId: form.parentId || undefined });
        toast.success("WBS node created");
      }
      setDialogOpen(false);
      setForm(null);
      await wbs.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save node");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (n: WbsNode) => {
    try {
      await api.del(`/api/projects/${projectId}/wbs/${n.id}`);
      toast.success(`Node ${n.code} deleted`);
      await wbs.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (wbs.loading) return <LoadingBlock label="Loading work breakdown structure…" />;
  if (wbs.error) return <ErrorBlock message={wbs.error} onRetry={wbs.refetch} />;

  const data = wbs.data;
  const totals = (data?.tree || []).reduce(
    (acc, n) => ({
      planned: acc.planned + (n.taskRollup?.plannedHours ?? n.plannedHours),
      actual: acc.actual + (n.taskRollup?.actualHours ?? n.actualHours),
    }),
    { planned: 0, actual: 0 },
  );

  return (
    <SectionCard
      title="Work Breakdown Structure"
      description={`${data?.flatCount ?? 0} nodes · ${num(totals.planned, 0)}h planned / ${num(totals.actual, 0)}h actual`}
      actions={(
        <Button size="sm" className="h-8" onClick={() => openCreate(null)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add root node
        </Button>
      )}
    >
      {!rows.length ? (
        <EmptyState
          title="No WBS nodes yet"
          description="Break the project scope into summary nodes and work packages."
          action={<Button size="sm" onClick={() => openCreate(null)}><Plus className="h-3.5 w-3.5 mr-1" /> Add root node</Button>}
        />
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1]">
              <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-medium">Code / Name</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Owner</th>
                <th className="px-3 py-2.5 font-medium text-right">Planned h</th>
                <th className="px-3 py-2.5 font-medium text-right">Actual h</th>
                <th className="px-3 py-2.5 font-medium w-40">Progress</th>
                <th className="px-3 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth }) => (
                <tr key={node.id} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">
                  <td className="px-3 py-2">
                    <div className="flex items-center" style={{ paddingLeft: depth * 20 }}>
                      {node.children?.length > 0 && <FolderTree className="h-3.5 w-3.5 text-slate-400 mr-1.5 shrink-0" />}
                      <span className="text-[11px] font-mono text-slate-400 mr-2 w-10">{node.code}</span>
                      <span className={node.nodeType === "SUMMARY" ? "font-semibold text-slate-900" : "text-slate-700"}>{node.name}</span>
                      {node.taskCount > 0 && <span className="ml-2 text-[10px] text-slate-400">{node.taskCount} task{node.taskCount === 1 ? "" : "s"}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2"><StatusChip status={node.nodeType} /></td>
                  <td className="px-3 py-2 text-slate-600 text-xs">{node.ownerName || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {num(node.taskRollup?.plannedHours ?? node.plannedHours, 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {num(node.taskRollup?.actualHours ?? node.actualHours, 0)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={node.taskRollup?.avgProgress ?? node.progress} className="flex-1" />
                      <span className="text-[11px] tabular-nums text-slate-500 w-9 text-right">{Math.round(node.taskRollup?.avgProgress ?? node.progress)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Add child under ${node.code}`} onClick={() => openCreate(node.id)}>
                      <Plus className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${node.code}`} onClick={() => openEdit(node)}>
                      <Pencil className="h-3.5 w-3.5 text-slate-500" />
                    </Button>
                    <ConfirmButton
                      variant="ghost"
                      title={`Delete ${node.code}?`}
                      description="Nodes with child nodes or attached tasks are protected by the server. Descendants are removed with the node."
                      confirmLabel="Delete"
                      onConfirm={() => remove(node)}
                    >
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${node.code}`}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit WBS node" : form?.parentId ? "Add child node" : "Add root node"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 py-1">
              <div className="grid gap-1.5">
                <Label htmlFor="wbs-name">Name</Label>
                <Input id="wbs-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Data migration work package" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Node type</Label>
                  <Select value={form.nodeType} onValueChange={(v) => setForm({ ...form, nodeType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SUMMARY">Summary</SelectItem>
                      <SelectItem value="WORK_PACKAGE">Work package</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Parent</Label>
                  <Select
                    value={form.parentId || "root"}
                    onValueChange={(v) => setForm({ ...form, parentId: v === "root" ? null : v })}
                    disabled={Boolean(form.id)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">— Project root —</SelectItem>
                      {rows.map(({ node }) => (
                        <SelectItem key={node.id} value={node.id}>{node.code} — {node.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="wbs-owner">Owner</Label>
                  <Input id="wbs-owner" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="Responsible person" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wbs-hours">Planned hours</Label>
                  <Input id="wbs-hours" type="number" min={0} value={form.plannedHours} onChange={(e) => setForm({ ...form, plannedHours: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wbs-desc">Description</Label>
                <Textarea id="wbs-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : form?.id ? "Save changes" : "Create node"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
