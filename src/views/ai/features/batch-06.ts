// PM CONTROL TOWER — AI Feature Studio · batch 06 (f051–f060, communication craft + personal productivity)
// Owns only this file and its ten feature components. See docs/AI-FEATURE-ROADMAP.md.

import type { FeatureLoader, FeatureMeta } from "./meta";
import {
  CalendarCheck, ClipboardCheck, FileSearch, Handshake, Inbox, Languages,
  ListChecks, Mail, Megaphone, Siren,
} from "lucide-react";

export const metas: FeatureMeta[] = [
  {
    id: "f051", rank: 51, name: "Executive Email Drafter", category: "status", priority: "P1", icon: Mail,
    tagline: "Subject plus a 150-word email that leads with the fact and asks for one thing by a date.",
  },
  {
    id: "f052", rank: 52, name: "Client Update Drafter", category: "status", priority: "P1", icon: Handshake,
    tagline: "A composed client update: what we delivered, what's next, an issue with a remedy, one question back.",
  },
  {
    id: "f053", rank: 53, name: "Bad News Delivery", category: "status", priority: "P2", icon: Siren,
    tagline: "Leads with the hard fact, gives cause without blame, recovery, the decision needed — and what not to say.",
  },
  {
    id: "f054", rank: 54, name: "Stakeholder Tailored Update", category: "status", priority: "P2", icon: Megaphone,
    tagline: "One set of facts rendered for sponsor, team or client — plus what each audience will ask next.",
  },
  {
    id: "f055", rank: 55, name: "Meeting Prep Brief", category: "productivity", priority: "P1", icon: CalendarCheck,
    tagline: "Turns a meeting purpose into an objective, five sharp questions and the decision to leave with.",
  },
  {
    id: "f056", rank: 56, name: "My Day Prioritizer", category: "productivity", priority: "P1", icon: ListChecks,
    tagline: "Orders today into time blocks: the one must-finish item, what to defer and what to break down.",
  },
  {
    id: "f057", rank: 57, name: "Inbox Triage", category: "productivity", priority: "P1", icon: Inbox,
    tagline: "Buckets every pasted ask into do now, schedule, delegate, two-line reply or ignore — with timings.",
  },
  {
    id: "f058", rank: 58, name: "Document Summarizer", category: "knowledge", priority: "P1", icon: FileSearch,
    tagline: "Summary at the depth you choose, plus decisions, open questions and the parts only a human should read.",
  },
  {
    id: "f059", rank: 59, name: "Action Item Extractor", category: "knowledge", priority: "P1", icon: ClipboardCheck,
    tagline: "Pulls actions out of pasted minutes with owner, due date and priority — decisions kept separate.",
  },
  {
    id: "f060", rank: 60, name: "Plain English Rewriter", category: "knowledge", priority: "P1", icon: Languages,
    tagline: "Rewrites dense text as plain English while every number and name survives — or is explicitly flagged.",
  },
];

export const loaders: Record<string, FeatureLoader> = {
  f051: () => import("./f051-executive-email"),
  f052: () => import("./f052-client-update"),
  f053: () => import("./f053-bad-news"),
  f054: () => import("./f054-stakeholder-update"),
  f055: () => import("./f055-meeting-prep"),
  f056: () => import("./f056-day-prioritizer"),
  f057: () => import("./f057-inbox-triage"),
  f058: () => import("./f058-document-summarizer"),
  f059: () => import("./f059-action-extractor"),
  f060: () => import("./f060-plain-english"),
};
