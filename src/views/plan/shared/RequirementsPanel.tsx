"use client";
// PM CONTROL TOWER — Shared requirements panel (workspace Scope tab + plan page)

import { useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { LoadingBlock, ErrorBlock, SectionCard, StatusChip, DataTable, ConfirmButton } from "@/components/pmct/kit";
import type { Column } from "@/components/pmct/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { num } from "@/lib/constants";
import { Plus, Trash2 } from "lucide-react";

type Requirement = {
  id: string;
  reqCode: string;
  title: string;
  description: string | null;
  reqType: string;
  priority: string;
  status: string;
  acceptanceCriteria: string | null;
  source: string | null;
  ownerName: string | null;
  effortEstimate: number;
};
interface RequirementsBundle { projectId: string; items: Requirement[]; total: number }

const REQ_TYPES = ["FUNCTIONAL", "NON_FUNCTIONAL", "BUSINESS", "TECHNICAL", "INTERFACE", "REGULATORY"];
const REQ_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const REQ_STATUSES = ["DRAFT", "UNDER_REVIEW", "BASELINED", "IN_PROGRESS", "DELIVERED", "ACCEPTED", "CANCELLED"];

interface ReqForm {
  title: string; description: string; reqType: string; priority: string; status: string;
  ownerName: string; effortEstimate: string; acceptanceCriteria: string; source: string;
}

export default function RequirementsPanel({ projectId }: { projectId: string }) {
  const reqs = useApi<RequirementsBundle>(`/api/projects/${projectId}/requirements`);
  useRealtimeRefetch(reqs.refetch, ["requirement:changed", "project:updated"]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ReqForm>({ title: "", description: "", reqType: "FUNCTIONAL", priority: "MEDIUM", status: "DRAFT", ownerName: "", effortEstimate: "", acceptanceCriteria: "", source: "" });

  const create = async () => {
    if (form.title.trim().length < 2) { toast.error("Title must be at least 2 characters"); return; }
    setSaving(true);
    try {
      await api.post(`/api/projects/${projectId}/requirements`, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        reqType: form.reqType,
        priority: form.priority,
        status: form.status,
        ownerName: form.ownerName.trim() || null,
        effortEstimate: form.effortEstimate === "" ? undefined : Number(form.effortEstimate),
        acceptanceCriteria: form.acceptanceCriteria.trim() || null,
        source: form.source.trim() || null,
      });
      toast.success("Requirement created");
      setOpen(false);
      setForm({ title: "", description: "", reqType: "FUNCTIONAL", priority: "MEDIUM", status: "DRAFT", ownerName: "", effortEstimate: "", acceptanceCriteria: "", source: "" });
      await reqs.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create requirement");
    } finally {
      setSaving(false);
    }
  };

  const patchStatus = async (r: Requirement, status: string) => {
    try {
      await api.patch(`/api/projects/${projectId}/requirements/${r.id}`, { status });
      toast.success(`${r.reqCode} → ${status.replace("_", " ").toLowerCase()}`);
      await reqs.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Status update failed");
      await reqs.refetch();
    }
  };

  const remove = async (r: Requirement) => {
    try {
      await api.del(`/api/projects/${projectId}/requirements/${r.id}`);
      toast.success(`${r.reqCode} deleted`);
      await reqs.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const columns: Column<Requirement>[] = [
    { key: "reqCode", header: "Code", render: (r) => <span className="font-mono text-xs text-slate-500">{r.reqCode}</span> },
    { key: "title", header: "Requirement", render: (r) => (
      <div className="max-w-[320px]">
        <p className="font-medium text-slate-800 truncate">{r.title}</p>
        {r.description && <p className="text-xs text-slate-500 truncate">{r.description}</p>}
      </div>
    ) },
    { key: "reqType", header: "Type", render: (r) => <span className="text-xs">{r.reqType.replace("_", " ").toLowerCase()}</span> },
    { key: "priority", header: "Priority", render: (r) => <StatusChip status={r.priority} /> },
    { key: "status", header: "Status", render: (r) => (
      <Select value={r.status} onValueChange={(v) => patchStatus(r, v)}>
        <SelectTrigger className="h-7 w-[150px] text-xs border-0 px-2 shadow-none bg-slate-50" aria-label={`Status of ${r.reqCode}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REQ_STATUSES.map((s) => <SelectItem key={s} value={s}><StatusChip status={s} /></SelectItem>)}
        </SelectContent>
      </Select>
    ) },
    { key: "ownerName", header: "Owner", render: (r) => r.ownerName || "—" },
    { key: "effortEstimate", header: "Effort (h)", className: "text-right", render: (r) => <span className="tabular-nums">{num(r.effortEstimate, 0)}</span> },
    { key: "actions", header: "", className: "text-right", render: (r) => (
      <ConfirmButton variant="ghost" title={`Delete ${r.reqCode}?`} description="This removes the requirement from the project scope record." confirmLabel="Delete" onConfirm={() => remove(r)}>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete ${r.reqCode}`}>
          <Trash2 className="h-3.5 w-3.5 text-red-500" />
        </Button>
      </ConfirmButton>
    ) },
  ];

  return (
    <SectionCard
      title="Requirements"
      description={`${reqs.data?.total ?? 0} requirements registered against project scope`}
      actions={<Button size="sm" className="h-8" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add requirement</Button>}
    >
      {reqs.loading ? <LoadingBlock label="Loading requirements…" />
        : reqs.error ? <ErrorBlock message={reqs.error} onRetry={reqs.refetch} />
        : <DataTable columns={columns} rows={reqs.data?.items || []} keyField="id" emptyTitle="No requirements" emptyDescription="Capture scope as traceable requirements." maxHeight="480px" />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Add requirement</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="req-title">Title</Label>
              <Input id="req-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Single sign-on for corporate users" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="req-desc">Description</Label>
              <Textarea id="req-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select value={form.reqType} onValueChange={(v) => setForm({ ...form, reqType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REQ_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REQ_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REQ_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="req-effort">Effort (h)</Label>
                <Input id="req-effort" type="number" min={0} value={form.effortEstimate} onChange={(e) => setForm({ ...form, effortEstimate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="req-owner">Owner</Label>
                <Input id="req-owner" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="Accountable owner" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="req-source">Source</Label>
                <Input id="req-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. Business case v2" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="req-ac">Acceptance criteria</Label>
              <Textarea id="req-ac" rows={2} value={form.acceptanceCriteria} onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? "Creating…" : "Create requirement"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
