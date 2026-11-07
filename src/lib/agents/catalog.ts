// PM CONTROL TOWER — the agent catalogue: all 14 agent definitions in one
// registry. This file is the single source of truth for what an agent IS;
// AgentProfile rows (Admin → Settings → AI Agents) hold only per-organisation
// activation + config, upserted lazily from this catalogue.

import type { AgentDefinition } from "./types";
import { MONITORS } from "./definitions/monitors";
import { DRAFTERS } from "./definitions/drafters";
import { AUTONOMOUS } from "./definitions/autonomous";

export const AGENTS: AgentDefinition[] = [...MONITORS, ...DRAFTERS, ...AUTONOMOUS];

/** key → definition (built once; keys are unique by construction + test). */
export const AGENT_BY_KEY: Record<string, AgentDefinition> = Object.fromEntries(
  AGENTS.map((a) => [a.key, a])
);

export function getAgent(key: string): AgentDefinition | undefined {
  return AGENT_BY_KEY[key];
}

/** Phase view used by the Settings roster. */
export const AGENT_PHASES: Record<number, AgentDefinition[]> = {
  1: AGENTS.filter((a) => a.phase === 1),
  2: AGENTS.filter((a) => a.phase === 2),
  3: AGENTS.filter((a) => a.phase === 3),
};
