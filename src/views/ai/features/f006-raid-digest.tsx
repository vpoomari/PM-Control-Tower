"use client";
// PM CONTROL TOWER — AI Feature f006 · RAID Digest for Steering
// Category: Risk & RAID · importance rank 6. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { ClipboardList } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "raid", label: "RAID rows", type: "textarea", rows: 7, required: true, placeholder: "Paste the register — one item per line:\nR-01 Supplier lead time 12 weeks · OPEN · Owner A · Due 04 Nov\nI-03 Data extract incomplete · IN_PROGRESS · Owner B" },
  { key: "audience", label: "Audience", type: "select", options: [
    { value: "Steering committee", label: "Steering committee" },
    { value: "PMO review", label: "PMO review" },
    { value: "Sponsor", label: "Sponsor" },
    { value: "Delivery team", label: "Delivery team" },
  ] },
  { key: "meetingDate", label: "Meeting date", type: "date" },
  { key: "movement", label: "What changed since last digest", type: "textarea", rows: 2, placeholder: "Optional: escalated, closed, new, scored up…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Condense a pasted RAID register into a one-page digest for the stated audience.",
  "Use these headings in plain text: TOP THREATS (max 5, each: ref · one-line statement · why it matters now · the ask), ISSUES NEEDING A DECISION (max 3, each with the decision and by-when if a date is present), MOVEMENT (what changed, only from the supplied movement note — if none was given write 'No change recorded'), STALE OR UNOWNED (any row missing an owner or a date, or flagged here; list it, never fix it silently), ASKS OF THIS AUDIENCE (max 3, one line each).",
  "Rank strictly by what could stop delivery, not by alphabetical or input order.",
  "Use each row's own reference and wording where supplied; never add items that are not in the pasted rows.",
].join(" ");

export default function RaidDigestForSteering() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", raid: "", audience: "Steering committee", meetingDate: "", movement: "",
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
        promptLine("Project", values.project),
        promptLine("Audience", values.audience),
        promptLine("Meeting date", values.meetingDate),
        promptLine("Movement since last digest", values.movement),
        "",
        "Register rows:",
        values.raid.trim(),
        "",
        "Produce the one-page digest now.",
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
      id="f006"
      rank={6}
      name="RAID Digest for Steering"
      tagline="Compresses a pasted RAID register into the one page a steering committee actually reads."
      category="Risk & RAID"
      icon={ClipboardList}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Build RAID digest"
    />
  );
}
