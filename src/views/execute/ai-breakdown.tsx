"use client";
// PM CONTROL TOWER — Example A: Kanban task → AI sub-task breakdown
// Calls the central Server Action (askAIResult) with the task title and gets
// 3 sub-tasks back. Loading, honest fallback, and parse guards are built in —
// the component never crashes when the key is missing/invalid/rate-limited.

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import { extractJsonArray, type AIResult } from "@/lib/ai/shared";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, ListChecks, AlertTriangle } from "lucide-react";

export interface AiBreakdownTask {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

const SYSTEM_CONTEXT = [
  "You are a senior delivery lead inside an enterprise project management tool (PM Control Tower).",
  "Break the given work item into exactly 3 concrete, independently executable sub-tasks in execution order.",
  "Each sub-task: max 12 words, action-first (start with a verb), scoped to one deliverable.",
  "Reply with ONLY a JSON array of exactly 3 strings — no prose, no markdown, no numbering.",
].join(" ");

export function AiBreakdown({ task }: { task: AiBreakdownTask }) {
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [result, setResult] = useState<AIResult | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const prompt = [
        `Task ${task.code}: ${task.name}`,
        task.description ? `Description: ${task.description.slice(0, 600)}` : null,
        "",
        "Break this task into exactly 3 sub-tasks.",
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      const res = await askAIResult(prompt, SYSTEM_CONTEXT);
      if (res.status === "ok") {
        const parsed = extractJsonArray(res.text);
        if (!parsed || parsed.length === 0) {
          setSteps([]);
          setResult({ ...res, status: "invalid_response", fallback: true, text: "The model replied in an unexpected format — run it again." });
        } else {
          setSteps(parsed.slice(0, 5));
          setResult(res);
        }
      } else {
        setSteps([]);
        setResult(res);
      }
    } catch (e) {
      setSteps([]);
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={run} disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {busy ? "Breaking down…" : steps.length ? "Regenerate" : "Break into 3 sub-tasks"}
        </Button>
        {steps.length > 0 && !busy && (
          <span className="text-[10px] text-slate-400 inline-flex items-center gap-1">
            <ListChecks className="h-3 w-3" /> {steps.length} suggested
          </span>
        )}
      </div>

      {/* Loading skeleton — announced politely to assistive tech */}
      {busy && (
        <div className="space-y-1.5" role="status" aria-live="polite" aria-label="AI is breaking down this task">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2">
              <span className="h-4 w-4 shrink-0 rounded bg-slate-200 animate-pulse" />
              <span className="h-3 rounded bg-slate-200 animate-pulse" style={{ width: `${68 - i * 9}%` }} />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!busy && steps.length > 0 && (
        <ol className="space-y-1.5" aria-label="AI-suggested sub-tasks">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-2.5 py-2">
              <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">
                {i + 1}
              </span>
              <span className="text-xs text-slate-700 leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      )}
      {!busy && steps.length > 0 && (
        <p className="text-[10px] text-slate-400">AI suggestion — review and adapt before creating these in the plan.</p>
      )}

      {/* Honest fallback — no key / rejected key / rate limit / provider down */}
      {!busy && result?.fallback && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2" role="status" aria-live="polite">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-amber-800">{result.text}</p>
        </div>
      )}
    </div>
  );
}
