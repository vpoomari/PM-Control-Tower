"use client";
// PM CONTROL TOWER — INTELLIGENCE · AI Feature Studio
// The catalogue surface for all 100 AI features: search + category/priority
// filters on the left, the selected feature (lazily imported) on the right.
// One live project fetch feeds the StudioProvider so every feature can ground
// its prompt in the real project register instead of free text.

import { Suspense, lazy, useMemo, useState, type ComponentType } from "react";
import { useApi } from "@/lib/client";
import { LoadingBlock } from "@/components/pmct/kit";
import { Filter, Search, Sparkles, X } from "lucide-react";
import { CATEGORIES, type CategoryId, type FeaturePriority } from "./meta";
import { FEATURES, LOADERS } from "./catalog";
import { StudioProvider, type StudioProject } from "./frame";

const PRIORITIES: FeaturePriority[] = ["P0", "P1", "P2"];

// One lazy wrapper per registered feature, created once at module scope: the
// actual chunk only loads when the feature is shown, and each selection mounts
// a fresh instance (state never leaks between features).
const FEATURE_COMPONENTS: Record<string, ComponentType> = Object.fromEntries(
  Object.entries(LOADERS).map(([id, loader]) => [id, lazy(loader)]),
);

interface ProjectListResponse {
  items: Array<{ code: string; name: string; status?: string }>;
}

function chip(active: boolean): string {
  return [
    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors motion-reduce:transition-none",
    active
      ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
      : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200",
  ].join(" ");
}

export default function AiFeaturesView() {
  const projectsQuery = useApi<ProjectListResponse>("/api/projects?take=200");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [priority, setPriority] = useState<FeaturePriority | "all">("all");
  const [selected, setSelected] = useState<string>(FEATURES[0]?.id ?? "f001");

  const studioValue = useMemo<StudioProject[]>(
    () =>
      (projectsQuery.data?.items ?? []).map((p) => ({
        code: p.code,
        name: p.name,
        status: p.status,
      })),
    [projectsQuery.data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FEATURES.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (priority !== "all" && f.priority !== priority) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.tagline.toLowerCase().includes(q) ||
        f.id.includes(q)
      );
    });
  }, [query, category, priority]);

  const active = FEATURES.find((f) => f.id === selected) ?? FEATURES[0];
  const Feature = FEATURE_COMPONENTS[active.id] ?? null;

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setPriority("all");
  };

  const studioProjects: StudioProject[] = studioValue;
  const contextValue = {
    projects: studioProjects,
    loaded: !projectsQuery.loading,
    error: projectsQuery.error,
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      {/* ---------- Header ---------- */}
      <div className="border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Intelligence · AI Feature Studio
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
              100 AI features for project managers
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-400">
              One bring-your-own-key provider powers the whole studio — every feature runs only when
              you press its button, is grounded in the inputs you supply, and returns an honest
              fallback when a key, quota or network is missing. Ranked by importance: f001 is the
              capability this platform most needs.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-slate-400">
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1">
              {filtered.length} / {FEATURES.length} shown
            </span>
            <span className="text-slate-500">
              {FEATURES.filter((f) => f.priority === "P0").length} P0 ·{" "}
              {FEATURES.filter((f) => f.priority === "P1").length} P1 ·{" "}
              {FEATURES.filter((f) => f.priority === "P2").length} P2
            </span>
          </div>
        </div>

        {/* ---------- Toolbar ---------- */}
        <div className="mt-4 space-y-2.5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <label htmlFor="studio-search" className="sr-only">
              Search the 100 AI features
            </label>
            <input
              id="studio-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search features — e.g. risk, sprint, budget, brief…"
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 motion-reduce:transition-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
            <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-500">
              <Filter className="h-3.5 w-3.5" aria-hidden="true" /> Category
            </span>
            <button type="button" className={chip(category === "all")} aria-pressed={category === "all"} onClick={() => setCategory("all")}>
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={chip(category === c.id)}
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by priority">
            <span className="mr-0.5 text-[11px] uppercase tracking-wide text-slate-500">Priority</span>
            <button type="button" className={chip(priority === "all")} aria-pressed={priority === "all"} onClick={() => setPriority("all")}>
              All
            </button>
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={chip(priority === p)}
                aria-pressed={priority === p}
                onClick={() => setPriority(p)}
              >
                {p}
              </button>
            ))}
            {(query || category !== "all" || priority !== "all") && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-1 inline-flex items-center gap-1 rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:border-rose-400/60 hover:text-rose-200 motion-reduce:transition-none"
              >
                <X className="h-3 w-3" aria-hidden="true" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Body ---------- */}
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-12">
        {/* Grid */}
        <div className="lg:col-span-5 xl:col-span-4">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-200">No feature matches those filters</p>
              <p className="mt-1 text-xs text-slate-500">
                Try a different word, or clear the category and priority filters.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-200 motion-reduce:transition-none"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {filtered.map((f) => {
                const Icon = f.icon;
                const isActive = f.id === active.id;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setSelected(f.id)}
                      className={[
                        "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none",
                        isActive
                          ? "border-cyan-400/60 bg-cyan-500/10"
                          : "border-slate-800 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-900",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                          isActive
                            ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300"
                            : "border-slate-700 bg-slate-950 text-slate-400",
                        ].join(" ")}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                            {f.id}
                          </span>
                          <span
                            className={[
                              "rounded px-1 py-px text-[9px] font-semibold",
                              f.priority === "P0"
                                ? "bg-rose-500/15 text-rose-300"
                                : f.priority === "P1"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-slate-700/60 text-slate-300",
                            ].join(" ")}
                          >
                            {f.priority}
                          </span>
                        </span>
                        <span className="block truncate text-sm font-medium text-slate-100">{f.name}</span>
                        <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-slate-500">
                          {f.tagline}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-7 xl:col-span-8">
          <StudioProvider value={contextValue}>
            {Feature ? (
              <Suspense fallback={<LoadingBlock label="Loading feature…" />}>
                <Feature key={active.id} />
              </Suspense>
            ) : (
              <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                This feature is not registered in the catalogue yet.
              </div>
            )}
          </StudioProvider>
        </div>
      </div>
    </div>
  );
}
