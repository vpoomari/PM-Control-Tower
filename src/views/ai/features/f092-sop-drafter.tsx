"use client";
// PM CONTROL TOWER — AI Feature f092 · SOP Drafter
// Category: Documents & Knowledge · importance rank 92. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { FileCog } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "process", label: "The process to document", type: "textarea", rows: 6, required: true, placeholder: "How purchase-order approval works today: buyer raises it in the ERP, finance checks the budget line, category manager approves above £25k, buyer releases the order…", hint: "Rough notes are fine — order, systems and who does what matter most." },
  { key: "roles", label: "Roles involved", type: "text", placeholder: "e.g. Buyer · Finance reviewer · Category manager", hint: "One per line or separated with ·" },
  { key: "controls", label: "Controls & compliance", type: "textarea", rows: 3, placeholder: "e.g. Four-eyes approval above 50k, segregation of duties, monthly audit-trail export", hint: "Leave empty if there are no formal controls yet." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Draft a numbered standard operating procedure for the supplied workflow, in plain text with no markdown fences and no preamble.",
  "Use exactly these sections: 1 PURPOSE (2 sentences on why it exists), 2 SCOPE (what is in and out, from the inputs only), 3 ROLES & RESPONSIBILITIES (one line per supplied role), 4 INPUTS & OUTPUTS, 5 PROCEDURE, 6 EXCEPTIONS, 7 CONTROL POINTS, 8 REVISION HISTORY.",
  "Section 5 numbers each step 5.1, 5.2 … and every step carries an action verb, the system or hand-off named in the inputs, an owner role, and a duration such as '10 min' or '1 working day' — where no timing was supplied write 'TIMING NEEDED'.",
  "Roles may only come from the roles input; a step that needs an unsupplied role is written 'ROLE NEEDED: <function>'. Section 7 maps only to the supplied controls — never invent a control, threshold or approval limit.",
  "Section 6 covers the exceptions the inputs describe and flags 'EXCEPTION NEEDED: <scenario>' for the ones a reviewer will demand but the inputs do not describe.",
  "Section 8 is a placeholder row 'version · date · author · change' with the first line left blank for the operator to fill.",
  "Imperative mood, auditor-ready tone, no advice outside this procedure. Total under 900 words.",
].join(" ");

export default function SopDrafter() {
  const [values, setValues] = useState<Record<string, string>>({
    process: "", roles: "", controls: "",
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
        promptLine("Process", values.process),
        promptLine("Roles", values.roles),
        promptLine("Controls & compliance", values.controls),
        "",
        "Draft the numbered SOP now: purpose, scope, roles, inputs & outputs, step-by-step procedure with timings, exceptions, control points and a revision-history placeholder.",
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
      id="f092"
      rank={92}
      name="SOP Drafter"
      tagline="Drafts a numbered SOP with roles, timings, exceptions, control points and a revision block."
      category="Documents & Knowledge"
      icon={FileCog}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft the SOP"
    />
  );
}
