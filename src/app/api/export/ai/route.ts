// PM CONTROL TOWER — POST /api/export/ai
// Natural-language export: "export Q4 project status with budgets" → the AI picks the
// dataset, the columns and a text filter, and returns a ready-to-download URL against
// GET /api/export/[entity]?cols=…&q=… (which re-validates everything server-side).
// When AI is unavailable (no key / no ai.use / rate limit / bad JSON) a keyword-overlap
// heuristic picks the dataset and columns instead — the endpoint never fails because of
// the provider, it degrades with the real reason attached.

import { z } from "zod";
import { withApi, ok, parseBody } from "@/lib/api";
import { hasPermission } from "@/lib/rbac";
import { ENTITIES } from "@/lib/io/entities";
import { KEY_COLUMN } from "@/lib/io/model";
import { askAIResult } from "@/lib/ai/ai-service";

const bodySchema = z.object({ prompt: z.string().min(1).max(600) });

const aiSchema = z.object({
  entity: z.string(),
  columns: z.array(z.string()).max(200).default([]),
  q: z.string().max(200).default(""),
  reason: z.string().max(400).default(""),
});

interface ViewableEntity {
  key: string;
  label: string;
  columns: { key: string; label: string }[];
}

const NOISE = new Set(["id", "createdAt", "updatedAt"]);
const STOP = new Set([
  "the", "and", "for", "with", "export", "csv", "json", "file", "data", "please", "all",
  "that", "this", "from", "into", "make", "give", "show", "list", "download", "where",
  "has", "have", "its", "are", "was", "were", "any", "some", "only", "containing",
]);

function tokens(s: string): string[] {
  return [...new Set(
    s.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOP.has(t)),
  )];
}

function buildUrl(entity: string, columnKeys: string[], q: string): { qs: string; url: string } {
  const params = new URLSearchParams();
  params.set("format", "csv");
  if (columnKeys.length) params.set("cols", columnKeys.join(","));
  if (q) params.set("q", q);
  const qs = `?${params.toString()}`;
  return { qs, url: `/api/export/${entity}${qs}` };
}

export const POST = withApi(async (ctx) => {
  const { prompt } = await parseBody(ctx.req, bodySchema);

  const viewable: ViewableEntity[] = Object.entries(ENTITIES)
    .filter(([, def]) => hasPermission(ctx.session, def.viewPermission))
    .map(([key, def]) => ({
      key,
      label: def.label,
      columns: def.columns.filter((c) => !NOISE.has(c.key)),
    }))
    .filter((e) => e.columns.length > 0);
  if (!viewable.length) return ok({ error: "No dataset is visible for your account" });

  const byKey = new Map(viewable.map((e) => [e.key, e]));

  // ---- Ask AI (server-side; never throws) ----
  const catalog = viewable.map((e) => `${e.key} (${e.label}): ${e.columns.map((c) => c.key).join(", ")}`).join("\n");
  const systemContext = [
    "You are the export planner of PM CONTROL TOWER, a project-management platform.",
    "Given a user's export request, pick ONE dataset, the columns they need and an optional text filter.",
    "Catalog (entity key (label) → column keys):",
    catalog,
    "Rules:",
    "- \"columns\" are column keys from the chosen dataset (empty array = all columns).",
    "- \"q\" is a short case-insensitive contains-filter (max 100 chars), or empty for no filter.",
    "- Output STRICT JSON only, no prose, no code fences:",
    "{\"entity\":\"projects\",\"columns\":[\"code\",\"name\",\"status\"],\"q\":\"\",\"reason\":\"one short sentence\"}",
  ].join("\n");

  const ai = await askAIResult(prompt, systemContext);

  let entity: string | null = null;
  let columnKeys: string[] = [];
  let q = "";
  let reason = "";
  let source: "ai" | "heuristic" = "ai";

  if (ai.status === "ok" && !ai.fallback) {
    try {
      const text = ai.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      const parsed = aiSchema.parse(JSON.parse(s >= 0 && e > s ? text.slice(s, e + 1) : text));
      const target = byKey.get(parsed.entity);
      if (target) {
        entity = target.key;
        const known = new Set(target.columns.map((c) => c.key));
        columnKeys = parsed.columns.filter((k) => known.has(k));
        q = parsed.q.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100);
        reason = parsed.reason.trim().slice(0, 300);
      }
    } catch {
      entity = null; // fall through to the heuristic below
    }
  }

  // ---- Keyword-overlap fallback (also used when AI output was invalid) ----
  if (!entity) {
    source = "heuristic";
    const toks = tokens(prompt);
    let best: { v: ViewableEntity; score: number } | null = null;
    for (const cand of viewable) {
      let score = 0;
      const labelToks = tokens(cand.label);
      for (const t of toks) {
        if (labelToks.some((l) => l.startsWith(t) || t.startsWith(l))) score += 3;
        if (cand.columns.some((c) => tokens(c.label).some((l) => l.startsWith(t) || t.startsWith(l)))) score += 1;
      }
      if (!best || score > best.score) best = { v: cand, score };
    }
    if (best) {
      entity = best.v.key;
      const toks2 = tokens(prompt);
      columnKeys = best.v.columns
        .filter((c) => tokens(c.label).some((l) => toks2.some((t) => l.startsWith(t) || t.startsWith(l))))
        .map((c) => c.key);
      const quoted = /["“']([^"”']{1,100})["”']/.exec(prompt);
      q = quoted ? quoted[1].trim() : "";
      reason = best.score > 0
        ? `Matched ${best.score} keyword(s) in your request to ${best.v.label}.`
        : `No strong keyword match — defaulting to ${best.v.label} with all columns.`;
    }
  }

  if (!entity) {
    return ok({
      source: "heuristic",
      ai: { status: ai.status, fallback: true },
      note: "No dataset is visible for your account.",
    });
  }

  const target = byKey.get(entity)!;
  // A narrowed column set always keeps the identifier columns, so the CSV stays
  // self-describing (business key + name) even when the AI only names the data fields.
  if (columnKeys.length) {
    const known = new Set(target.columns.map((c) => c.key));
    const must = [KEY_COLUMN[entity], "name"].filter((k): k is string => Boolean(k) && known.has(k));
    columnKeys = [...new Set([...must, ...columnKeys])];
  }
  const { qs, url } = buildUrl(entity, columnKeys, q);
  const chosen = target.columns.filter((c) => columnKeys.includes(c.key));

  return ok({
    entity,
    label: target.label,
    columnKeys,
    columns: chosen.map((c) => ({ key: c.key, label: c.label })),
    allColumns: columnKeys.length === 0,
    q: q || null,
    reason: reason || `Export ${target.label} as CSV.`,
    source,
    qs,
    url,
    ai: {
      status: ai.status,
      fallback: ai.status !== "ok",
      durationMs: ai.durationMs ?? null,
      provider: ai.provider ?? null,
      model: ai.model ?? null,
    },
  });
}, { rateLimit: { limit: 20, windowMs: 60_000 } });
