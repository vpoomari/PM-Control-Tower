// PM CONTROL TOWER — AI Feature Studio · batch 09 (f081–f090, compliance, narrative, data hygiene)
// Owns only this file and its ten feature components. See docs/AI-FEATURE-ROADMAP.md.

import type { FeatureLoader, FeatureMeta } from "./meta";
import {
  BarChart3, ClipboardCheck, Gauge, Layers3, Mail, MessageCircleQuestion,
  Network, Presentation, Rocket, ScanSearch,
} from "lucide-react";

export const metas: FeatureMeta[] = [
  {
    id: "f081", rank: 81, name: "Compliance Checklist Generator", category: "gov", priority: "P1", icon: ClipboardCheck,
    tagline: "Turns a published clause list into a themed audit checklist with owners, status and evidence order.",
  },
  {
    id: "f082", rank: 82, name: "Presentation Outline Builder", category: "status", priority: "P1", icon: Presentation,
    tagline: "Slide-by-slide outline with one message per slide, honest timings, an opening line and a closing ask.",
  },
  {
    id: "f083", rank: 83, name: "Data Narrator", category: "status", priority: "P1", icon: BarChart3,
    tagline: "Explains the trend in pasted figures only — plus the three movements and what the data cannot show.",
  },
  {
    id: "f084", rank: 84, name: "Project Data Quality Audit", category: "productivity", priority: "P1", icon: ScanSearch,
    tagline: "Finds defective rows in pasted records, quotes each one, and ranks the five fixes that matter first.",
  },
  {
    id: "f085", rank: 85, name: "Scope Creep Detector", category: "productivity", priority: "P1", icon: Layers3,
    tagline: "Classifies every new ask as scope, creep or change, then hands back the CR and the sentence to decline.",
  },
  {
    id: "f086", rank: 86, name: "Kickoff Agenda Designer", category: "productivity", priority: "P1", icon: Rocket,
    tagline: "A timed kickoff agenda with pre-reads, three assumption-testing questions and a closing commitment.",
  },
  {
    id: "f087", rank: 87, name: "Cross-Project Collision Detector", category: "productivity", priority: "P1", icon: Network,
    tagline: "Finds people, date and dependency collisions across pasted project lines and sequences around them.",
  },
  {
    id: "f088", rank: 88, name: "Time Estimate Calibrator", category: "productivity", priority: "P2", icon: Gauge,
    tagline: "Anchors a task estimate to real history, names the inflation factor, and sets the re-estimate point.",
  },
  {
    id: "f089", rank: 89, name: "Email Tone Check", category: "productivity", priority: "P2", icon: Mail,
    tagline: "Rewrites the draft in the register your goal needs and flags the three phrases that undercut it.",
  },
  {
    id: "f090", rank: 90, name: "PMO Sandbox (ask anything)", category: "productivity", priority: "P2", icon: MessageCircleQuestion,
    tagline: "Free-form PMO Q&A that answers, declares its assumptions, and refuses to invent project figures.",
  },
];

export const loaders: Record<string, FeatureLoader> = {
  f081: () => import("./f081-compliance-checklist"),
  f082: () => import("./f082-presentation-outline"),
  f083: () => import("./f083-data-narrator"),
  f084: () => import("./f084-data-quality-audit"),
  f085: () => import("./f085-scope-creep"),
  f086: () => import("./f086-kickoff-agenda"),
  f087: () => import("./f087-collision-detector"),
  f088: () => import("./f088-time-estimator"),
  f089: () => import("./f089-email-tone"),
  f090: () => import("./f090-pmo-sandbox"),
};
