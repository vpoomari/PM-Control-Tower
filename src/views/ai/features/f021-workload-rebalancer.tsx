"use client";
// PM CONTROL TOWER — AI Feature f021 · Workload Rebalancer
// Category: Resources & Teams · importance rank 21. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ArrowLeftRight } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "team", label: "Team allocations", type: "textarea", rows: 5, required: true, placeholder: "Ada — 60% API integration, 40% reporting\nBen — 90% migration, 30% on-call rota\nCleo — 45% test automation", hint: "One person per line with every allocation and its percentage." },
  { key: "deadlines", label: "Deadlines & commitments", type: "textarea", rows: 3, placeholder: "Go-live 15 Nov 2026 — migration must finish first\nMonthly board pack due on the 3rd", hint: "Anything that must not slip while you rebalance." },
  { key: "skillNote", label: "Skill constraints", type: "text", placeholder: "e.g. only Ada knows the billing database" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are rebalancing one team's workload from the pasted allocation list; every name, workstream and percentage you are given is a fact.",
  "Use exactly these headings in plain text (no markdown fences, no bold): LOAD ASSESSMENT, OVERLOADED, REDISTRIBUTION, RISK OF THE MOVE, CONVERSATIONS.",
  "LOAD ASSESSMENT gives one line per person: name · total allocated % · judgement (UNDER / AT CAPACITY / OVERLOADED). Sum the percentages given for that person yourself; assume 100% is the maximum sustainable allocation unless the input states otherwise.",
  "OVERLOADED names everyone above 100% with the exact percentage points to shed (total minus 100). If nobody is over 100%, say so plainly and name the two people closest to the limit.",
  "REDISTRIBUTION is 3–5 numbered moves phrased as 'move X% of A's <work> to B', each with one sentence on why B can absorb it; the team total must be conserved — never create or destroy capacity, and never move work to someone already over 100%.",
  "RISK OF THE MOVE gives the knock-on for each move (deadline exposure, quality, single-point-of-knowledge) grounded in the deadlines and skill constraints supplied; when none can be inferred, write 'no knock-on identified from the inputs'.",
  "CONVERSATIONS gives one opening script per person whose allocation changes, max 45 words each, referring only to their own work and percentages.",
  "Never state a capacity, deadline, skill or person that was not supplied — write 'NEEDS DATA: <specific fact>' instead, and never promise a date the inputs do not support.",
].join(" ");

export default function WorkloadRebalancer() {
  const [values, setValues] = useState<Record<string, string>>({
    team: "", deadlines: "", skillNote: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.team.trim()) {
      setError("List at least one person with their allocations so the workload can be assessed.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Team allocations", values.team),
        promptLine("Deadlines & commitments", values.deadlines),
        promptLine("Skill constraints", values.skillNote),
        "",
        "Rebalance this workload now and produce the five sections in order.",
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      const res = await askAIResult(prompt, SYSTEM_PROMPT);
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
    <FeatureFrame
      id="f021"
      rank={21}
      name="Workload Rebalancer"
      tagline="Reads pasted allocations, flags who is over 100% and returns a move-X%-to-Y rebalancing script."
      category="Resources & Teams"
      icon={ArrowLeftRight}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Rebalance workload"
    />
  );
}
