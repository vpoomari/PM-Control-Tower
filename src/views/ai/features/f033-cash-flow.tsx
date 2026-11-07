"use client";
// PM CONTROL TOWER — AI Feature f033 · Cash Flow Forecast
// Category: Cost & Finance · importance rank 33. The arithmetic happens here
// (line parsing + running balance, deterministic, client-side) and the model
// only interprets the finished table — cash figures are never left to the LLM
// to add up.

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { Banknote } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects", hint: "Live list from the project register." },
  { key: "opening", label: "Opening balance", type: "number", required: true, placeholder: "e.g. 250000", hint: "Cash available at the start of the window. Negative if already drawn down." },
  { key: "payments", label: "Payment lines", type: "textarea", rows: 6, required: true, placeholder: "One payment per line — month then amount, nothing else on the line:\nOct 2026 45,000\nNov 2026 120,500\nDec 2026 30,000\nJan 2027 88,000", hint: "Commas for thousands. Year optional — but give it to every line or to none." },
  { key: "inflows", label: "Inflows", type: "textarea", rows: 3, placeholder: "Optional — same format, money in:\nNov 2026 150,000" },
  { key: "notes", label: "Contract & timing notes", type: "textarea", rows: 3, placeholder: "Optional: 30-day terms, milestone billing on go-live, supplier will move the December invoice…" },
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  "The application has already parsed the payment lines and computed every figure you receive — the month-by-month table, the totals and the low point are fact; never re-add them, never correct them and never do arithmetic in prose, quote the computed numbers exactly as printed.",
  "Use these headings in plain text: READING OF THE TABLE (2–3 sentences on how the balance moves and whether the window ends with more or less cash than it opened with), PEAK FUNDING REQUIREMENT (the computed low point and its month, the funding amount that implies, and the month the balance first turns negative — if it never turns negative, say so), TIMING RISK (max 3 bullets: the tightest months and what in the supplied lines or notes would push money into them), WHAT TO RENEGOTIATE FIRST (ranked: item or month · why first · the lever — payment terms, milestone billing, drawdown or phasing — each grounded in a supplied line), DATA GAPS (what you would need that was not supplied).",
  "Work only from the computed table and the supplied lines: a month with no lines is 'no commitments recorded' rather than assumed spend, and no interest rate, discount, indexation or supplier term may be introduced unless it appears in the supplied notes.",
  "Total length under 400 words.",
].join(" ");

// ---------------------------------------------------------------------------
// Deterministic arithmetic: parse "month amount" lines, bucket them, run the
// balance. Nothing below is ever delegated to the model.
// ---------------------------------------------------------------------------

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MONTH_LOOKUP: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sept: 8, sep: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const MONTH_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b/i;

const AMOUNT_RE = /-?\d[\d,]*(?:\.\d+)?/g;

interface CashLine {
  year: number | null;
  month: number;
  amount: number;
}

interface ParsedCash {
  lines: CashLine[];
  error: string | null;
}

