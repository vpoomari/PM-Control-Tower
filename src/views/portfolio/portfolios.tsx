"use client";
// PM CONTROL TOWER — Portfolios: rich card grid with investment bars + create/edit dialogs

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, LoadingBlock, ErrorBlock, EmptyState, StatCard, StatusChip, RagBadge,
  ProgressBar, Toolbar, SearchInput, Button, ConfirmButton,
} from "@/components/pmct/kit";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, num, fmtDate } from "@/lib/constants";
import { Plus, Pencil, Wallet, FolderKanban, TrendingUp, Landmark, Users } from "lucide-react";

interface Owner { id: string; name: string; avatarColor: string }
interface ProgramSummary { id: string; code: string; name: string; status: string; healthScore: number; ragStatus: string }
interface ProjectSummary {
  id: string; code: string; name: string; status: string; healthScore: number; ragStatus: string;
  progress: number; currentBudget: number; actualCost: number; forecastCost: number;
}
interface Portfolio {
  id: string; code: string; name: string; description: string | null; status: string;
  ownerId: string | null; owner: Owner | null; strategicObjective: string | null;
  budgetTarget: number; totals: { currentBudget: number; actualCost: number; forecastCost: number };
  currency: string; startDate: string | null; endDate: string | null;
  healthScore: number; ragStatus: string; avgHealthScore: number;
  programCount: number; projectCount: number;
  ragDistribution: { GREEN: number; AMBER: number; RED: number };
  programs: ProgramSummary[]; projects: ProjectSummary[];
}
interface UsersBundle { users: { id: string; name: string; isActive: boolean }[] }

interface FormState {
  id?: string; code: string; name: string; description: string; ownerId: string;
  budgetTarget: string; startDate: string; endDate: string; strategicObjective: string; status: string;
}
const EMPTY_FORM: FormState = { code: "", name: "", description: "", ownerId: "", budgetTarget: "", startDate: "", endDate: "", strategicObjective: "", status: "ACTIVE" };

