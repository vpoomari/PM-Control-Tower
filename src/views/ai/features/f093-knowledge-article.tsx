"use client";
// PM CONTROL TOWER — AI Feature f093 · Knowledge Article Writer
// Category: Documents & Knowledge · importance rank 93. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { FileText } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "howto", label: "What the article must teach", type: "textarea", rows: 6, required: true, placeholder: "How to unlock a frozen SSO account: admin opens Entra ID → the user → clears sign-in sessions, user re-authenticates with MFA, help-desk confirms on the ticket…", hint: "The real steps in the order you would perform them." },
  { key: "audience", label: "Audience", type: "text", placeholder: "e.g. First-line support desk, non-technical managers" },
  { key: "system", label: "System or tool", type: "text", placeholder: "e.g. ServiceNow HRSD · Entra ID" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Write a knowledge article for the stated audience and system, in plain text with no markdown fences and no preamble.",
  "Use exactly these headings: SUMMARY, PREREQUISITES, STEPS, COMMON ERRORS, STILL STUCK?",
  "SUMMARY is exactly 2 sentences. PREREQUISITES is a '-' list of the access, permissions, information and open tickets the reader needs before starting — only ones the inputs support.",
  "STEPS numbers actions 1., 2. … one action per step, naming only screens, fields, roles and systems that appear in the input; each step ends with the expected result after a dash.",
  "COMMON ERRORS holds up to 5 'symptom → fix' lines grounded in the supplied steps; if the input reveals no errors, write 'NEEDS DATA: actual error messages from the support log' rather than inventing failures.",
  "STILL STUCK? gives the escalation route from the inputs, or 'NEEDS DATA: escalation route or owning team' when none was supplied.",
  "Write in the vocabulary of the stated audience, never describe a step the input does not contain, and never promise a turnaround time that was not given. Total under 600 words.",
].join(" ");

export default function KnowledgeArticleWriter() {
  const [values, setValues] = useState<Record<string, string>>({
    howto: "", audience: "", system: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("What the article must teach", values.howto),
        promptLine("Audience", values.audience),
        promptLine("System or tool", values.system),
        "",
        "Write the knowledge article now: summary, prerequisites, numbered steps with expected results, common errors with fixes, and the still-stuck escalation route.",
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
      id="f093"
      rank={93}
      name="Knowledge Article Writer"
      tagline="Writes a step-by-step knowledge article with prerequisites, error fixes and an escalation route."
      category="Documents & Knowledge"
      icon={FileText}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Write the article"
    />
  );
}
