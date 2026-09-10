"use client";
// PM CONTROL TOWER — ADMIN · PMO Template Library (browse, version, apply to projects)

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import {
  PageHeader, SectionCard, Button, Badge, Input, LoadingBlock, ErrorBlock,
  EmptyState, StatusChip, cn,
} from "@/components/pmct/kit";
import { Drawer, DrawerSection, KV } from "../connect/shared/drawer";
import { fromJson, fmtDate, fmtDateTime } from "@/lib/constants";
import {
  LayoutTemplate, Plus, RefreshCw, Rocket, History, Star, GitBranch, Search,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TemplateCategory = "PROJECT" | "PMO" | "DELIVERY";
const CATEGORIES: Array<{ key: TemplateCategory; label: string; blurb: string }> = [
  { key: "PROJECT", label: "Project Templates", blurb: "Full delivery blueprints — applying one scaffolds a complete project" },
  { key: "PMO", label: "PMO Templates", blurb: "Governance artefacts, gate packs and assurance checklists" },
  { key: "DELIVERY", label: "Delivery Templates", blurb: "Phase plans and working patterns for the delivery engine" },
];

interface TemplateVersion {
  id: string; version: string; changelog: string; structureJson: string | null;
  status: string; createdAt: string;
}
interface Template {
  id: string; name: string; category: TemplateCategory; templateType: string | null;
  description: string | null; methodology: string | null; industry: string | null;
  version: string; isActive: boolean; usageCount: number; rating: number | null;
  tags: string | null; versionsCount?: number; versions?: TemplateVersion[];
}

interface TemplateDetail extends Template {
  versions: TemplateVersion[];
}

interface Program { id: string; code: string; name: string }

function structurePhases(structureJson: string | null): string[] {
  const parsed = fromJson<{ phases?: unknown } | null>(structureJson, null);
  return Array.isArray(parsed?.phases) ? (parsed?.phases as string[]).map(String) : [];
}

export default function AdminTemplatesView() {
  const [category, setCategory] = useState<TemplateCategory>("PROJECT");
  const [query, setQuery] = useState("");
  const list = useApi<{ templates: Template[] }>(`/api/templates?category=${category}`);
  useRealtimeRefetch(list.refetch, ["project:created"]);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [applyTemplate, setApplyTemplate] = useState<Template | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const detail = useApi<TemplateDetail>(detailId ? `/api/templates/${detailId}` : null);

  const templates = (list.data?.templates ?? []).filter((t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q) || (t.tags ?? "").toLowerCase().includes(q);
  });

  const catMeta = CATEGORIES.find((c) => c.key === category)!;

  return (
    <div className="space-y-5">
      <PageHeader
        title="PMO Template Library"
        breadcrumb={["Administration", "Templates"]}
        subtitle="Curated, versioned delivery blueprints. Applying a project template scaffolds the WBS, tasks, dependencies, milestones, stage gates and budget lines in one governed action."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={list.refetch}><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> New template</Button>
          </>
        }
      />

      {/* Category tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={cn(
              "rounded-md border px-3.5 py-2 text-sm font-medium transition-colors",
              category === c.key ? "border-[#0b1f3a] bg-[#0b1f3a] text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700",
            )}
          >
            {c.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates…" className="pl-8 h-9 w-56 bg-white" />
        </div>
      </div>
      <p className="text-xs text-slate-500 -mt-2">{catMeta.blurb}</p>

      {list.loading && !list.data ? <LoadingBlock label="Loading template library…" />
        : list.error ? <ErrorBlock message={list.error} onRetry={list.refetch} />
        : templates.length === 0 ? (
          <EmptyState title="No templates in this category" description="Publish your first template to make it available for delivery teams." />
        ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 flex flex-col gap-3 hover:shadow transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><LayoutTemplate className="h-4 w-4 text-blue-600" /></div>
                <div className="flex items-center gap-1.5">
                  {t.version && <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-mono font-normal">v{t.version}</Badge>}
                  {!t.isActive && <StatusChip status="SUPERSEDED" />}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{t.description ?? "No description recorded."}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {t.templateType && <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-normal">{t.templateType.replace(/_/g, " ")}</Badge>}
                {t.methodology && <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-normal">{t.methodology}</Badge>}
                {t.industry && <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-normal">{t.industry}</Badge>}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-auto">
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Star className="h-3 w-3 text-amber-400" /> {t.rating !== null ? Number(t.rating).toFixed(1) : "—"} · used {t.usageCount}×
                  {t.versionsCount !== undefined && <> · {t.versionsCount} version{t.versionsCount === 1 ? "" : "s"}</>}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => setDetailId(t.id)}>
                  <History className="h-3.5 w-3.5 mr-1" /> Details
                </Button>
                {category === "PROJECT" && (
                  <Button size="sm" className="h-8 text-xs flex-1" onClick={() => setApplyTemplate(t)}>
                    <Rocket className="h-3.5 w-3.5 mr-1" /> Use template
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <Drawer open={detailId !== null} onOpenChange={(v) => { if (!v) setDetailId(null); }} title={detail.data?.name ?? "Template"} description={detail.data ? `${detail.data.category} template · v${detail.data.version}` : undefined} wide>
        {detail.loading ? <LoadingBlock /> : detail.error ? <ErrorBlock message={detail.error} onRetry={detail.refetch} /> : !detail.data ? null : (
          <>
            <DrawerSection title="Overview">
              <p className="text-xs text-slate-600 leading-relaxed mb-3">{detail.data.description}</p>
              <KV label="Template type">{detail.data.templateType?.replace(/_/g, " ") ?? "—"}</KV>
              <KV label="Methodology">{detail.data.methodology ?? "—"}</KV>
              <KV label="Industry">{detail.data.industry ?? "—"}</KV>
              <KV label="Current version">v{detail.data.version}</KV>
              <KV label="Rating">{detail.data.rating !== null ? Number(detail.data.rating).toFixed(1) : "—"}</KV>
              <KV label="Applied">{detail.data.usageCount} times</KV>
              <KV label="Tags">{detail.data.tags ?? "—"}</KV>
            </DrawerSection>

            <DrawerSection title="Latest structure (phases)">
              {(() => {
                const latest = detail.data.versions?.[0];
                const phases = structurePhases(latest?.structureJson ?? null);
                return phases.length === 0
                  ? <p className="text-xs text-slate-400">No structured phases published for this template.</p>
                  : (
                    <ol className="space-y-1.5">
                      {phases.map((p, i) => (
                        <li key={i} className="flex items-center gap-2.5 text-xs text-slate-700">
                          <span className="h-5 w-5 rounded-full bg-[#0b1f3a] text-white text-[10px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                          {p.replace(/^\d+[.\s]*/, "")}
                        </li>
                      ))}
                    </ol>
                  );
              })()}
            </DrawerSection>

            <DrawerSection title="Version history">
              {detail.data.versions.map((v) => (
                <div key={v.id} className="rounded-md border border-slate-100 px-3 py-2 mb-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <GitBranch className="h-3.5 w-3.5 text-slate-400" /> v{v.version}
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusChip status={v.status} />
                      <span className="text-[10px] text-slate-400 tabular-nums">{fmtDate(v.createdAt)}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{v.changelog}</p>
                </div>
              ))}
            </DrawerSection>

            <PublishVersionSection
              template={detail.data}
              onPublished={() => { detail.refetch(); list.refetch(); }}
            />
          </>
        )}
      </Drawer>

      <ApplyTemplateDialog
        template={applyTemplate}
        onClose={() => setApplyTemplate(null)}
      />
      <CreateTemplateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => list.refetch()}
      />
    </div>
  );
}

