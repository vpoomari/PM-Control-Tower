// PM CONTROL TOWER — AI Feature Studio · batch 10 (f091–f100, knowledge ops + specialist depth)
// Owns only this file and its ten feature components. See docs/AI-FEATURE-ROADMAP.md.

import type { FeatureLoader, FeatureMeta } from "./meta";
import {
  BadgeAlert, FileCog, FileText, Gem, Gauge, HelpCircle, Hourglass, Languages,
  ListChecks, Receipt,
} from "lucide-react";

export const metas: FeatureMeta[] = [
  {
    id: "f091", rank: 91, name: "FAQ Builder", category: "knowledge", priority: "P2", icon: HelpCircle,
    tagline: "Turns a pile of facts into ordered, source-true Q&A pairs — plus the one question the facts cannot answer.",
  },
  {
    id: "f092", rank: 92, name: "SOP Drafter", category: "knowledge", priority: "P2", icon: FileCog,
    tagline: "Drafts a numbered SOP with roles, timings, exceptions, control points and a revision block.",
  },
  {
    id: "f093", rank: 93, name: "Knowledge Article Writer", category: "knowledge", priority: "P2", icon: FileText,
    tagline: "Writes a step-by-step knowledge article with prerequisites, error fixes and an escalation route.",
  },
  {
    id: "f094", rank: 94, name: "Glossary & Naming Standard", category: "knowledge", priority: "P2", icon: Languages,
    tagline: "Defines each term in 20 words or less, kills the synonyms to avoid, and sets the naming rule.",
  },
  {
    id: "f095", rank: 95, name: "User Story → Test Cases", category: "knowledge", priority: "P1", icon: ListChecks,
    tagline: "Turns a user story into positive, negative and boundary test cases with the data to run them.",
  },
  {
    id: "f096", rank: 96, name: "Schedule Compression Advisor", category: "plan", priority: "P1", icon: Hourglass,
    tagline: "Prices fast-track, crash and descope moves, then sequences the safest way to win the days back.",
  },
  {
    id: "f097", rank: 97, name: "Risk-Adjusted Status Paragraph", category: "risk", priority: "P1", icon: BadgeAlert,
    tagline: "One 60–90-word paragraph that moves with the risk position and names the risk that decides it.",
  },
  {
    id: "f098", rank: 98, name: "Opportunity Realisation Brief", category: "risk", priority: "P2", icon: Gem,
    tagline: "Scores the opportunity, the actions that raise the odds, the trigger to act and the trade-off.",
  },
  {
    id: "f099", rank: 99, name: "Capex/Opex Classification Guide", category: "cost", priority: "P2", icon: Receipt,
    tagline: "Classifies every spend line as Capex, Opex or needs-review with the policy line cited.",
  },
  {
    id: "f100", rank: 100, name: "Financial Health Summary", category: "cost", priority: "P1", icon: Gauge,
    tagline: "Ratios computed locally, then a steering-grade read on burn, forecast, confidence and control.",
  },
];

export const loaders: Record<string, FeatureLoader> = {
  f091: () => import("./f091-faq-builder"),
  f092: () => import("./f092-sop-drafter"),
  f093: () => import("./f093-knowledge-article"),
  f094: () => import("./f094-glossary"),
  f095: () => import("./f095-test-cases"),
  f096: () => import("./f096-schedule-compression"),
  f097: () => import("./f097-risk-status-paragraph"),
  f098: () => import("./f098-opportunity-brief"),
  f099: () => import("./f099-capex-opex"),
  f100: () => import("./f100-financial-health"),
};
