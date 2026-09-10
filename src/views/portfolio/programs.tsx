"use client";
// PM CONTROL TOWER — Programs: table + portfolio filter, row click opens a program drawer
// showing its projects with health, progress and budget.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, LoadingBlock, ErrorBlock, EmptyState, StatCard, StatusChip, RagBadge,
  ProgressBar, Toolbar, SearchInput, DataTable, Button,
} from "@/components/pmct/kit";
import type { Column } from "@/components/pmct/kit";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, num, fmtDate } from "@/lib/constants";
import { Plus, Pencil, Wallet, FolderKanban, TrendingUp } from "lucide-react";

interface PortfolioRef { id: string; code: string; name: string }
interface ProgramProject {
  id: string; code: string; name: string; status: string; ragStatus: string; healthScore: number;
  progress: number; currentBudget: number; actualCost: number;
}
interface Program {
  id: string; code: string; name: string; description: string | null;
  portfolioId: string; portfolio: PortfolioRef; ownerId: string | null;
  owner: { id: string; name: string; avatarColor: string } | null;
  status: string; budget: number;
  totals: { currentBudget: number; actualCost: number; forecastCost: number };
  startDate: string | null; endDate: string | null;
  healthScore: number; ragStatus: string; avgHealthScore: number;
  projectCount: number; ragDistribution: { GREEN: number; AMBER: number; RED: number };
  projects: ProgramProject[];
}
interface ProgramRow extends Program { portfolioName: string }

interface FormState {
  id?: string; code: string; name: string; description: string; portfolioId: string;
  ownerId: string; budget: string; startDate: string; endDate: string; status: string;
}
const EMPTY_FORM: FormState = { code: "", name: "", description: "", portfolioId: "", ownerId: "", budget: "", startDate: "", endDate: "", status: "ACTIVE" };

