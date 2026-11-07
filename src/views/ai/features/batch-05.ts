// PM CONTROL TOWER — AI Feature Studio · batch 05 (f041–f050, agile + RACI)
// Owns only this file and its ten feature components. See docs/AI-FEATURE-ROADMAP.md.

import type { FeatureLoader, FeatureMeta } from "./meta";
import {
  Bug, ClipboardCheck, Gauge, Grid3X3, Hammer, ListChecks, ListFilter,
  Newspaper, Repeat, Scissors,
} from "lucide-react";

export const metas: FeatureMeta[] = [
  {
    id: "f041", rank: 41, name: "Story Splitter", category: "agile", priority: "P1", icon: Scissors,
    tagline: "Splits one story into 5–8 INVEST-shaped slices, smallest shippable first, and says what stays out.",
  },
  {
    id: "f042", rank: 42, name: "Acceptance Criteria Writer", category: "agile", priority: "P1", icon: ListChecks,
    tagline: "5–9 testable acceptance criteria — Gherkin or bullets — covering happy path, permissions and edges.",
  },
  {
    id: "f043", rank: 43, name: "Backlog Grooming Assistant", category: "agile", priority: "P1", icon: ListFilter,
    tagline: "Turns raw backlog lines into action-first titles, size buckets and an honest ready / not-ready verdict.",
  },
  {
    id: "f044", rank: 44, name: "Retrospective Facilitator", category: "agile", priority: "P1", icon: Repeat,
    tagline: "Runs start/stop/continue on the facts, finds one root theme and lands 3 measured next-sprint experiments.",
  },
  {
    id: "f045", rank: 45, name: "Velocity Forecast", category: "agile", priority: "P1", icon: Gauge,
    tagline: "Computes mean and trend from the sprint history client-side, then commits the next 3 sprints safely.",
  },
  {
    id: "f046", rank: 46, name: "Bug Triage Assistant", category: "agile", priority: "P1", icon: Bug,
    tagline: "Scores every bug for severity, priority and missing repro info, then orders the fix-first list.",
  },
  {
    id: "f047", rank: 47, name: "Release Notes Drafter", category: "agile", priority: "P2", icon: Newspaper,
    tagline: "Groups shipped changes into New / Changed / Fixed / Known issues plus a two-sentence changelog summary.",
  },
  {
    id: "f048", rank: 48, name: "Definition of Ready Checklist", category: "agile", priority: "P2", icon: ClipboardCheck,
    tagline: "Judges a story against the DoR, lists exactly what fails and hands back the text to make it ready.",
  },
  {
    id: "f049", rank: 49, name: "Technical Debt Pitch", category: "agile", priority: "P2", icon: Hammer,
    tagline: "Pitches the fix in business language: cost of inaction, three options and the trade-off to accept.",
  },
  {
    id: "f050", rank: 50, name: "RACI Matrix Drafter", category: "people", priority: "P1", icon: Grid3X3,
    tagline: "Builds the deliverable × role matrix with one Accountable per row and flags the hand-offs that break.",
  },
];

export const loaders: Record<string, FeatureLoader> = {
  f041: () => import("./f041-story-splitter"),
  f042: () => import("./f042-acceptance-criteria"),
  f043: () => import("./f043-backlog-grooming"),
  f044: () => import("./f044-retrospective"),
  f045: () => import("./f045-velocity-forecast"),
  f046: () => import("./f046-bug-triage"),
  f047: () => import("./f047-release-notes"),
  f048: () => import("./f048-definition-of-ready"),
  f049: () => import("./f049-tech-debt-pitch"),
  f050: () => import("./f050-raci-matrix"),
};
