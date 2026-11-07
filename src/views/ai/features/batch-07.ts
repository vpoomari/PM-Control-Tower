// PM CONTROL TOWER — AI Feature Studio · batch 07 (f061–f070, strategy & stakeholders)
// Owns only this file and its ten feature components. See docs/AI-FEATURE-ROADMAP.md.

import type { FeatureLoader, FeatureMeta } from "./meta";
import {
  Coins, Crosshair, GraduationCap, Layers, ListChecks, Megaphone,
  MessageCircleQuestion, Network, Rocket, Target,
} from "lucide-react";

export const metas: FeatureMeta[] = [
  {
    id: "f061", rank: 61, name: "Stakeholder Map", category: "strategy", priority: "P1", icon: Network,
    tagline: "Places every stakeholder in a power/interest quadrant and tells you how to work each relationship.",
  },
  {
    id: "f062", rank: 62, name: "Communications Plan", category: "strategy", priority: "P1", icon: Megaphone,
    tagline: "Turns a stakeholder list into a message-channel-cadence matrix with a clear escalation path.",
  },
  {
    id: "f063", rank: 63, name: "OKR Drafting Assistant", category: "strategy", priority: "P1", icon: Target,
    tagline: "Three objectives and nine key results drafted from your theme and baseline — never invented numbers.",
  },
  {
    id: "f064", rank: 64, name: "Strategy Alignment Checker", category: "strategy", priority: "P1", icon: Crosshair,
    tagline: "Rates the initiative against every company objective and names the objective nobody is funding.",
  },
  {
    id: "f065", rank: 65, name: "Benefit Realisation Plan", category: "strategy", priority: "P1", icon: Coins,
    tagline: "Baseline-to-target benefit statement with method, owner, capture date and the fragile assumption.",
  },
  {
    id: "f066", rank: 66, name: "Change Impact Assessment", category: "strategy", priority: "P1", icon: Layers,
    tagline: "Maps the change across process, people and system, then returns a readiness verdict and top risks.",
  },
  {
    id: "f067", rank: 67, name: "Adoption Plan", category: "strategy", priority: "P2", icon: Rocket,
    tagline: "Awareness-to-habit plan with owners, measures, a weekly metric and the group that will resist hardest.",
  },
  {
    id: "f068", rank: 68, name: "Training Outline Designer", category: "strategy", priority: "P2", icon: GraduationCap,
    tagline: "A timed session outline with objectives, an exercise, common mistakes and a one-week retention check.",
  },
  {
    id: "f069", rank: 69, name: "Sponsor Q&A Prep", category: "strategy", priority: "P1", icon: MessageCircleQuestion,
    tagline: "Ten hard sponsor questions with grounded answers, three to volunteer, and the one number to have ready.",
  },
  {
    id: "f070", rank: 70, name: "Vendor Evaluation Scorecard", category: "strategy", priority: "P2", icon: ListChecks,
    tagline: "A weighted vendor scorecard with scoring guidance, deciding questions and the lever to negotiate on.",
  },
];

export const loaders: Record<string, FeatureLoader> = {
  f061: () => import("./f061-stakeholder-map"),
  f062: () => import("./f062-comms-plan"),
  f063: () => import("./f063-okr-drafting"),
  f064: () => import("./f064-strategy-alignment"),
  f065: () => import("./f065-benefit-plan"),
  f066: () => import("./f066-change-impact"),
  f067: () => import("./f067-adoption-plan"),
  f068: () => import("./f068-training-outline"),
  f069: () => import("./f069-sponsor-qa"),
  f070: () => import("./f070-vendor-scorecard"),
};
