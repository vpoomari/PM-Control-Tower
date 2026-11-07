"use client";
// PM CONTROL TOWER — Administration → Settings → Tab Visibility.
// PMO/Admin-only screen listing EVERY navigation tab in the tool (one row per
// tab, grouped exactly like the sidebar). Tick = the tab is visible in the
// sidebar; untick = hidden from the sidebar. Hiding is display-only: routes,
// deep links, the command palette, global search, exports and all APIs keep
// working — no linkage is ever broken. Changes are saved explicitly, audited,
// and pushed live to every open session via the "admin:changed" event.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, useApi, useRealtimeRefetch } from "@/lib/client";
import { NAV } from "@/components/pmct/nav-items";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/pmct/kit";
import { Eye, EyeOff, Save, RotateCcw, Info } from "lucide-react";

interface VisibilityPayload {
  hidden: string[];
  totalTabs?: number;
}

export default function TabVisibilityView() {
  const vis = useApi<VisibilityPayload>("/api/admin/nav-visibility");
  const [draft, setDraft] = useState<Set<string> | null>(null); // hidden hrefs
  const [saving, setSaving] = useState(false);

  useRealtimeRefetch(vis.refetch, ["admin:changed"]);

  const serverHidden = useMemo(() => new Set(vis.data?.hidden ?? []), [vis.data]);

  // Sync the draft from the server — but never clobber unsaved admin edits.
  useEffect(() => {
    if (vis.data && draft === null) setDraft(new Set(vis.data.hidden));
  }, [vis.data, draft]);

  const total = NAV.reduce((n, g) => n + g.items.length, 0);
  const hiddenCount = draft?.size ?? 0;
  const isDirty = draft
    ? [...draft].some((h) => !serverHidden.has(h)) || [...serverHidden].some((h) => !draft.has(h))
    : false;

  const toggle = (href: string) => {
    setDraft((prev) => {
      const next = new Set(prev ?? serverHidden);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  const setGroupVisible = (hrefs: string[], visible: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev ?? serverHidden);
      for (const h of hrefs) {
        if (visible) next.delete(h);
        else next.add(h);
      }
      return next;
    });
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await api.patch("/api/admin/nav-visibility", { hidden: [...draft] });
      toast.success(
        draft.size === 0
          ? "All tabs are visible again"
          : `${draft.size} tab${draft.size === 1 ? "" : "s"} hidden from the sidebar`
      );
      vis.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (vis.loading && !vis.data) return <LoadingBlock label="Loading tab visibility…" />;
  if (vis.error) return <ErrorBlock message={vis.error} />;
  if (draft === null) return <LoadingBlock label="Preparing tab list…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5 text-sm text-slate-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p>
            <strong>Tick</strong> a tab to show it in the sidebar, <strong>untick</strong> to hide it.
            Hiding is display-only — hidden tabs keep working through direct links, the command
            palette, search and exports; nothing else changes. Applies to{" "}
            <strong>every user</strong>; changes are audited and go live immediately.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={hiddenCount ? "default" : "secondary"} className="whitespace-nowrap">
            {total - hiddenCount} of {total} visible
          </Badge>
          <Button variant="outline" size="sm" onClick={() => setDraft(new Set())} disabled={hiddenCount === 0 || saving}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Show all
          </Button>
          <Button size="sm" onClick={save} disabled={!isDirty || saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {NAV.map((group) => {
        const hrefs = group.items.map((i) => i.href);
        const groupHidden = hrefs.filter((h) => draft.has(h)).length;
        const allVisible = groupHidden === 0;
        const GroupIcon = group.icon;
        return (
          <section key={group.label} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <span style={{ color: group.accent }} aria-hidden="true">
                  <GroupIcon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-slate-800">{group.label}</span>
                <span className="text-xs text-slate-400">
                  {group.items.length - groupHidden}/{group.items.length} visible
                </span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setGroupVisible(hrefs, !allVisible)}>
                {allVisible ? "Hide all" : "Show all"}
              </Button>
            </header>
            <ul className="divide-y divide-slate-100">
              {group.items.map((item) => {
                const isHidden = draft.has(item.href);
                return (
                  <li key={item.href} className={isHidden ? "flex items-center gap-3 bg-slate-50/50 px-4 py-2" : "flex items-center gap-3 px-4 py-2"}>
                    <Checkbox
                      id={`tabvis-${item.href}`}
                      checked={!isHidden}
                      onCheckedChange={() => toggle(item.href)}
                      aria-label={`Show ${item.label} in sidebar`}
                    />
                    <label htmlFor={`tabvis-${item.href}`} className="flex min-w-0 cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <item.icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{item.label}</span>
                      <code className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">#{item.href}</code>
                    </label>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5" title={isHidden ? "Hidden from sidebar" : "Visible in sidebar"}>
                      {isHidden ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Hidden</span>
                        </>
                      ) : (
                        <Eye className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="text-xs text-slate-400">
        Saved to Admin Settings · every change is written to the audit trail (entity
        <code className="mx-1">AdminConfig:NavVisibility</code>) with the acting user.
      </p>
    </div>
  );
}
