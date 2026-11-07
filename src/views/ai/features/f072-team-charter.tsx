"use client";
// PM CONTROL TOWER — AI Feature f072 · Team Charter Drafter
// Category: Resources & Teams · importance rank 72. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { NotebookPen } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "team", label: "Team", type: "text", required: true, placeholder: "e.g. Platform Squad · 7 engineers · reports to Delivery Manager" },
  { key: "mission", label: "Mission", type: "textarea", rows: 3, placeholder: "What the team exists to deliver, in one or two sentences…", hint: "If empty, a draft mission is proposed and marked for confirmation." },
  { key: "constraints", label: "Constraints", type: "text", placeholder: "e.g. Hybrid Tue–Thu · no meetings Fri afternoon · shared with squad 2" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Draft a team charter as a set of one-line agreements the team can read aloud and sign as written. Plain text only: no markdown fences, no bold, no tables.",
  "Use exactly these headings, in this order: TEAM & MISSION, WAYS OF WORKING, DECISION RULES, MEETING DIET, DEFINITION OF DONE, CONFLICT ROUTE, CELEBRATION, CONSTRAINTS TO RESPECT.",
  "WAYS OF WORKING states working hours, shared overlap time and response-time expectations as single agreements that each start with 'We '. If the team name or constraints do not say, write 'NEEDS DATA: working hours' instead of guessing.",
  "DECISION RULES gives one line per recurring decision type (scope change, estimate disagreement, release go/no-go) naming the mechanism: who decides, who is consulted, who is informed — use role labels only, never invented names.",
  "MEETING DIET lists the recurring meetings kept with day, duration and purpose, plus any meeting to drop — maximum 6 lines. DEFINITION OF DONE is 5–7 checkable statements. CONFLICT ROUTE is exactly 3 steps (talk directly → leader mediates → sponsor decides). CELEBRATION is one realistic ritual, not a slogan.",
  "If no mission was supplied, draft one sentence from the team name and constraints and mark it 'DRAFT MISSION — team to confirm'. Apply every stated constraint under CONSTRAINTS TO RESPECT, one line each.",
  "Every agreement is one line and starts with 'We '. Total under 450 words; neutral, practical, non-judgemental language; never invent people, headcount, tooling, dates or policies.",
].join(" ");

export default function TeamCharterDrafter() {
  const [values, setValues] = useState<Record<string, string>>({
    team: "", mission: "", constraints: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.team.trim()) {
      setError("Team is required.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Team", values.team),
        promptLine("Mission", values.mission),
        promptLine("Constraints", values.constraints),
        "",
        "Draft the signable team charter now.",
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
      id="f072"
      rank={72}
      name="Team Charter Drafter"
      tagline="Signable one-line agreements on hours, decisions, meetings, done, conflict and celebration."
      category="Resources & Teams"
      icon={NotebookPen}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft team charter"
    />
  );
}
