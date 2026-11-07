// PM CONTROL TOWER — POST /api/io/plan
// AI-assisted import planning. Given a CSV's headers (and a few sample rows) it returns
// the mapping plan the importer runs on: per-header targets (entity + column, ordered
// most-likely-first — one file can span several datasets), the datasets suspected to be
// present, and notes. The heuristic mapper (src/lib/io/model → buildHeuristicPlan) is
// computed first and ALWAYS returned; the AI refines it when the BYOK provider answers
// (askAIResult never throws — missing key / no ai.use / rate limit / bad JSON all fall
// back to the heuristic with the real reason attached). AI output is validated against
// the known entity/column catalog — never trusted raw.

import { z } from "zod";
import { withApi, ok, parseBody } from "@/lib/api";
import { ENTITIES } from "@/lib/io/entities";
import { buildHeuristicPlan, type IoPlan, type PlanAssign } from "@/lib/io/model";
import { askAIResult } from "@/lib/ai/ai-service";
import type { EntityMeta } from "@/lib/io/auto-map";

const bodySchema = z.object({
  headers: z.array(z.string()).min(1).max(300),
  sample: z.array(z.record(z.string(), z.string())).max(5).default([]),
  fileName: z.string().max(200).optional(),
});

const aiSchema = z.object({
  assignments: z.array(
    z.object({
      header: z.string(),
      targets: z.array(z.object({ entity: z.string(), column: z.string() })).max(20),
    }),
  ).max(400),
  targets: z.array(z.string()).max(60).default([]),
  notes: z.array(z.string()).max(10).default([]),
});

/** Importable entities only — the catalog the AI may map into. */
function importableCatalog(): { keys: string[]; meta: EntityMeta[]; known: Map<string, Set<string>> } {
  const keys: string[] = [];
  const meta: EntityMeta[] = [];
  const known = new Map<string, Set<string>>();
  for (const [key, def] of Object.entries(ENTITIES)) {
    if (!def.managePermission) continue;
    keys.push(key);
    meta.push({ key, label: def.label, columns: def.columns });
    known.set(
      key,
      new Set(def.columns.filter((c) => !["id", "createdAt", "updatedAt"].includes(c.key)).map((c) => c.key)),
    );
  }
  return { keys, meta, known };
}

const NOISE_KEYS = new Set(["id", "createdAt", "updatedAt"]);

export const POST = withApi(async (ctx) => {
  const { headers, sample, fileName } = await parseBody(ctx.req, bodySchema);
  const { keys, meta, known } = importableCatalog();
  if (!keys.length) return ok({ plan: buildHeuristicPlan(headers, meta), ai: { status: "no_catalog", fallback: true } });

  // ---- Instant baseline (client shows this immediately as well) ----
  const heuristic = buildHeuristicPlan(headers, meta);

  // ---- Ask AI to refine ----
  const catalog = meta
    .map((e) => `${e.key}: ${e.columns.map((c) => c.key).filter((k) => !NOISE_KEYS.has(k)).join(", ")}`)
    .join("\n");
  const systemContext = [
    "You are the column-mapping engine of PM CONTROL TOWER, a project-management platform.",
    "Map every CSV header of the user's file to the platform's importable datasets.",
    "Catalog (entity key → available column keys):",
    catalog,
    "Rules:",
    "- One file often spans several datasets; a header may map to several entities (e.g. \"Title\" → tasks.title and issues.title).",
    "- Order each header's targets most-likely-first. Use ONLY entity and column keys from the catalog.",
    "- \"targets\" lists the dataset keys present in the file, most likely first.",
    "- Output STRICT JSON only, no prose and no code fences:",
    "{\"assignments\":[{\"header\":\"Project Code\",\"targets\":[{\"entity\":\"tasks\",\"column\":\"projectCode\"}]}],\"targets\":[\"tasks\",\"projects\"],\"notes\":[\"...\"]}",
    "- Every header from the user's file must appear exactly once in assignments (empty targets = ignore that column).",
  ].join("\n");
  const prompt = [
    fileName ? `File: ${fileName}` : null,
    `Headers: ${JSON.stringify(headers)}`,
    sample.length ? `Sample rows: ${JSON.stringify(sample.slice(0, 3))}` : null,
  ].filter(Boolean).join("\n");

  const ai = await askAIResult(prompt, systemContext);

  if (ai.status !== "ok" || !ai.text.trim()) {
    return ok({
      plan: {
        ...heuristic,
        notes: [...heuristic.notes, `AI unavailable (${ai.status}) — heuristic mapping used.`],
      },
      ai: { status: ai.status, fallback: true, durationMs: ai.durationMs ?? null, provider: ai.provider ?? null, model: ai.model ?? null },
    });
  }

  // ---- Validate + sanitize the AI output against the catalog ----
  let parsed: z.infer<typeof aiSchema> | null = null;
  try {
    const text = ai.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    parsed = aiSchema.parse(JSON.parse(jsonStart >= 0 && jsonEnd > jsonStart ? text.slice(jsonStart, jsonEnd + 1) : text));
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return ok({
      plan: {
        ...heuristic,
        notes: [...heuristic.notes, "AI returned unparseable output — heuristic mapping used."],
      },
      ai: { status: "invalid_response", fallback: true, durationMs: ai.durationMs ?? null, provider: ai.provider ?? null, model: ai.model ?? null },
    });
  }

  const headerSet = new Set(headers);
  const aiByHeader = new Map<string, PlanAssign>();
  const aiEmitted = new Set<string>();
  for (const a of parsed.assignments) {
    if (!headerSet.has(a.header) || aiByHeader.has(a.header)) continue;
    aiEmitted.add(a.header);
    const seenEntity = new Set<string>();
    const targets = a.targets.filter((t) => {
      if (!known.has(t.entity) || !known.get(t.entity)!.has(t.column)) return false;
      if (seenEntity.has(t.entity)) return false; // first target per entity wins
      seenEntity.add(t.entity);
      return true;
    });
    aiByHeader.set(a.header, { header: a.header, targets, via: "ai" });
  }

  const assignments: PlanAssign[] = headers.map((h) => {
    const aiA = aiByHeader.get(h);
    const heur = heuristic.assignments.find((a) => a.header === h) ?? { header: h, targets: [], via: "heuristic" as const };
    if (!aiA || !aiEmitted.has(h)) return heur;                 // AI skipped this header
    if (aiA.targets.length > 0) return aiA;                     // AI mapping (sanitized)
    // AI listed the header: explicit empty = ignore it; targets-but-all-invalid = trust heuristic.
    const aiRawCount = parsed!.assignments.find((a) => a.header === h)?.targets.length ?? 0;
    return aiRawCount === 0 ? aiA : heur;
  });

  const aiCovered = assignments.filter((a) => a.via === "ai").length;
  const aiTargets = parsed.targets.filter((k) => keys.includes(k));
  const plan: IoPlan = {
    assignments,
    targets: aiTargets.length ? aiTargets : heuristic.targets,
    source: aiCovered === assignments.length ? "ai" : aiCovered > 0 ? "mixed" : "heuristic",
    notes: parsed.notes.slice(0, 5).map((n) => `AI: ${n}`),
  };
  if (aiCovered < assignments.length) {
    plan.notes.push(`AI mapped ${aiCovered}/${assignments.length} columns; the rest kept the heuristic match.`);
  }

  return ok({
    plan,
    ai: { status: "ok", fallback: false, durationMs: ai.durationMs ?? null, provider: ai.provider ?? null, model: ai.model ?? null },
  });
}, { rateLimit: { limit: 20, windowMs: 60_000 } });
