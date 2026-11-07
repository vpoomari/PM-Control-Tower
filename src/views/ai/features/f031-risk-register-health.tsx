"use client";
// PM CONTROL TOWER — AI Feature f031 · Risk Register Health Check
// Category: Risk & RAID · importance rank 31. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ClipboardCheck } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "register", label: "Risk register rows", type: "textarea", rows: 7, required: true, placeholder: "Paste the rows exactly as they appear — one per line:\nR-14 Supplier lead time 12 weeks · Score 4×3 · Owner: — · Raised 03 Feb · Updated 04 Mar\nR-22 Testing environment unavailable · Score 5×4 · Owner J. Reyes · Raised 12 Mar\nI-07 Data extract incomplete · OPEN · Owner A. Khan · Updated 01 Oct", hint: "Keep every column that exists: ref, wording, score, owner, dates, status." },
  { key: "asOf", label: "Review as at", type: "date", hint: "Used to judge staleness — defaults to today." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Audit a pasted risk register for data-quality and judgement defects — review the register exactly as written; this is not a risk brainstorm and you may not add risks that are not on the rows.",
  "Use these headings in plain text (no markdown fences): FINDINGS (one line per problem: ref · problem type · what is wrong in that row · the exact fix to apply), DUPLICATE CANDIDATES (rows describing the same event, each pair with keep / merge / retire advice), RISKS THAT ARE NOW ISSUES (rows whose wording says the event has already happened), STALE ITEMS (rows with no update date, or last updated before the as-at date), REGISTER QUALITY (a 0–100 score, one sentence of justification, and the three fixes that would raise it most).",
  "Problem types to check for, named exactly on each line: missing owner, missing or implausible dates, score that contradicts the description, status that contradicts the wording, closed item left open, duplicate, threat written as an issue, score outside the 1–5 scale.",
  "Quote each row's own reference and wording; never re-score, re-date or re-word a row — report the inconsistency and hand back the fix instead.",
  "Score bands: 90–100 decision-ready, 70–89 usable once fixed, 50–69 unreliable for governance, below 50 rebuild the register before the next steering meeting.",
  "If rows arrive without references, number them 1, 2, 3… in the order pasted. Total length under 450 words.",
].join(" ");

export default function RiskRegisterHealthCheck() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", register: "", asOf: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (values.register.trim().length < 20) {
      setError("Paste the register rows — at least one full row with its columns.");
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Review as at", values.asOf),
        "",
        "Risk register rows:",
        values.register.trim(),
        "",
        "Audit the register and produce the findings now.",
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
      id="f031"
      rank={31}
      name="Risk Register Health Check"
      tagline="Audits a pasted risk register for missing owners, dates, stale rows and contradictory scores."
      category="Risk & RAID"
      icon={ClipboardCheck}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Check register health"
    />
  );
}
