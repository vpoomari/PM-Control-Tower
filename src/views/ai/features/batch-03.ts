// PM CONTROL TOWER — AI Feature Studio · batch 03 (f021–f030, cost/scope/sprint)
// Owns only this file and its ten feature components. See docs/AI-FEATURE-ROADMAP.md.

import type { FeatureLoader, FeatureMeta } from "./meta";
import {
  ArrowLeftRight, CalendarRange, FileText, FlaskConical, Handshake,
  Landmark, LifeBuoy, ListTodo, Receipt, ScrollText,
} from "lucide-react";

export const metas: FeatureMeta[] = [
  {
    id: "f021", rank: 21, name: "Workload Rebalancer", category: "people", priority: "P1", icon: ArrowLeftRight,
    tagline: "Reads pasted allocations, flags who is over 100% and returns a move-X%-to-Y rebalancing script.",
  },
  {
    id: "f022", rank: 22, name: "Cost Variance Narrative", category: "cost", priority: "P1", icon: Receipt,
    tagline: "Budget vs actual line by line, with the top drivers split into timing versus true overspend.",
  },
  {
    id: "f023", rank: 23, name: "Budget Phasing Advisor", category: "cost", priority: "P1", icon: CalendarRange,
    tagline: "Phases the total client-side so the month table sums exactly to the budget, then reads the cash risk.",
  },
  {
    id: "f024", rank: 24, name: "Scope Statement Writer", category: "plan", priority: "P1", icon: FileText,
    tagline: "Turns objectives and boundaries into a scope statement with exclusions and arguable edge cases.",
  },
  {
    id: "f025", rank: 25, name: "Project Charter Drafter", category: "plan", priority: "P1", icon: ScrollText,
    tagline: "Eight charter sections drafted only from the sponsor, dates, budget and objectives you supply.",
  },
  {
    id: "f026", rank: 26, name: "Assumption Validation Sprint", category: "risk", priority: "P1", icon: FlaskConical,
    tagline: "Ranks pasted assumptions by exposure and returns the cheapest test for each within two weeks.",
  },
  {
    id: "f027", rank: 27, name: "Contingency Plan Builder", category: "risk", priority: "P1", icon: LifeBuoy,
    tagline: "Turns one risk into measurable triggers, ordered response steps, fallback and a reserve call.",
  },
  {
    id: "f028", rank: 28, name: "Business Case Drafter", category: "cost", priority: "P0", icon: Landmark,
    tagline: "Compares the options you give, comments on payback only from your numbers, and states the ask.",
  },
  {
    id: "f029", rank: 29, name: "Sprint Planner", category: "agile", priority: "P1", icon: ListTodo,
    tagline: "Selects stories inside the point capacity with a running total, exclusions and dependency blockers.",
  },
  {
    id: "f030", rank: 30, name: "Staffing Recommender", category: "people", priority: "P1", icon: Handshake,
    tagline: "Recommends internal, contract or hire per role with ramp-up and the one role you cannot lose.",
  },
];

export const loaders: Record<string, FeatureLoader> = {
  f021: () => import("./f021-workload-rebalancer"),
  f022: () => import("./f022-cost-variance"),
  f023: () => import("./f023-budget-phasing"),
  f024: () => import("./f024-scope-statement"),
  f025: () => import("./f025-project-charter"),
  f026: () => import("./f026-assumption-validation"),
  f027: () => import("./f027-contingency-plan"),
  f028: () => import("./f028-business-case"),
  f029: () => import("./f029-sprint-planner"),
  f030: () => import("./f030-staffing-recommender"),
};
