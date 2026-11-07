// PM CONTROL TOWER — AI Feature Studio · batch 02 (f011–f020, plan depth + first people/governance tools)
// Owns only this file and its ten feature components. See docs/AI-FEATURE-ROADMAP.md.

import type { FeatureLoader, FeatureMeta } from "./meta";
import {
  ArrowLeftRight, Calculator, ChartColumn, ClipboardCheck, FileCog, FolderKanban,
  Gauge, Megaphone, Milestone, Route,
} from "lucide-react";

export const metas: FeatureMeta[] = [
  {
    id: "f011", rank: 11, name: "WBS Generator", category: "plan", priority: "P0", icon: FolderKanban,
    tagline: "Builds an indented phase → work package → task WBS with working-day durations and stated assumptions.",
  },
  {
    id: "f012", rank: 12, name: "Capacity vs Demand Planner", category: "people", priority: "P0", icon: ArrowLeftRight,
    tagline: "Compares demand with capacity role by role, quantifies the person-week gap and picks the fastest fix.",
  },
  {
    id: "f013", rank: 13, name: "Critical Path Explainer", category: "plan", priority: "P1", icon: Route,
    tagline: "Finds the longest chain, floats every parallel path and names the three levers on the finish date.",
  },
  {
    id: "f014", rank: 14, name: "PERT Duration Estimator", category: "plan", priority: "P1", icon: Calculator,
    tagline: "Computes expected duration and sigma locally, then explains the confidence range and the skew risk.",
  },
  {
    id: "f015", rank: 15, name: "Milestone & Gate Planner", category: "plan", priority: "P1", icon: Milestone,
    tagline: "Orders milestones and gates with testable exit criteria and flags the dependency most likely to break.",
  },
  {
    id: "f016", rank: 16, name: "Cost Forecast (EAC / ETC / VAC)", category: "cost", priority: "P0", icon: ChartColumn,
    tagline: "Computes EAC, ETC and VAC for all three methods locally, then explains confidence and data gaps.",
  },
  {
    id: "f017", rank: 17, name: "Issue Escalation Brief", category: "risk", priority: "P0", icon: Megaphone,
    tagline: "Turns a live issue into an escalation brief with options, a recommendation and the exact decision asked.",
  },
  {
    id: "f018", rank: 18, name: "Stage Gate Readiness Review", category: "gov", priority: "P0", icon: ClipboardCheck,
    tagline: "Returns GO / CONDITIONAL GO / NO-GO with the missing evidence and the questions the board will ask.",
  },
  {
    id: "f019", rank: 19, name: "Change Request Narrative", category: "gov", priority: "P0", icon: FileCog,
    tagline: "Shapes a change request narrative with baseline impact, options and a paste-ready executive summary.",
  },
  {
    id: "f020", rank: 20, name: "RAG Rating Justifier", category: "status", priority: "P0", icon: Gauge,
    tagline: "Tests a RAG rating against the evidence supplied and returns a sentence ready for the status report.",
  },
];

export const loaders: Record<string, FeatureLoader> = {
  f011: () => import("./f011-wbs-generator"),
  f012: () => import("./f012-capacity-demand"),
  f013: () => import("./f013-critical-path"),
  f014: () => import("./f014-pert-estimator"),
  f015: () => import("./f015-milestone-planner"),
  f016: () => import("./f016-cost-forecast"),
  f017: () => import("./f017-issue-escalation"),
  f018: () => import("./f018-gate-readiness"),
  f019: () => import("./f019-change-request"),
  f020: () => import("./f020-rag-justifier"),
};
