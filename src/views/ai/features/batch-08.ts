// PM CONTROL TOWER — AI Feature Studio · batch 08 (f071–f080, people leadership + governance depth)
// Owns only this file and its ten feature components. See docs/AI-FEATURE-ROADMAP.md.

import type { FeatureLoader, FeatureMeta } from "./meta";
import {
  ClipboardCheck, FileSearch, Gavel, Handshake, History, MessageCircle,
  MessagesSquare, NotebookPen, Route, Ruler,
} from "lucide-react";

export const metas: FeatureMeta[] = [
  {
    id: "f071", rank: 71, name: "1:1 Agenda Builder", category: "people", priority: "P1", icon: MessagesSquare,
    tagline: "A 25-minute 1:1 agenda with time boxes, one growth question and agreed actions.",
  },
  {
    id: "f072", rank: 72, name: "Team Charter Drafter", category: "people", priority: "P2", icon: NotebookPen,
    tagline: "Signable one-line agreements on hours, decisions, meetings, done, conflict and celebration.",
  },
  {
    id: "f073", rank: 73, name: "Conflict Resolution Coach", category: "people", priority: "P2", icon: Handshake,
    tagline: "Neutral framing of both sides, their interests and a five-step mediation script.",
  },
  {
    id: "f074", rank: 74, name: "Onboarding 30/60/90 Plan", category: "people", priority: "P2", icon: Route,
    tagline: "A week-by-week ramp plan with goals, buddies and the checkpoints that prove ramp-up.",
  },
  {
    id: "f075", rank: 75, name: "Performance Feedback Drafter (SBI)", category: "people", priority: "P1", icon: MessageCircle,
    tagline: "SBI-structured feedback script with the question to ask, what to avoid and the follow-up.",
  },
  {
    id: "f076", rank: 76, name: "Document Quality Reviewer", category: "gov", priority: "P1", icon: FileSearch,
    tagline: "Scores a document five ways, quotes the line-level issues and returns a publish verdict.",
  },
  {
    id: "f077", rank: 77, name: "Lessons Learned Capture", category: "gov", priority: "P1", icon: History,
    tagline: "Turns one experience into 4–6 blameless lessons mapped to process areas and practice changes.",
  },
  {
    id: "f078", rank: 78, name: "Audit Finding Response", category: "gov", priority: "P1", icon: ClipboardCheck,
    tagline: "Agreed statement, root cause, corrective and preventive actions, evidence and closure line.",
  },
  {
    id: "f079", rank: 79, name: "Decision Record Writer", category: "gov", priority: "P1", icon: Gavel,
    tagline: "Context, decision, rationale, rejected alternatives and consequences — paste-ready for the log.",
  },
  {
    id: "f080", rank: 80, name: "Governance Rule Author", category: "gov", priority: "P1", icon: Ruler,
    tagline: "Turns a requirement into a plain-language rule with trigger, owner, exception path and evidence.",
  },
];

export const loaders: Record<string, FeatureLoader> = {
  f071: () => import("./f071-one-to-one-agenda"),
  f072: () => import("./f072-team-charter"),
  f073: () => import("./f073-conflict-coach"),
  f074: () => import("./f074-onboarding-plan"),
  f075: () => import("./f075-feedback-sbi"),
  f076: () => import("./f076-document-review"),
  f077: () => import("./f077-lessons-learned"),
  f078: () => import("./f078-audit-response"),
  f079: () => import("./f079-decision-record"),
  f080: () => import("./f080-governance-rule"),
};