function parseCash(raw: string, kind: string): ParsedCash {
  const rows = raw.split(/\r?\n/);
  const lines: CashLine[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].trim();
    if (!row) continue;

    const fail = (msg: string): ParsedCash => ({ lines: [], error: `${kind} line ${i + 1} — ${msg}` });

    let month: number | null = null;
    let year: number | null = null;
    let rest = row;

    const named = MONTH_RE.exec(row);
    if (named) {
      month = MONTH_LOOKUP[named[1].toLowerCase()];
      rest = `${row.slice(0, named.index)} ${row.slice(named.index + named[0].length)}`;
    }

    if (month === null) {
      const iso = /\b(19\d{2}|20\d{2})[-/.](0?[1-9]|1[0-2])\b/.exec(row);
      if (iso) {
        year = Number(iso[1]);
        month = Number(iso[2]) - 1;
        rest = `${row.slice(0, iso.index)} ${row.slice(iso.index + iso[0].length)}`;
      }
    }

    if (month === null) {
      const us = /\b(0?[1-9]|1[0-2])[-/.](19\d{2}|20\d{2})\b/.exec(row);
      if (us) {
        month = Number(us[1]) - 1;
        year = Number(us[2]);
        rest = `${row.slice(0, us.index)} ${row.slice(us.index + us[0].length)}`;
      }
    }

    if (month === null) {
      return fail(`has no month — write e.g. "Nov 2026 45,000".`);
    }

    if (year === null) {
      const ym = /\b(19\d{2}|20\d{2})\b/.exec(rest);
      if (ym) {
        year = Number(ym[1]);
        rest = `${rest.slice(0, ym.index)} ${rest.slice(ym.index + ym[0].length)}`;
      }
    }

    const nums = rest.match(AMOUNT_RE) ?? [];
    if (nums.length === 0) {
      const sample = `${MONTH_LABEL[month]}${year === null ? "" : ` ${year}`} 45,000`;
      return fail(`has no amount — write e.g. "${sample}".`);
    }
    if (nums.length > 1) {
      return fail(`has ${nums.length} numbers — keep only the month and the amount on each line, no references or labels.`);
    }
    const token = nums[0] ?? "";
    if (/^\d+\.\d{3}$/.test(token)) {
      return fail(`uses "." as a thousands separator — write ${token.replace(".", ",")} so the amount is unambiguous.`);
    }
    const amount = Number(token.replace(/,/g, ""));
    if (!Number.isFinite(amount)) {
      return fail(`has an amount that is not a number ("${token}").`);
    }

    lines.push({ year, month, amount });
  }

  return { lines, error: null };
}

