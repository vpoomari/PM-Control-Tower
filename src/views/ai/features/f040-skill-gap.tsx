"use client";
// PM CONTROL TOWER — AI Feature f040 · Skill Gap Analysis
// Category: Resources & Teams · importance rank 40. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { GraduationCap } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "team", label: "Programme or team", type: "text", placeholder: "e.g. Data Migration workstream, 9 people" },
  { key: "needs", label: "Capabilities needed", type: "textarea", rows: 5, required: true, placeholder: "One capability per line, with the level if known:\nSnowflake data modelling — working\nSQL performance tuning — working\nGDPR transfer assessments — aware\nStakeholder facilitation — working", hint: "What the programme requires, not who it expects to supply it." },
  { key: "current", label: "Current team skills", type: "textarea", rows: 5, required: true, placeholder: "Person or group with their level (none / aware / working / expert):\nA. Khan — SQL expert, no Snowflake\nJ. Reyes — working modelling, no GDPR\nP. Nowak — aware of SQL, strong facilitation", hint: "Copy the levels you already have — they are not re-rated here." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Compare the capabilities the programme needs with the team's current skills and plan how to close the gap within 90 days.",
  "Use these headings in plain text: GAP MATRIX (one line per capability: capability · needed level · current level · gap — copy the capability wording from the inputs; when nobody holds it write 'not held', when no level was stated write 'level not stated'), CRITICAL VS DEVELOPABLE (split the gaps into CRITICAL = blocking delivery inside 90 days and DEVELOPABLE = the rest, with the reason for each classification), 90-DAY DEVELOPMENT PLAN (grouped Days 1–30, 31–60, 61–90; each action names capability · owner role · the cheapest intervention — shadowing, pair work, internal session, e-learning, certification or hire — and how completion is evidenced).",
  "Count only what the inputs state: use the levels supplied, never rate a person yourself, and mark a capability that is absent from the current skills as 'not held' rather than assuming it exists somewhere in the team.",
  "Rank by delivery impact first and cost second; where two gaps compete for the same person, say which one waits and why. If a capability has no stated level on either side, flag it as a data gap instead of scoring it.",
  "Total length under 500 words.",
].join(" ");

export default function SkillGapAnalysis() {
  const [values, setValues] = useState<Record<string, string>>({
    team: "", needs: "", current: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.needs.trim().length < 20 || values.current.trim().length < 20) {
      setError("List both the capabilities needed and the current team skills — the gap sits between them.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Programme or team", values.team),
        "",
        "Capabilities needed:",
        values.needs.trim(),
        "",
        "Current team skills:",
        values.current.trim(),
        "",
        "Produce the gap matrix and the 90-day development plan now.",
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
      id="f040"
      rank={40}
      name="Skill Gap Analysis"
      tagline="Maps needed capabilities against current skills, then plans the cheapest fix per gap in 90 days."
      category="Resources & Teams"
      icon={GraduationCap}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Analyse skill gaps"
    />
  );
}
