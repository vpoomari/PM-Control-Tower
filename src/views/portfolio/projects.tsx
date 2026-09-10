"use client";
// PM CONTROL TOWER — Project register: searchable, filterable table of all projects.
// Row click opens the project workspace. New Project dialog with program/owner pickers.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, LoadingBlock, ErrorBlock, StatCard, StatusChip, RagBadge, ProgressBar,
  Toolbar, SearchInput, DataTable, Button,
} from "@/components/pmct/kit";
import type { Column } from "@/components/pmct/kit";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECT_STATUS, PRIORITY, money, num, fmtDate } from "@/lib/constants";
import { Plus, FolderKanban, Wallet, Activity, ClipboardList } from "lucide-react";

type ProjectRow = {
  id: string; code: string; name: string; status: string; priority: string; phase: string;
  progress: number; healthScore: number; ragStatus: string;
  startDate: string | null; endDate: string | null;
  currentBudget: number; actualCost: number;
  owner: { id: string; name: string } | null;
  program: { id: string; code: string; name: string; portfolio?: { id: string; code: string; name: string } } | null;
  portfolio: { id: string; code: string; name: string } | null;
};
interface ProjectsBundle { items: ProjectRow[]; total: number; skip: number; take: number }
interface ProgramOpt { id: string; code: string; name: string; portfolio?: { id: string; code: string; name: string } }
interface UsersBundle { users: { id: string; name: string; isActive: boolean }[] }

interface FormState {
  code: string; name: string; description: string; programId: string; ownerId: string;
  startDate: string; endDate: string; budget: string; status: string; priority: string;
}
const EMPTY_FORM: FormState = { code: "", name: "", description: "", programId: "", ownerId: "", startDate: "", endDate: "", budget: "", status: "DRAFT", priority: "MEDIUM" };