// ---------- publish new version ----------
function PublishVersionSection({ template, onPublished }: {
  template: TemplateDetail; onPublished: () => void;
}) {
  const [version, setVersion] = useState("");
  const [changelog, setChangelog] = useState("");
  const [phases, setPhases] = useState("");
  const [saving, setSaving] = useState(false);

  const suggestNext = (() => {
    const parts = (template.version || "1.0").split(".").map((n) => Number(n) || 0);
    return `${parts[0]}.${(parts[1] ?? 0) + 1}`;
  })();

  const publish = async () => {
    if (version.trim().length < 1) { toast.error("Provide a version label (e.g. 1.3)"); return; }
    if (changelog.trim().length < 3) { toast.error("A changelog entry is required for every published version"); return; }
    const phaseLines = phases.split("\n").map((l) => l.trim()).filter(Boolean);
    setSaving(true);
    try {
      await api.patch(`/api/templates/${template.id}`, {
        version: version.trim(),
        changelog: changelog.trim(),
        ...(phaseLines.length ? { structure: { phases: phaseLines } } : {}),
      });
      toast.success(`Version ${version.trim()} published`, { description: "It is now the active version of this template." });
      setVersion(""); setChangelog(""); setPhases("");
      onPublished();
    } catch (e) {
      toast.error("Could not publish version", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setSaving(false); }
  };

  return (
    <DrawerSection title="Publish new version">
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label className="text-xs text-slate-600">Version</Label>
            <Input value={version} onChange={(e) => setVersion(e.target.value)} className="mt-1 h-9 font-mono" placeholder={suggestNext} />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Changelog</Label>
            <Input value={changelog} onChange={(e) => setChangelog(e.target.value)} className="mt-1 h-9" placeholder="What changed?" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-slate-600">Structure phases (one per line — optional)</Label>
          <Textarea
            value={phases}
            onChange={(e) => setPhases(e.target.value)}
            rows={4}
            className="mt-1 font-mono text-xs"
            placeholder={"1. Initiate\n2. Plan\n3. Execute\n4. Close"}
          />
        </div>
        <Button size="sm" onClick={publish} disabled={saving}>{saving ? "Publishing…" : "Publish version"}</Button>
      </div>
    </DrawerSection>
  );
}

// ---------- apply dialog ----------
function ApplyTemplateDialog({ template, onClose }: {
  template: Template | null; onClose: () => void;
}) {
  const programs = useApi<{ programs?: Program[] } | Program[]>("/api/programs");
  const programList: Program[] = Array.isArray(programs.data) ? programs.data : (programs.data?.programs ?? []);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [programId, setProgramId] = useState("NONE");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const submit = async () => {
    if (!template) return;
    if (code.trim().length < 2) { toast.error("Project code is required (2+ characters)"); return; }
    if (name.trim().length < 2) { toast.error("Project name is required"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        projectCode: code.trim().toUpperCase(),
        projectName: name.trim(),
        ...(programId !== "NONE" ? { programId } : {}),
        ...(budget ? { budget: Number(budget) } : {}),
        ...(startDate ? { startDate: new Date(startDate).toISOString() } : {}),
        ...(endDate ? { endDate: new Date(endDate).toISOString() } : {}),
      };
      const r = await api.post<{ projectId: string; projectCode: string; counts: Record<string, number> }>(
        `/api/templates/${template.id}/apply`, payload,
      );
      setCreatedProjectId(r.projectId);
      const countsSummary = r.counts
        ? Object.entries(r.counts).map(([k, v]) => `${v} ${k.replace(/([A-Z])/g, " $1").toLowerCase()}`).join(", ")
        : "";
      toast.success(`Project ${r.projectCode} created from "${template.name}"`, {
        description: `Scaffolded: ${countsSummary}`.slice(0, 220),
        action: r.projectId ? { label: "Open project", onClick: () => { window.location.hash = `/projects/${r.projectId}`; onClose(); } } : undefined,
        duration: 8000,
      });
      // keep dialog open showing success + link
    } catch (e) {
      toast.error("Template application failed", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={template !== null} onOpenChange={(v) => { if (!v) { setCreatedProjectId(null); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Use template — {template?.name}</DialogTitle>
          <DialogDescription>
            Applies v{template?.version} via the template application engine: phases become summary WBS with work packages,
            chained dependencies, stage gates and a category-split budget.
          </DialogDescription>
        </DialogHeader>

        {createdProjectId ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center space-y-2.5">
            <Rocket className="h-6 w-6 text-emerald-600 mx-auto" />
            <p className="text-sm font-semibold text-emerald-800">Project scaffolded successfully</p>
            <p className="text-xs text-emerald-700">Code <span className="font-mono">{code.toUpperCase()}</span> — “{name.trim()}”</p>
            <Button
              size="sm"
              onClick={() => { window.location.hash = `/projects/${createdProjectId}`; setCreatedProjectId(null); onClose(); }}
            >
              Open the new project
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-600">Project code</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 h-9 font-mono" placeholder="PRJ-TPL-950" />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">Budget (optional)</Label>
                  <Input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} className="mt-1 h-9" placeholder="e.g. 500000" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-600">Project name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9" placeholder="e.g. Data Platform Wave 2" />
              </div>
              <div>
                <Label className="text-xs text-slate-600">Program (optional)</Label>
                <Select value={programId} onValueChange={setProgramId}>
                  <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— Standalone project —</SelectItem>
                    {programList.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-600">Start (optional)</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 h-9" />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">Target end (optional)</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 h-9" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">Leave dates empty to default to today → +180 days. The code must be unique — duplicates are rejected.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "Applying template…" : "Apply template"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------- create template ----------
function CreateTemplateDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("PROJECT");
  const [templateType, setTemplateType] = useState("");
  const [description, setDescription] = useState("");
  const [methodology, setMethodology] = useState("HYBRID");
  const [industry, setIndustry] = useState("");
  const [tags, setTags] = useState("");
  const [phases, setPhases] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) { toast.error("Template name is required"); return; }
    const phaseLines = phases.split("\n").map((l) => l.trim()).filter(Boolean);
    setSaving(true);
    try {
      await api.post("/api/templates", {
        name: name.trim(),
        category,
        templateType: templateType.trim() || undefined,
        description: description.trim() || undefined,
        methodology: methodology || undefined,
        industry: industry.trim() || undefined,
        tags: tags.trim() || undefined,
        ...(phaseLines.length ? { structure: { phases: phaseLines } } : {}),
      });
      toast.success("Template created", { description: "Version 1.0 published — teams can apply it immediately." });
      onOpenChange(false);
      setName(""); setTemplateType(""); setDescription(""); setIndustry(""); setTags(""); setPhases("");
      onCreated();
    } catch (e) {
      toast.error("Could not create template", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>Publishes version 1.0 with an initial structure definition.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9" placeholder="e.g. Regulatory Reporting Program" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
                <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Template type</Label>
              <Input value={templateType} onChange={(e) => setTemplateType(e.target.value.toUpperCase())} className="mt-1 h-9 font-mono" placeholder="SOFTWARE_IMPLEMENTATION" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Methodology</Label>
              <Select value={methodology} onValueChange={setMethodology}>
                <SelectTrigger className="h-9 mt-1 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["WATERFALL", "AGILE", "HYBRID"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-600">Industry</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} className="mt-1 h-9" placeholder="e.g. Financial services" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Tags (comma-separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1 h-9" placeholder="regulatory,data" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Structure phases (one per line)</Label>
            <Textarea value={phases} onChange={(e) => setPhases(e.target.value)} rows={4} className="mt-1 font-mono text-xs" placeholder={"1. Initiate\n2. Plan\n3. Execute\n4. Close"} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create template"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
