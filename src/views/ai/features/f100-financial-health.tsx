"use client";
// PM CONTROL TOWER — AI Feature f100 · Financial Health Summary
// Category: Cost & Finance · importance rank 100. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).
// Every ratio, variance and EAC quoted below is computed here, deterministically
// and client-side, exactly as f004 does — the model only narrates the figures.

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Gauge } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "budget", label: "Approved budget", type: "text", required: true, placeholder: "e.g. 1,250,000", hint: "Number only — £, $, € and thousand separators are stripped." },
  { key: "spent", label: "Spent to date", type: "text", required: true, placeholder: "e.g. 840,000", hint: "Same currency and unit as the budget." },
  { key: "forecast", label: "Forecast at completion", type: "text", placeholder: "e.g. 1,310,000", hint: "Leave blank if there is no forecast yet." },
  { key: "evm", label: "CPI / SPI if known", type: "text", placeholder: "e.g. CPI 0.94 · SPI 0.98", hint: "Format: CPI <number> · SPI <number>. Leave blank when unknown." },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "The client has already computed every ratio, variance and EAC you receive — quote those figures exactly as given: do not recompute, do not round them differently, do not derive any further ratio of your own.",
  "Write the finance paragraph for a steering committee in plain text (no markdown fences) with these headings: POSITION AT COMPLETION, BURN VS PLAN, BIGGEST COST RISK, CONFIDENCE, CONTROL TO TIGHTEN.",
  "POSITION AT COMPLETION uses the forecast and the computed forecast variance; BURN VS PLAN uses the computed % of budget spent and the computed remaining budget. When no forecast was supplied, say the position at completion cannot be stated and write 'NEEDS DATA: forecast at completion'.",
  "BIGGEST COST RISK is one risk drawn only from the supplied context; if no context was supplied, write 'NEEDS DATA: cost risk commentary' instead of speculating.",
  "CONFIDENCE is HIGH/MEDIUM/LOW with one reason tied to the supplied CPI/SPI or to the absence of a forecast; CONTROL TO TIGHTEN is exactly one control, named concretely (for example weekly EAC re-baselining or a change-control gate).",
  "Use a currency symbol only if one was supplied in the inputs. Total under 350 words.",
].join(" ");

const toAmount = (v: string): number | null => {
  const cleaned = v.replace(/[£$€,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const money = (n: number): string => n.toLocaleString("en-GB", { maximumFractionDigits: 0 });

export default function FinancialHealthSummary() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", budget: "", spent: "", forecast: "", evm: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);

    const budget = toAmount(values.budget);
    if (budget === null || budget <= 0) {
      setError("Approved budget must be a number greater than zero, e.g. 1,250,000.");
      return;
    }
    const spent = toAmount(values.spent);
    if (spent === null || spent < 0) {
      setError("Spent to date must be a number of zero or more, e.g. 840,000.");
      return;
    }

    const rawForecast = values.forecast.trim();
    let forecast: number | null = null;
    if (rawForecast !== "") {
      const parsed = toAmount(rawForecast);
      if (parsed === null || parsed <= 0) {
        setError("Forecast at completion must be a number greater than zero, e.g. 1,310,000.");
        return;
      }
      forecast = parsed;
    }

    const rawEvm = values.evm.trim();
    const cpiMatch = rawEvm.match(/CPI\s*[:=]?\s*([0-9]*\.?[0-9]+)/i);
    const spiMatch = rawEvm.match(/SPI\s*[:=]?\s*([0-9]*\.?[0-9]+)/i);
    if (rawEvm !== "" && !cpiMatch && !spiMatch) {
      setError("CPI / SPI must be written with a number, e.g. CPI 0.94 · SPI 0.98 — or leave it blank.");
      return;
    }
    const cpi = cpiMatch ? Number(cpiMatch[1]) : null;
    const spi = spiMatch ? Number(spiMatch[1]) : null;
    const evmLine = [
      cpi !== null && cpi > 0 ? `CPI ${cpi}` : null,
      spi !== null && spi > 0 ? `SPI ${spi}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join(" · ");

    setBusy(true);
    setResult(null);
    try {
      // --- deterministic client-side maths: the model narrates, it never computes ---
      const pctSpent = (spent / budget) * 100;
      const remaining = budget - spent;
      const variance = forecast === null ? null : forecast - budget;
      const variancePct = variance === null ? null : (variance / budget) * 100;
      const headroom = forecast === null ? null : budget - forecast;
      const toComplete = forecast === null ? null : forecast - spent;
      const eac = cpi !== null && cpi > 0 ? budget / cpi : null;
      const sign = (n: number) => (n >= 0 ? "+" : "-");

      const positionLine =
        variance !== null && variancePct !== null && headroom !== null && toComplete !== null
          ? `forecast vs budget ${sign(variance)}${money(Math.abs(variance))} (${sign(variancePct)}${Math.abs(variancePct).toFixed(1)}%) · headroom ${money(headroom)} · still to spend ${money(toComplete)}`
          : "forecast not supplied — position at completion cannot be stated";

      const prompt = [
        promptLine("Project", values.project),
        promptLine("Supplied figures", `budget ${values.budget.trim()} · spent ${values.spent.trim()}${rawForecast ? ` · forecast ${rawForecast}` : ""}`),
        promptLine("EVM as supplied", rawEvm),
        promptLine(
          "Computed for you",
          [
            `% of budget spent ${pctSpent.toFixed(1)}%`,
            `remaining budget ${money(remaining)}`,
            positionLine,
            eac !== null ? `EAC from supplied CPI ${eac.toFixed(2)} = ${money(eac)}` : null,
            evmLine ? `parsed EVM ${evmLine}` : null,
          ]
            .filter((line): line is string => line !== null)
            .join(" · "),
        ),
        "",
        "Write the finance paragraph for steering now: position at completion, burn vs plan, the biggest cost risk, confidence, and the one control to tighten.",
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
      id="f100"
      rank={100}
      name="Financial Health Summary"
      tagline="Ratios computed locally, then a steering-grade read on burn, forecast, confidence and control."
      category="Cost & Finance"
      icon={Gauge}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Summarise financial health"
    />
  );
}
