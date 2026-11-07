// PM CONTROL TOWER — Analytics value formatting (client-safe).
// Turns ValueFormat tokens from the report payload into display strings and
// chart formatter callbacks (charts3d expects (v: number) => string).

import type { ValueFormat } from "./types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const moneyCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

export function fmtValue(v: number | string | null | undefined, format?: ValueFormat): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  switch (format) {
    case "money":
      return Math.abs(v) >= 10_000 ? moneyCompact.format(v) : money.format(v);
    case "pct":
      return `${round1(v)}%`;
    case "ratio":
      return v.toFixed(2);
    case "days":
      return `${round1(v)}d`;
    case "hours":
      return `${round1(v)}h`;
    case "count":
      return String(Math.round(v));
    case "number":
    default:
      return Number.isInteger(v) ? v.toLocaleString("en-US") : round1(v).toLocaleString("en-US");
  }
}

/** Formatter function for charts3d components. */
export function fmtFor(format?: ValueFormat): (v: number) => string {
  return (v: number) => fmtValue(v, format);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
