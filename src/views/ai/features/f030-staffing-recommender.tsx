"use client";
// PM CONTROL TOWER — AI Feature f030 · Staffing Recommender
// Category: Resources & Teams · importance rank 30. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Handshake } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "roles", label: "Roles needed", type: "textarea", rows: 4, required: true, placeholder: "Data engineer — 12 weeks from January\nSecurity reviewer — 3 weeks, ongoing\nScrum facilitator — 6 weeks", hint: "One role per line with the weeks needed." },
  { key: "profile", label: "Current team skills", type: "textarea", rows: 4, placeholder: "2 React devs (mid), 1 BA, 1 QA lead; no cloud or security experience in the team" },
  { key: "mode", label: "Sourcing preference", type: "select", options: [
    { value: "Internal", label: "Internal" },
    { value: "Balanced", label: "Balanced" },
    { value: "Mix", label: "Mix" },
  ] },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You are recommending how to source each requested role; the role list, weeks needed, current team profile and sourcing preference supplied are the only facts you have.",
  "Use exactly these headings in plain text (no markdown fences, no bold): SOURCING RECOMMENDATIONS, BUY VS TRAIN, RAMP-UP, CRITICAL ROLE, NEXT ACTIONS.",
  "SOURCING RECOMMENDATIONS is a plain-text table: role · weeks needed · recommended source (internal move / contract / new hire) · why it fits the supplied team profile · ramp-up in weeks.",
  "The sourcing preference constrains the recommendation: 'Internal' allows only internal moves or reallocation; 'Balanced' prefers internal first and uses contract only where no internal skill exists; 'Mix' picks the cheapest viable source per role. If internal coverage is impossible for a role under the chosen preference, say so explicitly.",
  "BUY VS TRAIN lists each capability gap as 'capability · buy or train · reason', using only skills stated in the profile; a skill not mentioned in the profile is 'unknown', not absent — write 'NEEDS DATA: <skill>' rather than assuming a gap.",
  "RAMP-UP gives one line per role with the ramp-up in weeks and the single dependency that would slow it; ramp-up must not exceed the weeks requested for that role unless you explain why in one sentence.",
  "CRITICAL ROLE names exactly one role whose absence would hurt most, with the reasoning tied to the supplied weeks and profile, plus who could cover it if anyone.",
  "NEXT ACTIONS is 3 numbered steps the PM can take this week. Never quote salary, rate, day-cost, notice period or market availability — none were supplied; write 'NEEDS DATA: <commercial figure>' instead. Total length under 450 words.",
].join(" ");

export default function StaffingRecommender() {
  const [values, setValues] = useState<Record<string, string>>({
    roles: "", profile: "", mode: "Balanced",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.roles.trim()) {
      setError("List the roles you need with their weeks — the recommendations are built from them.");
      return;
    }
    if (!["Internal", "Balanced", "Mix"].includes(values.mode)) {
      setError("Choose a sourcing preference: Internal, Balanced or Mix.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Roles needed", values.roles),
        promptLine("Current team skills", values.profile),
        promptLine("Sourcing preference", values.mode),
        "",
        "Recommend the staffing plan now with the five sections in order.",
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
      id="f030"
      rank={30}
      name="Staffing Recommender"
      tagline="Recommends internal, contract or hire per role with ramp-up and the one role you cannot lose."
      category="Resources & Teams"
      icon={Handshake}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Recommend staffing"
    />
  );
}
