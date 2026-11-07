// PM CONTROL TOWER — AI Feature Studio · batch 04 (f031–f040, RAID health, root cause, requirements)
// Owns only this file and its ten feature components. See docs/AI-FEATURE-ROADMAP.md.

import type { FeatureLoader, FeatureMeta } from "./meta";
import {
  Banknote, ClipboardCheck, FileSearch, Gauge, GraduationCap, ListChecks,
  MessageCircleQuestion, Microscope, NotebookPen, Presentation,
} from "lucide-react";

export const metas: FeatureMeta[] = [
  {
    id: "f031", rank: 31, name: "Risk Register Health Check", category: "risk", priority: "P1", icon: ClipboardCheck,
    tagline: "Audits a pasted risk register for missing owners, dates, stale rows and contradictory scores.",
  },
  {
    id: "f032", rank: 32, name: "Estimate Confidence Review", category: "cost", priority: "P1", icon: Gauge,
    tagline: "Rates estimate confidence, sizes a defensible range and lists three ways to de-risk it.",
  },
  {
    id: "f033", rank: 33, name: "Cash Flow Forecast", category: "cost", priority: "P1", icon: Banknote,
    tagline: "Builds the month-by-month cash table itself, then explains peak funding and timing risk.",
  },
  {
    id: "f034", rank: 34, name: "Meeting Minutes & Actions", category: "status", priority: "P1", icon: NotebookPen,
    tagline: "Turns raw meeting notes into clean minutes with numbered decisions and owner-dated actions.",
  },
  {
    id: "f035", rank: 35, name: "Steering Committee Pack Outline", category: "status", priority: "P1", icon: Presentation,
    tagline: "Lays out an 8–12 slide steering pack with headlines, data points and slide-1 decisions.",
  },
  {
    id: "f036", rank: 36, name: "Root Cause Analysis (5 Whys)", category: "risk", priority: "P1", icon: Microscope,
    tagline: "Chains five whys through the supplied facts to one root cause and three prevention actions.",
  },
  {
    id: "f037", rank: 37, name: "Definition of Done Reviewer", category: "gov", priority: "P2", icon: ListChecks,
    tagline: "Finds the gaps in a definition of done and returns a stronger, rework-preventing version.",
  },
  {
    id: "f038", rank: 38, name: "Requirements Elicitation Questions", category: "knowledge", priority: "P1", icon: MessageCircleQuestion,
    tagline: "Returns 18–24 grouped elicitation questions, the five to ask last and the assumption to challenge.",
  },
  {
    id: "f039", rank: 39, name: "Requirements Quality Reviewer", category: "knowledge", priority: "P1", icon: FileSearch,
    tagline: "Flags ambiguous or untestable requirements, rewrites them measurably and drafts the test.",
  },
  {
    id: "f040", rank: 40, name: "Skill Gap Analysis", category: "people", priority: "P1", icon: GraduationCap,
    tagline: "Maps needed capabilities against current skills, then plans the cheapest fix per gap in 90 days.",
  },
];

export const loaders: Record<string, FeatureLoader> = {
  f031: () => import("./f031-risk-register-health"),
  f032: () => import("./f032-estimate-confidence"),
  f033: () => import("./f033-cash-flow"),
  f034: () => import("./f034-meeting-minutes"),
  f035: () => import("./f035-steering-pack"),
  f036: () => import("./f036-root-cause"),
  f037: () => import("./f037-definition-of-done"),
  f038: () => import("./f038-elicitation-questions"),
  f039: () => import("./f039-requirements-review"),
  f040: () => import("./f040-skill-gap"),
};
