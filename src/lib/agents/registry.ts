// PM CONTROL TOWER — agent registry: catalogue ⇄ organisation profiles.
// Profiles (AgentProfile) are upserted lazily from the catalogue; config
// overrides are validated against each agent's declared thresholds (keys and
// ranges), so an org can tune agents but never break them.

import { db } from "@/lib/db";
import { AGENTS, getAgent } from "./catalog";
import type { AgentConfig, AgentCadence, AgentDefinition } from "./types";

/** Serialisable agent metadata — the `run` function never leaves the server. */
export interface AgentPublicView {
  key: string;
  name: string;
  family: string;
  phase: number;
  role: string;
  description: string;
  cadence: AgentCadence;
  defaultCadence: AgentCadence;
  thresholds: AgentDefinition["thresholds"];
  defaults: AgentConfig;
  requiresApproval: boolean;
  raiseAlerts: boolean;
}

export interface AgentRosterEntry extends AgentPublicView {
  status: "ACTIVE" | "PAUSED";
  config: AgentConfig;
  budgetTokens: number;
  runCount: number;
  lastRunAt: string | null;
}

export function publicView(def: AgentDefinition): AgentPublicView {
  return {
    key: def.key,
    name: def.name,
    family: def.family,
    phase: def.phase,
    role: def.role,
    description: def.description,
    cadence: def.cadence,
    defaultCadence: def.cadence,
    thresholds: def.thresholds,
    defaults: def.defaults,
    requiresApproval: def.requiresApproval,
    raiseAlerts: def.raiseAlerts ?? false,
  };
}

/** Create missing AgentProfile rows from the catalogue (idempotent). */
export async function ensureProfiles(): Promise<void> {
  for (const def of AGENTS) {
    await db.agentProfile
      .upsert({
        where: { key: def.key },
        create: { key: def.key, status: "PAUSED", configJson: "{}" },
        update: {}, // never overwrite an org's activation/config
      })
      .catch(() => undefined);
  }
}

function parseConfig(json: string): AgentConfig {
  try {
    const raw = JSON.parse(json) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: AgentConfig = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Catalogue defaults + org overrides (unknown keys are ignored at run time). */
export function mergedConfig(def: AgentDefinition, overrides: AgentConfig): AgentConfig {
  return { ...def.defaults, ...overrides };
}

/** Validate + clamp an org config against the agent's declared thresholds. */
export function sanitizeConfig(def: AgentDefinition, input: unknown): AgentConfig {
  const out: AgentConfig = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const t of def.thresholds) {
    const v = (input as Record<string, unknown>)[t.key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    out[t.key] = Math.min(t.max, Math.max(t.min, v));
  }
  return out;
}

export async function listRoster(): Promise<AgentRosterEntry[]> {
  await ensureProfiles();
  const profiles = await db.agentProfile.findMany();
  const byKey = new Map(profiles.map((p) => [p.key, p]));
  return AGENTS.map((def) => {
    const p = byKey.get(def.key);
    return {
      ...publicView(def),
      status: (p?.status === "ACTIVE" ? "ACTIVE" : "PAUSED") as "ACTIVE" | "PAUSED",
      config: p ? parseConfig(p.configJson) : {},
      budgetTokens: p?.budgetTokens ?? 0,
      runCount: p?.runCount ?? 0,
      lastRunAt: p?.lastRunAt ? p.lastRunAt.toISOString() : null,
    };
  });
}

/** Load a single definition + profile pair for the runner (null when unknown). */
export async function loadAgent(key: string): Promise<{
  def: AgentDefinition;
  profile: { id: string; status: string; config: AgentConfig; budgetTokens: number; lastRunAt: Date | null } | null;
} | null> {
  const def = getAgent(key);
  if (!def) return null;
  await ensureProfiles();
  const p = await db.agentProfile.findUnique({ where: { key } });
  return {
    def,
    profile: p
      ? { id: p.id, status: p.status, config: parseConfig(p.configJson), budgetTokens: p.budgetTokens, lastRunAt: p.lastRunAt }
      : null,
  };
}

/** Persist an org config patch (activation, thresholds, cadence, budget). */
export async function saveProfile(
  key: string,
  patch: { status?: "ACTIVE" | "PAUSED"; config?: unknown; budgetTokens?: number; cadence?: AgentCadence }
): Promise<AgentRosterEntry | null> {
  const def = getAgent(key);
  if (!def) return null;
  await ensureProfiles();
  const existing = await db.agentProfile.findUnique({ where: { key } });

  const data: { status?: string; configJson?: string; budgetTokens?: number } = {};
  if (patch.status) data.status = patch.status === "ACTIVE" ? "ACTIVE" : "PAUSED";
  if (patch.config !== undefined) {
    const raw = (typeof patch.config === "object" && patch.config !== null ? patch.config : {}) as Record<string, unknown>;
    const current = existing ? parseConfig(existing.configJson) : {};
    const next = sanitizeConfig(def, patch.config);
    // Preserve any already-stored threshold keys the patch didn't mention.
    for (const t of def.thresholds) {
      if (next[t.key] === undefined && current[t.key] !== undefined) next[t.key] = current[t.key];
    }
    // Cadence override may ride along inside the config payload.
    const cadence = patch.cadence ?? normalizeCadence(raw.cadence);
    if (cadence) next.cadence = cadence;
    data.configJson = JSON.stringify(next);
  } else if (patch.cadence) {
    const current = existing ? parseConfig(existing.configJson) : {};
    current.cadence = patch.cadence;
    data.configJson = JSON.stringify(current);
  }
  if (patch.budgetTokens !== undefined) {
    data.budgetTokens = Math.max(0, Math.min(10_000_000, Math.round(patch.budgetTokens)));
  }

  if (existing) {
    if (Object.keys(data).length) await db.agentProfile.update({ where: { key }, data });
  } else {
    await db.agentProfile.create({
      data: {
        key,
        status: data.status ?? "PAUSED",
        configJson: data.configJson ?? "{}",
        budgetTokens: data.budgetTokens ?? 0,
      },
    });
  }
  const roster = await listRoster();
  return roster.find((r) => r.key === key) ?? null;
}

/** Effective cadence: org override (config.cadence) or the catalogue default. */
export function effectiveCadence(def: AgentDefinition, config: AgentConfig): AgentCadence {
  return normalizeCadence(config.cadence) ?? def.cadence;
}

function normalizeCadence(v: unknown): AgentCadence | null {
  return v === "HOURLY" || v === "DAILY" || v === "WEEKLY" || v === "MANUAL" ? v : null;
}

const CADENCE_MS: Record<Exclude<AgentCadence, "MANUAL">, number> = {
  HOURLY: 60 * 60_000,
  DAILY: 24 * 60 * 60_000,
  WEEKLY: 7 * 24 * 60 * 60_000,
};

/** Scheduled sweep due-check: MANUAL never fires; others respect their window. */
export function isDue(def: AgentDefinition, config: AgentConfig, lastRunAt: Date | null): boolean {
  const cadence = effectiveCadence(def, config);
  if (cadence === "MANUAL") return false;
  const window =
    cadence === "HOURLY" ? CADENCE_MS.HOURLY : cadence === "WEEKLY" ? CADENCE_MS.WEEKLY : CADENCE_MS.DAILY;
  if (!lastRunAt) return true;
  return Date.now() - lastRunAt.getTime() >= window;
}
