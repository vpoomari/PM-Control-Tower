"use client";
// PM CONTROL TOWER — AI Feature f073 · Conflict Resolution Coach
// Category: Resources & Teams · importance rank 73. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Handshake } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "situation", label: "What is happening", type: "textarea", rows: 6, required: true, placeholder: "Describe the conflict factually: who disagrees, over what, since when, what has already been tried…", hint: "Facts only — the coach stays neutral and cannot use what is not here." },
  { key: "parties", label: "Parties", type: "text", placeholder: "e.g. Delivery Lead vs Tech Lead (use roles, not names, if you prefer)" },
  { key: "power", label: "Your relationship to the parties", type: "select", options: [
    { value: "Peer", label: "Peer" },
    { value: "Superior", label: "Superior" },
    { value: "Subordinate", label: "Subordinate" },
  ] },
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Act as a neutral mediation coach preparing a project manager to run a conflict conversation. Take no side, assign no blame, and stay plain text: no markdown fences, no bold, no tables.",
  "Use exactly these headings, in this order: NEUTRAL FRAMING, UNDERLYING INTERESTS, PREPARATION, 5-STEP CONVERSATION SCRIPT, ESCALATION POINT.",
  "NEUTRAL FRAMING gives two paragraphs of equal length and tone — SIDE A and SIDE B — describing each position from the supplied situation in observable facts only; never label either side as right, difficult or uncooperative.",
  "UNDERLYING INTERESTS gives at most 2 bullets per side stating what that party needs rather than what they argue for; mark any bullet not stated in the input with 'INFERRED — confirm'.",
  "PREPARATION lists 3 short lines for the manager: the goal of the meeting, the facts to have to hand, and the opening sentence to use.",
  "The 5-STEP CONVERSATION SCRIPT is word-for-word, numbered 1 to 5: open neutrally, hear side A, hear side B, test shared interest and generate options, agree the next step. Each step carries one spoken line in quotation marks, one follow-up question, and a one-line purpose — write for a real conversation, 6–8 lines per step.",
  "Tailor the script's language to the power relationship supplied: Peer uses equal, direct wording; Superior prepares the manager to raise the concern upward without accusation; Subordinate opens with questions before any statement and protects psychological safety.",
  "ESCALATION POINT names when to stop mediating (policy breach, harassment, safety, a formal grievance) and the escalation route by role — only from the supplied facts; otherwise write 'ESCALATION POINT: NEEDS DATA: escalation route in this organisation'. Total under 500 words; use role labels only, never invented names, dates, witnesses or performance ratings.",
].join(" ");

export default function ConflictResolutionCoach() {
  const [values, setValues] = useState<Record<string, string>>({
    situation: "", parties: "", power: "Peer", project: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    if (!values.situation.trim()) {
      setError("What is happening is required.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("What is happening", values.situation),
        promptLine("Parties", values.parties),
        promptLine("Relationship to the parties", values.power),
        promptLine("Project", values.project),
        "",
        "Coach the mediation conversation now.",
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
      id="f073"
      rank={73}
      name="Conflict Resolution Coach"
      tagline="Neutral framing of both sides, their interests and a five-step mediation script."
      category="Resources & Teams"
      icon={Handshake}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Coach the conversation"
    />
  );
}