export default function ProgramsView() {
  const programs = useApi<Program[]>("/api/programs");
  const portfolios = useApi<PortfolioRef[]>("/api/portfolios");
  useRealtimeRefetch(programs.refetch, ["project:created", "project:updated", "project:health"]);

  const [query, setQuery] = useState("");
  const [portfolioFilter, setPortfolioFilter] = useState<string>("all");
  const [detail, setDetail] = useState<Program | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const list = (programs.data || []).map((p) => ({ ...p, portfolioName: p.portfolio?.name || "—" }));
    const q = query.trim().toLowerCase();
    return list.filter((p) => {
      if (portfolioFilter !== "all" && p.portfolioId !== portfolioFilter) return false;
      if (!q) return true;
      return `${p.code} ${p.name} ${p.owner?.name || ""}`.toLowerCase().includes(q);
    });
  }, [programs.data, query, portfolioFilter]);

  const openCreate = () => {
    const first = portfolios.data?.[0]?.id || "";
    setForm({ ...EMPTY_FORM, portfolioId: first });
    setDialogOpen(true);
  };
  const openEdit = (p: Program) => {
    setForm({
      id: p.id, code: p.code, name: p.name, description: p.description || "",
      portfolioId: p.portfolioId, ownerId: p.ownerId || "",
      budget: p.budget ? String(p.budget) : "",
      startDate: p.startDate ? p.startDate.slice(0, 10) : "", endDate: p.endDate ? p.endDate.slice(0, 10) : "",
      status: p.status,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (form.code.trim().length < 2) { toast.error("Code must be at least 2 characters"); return; }
    if (form.name.trim().length < 2) { toast.error("Name must be at least 2 characters"); return; }
    if (!form.portfolioId) { toast.error("Select the parent portfolio"); return; }
    setSaving(true);
    try {
      const body = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        portfolioId: form.portfolioId,
        ownerId: form.ownerId || null,
        budget: form.budget === "" ? undefined : Number(form.budget),
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        status: form.status,
      };
      if (form.id) {
        await api.patch(`/api/programs/${form.id}`, body);
        toast.success("Program updated");
      } else {
        await api.post("/api/programs", body);
        toast.success("Program created");
      }
      setDialogOpen(false);
      await programs.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<ProgramRow>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-mono text-xs text-slate-500">{r.code}</span> },
    { key: "name", header: "Program", render: (r) => (
      <div>
        <p className="font-medium text-slate-800">{r.name}</p>
        {r.description && <p className="text-xs text-slate-500 truncate max-w-[280px]">{r.description}</p>}
      </div>
    ) },
    { key: "portfolioName", header: "Portfolio", render: (r) => <span className="text-xs text-slate-600">{r.portfolioName}</span> },
    { key: "owner", header: "Owner", render: (r) => r.owner?.name || "—" },
    { key: "status", header: "Status", render: (r) => <StatusChip status={r.status} /> },
    { key: "rag", header: "RAG", render: (r) => <RagBadge rag={r.ragStatus} score={r.avgHealthScore} /> },
    { key: "projectCount", header: "Projects", className: "text-right", render: (r) => <span className="tabular-nums">{r.projectCount}</span> },
    { key: "budget", header: "Budget", className: "text-right", render: (r) => <span className="tabular-nums">{money(r.budget)}</span> },
    { key: "committed", header: "Committed", className: "text-right", render: (r) => <span className="tabular-nums text-xs">{money(r.totals.currentBudget)}</span> },
  ];

  if (programs.loading) return <LoadingBlock label="Loading programs…" />;
  if (programs.error || !programs.data) return <ErrorBlock message={programs.error || "Programs unavailable"} onRetry={programs.refetch} />;

  const totBudget = (programs.data || []).reduce((a, p) => a + p.budget, 0);
  const totCommitted = (programs.data || []).reduce((a, p) => a + p.totals.currentBudget, 0);
  const totProjects = (programs.data || []).reduce((a, p) => a + p.projectCount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        io="programs"
        title="Programs"
        subtitle="Coordinated groups of related projects delivering a shared outcome inside a portfolio."
        breadcrumb={["Home", "Programs"]}
        actions={<Button onClick={openCreate} disabled={!portfolios.data?.length}><Plus className="h-4 w-4 mr-1.5" /> New program</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Programs" value={programs.data.length} sub={`${portfolios.data?.length ?? 0} portfolios`} icon={<FolderKanban className="h-4 w-4" />} />
        <StatCard label="Program budget" value={money(totBudget)} sub="Approved envelopes" icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Committed" value={money(totCommitted)} sub={`${num(totBudget ? (totCommitted / totBudget) * 100 : 0, 1)}% of envelopes`} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Projects" value={totProjects} sub="Coordinated delivery units" icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search programs…" className="w-full sm:w-72" />
        <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
          <SelectTrigger className="w-full sm:w-64 h-9 bg-white" aria-label="Filter by portfolio">
            <SelectValue placeholder="Portfolio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All portfolios</SelectItem>
            {(portfolios.data || []).map((pf) => (
              <SelectItem key={pf.id} value={pf.id}>{pf.code} — {pf.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-400 ml-auto">{rows.length} of {programs.data.length}</span>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={rows}
        keyField="id"
        onRowClick={(r) => setDetail(r)}
        emptyTitle="No programs match"
        emptyDescription="Adjust filters or create a program."
      />

      {/* Program drawer: projects under this program */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-slate-400 text-sm">{detail.code}</span>
                  {detail.name}
                  <StatusChip status={detail.status} />
                  <RagBadge rag={detail.ragStatus} score={detail.avgHealthScore} />
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-1">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Portfolio</p><p className="font-medium text-slate-700">{detail.portfolio?.name || "—"}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Owner</p><p className="font-medium text-slate-700">{detail.owner?.name || "—"}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Window</p><p className="text-slate-700">{fmtDate(detail.startDate)} → {fmtDate(detail.endDate)}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">RAG mix</p><p className="text-slate-700">{detail.ragDistribution.GREEN}G / {detail.ragDistribution.AMBER}A / {detail.ragDistribution.RED}R</p></div>
                </div>
                {detail.description && <p className="text-sm text-slate-600">{detail.description}</p>}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Program budget</p>
                    <p className="text-lg font-semibold tabular-nums">{money(detail.budget)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Committed</p>
                    <p className="text-lg font-semibold tabular-nums">{money(detail.totals.currentBudget)}</p>
                    <ProgressBar value={detail.budget ? Math.min((detail.totals.currentBudget / detail.budget) * 100, 100) : 0} className="mt-1.5" />
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Actual / Forecast</p>
                    <p className="text-lg font-semibold tabular-nums">{money(detail.totals.actualCost)}</p>
                    <p className="text-xs text-slate-400">forecast {money(detail.totals.forecastCost)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Projects in this program</p>
                  {!detail.projects.length ? <EmptyState title="No projects yet" description="Move projects into this program from the register." /> : (
                    <div className="rounded-lg border border-slate-200 overflow-auto max-h-72">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0">
                          <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-3 py-2 font-medium">Code</th>
                            <th className="px-3 py-2 font-medium">Project</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">RAG</th>
                            <th className="px-3 py-2 font-medium w-32">Progress</th>
                            <th className="px-3 py-2 font-medium text-right">Budget</th>
                            <th className="px-3 py-2 font-medium text-right">Actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.projects.map((pr) => (
                            <tr
                              key={pr.id}
                              className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-blue-50/50"
                              onClick={() => { window.location.hash = `/projects/${pr.id}`; }}
                            >
                              <td className="px-3 py-2 font-mono text-xs text-slate-500">{pr.code}</td>
                              <td className="px-3 py-2 text-slate-700">{pr.name}</td>
                              <td className="px-3 py-2"><StatusChip status={pr.status} /></td>
                              <td className="px-3 py-2"><RagBadge rag={pr.ragStatus} score={pr.healthScore} /></td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <ProgressBar value={pr.progress} className="flex-1" />
                                  <span className="text-[11px] tabular-nums text-slate-500">{Math.round(pr.progress)}%</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-xs">{money(pr.currentBudget)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-xs">{money(pr.actualCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
                <Button onClick={() => openEdit(detail)}><Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit program" : "New program"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pr-code">Code</Label>
                <Input id="pr-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PRG-XX" disabled={Boolean(form.id)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pr-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="pr-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{["ACTIVE", "DRAFT", "ON_HOLD", "COMPLETED", "CANCELLED"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pr-name">Name</Label>
              <Input id="pr-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pr-portfolio">Portfolio</Label>
              <Select value={form.portfolioId || ""} onValueChange={(v) => setForm({ ...form, portfolioId: v })}>
                <SelectTrigger id="pr-portfolio"><SelectValue placeholder="Select portfolio" /></SelectTrigger>
                <SelectContent>
                  {(portfolios.data || []).map((pf) => (
                    <SelectItem key={pf.id} value={pf.id}>{pf.code} — {pf.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pr-budget">Budget</Label>
                <Input id="pr-budget" type="number" min={0} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pr-start">Start</Label>
                <Input id="pr-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pr-end">End</Label>
                <Input id="pr-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pr-desc">Description</Label>
              <Textarea id="pr-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Create program"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