const toNum = (v: string): number | null => {
  const t = v.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const fmt = (n: number): string => {
  const negative = n < 0 ? "-" : "";
  const [whole, decimals] = Math.abs(n).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = decimals && decimals !== "00" ? `.${decimals}` : "";
  return `${negative}${grouped}${tail}`;
};

interface CashBucket {
  key: string;
  label: string;
  year: number | null;
  month: number;
  outflow: number;
  inflow: number;
}

interface ForecastRow {
  label: string;
  opening: number;
  outflow: number;
  inflow: number;
  closing: number;
}

interface Forecast {
  rows: ForecastRow[];
  totalOut: number;
  totalIn: number;
  closing: number;
  low: ForecastRow;
  firstNegative: ForecastRow | null;
  table: string;
  lowPoint: string;
}

/**
 * Bucket every payment / inflow line by month and run the balance from the
 * opening figure. Pure and deterministic — the model never sees arithmetic it
 * has to redo.
 * @param dated count of lines carrying a year (0 = none, otherwise all of them)
 */
function buildForecast(opening: number, paymentLines: CashLine[], inflowLines: CashLine[], dated: number): Forecast {
  const buckets = new Map<string, CashBucket>();
  const touch = (line: CashLine): CashBucket => {
    const key = line.year === null ? `x${line.month}` : `${line.year}-${String(line.month).padStart(2, "0")}`;
    const existing = buckets.get(key);
    if (existing) return existing;
    const bucket: CashBucket = {
      key,
      label: line.year === null ? MONTH_LABEL[line.month] : `${MONTH_LABEL[line.month]} ${line.year}`,
      year: line.year,
      month: line.month,
      outflow: 0,
      inflow: 0,
    };
    buckets.set(key, bucket);
    return bucket;
  };

  for (const line of paymentLines) touch(line).outflow += Math.abs(line.amount);
  for (const line of inflowLines) touch(line).inflow += Math.abs(line.amount);

  const ordered = [...buckets.values()].sort((a, b) =>
    dated > 0
      ? (a.year ?? 0) - (b.year ?? 0) || a.month - b.month
      : a.month - b.month,
  );

  const rows: ForecastRow[] = [];
  let balance = opening;
  let totalOut = 0;
  let totalIn = 0;
  for (const bucket of ordered) {
    const rowOpening = balance;
    const closing = rowOpening - bucket.outflow + bucket.inflow;
    rows.push({ label: bucket.label, opening: rowOpening, outflow: bucket.outflow, inflow: bucket.inflow, closing });
    balance = closing;
    totalOut += bucket.outflow;
    totalIn += bucket.inflow;
  }

  let low = rows[0];
  let firstNegative: ForecastRow | null = null;
  for (const row of rows) {
    if (row.closing < low.closing) low = row;
    if (firstNegative === null && row.closing < 0) firstNegative = row;
  }

  const table = [
    "Month | Opening | Outflows | Inflows | Closing",
    ...rows.map((r) => `${r.label} | ${fmt(r.opening)} | ${fmt(r.outflow)} | ${fmt(r.inflow)} | ${fmt(r.closing)}`),
  ].join("\n");

  const lowPoint =
    low.closing < 0
      ? `${fmt(low.closing)} in ${low.label} — a peak funding requirement of ${fmt(-low.closing)}${firstNegative ? `; the balance first turns negative in ${firstNegative.label}` : ""}`
      : `${fmt(low.closing)} in ${low.label} — the balance never turns negative in this window`;

  return { rows, totalOut, totalIn, closing: balance, low, firstNegative, table, lowPoint };
}

export default function CashFlowForecast() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", opening: "", payments: "", inflows: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);

    const opening = toNum(values.opening);
    if (opening === null) {
      setError("Opening balance must be a number (use 0 if the window starts empty).");
      return;
    }

    const payments = parseCash(values.payments, "Payment");
    if (payments.error) {
      setError(payments.error);
      return;
    }
    if (payments.lines.length === 0) {
      setError("Paste at least one payment line — month and amount.");
      return;
    }

    const inflows = parseCash(values.inflows, "Inflow");
    if (inflows.error) {
      setError(inflows.error);
      return;
    }

    const all = [...payments.lines, ...inflows.lines];
    const dated = all.filter((l) => l.year !== null).length;
    if (dated > 0 && dated < all.length) {
      setError("Give every line a year (e.g. 'Nov 2026') or none at all — the forecast cannot mix dated and undated months.");
      return;
    }
    if (dated === 0) {
      for (const group of [payments.lines, inflows.lines]) {
        for (let i = 1; i < group.length; i++) {
          if (group[i].month < group[i - 1].month) {
            setError("Months are out of calendar order — add a year to each line (e.g. 'Dec 2026' then 'Jan 2027').");
            return;
          }
        }
      }
    }

    setBusy(true);
    setResult(null);
    try {
      const forecast = buildForecast(opening, payments.lines, inflows.lines, dated);

      const prompt = [
        promptLine("Project", values.project),
        promptLine("Opening balance", fmt(opening)),
        promptLine("Computed cash table — client-side arithmetic, treat as fact", forecast.table),
        promptLine("Computed totals", `Outflows ${fmt(forecast.totalOut)} · Inflows ${fmt(forecast.totalIn)} · Net movement ${fmt(forecast.totalIn - forecast.totalOut)} · Closing balance ${fmt(forecast.closing)}`),
        promptLine("Computed low point (peak funding)", forecast.lowPoint),
        promptLine("Payment lines as pasted (descriptions only — the amounts are already computed above)", values.payments.trim()),
        promptLine("Inflow lines as pasted", values.inflows.trim()),
        promptLine("Contract & timing notes", values.notes),
        "",
        "Produce the cash flow commentary now: how the balance moves, the peak funding requirement, timing risk and what to renegotiate first.",
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
      id="f033"
      rank={33}
      name="Cash Flow Forecast"
      tagline="Builds the month-by-month cash table itself, then explains peak funding and timing risk."
      category="Cost & Finance"
      icon={Banknote}
      fields={FIELDS}
      values={values}
      setValue={setValue}
      busy={busy}
      onRun={run}
      result={result}
      error={error}
      runLabel="Forecast cash flow"
    />
  );
}
