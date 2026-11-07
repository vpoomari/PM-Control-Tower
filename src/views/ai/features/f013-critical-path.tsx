"use client";
// PM CONTROL TOWER — AI Feature f013 · Critical Path Explainer
// Category: Plan & Schedule · importance rank 13. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Route } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "chain",
    label: "Dependencies & durations",
    type: "textarea",
    rows: 6,
    required: true,
    placeholder: "A Design (5d) → B Build (10d) → D Deploy (2d)\nA → C Test data (4d) → D\nE is parallel to B and C",
    hint: "Activity, duration in working days and predecessor links — one link per line.",
  },
  { key: "today", label: "Today's date", type: "date", hint: "Used only to state the earliest finish from today." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Parse the supplied chain exactly as written — activities, durations in working days, predecessor links — and analyse it as a precedence network; do not add, drop or re-time any activity.",
  "Use exactly these plain-text headings: CRITICAL PATH, PATH FLOAT, NEAR-CRITICAL, WHAT MOVES THE FINISH DATE, DATA NEEDED.",
  "CRITICAL PATH lists the longest chain activity by activity with its total duration; PATH FLOAT gives one line per parallel path — path · total duration · total float = critical total − path total — and shows both sums so the arithmetic is auditable.",
  "NEAR-CRITICAL lists every path whose float is 5 working days or less (or states that none qualify) and names the near-critical activities; WHAT MOVES THE FINISH DATE is exactly 3 ranked levers, each tied to a named activity and its duration.",
  "If today's date was supplied, state the earliest finish date assuming the remaining chain starts today and 5 working days per week, and flag that working-week assumption explicitly.",
  "Never state a float, duration or date that cannot be derived from the supplied chain; anything absent goes under DATA NEEDED instead of being estimated.",
  "Maximum 350 words.",
].join(" ");

export default function CriticalPathExplainer() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "",
    chain: "",
    today: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!/\d/.test(values.chain)) {
      setError("Each activity needs a duration in working days, e.g. 'B Build (10d)'.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Dependencies & durations", values.chain),
        promptLine("Today", values.today),
        "",
        "Identify the critical path, float per path and the three levers on the finish date now.",
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
      id="f013"
      rank={13}
      name="Critical Path Explainer"
      tagline="Finds the longest chain, floats every parallel path and names the three levers on the finish date."
      category="Plan & Schedule"
      icon={Route}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Explain critical path"
    />
  );
}
