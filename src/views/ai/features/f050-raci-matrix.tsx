"use client";
// PM CONTROL TOWER — AI Feature f050 · RACI Matrix Drafter
// Category: Resources & Teams · importance rank 50. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Grid3X3 } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  {
    key: "deliverables",
    label: "Deliverables",
    type: "textarea",
    rows: 6,
    required: true,
    placeholder: "One per line:\nBaseline schedule\nMonthly cost report\nUAT sign-off\nGo-live cutover\nBenefits report",
    hint: "Work packages, reports and decisions — anything that needs a clear owner.",
  },
  {
    key: "people",
    label: "Roles",
    type: "textarea",
    rows: 4,
    required: true,
    placeholder: "One role per line:\nProject manager\nDelivery lead\nBusiness analyst\nFinance partner\nSite manager",
    hint: "Roles, not names — the matrix is handed over and people change.",
  },
  { key: "note", label: "Governance note", type: "text", placeholder: "Optional: e.g. sponsor signs off anything above £50k; site manager owns UAT" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "You build a RACI matrix from a list of deliverables and a list of roles so a delivery team knows exactly who decides.",
  "Output exactly these headings in plain text: MATRIX, CONFLICTS, HAND-OFFS.",
  "MATRIX is a text table with one row per deliverable (row label trimmed to 40 characters) and one column per supplied role; the first row is the column header using short role names, and every other cell holds exactly one letter — R, A, C or I. Use a space or '-' only where the operator's governance note clearly makes the role irrelevant, and say so in one line under MATRIX.",
  "Every deliverable needs exactly one Accountable: where a row has zero or multiple Accountable cells, still print the row, mark the suspect cells 'A?' and list the row under CONFLICTS with the decision required to settle it.",
  "CONFLICTS also lists any deliverable that clearly needs a role which was not supplied, written as 'MISSING ROLE: <what is needed>'; only the roles the operator listed may become columns — never invent a person, role or deliverable, and never borrow an Accountable from another row silently.",
  "HAND-OFFS gives exactly 3 hand-offs most likely to fail, each naming the two roles involved, what must be agreed and by when; if the matrix is too wide, abbreviate the role headers to initials and add a one-line key beneath it.",
  "Plain text output, no markdown fences, total under 500 words.",
].join(" ");

export default function RaciMatrixDrafter() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", deliverables: "", people: "", note: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    const deliverables = values.deliverables.split(/\r?\n/).filter((l) => l.trim() !== "");
    const roles = values.people.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (deliverables.length === 0) {
      setError("List at least one deliverable, one per line.");
      return;
    }
    if (roles.length < 2) {
      setError("List at least two roles, one per line — a RACI needs columns to compare.");
      return;
    }
    if (deliverables.length * roles.length > 400) {
      setError(`That matrix is ${deliverables.length} × ${roles.length} cells — trim the list to at most 400 cells so nothing is summarised away.`);
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("Deliverables (one per line)", values.deliverables),
        promptLine("Roles (one per line)", values.people),
        promptLine("Governance note", values.note),
        "",
        "Build the RACI matrix now, flag every row that breaks the one-Accountable rule, and name the three riskiest hand-offs.",
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
      id="f050"
      rank={50}
      name="RACI Matrix Drafter"
      tagline="Builds the deliverable × role matrix with one Accountable per row and flags the hand-offs that break."
      category="Resources & Teams"
      icon={Grid3X3}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Draft RACI matrix"
    />
  );
}
