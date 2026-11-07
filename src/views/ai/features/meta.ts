"use client";
// PM CONTROL TOWER — AI Feature Studio · shared catalogue contracts
// Client-safe: no server imports, no DB, no Node APIs. Batch files (batch-NN.ts)
// and the studio view (index.tsx) both import from here so the catalogue shape
// lives in exactly one place.

import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen, Coins, FileBarChart, GanttChartSquare, Landmark, ShieldAlert,
  Target, Timer, Users, Zap,
} from "lucide-react";

/** Topical grouping used by the studio's category filter. */
export type CategoryId =
  | "plan"
  | "cost"
  | "risk"
  | "status"
  | "gov"
  | "agile"
  | "people"
  | "strategy"
  | "knowledge"
  | "productivity";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "plan", label: "Plan & Schedule", icon: GanttChartSquare },
  { id: "cost", label: "Cost & Finance", icon: Coins },
  { id: "risk", label: "Risk & RAID", icon: ShieldAlert },
  { id: "status", label: "Status & Reporting", icon: FileBarChart },
  { id: "gov", label: "Governance & Quality", icon: Landmark },
  { id: "agile", label: "Agile & Delivery", icon: Zap },
  { id: "people", label: "Resources & Teams", icon: Users },
  { id: "strategy", label: "Strategy & Stakeholders", icon: Target },
  { id: "knowledge", label: "Documents & Knowledge", icon: BookOpen },
  { id: "productivity", label: "Personal & Data", icon: Timer },
];

export const CATEGORY_LABEL: Record<CategoryId, string> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.id]: c.label }),
  {} as Record<CategoryId, string>,
);

export type FeaturePriority = "P0" | "P1" | "P2";

/** One row of the catalogue: everything the studio grid needs (no code). */
export interface FeatureMeta {
  /** Stable id: "f001" … "f100" — also the importance rank. */
  id: string;
  /** 1..100 importance rank (same number as the id). */
  rank: number;
  name: string;
  tagline: string;
  category: CategoryId;
  priority: FeaturePriority;
  icon: LucideIcon;
}

/** Lazy factory for one feature component (default export). */
export type FeatureLoader = () => Promise<{ default: ComponentType }>;

/** Exactly 100 — asserted by tests/engines/ai-features.test.ts. */
export const FEATURE_COUNT = 100;

/** "f017" → 17 (id must be f + 3 digits). */
export function rankOf(id: string): number {
  return Number(id.slice(1));
}

export function isFeatureId(value: string): boolean {
  return /^f\d{3}$/.test(value) && rankOf(value) >= 1 && rankOf(value) <= FEATURE_COUNT;
}
