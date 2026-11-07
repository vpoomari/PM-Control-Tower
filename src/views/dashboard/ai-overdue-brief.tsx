"use client";
// PM CONTROL TOWER — Example B: overdue items → AI executive brief (dashboard)
// Takes the overdue milestone/project list the dashboard already renders and
// asks the central Server Action (askAIResult) for a short, data-grounded
// summary. Explicit button-trigger so BYOK quota is never spent silently.

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Button } from "@/components/pmct/kit";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";

export interface OverdueItem {
  id: string;
  name: string;
  dueDate: string;
  projectCode?: string;
}

const SYSTEM_CONTEXT = [
  "You are the PMO analyst of an enterprise project management platform (PM Control Tower).",
  "Given a list of overdue schedule items, write a brief executive summary (max 120 words):",
  "(1) what is overdue and for how long, (2) the most likely delivery impact,",
  "(3) 2-3 concrete recommended actions as one compact line each.",
  "Strictly use the provided data — never invent dates, names or figures.",
  "Plain text with short lines; no markdown headers, no emoji.",
].join(" ");

function dayLag(dueDate: string): number {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - due.getTime()) / 86_400_000));
}

export function AiOverdueBrief({ items }: { items: OverdueItem[] }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);

  // Nothing overdue → the dashboard already states the schedule is healthy.
  if (items.length === 0) return null;

  const run = async () => {
    setBusy(true);
    try {
      const prompt = [
        `Overdue schedule items (${items.length}):`,
        ...items.map((i) => {
          const lag = dayLag(i.dueDate);
          return `- ${i.name}${i.projectCode ? ` [${i.projectCode}]` : ""} — due ${i.dueDate.slice(0, 10)} (${lag}d overdue)`;
        }),
        "",
        "Write the executive brief.",
      ].join("\n");

      const res = await askAIResult(prompt, SYSTEM_CONTEXT);
      setResult(res);
    } catch (e) {
      setResult({
        status: "server",
        fallback: true,
        text: e instanceof Error ? e.message : "The AI request failed unexpectedly.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3" aria-busy={busy}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Executive brief
        </p>
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={run} disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {busy ? "Summarizing…" : result ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {/* Loading — polite announcement + skeleton lines */}
      {busy && (
        <div className="space-y-1.5" role="status" aria-live="polite" aria-label="AI is summarizing overdue items">
          {[86, 72, 60].map((w, i) => (
            <div key={i} className="h-3 rounded bg-slate-100 animate-pulse" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {/* Brief */}
      {!busy && result && !result.fallback && (
        <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2.5" role="status" aria-live="polite">
          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{result.text}</p>
          <p className="text-[10px] text-slate-400 mt-1.5">
            AI-generated from the {items.length} overdue item{items.length === 1 ? "" : "s"} on this dashboard · {result.provider} · {result.durationMs} ms
          </p>
        </div>
      )}

      {/* Honest fallback — no key / invalid key / rate limit / provider down */}
      {!busy && result?.fallback && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2" role="status" aria-live="polite">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-amber-800">{result.text}</p>
        </div>
      )}
    </div>
  );
}