export default function ProjectsView() {
  const projects = useApi<ProjectsBundle>("/api/projects?take=500");
  const programs = useApi<ProgramOpt[]>("/api/programs");
  const users = useApi<UsersBundle>("/api/admin/users");
  useRealtimeRefetch(projects.refetch, ["project:created", "project:updated", "project:health"]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ragFilter, setRagFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const list = projects.data?.items || [];
    const q = query.trim().toLowerCase();
    return list.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (ragFilter !== "all" && p.ragStatus !== ragFilter) return false;
      if (!q) return true;
      const pm = p.owner?.name || "";
      const prog = p.program?.name || "";
      const port = p.program?.portfolio?.name || p.portfolio?.name || "";
      return `${p.code} ${p.name} ${pm} ${prog} ${port}`.toLowerCase().includes(q);
    });
  }, [projects.data, query, statusFilter, ragFilter]);

  const openCreate = () => { setForm(EMPTY_FORM); setDialogOpen(true); };

  const save = async () => {
    if (form.code.trim().length < 2) { toast.error("Code must be at least 2 characters"); return; }
    if (form.name.trim().length < 2) { toast.error("Name must be at least 2 characters"); return; }
    setSaving(true);
    try {
      await api.post("/api/projects", {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        programId: form.programId || null,
        ownerId: form.ownerId || null,
        managerId: form.ownerId || null,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        currentBudget: form.budget === "" ? undefined : Number(form.budget),
        status: form.status,
        priority: form.priority,
      });
      toast.success("Project created");
      setDialogOpen(false);
      await projects.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<ProjectRow>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono text-xs text-slate-500">{r.code}</span> },
    { key: "name", header: "Project", render: (r) => (
      <div className="max-w-[240px]">
        <p className="font-medium text-slate-800 truncate">{r.name}</p>
        <p className="text-xs text-slate-400">{r.phase.replace("_", " ").toLowerCase()}</p>
      </div>
    ) },
    { key: "org", header: "Program → Portfolio", render: (r) => (
      <div className="text-xs text-slate-600">
        <p>{r.program?.name || "—"}</p>
        <p className="text-slate-400">{r.program?.portfolio?.name || r.portfolio?.name || ""}</p>
      </div>
    ) },
    { key: "pm", header: "PM", render: (r) => r.owner?.name || "—" },
    { key: "status", header: "Status", render: (r) => <StatusChip status={r.status} /> },
    { key: "priority", header: "Priority", render: (r) => <StatusChip status={r.priority} /> },
    { key: "rag", header: "RAG / Health", render: (r) => <RagBadge rag={r.ragStatus} score={r.healthScore} /> },
    { key: "progress", header: "Progress", className: "w-32", render: (r) => (
      <div className="flex items-center gap-2">
        <ProgressBar value={r.progress} className="flex-1" />
        <span className="text-[11px] tabular-nums text-slate-500 w-9 text-right">{Math.round(r.progress)}%</span>
      </div>
    ) },
    { key: "dates", header: "Window", render: (r) => <span className="text-xs text-slate-600 whitespace-nowrap">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</span> },
    { key: "budget", header: "Budget", className: "text-right", render: (r) => (
      <div className="text-xs">
        <p className="tabular-nums text-slate-700">{money(r.currentBudget)}</p>
        <p className="tabular-nums text-slate-400">{money(r.actualCost)} actual</p>
      </div>
    ) },
  ];

  if (projects.loading) return <LoadingBlock label="Loading project register…" />;
  if (projects.error || !projects.data) return <ErrorBlock message={projects.error || "Register unavailable"} onRetry={projects.refetch} />;

  const items = projects.data.items;
  const active = items.filter((p) => p.status === "ACTIVE").length;
  const totBudget = items.reduce((a, p) => a + p.currentBudget, 0);
  const avgProgress = items.length ? items.reduce((a, p) => a + p.progress, 0) / items.length : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        io="projects"
        title="Project Register"
        subtitle="Every project under management — click a row to open its workspace."
        breadcrumb={["Home", "Projects"]}
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> New project</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Projects" value={projects.data.total} sub={`${active} active`} icon={<FolderKanban className="h-4 w-4" />} />
        <StatCard label="Committed budget" value={money(totBudget)} sub={`${items.length} registered`} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Average progress" value={`${num(avgProgress, 1)}%`} sub="Across the register" icon={<Activity className="h-4 w-4" />} />
        <StatCard
          label="Health alerts"
          value={items.filter((p) => p.ragStatus === "RED").length}
          tone={items.some((p) => p.ragStatus === "RED") ? "bad" : "good"}
          sub={`${items.filter((p) => p.ragStatus === "AMBER").length} amber · ${items.filter((p) => p.ragStatus === "GREEN").length} green`}
          icon={<ClipboardList className="h-4 w-4" />}
        />
      </div>

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search code, name, PM, program…" className="w-full sm:w-80" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9 bg-white" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PROJECT_STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={ragFilter} onValueChange={setRagFilter}>
          <SelectTrigger className="w-36 h-9 bg-white" aria-label="Filter by RAG"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All RAG</SelectItem>
            {["GREEN", "AMBER", "RED"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-400 ml-auto">{rows.length} of {projects.data.total}</span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        keyField="id"
        onRowClick={(r) => { window.location.hash = `/projects/${r.id}`; }}
        emptyTitle="No projects match"
        emptyDescription="Adjust the filters or create a new project."
        maxHeight="640px"
      />

      {/* New project dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pj-code">Code</Label>
                <Input id="pj-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PRJ-XX-000" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pj-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="pj-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pj-name">Name</Label>
              <Input id="pj-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer Onboarding Revamp" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pj-program">Program</Label>
                <Select value={form.programId || "none"} onValueChange={(v) => setForm({ ...form, programId: v === "none" ? "" : v })}>
                  <SelectTrigger id="pj-program"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Standalone —</SelectItem>
                    {(programs.data || []).map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.code} — {g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pj-owner">Project manager</Label>
                <Select value={form.ownerId || "none"} onValueChange={(v) => setForm({ ...form, ownerId: v === "none" ? "" : v })}>
                  <SelectTrigger id="pj-owner"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {(users.data?.users || []).filter((u) => u.isActive).map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pj-start">Start</Label>
                <Input id="pj-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pj-end">End</Label>
                <Input id="pj-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pj-budget">Budget</Label>
                <Input id="pj-budget" type="number" min={0} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pj-priority">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger id="pj-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITY.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pj-desc">Description</Label>
              <Textarea id="pj-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Creating…" : "Create project"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
