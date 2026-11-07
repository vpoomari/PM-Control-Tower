// PM CONTROL TOWER — AI Feature Studio · batch 01 (f001–f010, decision core)
// Owns only this file and its ten feature components. See docs/AI-FEATURE-ROADMAP.md.

import type { FeatureLoader, FeatureMeta } from "./meta";
import {
  AlarmClock, CalendarClock, ChartLine, ClipboardList, Crown, FileBarChart,
  Lightbulb, Scale, ShieldAlert, Split,
} from "lucide-react";

export const metas: FeatureMeta[] = [
  {
    id: "f001", rank: 1, name: "Status Report Draft Generator", category: "status", priority: "P0", icon: FileBarChart,
    tagline: "Turns this week's facts into a steering-ready status report with a defensible RAG rating.",
  },
  {
    id: "f002", rank: 2, name: "Risk → Mitigation Designer", category: "risk", priority: "P0", icon: ShieldAlert,
    tagline: "Scores a raw risk and returns mitigation, contingency, trigger and owner in one pass.",
  },
  {
    id: "f003", rank: 3, name: "Schedule Recovery Advisor", category: "plan", priority: "P0", icon: CalendarClock,
    tagline: "Diagnoses a slipping plan and returns a ranked crash / fast-track / descope recovery sequence.",
  },
  {
    id: "f004", rank: 4, name: "EVM Variance Explainer", category: "cost", priority: "P0", icon: ChartLine,
    tagline: "Computes CPI/SPI/EAC/TCPI deterministically, then explains the variance and corrective actions.",
  },
  {
    id: "f005", rank: 5, name: "Overdue Work Recovery Plan", category: "plan", priority: "P0", icon: AlarmClock,
    tagline: "Triages pasted overdue items into recover / replan / escalate / close within real capacity.",
  },
  {
    id: "f006", rank: 6, name: "RAID Digest for Steering", category: "risk", priority: "P0", icon: ClipboardList,
    tagline: "Compresses a pasted RAID register into the one page a steering committee actually reads.",
  },
  {
    id: "f007", rank: 7, name: "Executive Brief (150 words)", category: "status", priority: "P0", icon: Crown,
    tagline: "Headline, three facts, recommendation and one clear ask — in 150 words or fewer.",
  },
  {
    id: "f008", rank: 8, name: "What-If Scenario Analyst", category: "plan", priority: "P0", icon: Split,
    tagline: "Stress-tests the plan against a delay, cost shock or scope change and returns ranked options.",
  },
  {
    id: "f009", rank: 9, name: "Risk Brainstorm", category: "risk", priority: "P0", icon: Lightbulb,
    tagline: "12–15 context-specific threats and opportunities with initial scores — plus what it cannot see.",
  },
  {
    id: "f010", rank: 10, name: "Decision Brief Builder", category: "gov", priority: "P0", icon: Scale,
    tagline: "Scores options against the criteria, picks one, and hands back a paste-ready decision record.",
  },
];

export const loaders: Record<string, FeatureLoader> = {
  f001: () => import("./f001-status-report"),
  f002: () => import("./f002-risk-mitigation"),
  f003: () => import("./f003-schedule-recovery"),
  f004: () => import("./f004-evm-variance"),
  f005: () => import("./f005-overdue-recovery"),
  f006: () => import("./f006-raid-digest"),
  f007: () => import("./f007-executive-brief"),
  f008: () => import("./f008-what-if"),
  f009: () => import("./f009-risk-brainstorm"),
  f010: () => import("./f010-decision-brief"),
};
