"use client";
// PM CONTROL TOWER — AI Feature f062 · Communications Plan
// Category: Strategy & Stakeholders · importance rank 62. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Megaphone } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "map", label: "Stakeholders or groups", type: "textarea", rows: 4, required: true, placeholder: "One per line:\nSteering committee\nAmina Rahman — CFO\nDelivery team\nImpacted end users", hint: "The audiences the plan must cover." },
  { key: "cadence", label: "Cadence", type: "text", placeholder: "e.g. Weekly steering pack, monthly all-hands, daily during cutover" },
  { key: "channels", label: "Channels", type: "text", placeholder: "e.g. Email, steering pack, Teams channel, intranet page" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "Build a communications plan matrix from the audiences listed in the input.",
  "Use these plain-text headings (no markdown fences, no bold): COMMUNICATION MATRIX, ESCALATION PATH, NEVER INFORMAL, GROUNDING NOTES.",
  "COMMUNICATION MATRIX is a pipe-separated table, one row per audience: audience · message · channel · frequency · owner role · feedback loop — every cell filled, rows in descending order of influence.",
  "Take frequency from the cadence input and channel from the channels input; where an audience needs one that was not supplied, propose a standard PM vehicle and mark it '(proposed)' rather than presenting it as agreed fact.",
  "Each feedback loop says how the audience replies and by when; each owner is a role, never an invented person.",
  "ESCALATION PATH is a numbered sequence: trigger → who is informed → within how long → who decides.",
  "NEVER INFORMAL names the single message that must always be documented (vehicle + owner) and the risk of leaving it casual. Where an audience cannot be planned, write 'NEEDS DATA: <what>' instead of guessing; never invent tool names, meeting names or metrics. Total length under 450 words.",
].join(" ");

export default function CommunicationsPlan() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", map: "", cadence: "", channels: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const audiences = values.map.split("\n").filter((line) => line.trim()).length;
    if (audiences < 1) {
      setError("Add at least one stakeholder or group to plan communications for.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Stakeholders or groups (one per line)", values.map),
        promptLine("Cadence", values.cadence),
        promptLine("Channels", values.channels),
        "",
        "Build the communications plan now.",
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
      id="f062"
      rank={62}
      name="Communications Plan"
      tagline="Turns a stakeholder list into a message-channel-cadence matrix with a clear escalation path."
      category="Strategy & Stakeholders"
      icon={Megaphone}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft comms plan"
    />
  );
}