export default function PortfoliosView() {
  const portfolios = useApi<Portfolio[]>("/api/portfolios");
  const users = useApi<UsersBundle>("/api/admin/users");
  useRealtimeRefetch(portfolios.refetch, ["project:created", "project:updated", "project:health"]);

  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detail, setDetail] = useState<Portfolio | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const list = portfolios.data || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => `${p.code} ${p.name} ${p.owner?.name || ""}`.toLowerCase().includes(q));
  }, [portfolios.data, query]);

  const openCreate = () => { setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (p: Portfolio) => {
    setForm({
      id: p.id, code: p.code, name: p.name, description: p.description || "",
      ownerId: p.ownerId || "", budgetTarget: p.budgetTarget ? String(p.budgetTarget) : "",
      startDate: p.startDate ? p.startDate.slice(0, 10) : "", endDate: p.endDate ? p.endDate.slice(0, 10) : "",
      strategicObjective: p.strategicObjective || "", status: p.status,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (form.code.trim().length < 2) { toast.error("Code must be at least 2 characters"); return; }
    if (form.name.trim().length < 2) { toast.error("Name must be at least 2 characters"); return; }
    setSaving(true);
    try {
      const body = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        ownerId: form.ownerId || null,
        budgetTarget: form.budgetTarget === "" ? undefined : Number(form.budgetTarget),
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        strategicObjective: form.strategicObjective.trim() || null,
        status: form.status,
      };
      if (form.id) {
        await api.patch(`/api/portfolios/${form.id}`, body);
        toast.success("Portfolio updated");
      } else {
        await api.post("/api/portfolios", body);
        toast.success("Portfolio created");
      }
      setDialogOpen(false);
      await portfolios.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Portfolio) => {
    try {
      await api.del(`/api/portfolios/${p.id}`);
      toast.success("Portfolio deleted");
      setDetail(null);
      await portfolios.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (portfolios.loading) return <LoadingBlock label="Loading portfolios…" />;
  if (portfolios.error || !portfolios.data) return <ErrorBlock message={portfolios.error || "Portfolios unavailable"} onRetry={portfolios.refetch} />;

  const totTarget = portfolios.data.reduce((a, p) => a + p.budgetTarget, 0);
  const totCurrent = portfolios.data.reduce((a, p) => a + p.totals.currentBudget, 0);
  const totActual = portfolios.data.reduce((a, p) => a + p.totals.actualCost, 0);
  const totForecast = portfolios.data.reduce((a, p) => a + p.totals.forecastCost, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        io="portfolios"
        title="Portfolios"
        subtitle="Investment envelope, strategic alignment and delivery health across the enterprise change portfolio."
        breadcrumb={["Home", "Portfolios"]}
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> New portfolio</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Budget target" value={money(totTarget)} sub={`${portfolios.data.length} portfolios`} icon={<Landmark className="h-4 w-4" />} />
        <StatCard label="Committed budget" value={money(totCurrent)} sub={`${num(totTarget ? (totCurrent / totTarget) * 100 : 0, 1)}% of target`} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Actual spend" value={money(totActual)} sub={`${num(totCurrent ? (totActual / totCurrent) * 100 : 0, 1)}% consumed`} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Forecast" value={money(totForecast)} tone={totForecast > totCurrent ? "bad" : "good"} sub={totForecast > totCurrent ? `${money(totForecast - totCurrent)} over committed` : `${money(totCurrent - totForecast)} headroom`} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search portfolios by code, name or owner…" className="w-full sm:w-80" />
        <span className="text-xs text-slate-400 ml-auto">{rows.length} of {portfolios.data.length}</span>
      </Toolbar>

      {!rows.length ? (
        <EmptyState title="No portfolios match" description="Adjust the search or create your first portfolio." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((p) => {
            const committedPct = p.budgetTarget ? Math.min((p.totals.currentBudget / p.budgetTarget) * 100, 100) : 0;
            const actualPct = p.totals.currentBudget ? (p.totals.actualCost / p.totals.currentBudget) * 100 : 0;
            const forecastOver = p.totals.forecastCost > p.budgetTarget;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setDetail(p)}
                className="text-left rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-blue-200 transition-all p-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                aria-label={`Open portfolio ${p.name}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] text-slate-400">{p.code}</p>
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{p.name}</h3>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusChip status={p.status} />
                    <RagBadge rag={p.ragStatus} score={p.avgHealthScore ?? p.healthScore} />
                  </div>
                </div>

                {p.strategicObjective && (
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">{p.strategicObjective}</p>
                )}

                <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><FolderKanban className="h-3.5 w-3.5" /> {p.projectCount} projects</span>
                  <span className="flex items-center gap-1"><Landmark className="h-3.5 w-3.5" /> {p.programCount} programs</span>
                  <span className="flex items-center gap-1 ml-auto"><Users className="h-3.5 w-3.5" /> {p.owner?.name || "Unassigned"}</span>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Committed of {money(p.budgetTarget)} target</span>
                    <span className="font-medium tabular-nums text-slate-700">{money(p.totals.currentBudget)}</span>
                  </div>
                  <ProgressBar value={committedPct} tone="blue" />
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                    <span>Actual {money(p.totals.actualCost)} · {num(actualPct, 0)}% consumed</span>
                    <span className={forecastOver ? "text-red-600 font-medium" : ""}>Forecast {money(p.totals.forecastCost)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
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
                {detail.description && <p className="text-sm text-slate-600">{detail.description}</p>}
                {detail.strategicObjective && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Strategic objective</p>
                    <p className="text-sm text-slate-700">{detail.strategicObjective}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Owner</p><p className="font-medium text-slate-700">{detail.owner?.name || "—"}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Window</p><p className="text-slate-700">{fmtDate(detail.startDate)} → {fmtDate(detail.endDate)}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">RAG mix</p><p className="text-slate-700">{detail.ragDistribution.GREEN}G / {detail.ragDistribution.AMBER}A / {detail.ragDistribution.RED}R</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Avg health</p><p className="font-semibold tabular-nums text-slate-700">{num(detail.avgHealthScore, 1)}</p></div>
                </div>
                {detail.programs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Programs</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.programs.map((g) => (
                        <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs">
                          <span className="font-mono text-slate-400">{g.code}</span> {g.name}
                          <RagBadge rag={g.ragStatus} />
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {detail.projects.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Projects</p>
                    <div className="rounded-lg border border-slate-200 overflow-auto max-h-56">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0">
                          <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-3 py-2 font-medium">Code</th>
                            <th className="px-3 py-2 font-medium">Project</th>
                            <th className="px-3 py-2 font-medium">RAG</th>
                            <th className="px-3 py-2 font-medium text-right">Budget</th>
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
                              <td className="px-3 py-2"><RagBadge rag={pr.ragStatus} score={pr.healthScore} /></td>
                              <td className="px-3 py-2 text-right tabular-nums text-xs">{money(pr.currentBudget)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2">
                <ConfirmButton variant="outline" title={`Delete ${detail.code}?`} description="Portfolios with programs or projects are protected by the server." confirmLabel="Delete" onConfirm={() => remove(detail)}>
                  <Button variant="outline" className="text-red-600 hover:bg-red-50">Delete</Button>
                </ConfirmButton>
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
            <DialogTitle>{form.id ? "Edit portfolio" : "New portfolio"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pf-code">Code</Label>
                <Input id="pf-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PTF-XX" disabled={Boolean(form.id)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-status">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="pf-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{["ACTIVE", "DRAFT", "ON_HOLD", "COMPLETED", "CANCELLED"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-name">Name</Label>
              <Input id="pf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enterprise Digital Transformation" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-owner">Owner</Label>
              <Select value={form.ownerId || "none"} onValueChange={(v) => setForm({ ...form, ownerId: v === "none" ? "" : v })}>
                <SelectTrigger id="pf-owner"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Unassigned —</SelectItem>
                  {(users.data?.users || []).filter((u) => u.isActive).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pf-budget">Budget target</Label>
                <Input id="pf-budget" type="number" min={0} value={form.budgetTarget} onChange={(e) => setForm({ ...form, budgetTarget: e.target.value })} placeholder="0" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-start">Start</Label>
                <Input id="pf-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pf-end">End</Label>
                <Input id="pf-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-desc">Description</Label>
              <Textarea id="pf-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-objective">Strategic objective</Label>
              <Textarea id="pf-objective" rows={2} value={form.strategicObjective} onChange={(e) => setForm({ ...form, strategicObjective: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Create portfolio"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
