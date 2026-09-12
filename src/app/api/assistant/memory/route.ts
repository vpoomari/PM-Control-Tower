// PM CONTROL TOWER — Assistant Learning Memory API
// GET  /api/assistant/memory — the AI's evolving learning profile: interaction
//      history by day, feedback score, top topics, distilled knowledge entries.
//      Evolution is COMPUTED from real interaction history (aIExecution, aiAction,
//      aiMemory) — day by day, never invented.
// POST /api/assistant/memory {question, answerSummary?, topic?}  — record an interaction
// POST /api/assistant/memory {feedback:"POSITIVE"|"NEGATIVE", memoryId} — teach it

import { z } from "zod";
import { db } from "@/lib/db";
import { withApi, ok, parseBody } from "@/lib/api";

const TOPIC_WORDS = ["risk", "budget", "cost", "schedule", "resource", "capacity", "evm", "cpi", "spi", "benefits", "freshness", "gate", "dependency", "forecast"];

function topicOf(text: string): string | null {
  const t = text.toLowerCase();
  return TOPIC_WORDS.find((w) => t.includes(w)) ?? null;
}

export const GET = withApi(async (ctx) => {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [execs, actions, memories] = await Promise.all([
    db.aIExecution.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, prompt: true, status: true } }),
    db.aiAction.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true, type: true } }),
    db.aiMemory.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  // Day-by-day evolution: interactions + drafts per calendar day
  const byDay = new Map<string, { day: string; interactions: number; drafts: number; lessons: number }>();
  const touch = (iso: Date) => {
    const day = iso.toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { day, interactions: 0, drafts: 0, lessons: 0 });
    return byDay.get(day)!;
  };
  execs.forEach((e) => touch(e.createdAt).interactions += 1);
  actions.forEach((a) => touch(a.createdAt).drafts += 1);
  memories.forEach((m) => { if (m.feedback !== "NONE") touch(m.createdAt).lessons += 1; });
  const evolution = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30);

  // Topics the assistant is asked about most (organizational attention profile)
  const topicCounts = new Map<string, number>();
  const bump = (t: string | null) => { if (t) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1); };
  execs.forEach((e) => bump(topicOf(e.prompt)));
  memories.forEach((m) => bump(m.topic));
  const topTopics = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([topic, count]) => ({ topic, count }));

  const positive = memories.filter((m) => m.feedback === "POSITIVE").length;
  const negative = memories.filter((m) => m.feedback === "NEGATIVE").length;
  const knowledge = await db.aiKnowledge.findMany({ orderBy: [{ day: "desc" }], take: 10 });

  return ok({
    profile: {
      interactions30d: execs.length,
      drafts30d: actions.length,
      approvedDrafts: actions.filter((a) => a.status === "APPROVED").length,
      feedbackPositive: positive,
      feedbackNegative: negative,
      accuracyPct: positive + negative > 0 ? Math.round((positive / (positive + negative)) * 100) : null,
      topTopics,
    },
    evolution,
    knowledge,
    recentMemories: memories.slice(0, 12),
    note: "The assistant learns from real interaction history: every query, every draft decision and every feedback signal updates this profile. Nothing is invented.",
  });
}, { permission: "ai.use", rateLimit: { limit: 240, windowMs: 60_000 } });

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("record"), question: z.string().min(1), answerSummary: z.string().optional().nullable(), topic: z.string().optional().nullable() }),
  z.object({ action: z.literal("feedback"), memoryId: z.string().optional(), question: z.string().optional(), feedback: z.enum(["POSITIVE", "NEGATIVE"]) }),
]);

export const POST = withApi(async (ctx) => {
  const session = ctx.session!;
  const body = await parseBody(ctx.req, postSchema);
  if (body.action === "record") {
    const mem = await db.aiMemory.create({ data: { userId: session.id, question: body.question.slice(0, 500), answerSummary: body.answerSummary?.slice(0, 500) ?? null, topic: body.topic ?? topicOf(body.question) } });
    return ok({ memoryId: mem.id }, 201);
  }
  // feedback: attach to an existing memory or create one from the question text
  let mem = body.memoryId ? await db.aiMemory.findUnique({ where: { id: body.memoryId } }) : null;
  if (!mem && body.question) {
    mem = await db.aiMemory.findFirst({ where: { userId: session.id, question: { contains: body.question.slice(0, 40) } }, orderBy: { createdAt: "desc" } });
  }
  if (!mem) {
    mem = await db.aiMemory.create({ data: { userId: session.id, question: (body.question ?? "unattributed").slice(0, 500), topic: topicOf(body.question ?? ""), feedback: body.feedback } });
  } else {
    await db.aiMemory.update({ where: { id: mem.id }, data: { feedback: body.feedback } });
  }
  // Learning: a NEGATIVE signal immediately becomes a correction in the knowledge base
  if (body.feedback === "NEGATIVE") {
    const day = new Date();
    await db.aiKnowledge.upsert({
      where: { day_content: { day, content: "Correction: answer on '" + (mem.topic ?? mem.question.slice(0, 40)) + "' marked unhelpful — prioritize fresher data and explicit metrics next time." } },
      create: { day, kind: "CORRECTION", content: "Correction: answer on '" + (mem.topic ?? mem.question.slice(0, 40)) + "' marked unhelpful — prioritize fresher data and explicit metrics next time.", weight: 2, source: "FEEDBACK" },
      update: { weight: { increment: 1 } },
    });
  }
  return ok({ memoryId: mem.id, feedback: body.feedback }, 201);
}, { permission: "ai.use", rateLimit: { limit: 120, windowMs: 60_000 } });
