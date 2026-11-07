// PM CONTROL TOWER — agent narration: turns deterministic findings into a short
// executive summary. AI-first, heuristic fallback — the narration source is
// recorded on every run (AI | HEURISTIC) so nothing is ever mislabelled.

import { askAISystem } from "@/lib/ai/ai-service";
import type { AgentDefinition, AgentFinding, AgentRunResult } from "./types";

export interface Narration {
  text: string;
  source: "AI" | "HEURISTIC";
  tokens: number;
}

const SYSTEM = [
  "You are the narration layer of an enterprise PMO agent inside PM Control Tower.",
  "Summarise ONLY the supplied findings — never invent metrics, dates or names.",
  "Maximum 120 words, plain text, professional tone, lead with the most severe item.",
  "If there are no findings, write one short sentence saying all clear.",
].join(" ");

function heuristic(def: AgentDefinition, result: AgentRunResult): string {
  if (!result.findings.length) return `${def.name}: all clear — no findings this run.`;
  const worst = result.findings.reduce((a, b) =>
    b.severity === "CRITICAL" || (b.severity === "WARNING" && a.severity === "INFO") ? b : a
  );
  const tail = result.findings.length > 1 ? ` (+${result.findings.length - 1} more)` : "";
  return `${result.findings.length} finding(s) · worst: [${worst.severity}] ${worst.title}${tail}.`;
}

/**
 * Narrate a run. NEVER throws — any AI failure falls back to the deterministic
 * heuristic line above, so a missing key/quota/network cannot break a run.
 */
export async function narrate(
  def: AgentDefinition,
  result: AgentRunResult
): Promise<Narration> {
  const fallback: Narration = { text: heuristic(def, result), source: "HEURISTIC", tokens: 0 };
  try {
    const facts = result.findings.slice(0, 40).map((f: AgentFinding) => ({
      severity: f.severity, title: f.title, detail: f.detail ?? null, ref: f.ref ?? null,
    }));
    const prompt = [
      `Agent: ${def.name} (${def.role}).`,
      `Run summary: ${result.summary}`,
      `Findings (${result.findings.length}): ${JSON.stringify(facts)}`,
    ].join("\n");
    const res = await askAISystem(prompt, SYSTEM, `agent:${def.key}`);
    if (res.status !== "ok" || !res.text.trim()) return fallback;
    return { text: res.text.trim(), source: "AI", tokens: res.tokens ?? 0 };
  } catch {
    return fallback;
  }
}
