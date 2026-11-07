# PM Control Tower — 100 AI Feature Studio Roadmap

**Status:** authoritative spec · **Authored:** 2026-10-26 · **Owner:** PMO platform team

This document defines **all 100 AI features** of the AI Feature Studio, ordered by
**importance rank** (`f001` = most important capability for an enterprise PMO,
`f100` = useful but lower leverage). The rank *is* the feature id, so the build
order, the catalogue order and the studio's "Top 10" are the same ordering.

Every feature is one client component that calls the single central server action
`askAIResult(prompt, systemContext)` from `src/lib/ai/ai-service.ts` (the AIResult
form of `askAI`) — one saved BYOK key activates all 100, no subscription model,
key never reaches the browser, and `askAI` never throws.

---

## 1. Principles (apply to every feature)

1. **Grounded, never invented.** The model may only use what the operator pastes
   or selects. No fabricated metrics, dates, names, percentages or money. If a
   required fact is missing, the output must ask for that specific data instead
   of guessing. Every `SYSTEM_PROMPT` starts with the two standing lines (§4).
2. **Honest states.** No key / rejected key / rate limit / provider down must
   render as an amber fallback with the real reason — never a fake answer, never
   a crash. `askAIResult` resolves the failure; the frame renders it.
3. **Explicit trigger.** Features run only when the operator presses the Run
   button — BYOK quota is never spent silently (no `useEffect` runs).
4. **Theme + icons.** The frame owns the dark-slate studio theme and all motion
   (gated by `prefers-reduced-motion`). Features supply a verified `lucide-react`
   icon (§6).
5. **Accessibility.** Every input has a real `<label htmlFor>`; loading and
   result regions are `role="status" aria-live="polite"`; required fields are
   announced with `aria-invalid`; nothing is communicated by colour alone.
6. **No new dependencies.** React, `lucide-react`, the existing kit and
   `askAIResult` only. No direct `fetch`, no DB, no Node APIs in features.
7. **No hardcoded dashboard metrics** and no claims about live data the feature
   did not receive. Live context = the project list the studio loads (§3).

---

## 2. Files & contracts

| File | Owner | Purpose |
|---|---|---|
| `src/views/ai/features/meta.ts` | shared | `FeatureMeta`, `CategoryId`, `CATEGORIES`, `FEATURE_COUNT = 100` |
| `src/views/ai/features/frame.tsx` | shared | `FeatureFrame` (dark-slate shell), `FieldDef`, `StudioProvider`, `useStudio`, `promptLine` |
| `src/views/ai/features/batch-NN.ts` | batch N | `metas: FeatureMeta[]` + `loaders` for its 10 features |
| `src/views/ai/features/fNNN-slug.tsx` | batch N | the feature component (default export) |
| `src/views/ai/features/catalog.ts` | core | aggregates the 10 batch files into `FEATURES` + `LOADERS` |
| `src/views/ai/features/index.tsx` | core | the Studio view (grid, search, filters, detail pane) |
| `src/views/registry.tsx` | core | route `#/ai-features` → Studio |
| `src/components/pmct/shell.tsx` | core | Intelligence → sub-tab "AI Feature Studio" |
| `tests/engines/ai-features.test.ts` | core | structural gate: 100 features, protocol compliance, icon validity |

**Batch files are owned by the batch author.** Batch authors create *only*
`batch-NN.ts` + their ten `fNNN-*.tsx` files and never edit shared files
(`meta.ts`, `frame.tsx`, `catalog.ts`, `index.tsx`, `registry.tsx`, `shell.tsx`,
`tests/**`, `docs/**`).

---

## 3. Live context

The Studio loads `/api/projects?take=200` once (permission `project.view`) and
provides it through `StudioProvider`. Features declare a select field with
`options: "projects"` and the frame renders the live list — the option **value**
is `"CODE · Project name"`, so prompts carry both code and name. When the
endpoint fails or returns nothing the frame states it honestly and the operator
can type a project name manually. Nothing else is auto-loaded: every other fact
comes from the operator's own inputs.

---

## 4. The feature template (copy exactly)

```tsx
"use client";
// PM CONTROL TOWER — AI Feature fNNN · <Name>
// Category: <label> · importance rank <n>. Studio protocol: embedded
// SYSTEM_PROMPT + local input state + explicit try/catch around the central
// askAI server action (never throws → honest fallback UI, no silent runs).

import { useState } from "react";
import { askAIResult } from "@/lib/ai/ai-service";
import type { AIResult } from "@/lib/ai/shared";
import { <VerifiedIcon> } from "lucide-react";
import { FeatureFrame, promptLine, type FieldDef } from "./frame";

const FIELDS: FieldDef[] = [
  { key: "project", label: "Project", type: "select", options: "projects" },
  { key: "context", label: "What is going on", type: "textarea", rows: 4, required: true, placeholder: "Paste the facts…" },
  { key: "audience", label: "Audience", type: "select", options: [
    { value: "Steering committee", label: "Steering committee" },
    { value: "Sponsor", label: "Sponsor" },
  ]},
];

const SYSTEM_PROMPT = [
  "You are a senior PMO analyst inside PM Control Tower, an enterprise project management platform.",
  "Never invent project metrics, dates, names or financial figures — work only from the inputs provided; if a fact you need is missing, list the exact data you need instead of guessing.",
  // … feature-specific instructions: role, method, structure, length, tone …
].join(" ");

export default function NnnnName() {
  const [values, setValues] = useState<Record<string, string>>({
    project: "", context: "", audience: "Steering committee",
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const prompt = [
        promptLine("Project", values.project),
        promptLine("What is going on", values.context),
        promptLine("Audience", values.audience),
        "",
        "<the single task for this run — state the deliverable and length>",
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      const res = await askAIResult(prompt, SYSTEM_PROMPT);
      setResult(res);
    } catch (e) {
      setResult({
        status: "server",
        fallback: true,
        text: e instanceof Error ? e.message : "The AI request failed unexpectedly.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FeatureFrame
      id="fNNN" rank={N} name="<Name>" tagline="<one sentence, ≤120 chars>"
      category="<Category label>" icon={<VerifiedIcon>}
      fields={FIELDS} values={values} setValue={setValue}
      busy={busy} onRun={run} result={result} error={error}
      runLabel="<verb phrase, e.g. Draft status report>"
    />
  );
}
```

### `FeatureFrame` props

```ts
id: string                 // "f007"
rank: number               // 1..100 (importance)
name: string; tagline: string; category: string
icon: LucideIcon
fields: FieldDef[]
values: Record<string, string>
setValue: (key: string, value: string) => void
busy: boolean
onRun: () => void
result: AIResult | null
error?: string | null      // feature-level validation message (shown under Run)
runLabel?: string          // button text (default "Run")
resultNode?: ReactNode     // optional custom output (replaces the text panel)
children?: ReactNode       // optional slot between the fields and the Run button
```

### `FieldDef`

```ts
{ key, label,
  type: "text" | "textarea" | "select" | "number" | "date",
  placeholder?, hint?, required?, rows?, wide?,           // wide = full row
  options?: FieldOption[] | "projects" }                  // select only
```

The frame validates `required` fields and blocks the run (inline + `aria-invalid`)
when they are empty — features may still guard defensively in `run`.

### `promptLine(label, value)`

Returns `"Label: value"` or `null` when the value is blank, so prompts never
contain empty lines. Compose with `.filter((line): line is string => line !== null)`.

### `useStudio()`

`{ projects: { code: string; name: string }[]; loaded: boolean; error: string | null }`
— only needed when a feature wants the live list beyond a `select` (e.g. it
builds a cross-project prompt).

---

## 5. The 100 features

Legend: **id · name** — category · priority — *Inputs* → *Output / prompt focus*.
`P0` = top-tier (decision-grade), `P1` = core daily PM work, `P2` = useful depth.

### Batch 01 · f001–f010 — decision core

- **f001 · Status Report Draft Generator** — status · P0 — Inputs: `project` (select/projects), `period` (text), `progress` (textarea, required), `blockers` (textarea), `next` (textarea) → Weekly status: ≤90-word summary, RAG recommendation + rationale, accomplishments, blockers with impact and owner-role, next-period plan, explicit asks. Never state a progress % that was not given.
- **f002 · Risk → Mitigation Designer** — risk · P0 — Inputs: `project`, `risk` (textarea, required), `category` (select: Schedule/Cost/Scope/Resource/Technical/External/Commercial/Compliance), `impact` (textarea) → Scored risk (P×I 1–5, score, band), root causes, preventive mitigation, contingency, early-warning trigger, suggested owner role. One line per element.
- **f003 · Schedule Recovery Advisor** — plan · P0 — Inputs: `project`, `situation` (textarea, required), `mustHitDate` (date), `daysLate` (number), `constraints` (text) → Diagnosis of why the plan slipped, then ranked recovery options (crash / fast-track / descope / re-baseline) each with cost, risk and feasibility, then a 5-step recovery sequence for the next 10 working days.
- **f004 · EVM Variance Explainer** — cost · P0 — Inputs: `bac`, `pv`, `ev`, `ac` (numbers, required), `context` (textarea) → Component **computes** CPI, SPI, CV, SV, EAC (composite formula) and TCPI client-side, passes them into the prompt, and the model explains *why* performance moved, what it means at completion, and 3 corrective actions. Show the formulas in the output.
- **f005 · Overdue Work Recovery Plan** — plan · P0 — Inputs: `items` (textarea, required — one overdue item per line with its date), `capacity` (text), `rule` (select: Recover first / Re-plan / Escalate / Close) → Triaged table (item · age · recommendation · new date guidance), a resequenced plan respecting the chosen rule, and the 3 escalations that cannot be solved by the team alone.
- **f006 · RAID Digest for Steering** — risk · P0 — Inputs: `raid` (textarea, required — pasted register rows), `audience` (select: Steering/PMO/Sponsor/Team), `meetingDate` (date) → One-page digest: top 5 threats, top 3 issues needing decisions, open decisions with deadlines, asks of the audience, plus a "watch list" of items that are stale or unowned (flag, never fix silently).
- **f007 · Executive Brief (150 words)** — status · P0 — Inputs: `situation` (textarea, required), `audience` (select: Board/Sponsor/Steering/Client), `outcome` (text) → Exactly ≤150 words: headline, 3 bullets of fact, recommendation, one clear ask with a date.
- **f008 · What-If Scenario Analyst** — plan · P0 — Inputs: `baseline` (textarea, required — current plan in a few lines), `scenario` (textarea, required — the change), `type` (select: Delay/Cost increase/Scope cut/Scope add/Resource loss) → Impact across schedule, cost, scope, resource and quality; ripple effects on other work; 3 options with pros/cons; recommended option and the decision it requires.
- **f009 · Risk Brainstorm (threats & opportunities)** — risk · P0 — Inputs: `project` , `context` (textarea, required), `phase` (select: Concept/Planning/Execution/Closure), `kind` (select: Both/Threats only/Opportunities only) → 12–15 candidate risks (max 16 words each), each tagged category + initial P×I + why it matters here; grouped by theme; explicitly notes what it could not know.
- **f010 · Decision Brief Builder** — gov · P0 — Inputs: `decision` (textarea, required), `options` (textarea, required — one per line), `criteria` (text), `deadline` (date) → Options scored against the criteria (table), recommended option with rationale, risk of each rejected option, and a ready-to-paste decision record (decision, date, owner, review point).

### Batch 02 · f011–f020 — plan depth + first people/governance tools

- **f011 · WBS Generator** — plan · P0 — Inputs: `objective` (textarea, required), `depth` (select: Phases/Work packages/Tasks), `count` (number: 3–8 phases), `constraints` (text) → Indented WBS outline: PHASE → work package → tasks, each task with duration in working days and a one-line description; closing note listing assumptions; plain text with `├` style indentation, no markdown fences.
- **f012 · Capacity vs Demand Planner** — people · P0 — Inputs: `demand` (textarea, required — roles/weeks needed), `capacity` (textarea, required — roles/available weeks), `period` (text) → Demand vs capacity table, gap per role (surplus/shortfall in person-weeks), 3 mitigation options (re-sequence, hire, re-scope) and the fastest one to apply.
- **f013 · Critical Path Explainer** — plan · P1 — Inputs: `chain` (textarea, required — dependencies with durations), `today` (date) → Identifies the longest chain, total float of each parallel path, which activities are near-critical, and the 3 things that would move the finish date.
- **f014 · PERT Duration Estimator** — plan · P1 — Inputs: `optimistic`, `mostLikely`, `pessimistic` (numbers, required) → Component computes expected duration (O+4M+P)/6 and σ=(P−O)/6 client-side, passes them in; model explains the confidence range (±1σ/±2σ), the skew risk, and what would justify narrowing the range.
- **f015 · Milestone & Gate Planner** — plan · P1 — Inputs: `goal` (text, required), `months` (number), `phase` (select: Concept/Planning/Execution/Closure), `gates` (select: Yes/No) → Ordered milestone list (name · month · exit criteria), the 3 gates with evidence required, and the dependency most likely to break the sequence.
- **f016 · Cost Forecast (EAC / ETC / VAC)** — cost · P0 — Inputs: `bac`, `ac`, `ev` (numbers, required), `method` (select: Composite/Atypical/Continuous) → Component computes EAC/ETC/VAC for the chosen formula client-side and passes them in; model compares the three methods, states the confidence and the 3 data points that would make the forecast trustworthy.
- **f017 · Issue Escalation Brief** — risk · P0 — Inputs: `project`, `issue` (textarea, required), `impact` (textarea, required), `ownerRole` (text), `decisionBy` (date) → Escalation brief: what happened, business impact with a number if given, 3 options with effort/risk, recommended option, the exact decision asked for, by when, and who must be in the room.
- **f018 · Stage Gate Readiness Review** — gov · P0 — Inputs: `gate` (select: Initiation/Planning/Execution/Close/Benefits), `evidence` (textarea, required — what exists today), `criteria` (textarea, optional) → GO / CONDITIONAL GO / NO-GO with reasons, a checklist of missing evidence (must-have vs nice-to-have), conditions to clear before the gate, and the 3 questions the board will ask.
- **f019 · Change Request Narrative** — gov · P0 — Inputs: `change` (textarea, required), `reason` (textarea, required), `impact` (textarea), `baseline` (select: Schedule/Cost/Scope/All) → CR narrative: description, origin, justification, impact analysis by baseline, options (approve/reject/defer), recommendation and a one-paragraph executive summary.
- **f020 · RAG Rating Justifier** — status · P0 — Inputs: `evidence` (textarea, required — facts only), `current` (select: GREEN/AMBER/RED), `dimension` (select: Overall/Schedule/Cost/Scope/Quality/Risk) → Recommended rating with a defensible rationale (2–3 bullets tied to the evidence), what would change it, and the sentence to put in the status report.

### Batch 03 · f021–f030 — cost, scope, charter, sprint

- **f021 · Workload Rebalancer** — people · P1 — Inputs: `team` (textarea, required — people with allocations %), `deadlines` (textarea), `skillNote` (text) → Per-person load assessment, who is overloaded and by how much, a redistribution proposal (move X% of A to B) with the knock-on risk, and the conversation to have with each person.
- **f022 · Cost Variance Narrative** — cost · P1 — Inputs: `budget` (textarea, required), `actual` (textarea, required), `drivers` (textarea, optional) → Variance by line (over/under), the 3 dominant drivers, whether each is timing or true overspend, corrective actions with owner-role and expected effect.
- **f023 · Budget Phasing Advisor** — cost · P1 — Inputs: `total` (number, required), `months` (number, required), `shape` (select: S-curve/Linear/Front-loaded/Back-loaded), `notes` (textarea) → Month-by-month phasing table that sums to the total, peak month, cash risk (when spend outpaces funding) and a note on what would change the shape.
- **f024 · Scope Statement Writer** — plan · P1 — Inputs: `objective` (textarea, required), `inScope` (textarea, required), `outScope` (textarea), `acceptance` (textarea) → Scope statement: in-scope deliverables, explicit exclusions, acceptance criteria, assumptions, and the boundary cases most likely to be argued about later.
- **f025 · Project Charter Drafter** — plan · P1 — Inputs: `name` (text, required), `sponsor` (text), `objective` (textarea, required), `budget` (text), `start`, `end` (dates) → Charter sections: purpose, objectives & success criteria, scope summary, high-level milestones, budget & funding, sponsor/roles, top 3 risks, approval line.
- **f026 · Assumption Validation Sprint** — risk · P1 — Inputs: `assumptions` (textarea, required — one per line), `budget` (text) → For each assumption: why it matters, cheapest validation test, owner role, by when; ranked by exposure; a 2-week validation plan if all must be tested.
- **f027 · Contingency Plan Builder** — risk · P1 — Inputs: `risk` (textarea, required), `trigger` (text), `reserve` (text) → Trigger definitions (leading + lagging indicators), response steps in order with owner roles, fallback plan, contingency reserve recommendation and the point at which the plan is abandoned.
- **f028 · Business Case Drafter** — cost · P0 — Inputs: `problem` (textarea, required), `options` (textarea), `cost` (text), `benefit` (text), `horizon` (text) → Business case: problem & cost of inaction, options compared, recommended option, costs vs benefits, payback commentary **based only on the numbers given**, key risks and the approval ask.
- **f029 · Sprint Planner** — agile · P1 — Inputs: `backlog` (textarea, required — stories with points), `capacity` (number, required — points), `goal` (text) → Sprint goal, selected stories within capacity with a running total, deliberately excluded items, capacity risk if unplanned work arrives, and the 2 dependency blockers to clear first.
- **f030 · Staffing Recommender** — people · P1 — Inputs: `roles` (textarea, required — roles + needed weeks), `profile` (textarea — current team skills), `mode` (select: Internal/Balanced/Mix) → Recommended sourcing per role (internal move / contract / new hire), skills to buy vs train, ramp-up time, and the single role whose absence would hurt most.

### Batch 04 · f031–f040 — RAID health, root cause, requirements

- **f031 · Risk Register Health Check** — risk · P1 — Inputs: `register` (textarea, required — pasted rows) → Findings: missing owners, missing dates, scores that contradict descriptions, duplicates, risks that became issues, stale items; each with the fix to apply; closing summary of register quality (0–100 with justification).
- **f032 · Estimate Confidence Review** — cost · P1 — Inputs: `estimate` (text, required), `basis` (textarea, required), `unknowns` (textarea) → Confidence rating (Low/Medium/High) with reasoning, the biggest single uncertainty, a range (±%) that is defensible, and 3 de-risking actions.
- **f033 · Cash Flow Forecast** — cost · P1 — Inputs: `payments` (textarea, required — amount + month per line), `inflows` (textarea, optional), `opening` (number) → Month-by-month opening/committed/closing table (arithmetic shown), peak funding requirement, timing risk, and what to renegotiate first.
- **f034 · Meeting Minutes & Actions** — status · P1 — Inputs: `notes` (textarea, required), `attendees` (text), `date` (date) → Clean minutes: discussion summary, decisions taken (numbered), actions with owner + due date (flag any missing owner/date as `NEEDS OWNER`/`NEEDS DATE`), next meeting placeholder.
- **f035 · Steering Committee Pack Outline** — status · P1 — Inputs: `project`, `period` (text), `highlights` (textarea), `asks` (textarea) → Slide-by-slide pack outline (8–12 slides) with the headline message per slide, the 3 data points to show, and the decisions to put on slide 1.
- **f036 · Root Cause Analysis (5 Whys)** — risk · P1 — Inputs: `problem` (textarea, required), `facts` (textarea, required), `scope` (select: Single team/Cross-team/Systemic) → Problem statement, 5-why chain (each answer grounded in the facts), contributing factors in category buckets, root cause statement, and 3 corrective actions that prevent recurrence.
- **f037 · Definition of Done Reviewer** — gov · P2 — Inputs: `dod` (textarea, required), `teamType` (select: Software/Delivery/Research/Operations) → Gaps in the current DoD (missing quality/security/ops/review items), a stronger version, and the 3 items whose absence causes rework.
- **f038 · Requirements Elicitation Questions** — knowledge · P1 — Inputs: `idea` (textarea, required), `stakeholders` (text), `method` (select: Workshop/Interview/Survey) → 18–24 questions grouped by theme (user, process, data, integration, compliance, edge cases), plus 5 questions to ask last and the one assumption to challenge first.
- **f039 · Requirements Quality Reviewer** — knowledge · P1 — Inputs: `requirement` (textarea, required) → Issues found (ambiguous / untestable / compound / missing threshold / no source), a rewritten measurable version, and the acceptance test that would prove it.
- **f040 · Skill Gap Analysis** — people · P1 — Inputs: `needs` (textarea, required — capabilities the programme needs), `current` (textarea, required — team skills with level) → Gap matrix (capability · needed · have · gap), critical vs developable gaps, and a 90-day development plan with the cheapest intervention per gap.

### Batch 05 · f041–f050 — agile delivery + RACI

- **f041 · Story Splitter** — agile · P1 — Inputs: `story` (textarea, required), `mode` (select: By workflow/By business rule/By data operations) → 5–8 smaller INVEST-shaped stories with one-line scope each, the smallest shippable slice first, and what is deliberately left out.
- **f042 · Acceptance Criteria Writer** — agile · P1 — Inputs: `story` (textarea, required), `style` (select: Gherkin/Bullets), `edgeCases` (select: Include/Skip) → 5–9 acceptance criteria covering happy path, permissions/validation and (if chosen) edge cases; Gherkin style uses Given/When/Then.
- **f043 · Backlog Grooming Assistant** — agile · P1 — Inputs: `items` (textarea, required — raw backlog lines) → Each item: refined title (action-first), missing information, rough size bucket (S/M/L with reason), and a ready/not-ready verdict; topped with the 3 items to refine first.
- **f044 · Retrospective Facilitator** — agile · P1 — Inputs: `sprint` (text), `facts` (textarea, required — what happened), `mood` (select: Neutral/Tense/Fatigued/Celebratory) → Start/stop/continue with evidence, one root theme, 3 experiments for the next sprint with owner + measure, and 4 facilitation prompts tailored to the mood.
- **f045 · Velocity Forecast** — agile · P1 — Inputs: `history` (textarea, required — points completed per sprint), `confidence` (select: Optimistic/Realistic/Conservative) → Component computes mean and trend client-side and passes them in; model forecasts the next 3 sprints, gives a commitment recommendation per confidence choice and states the assumption that would break it.
- **f046 · Bug Triage Assistant** — agile · P1 — Inputs: `reports` (textarea, required — bug reports), `severityScale` (select: S1–S4/Blocker–Trivial) → Per bug: severity, priority, likely area, duplicate suspicion, missing repro info; then the fix-first order and what can wait for the next sprint.
- **f047 · Release Notes Drafter** — agile · P2 — Inputs: `changes` (textarea, required), `audience` (select: Customers/Internal/Both), `version` (text) → Grouped release notes (New/Changed/Fixed/Known issues) in plain language, no internal jargon, plus a 2-sentence summary for the changelog header.
- **f048 · Definition of Ready Checklist** — agile · P2 — Inputs: `story` (textarea, required), `checklist` (textarea, optional — current DoR) → Ready/not-ready assessment with the failing items, what to add to the story to make it ready, and the rule the team should add to its DoR.
- **f049 · Technical Debt Pitch** — agile · P2 — Inputs: `debt` (textarea, required), `cost` (text — effort to fix), `impact` (textarea — what it costs if left) → Business-facing pitch: risk of inaction in money/time terms using only the given numbers, options (fix now / schedule / replace), recommended path and the trade-off to accept.
- **f050 · RACI Matrix Drafter** — people · P1 — Inputs: `deliverables` (textarea, required — one per line), `people` (textarea, required — roles), `note` (text) → RACI table (deliverable × role), exactly one Accountable per row (flags rows with zero or multiple A), conflicts to resolve, and the 3 hand-offs most likely to fail.

### Batch 06 · f051–f060 — communication craft + personal productivity

- **f051 · Executive Email Drafter** — status · P1 — Inputs: `subject` (text), `situation` (textarea, required), `ask` (textarea, required), `tone` (select: Neutral/Urgent/Reassuring) → Subject + ≤150-word email: context in one line, what changed, the ask with a date, next update; no jargon, no filler.
- **f052 · Client Update Drafter** — status · P1 — Inputs: `facts` (textarea, required), `relationship` (select: New/Stable/At risk), `news` (select: Good/Mixed/Bad) → Client-facing update: what we delivered, what's next, any issue with a remedy already attached, one question back to the client; honest but composed.
- **f053 · Bad News Delivery** — status · P2 — Inputs: `news` (textarea, required), `recipient` (text), `relationship` (select: Sponsor/Client/Team/Supplier) → Message that leads with the fact, explains cause without blame, states the recovery plan and the decision needed; short, kind, specific; plus what NOT to say.
- **f054 · Stakeholder Tailored Update** — status · P2 — Inputs: `update` (textarea, required), `segments` (select: Sponsor/Team/Client/All three) → One message rendered in 2–3 audience variants: same facts, different depth and emphasis; a note on what each audience will ask next.
- **f055 · Meeting Prep Brief** — productivity · P1 — Inputs: `purpose` (text, required), `attendees` (text), `length` (text), `prepTime` (text) → Objective, desired outcome, 5 questions to ask, likely objections with responses, the decision to leave with, and a 10-minute pre-read list.
- **f056 · My Day Prioritizer** — productivity · P1 — Inputs: `tasks` (textarea, required — one per line), `hours` (number, required), `deadlineNote` (text) → Ordered plan for the day with time blocks, the single must-finish item, what to defer and why, and the 2 tasks to break down further.
- **f057 · Inbox Triage** — productivity · P1 — Inputs: `messages` (textarea, required — one ask per line), `timebox` (number) → Triage buckets (Do now / Schedule / Delegate / Reply in 2 lines / Ignore), a suggested 2-line reply for each reply-needed item, and the total time the plan takes.
- **f058 · Document Summarizer** — knowledge · P1 — Inputs: `document` (textarea, required), `depth` (select: 5 bullets/1 page/Detailed), `purpose` (text) → Summary at the chosen depth, key decisions if present, open questions, and the parts that need a human read because they are ambiguous.
- **f059 · Action Item Extractor** — knowledge · P1 — Inputs: `source` (textarea, required — minutes/email/notes) → Actions as a table (action · owner if stated else `NEEDS OWNER` · due if stated else `NEEDS DATE` · priority), plus decisions vs actions separated.
- **f060 · Plain English Rewriter** — knowledge · P1 — Inputs: `text` (textarea, required), `length` (select: Same/Shorter/Much shorter), `keepFacts` (select: All numbers/names preserved) → Plain version at roughly a grade-9 reading level, a list of terms replaced, and confirmation that every number and name was preserved (or which ones were dropped as ambiguous).

### Batch 07 · f061–f070 — strategy & stakeholders

- **f061 · Stakeholder Map** — strategy · P1 — Inputs: `stakeholders` (textarea, required — name/role), `context` (textarea) → Power/interest placement for each, engagement approach (manage closely / keep satisfied / keep informed / monitor), the 2 most dangerous relationships, and who is missing from the list.
- **f062 · Communications Plan** — strategy · P1 — Inputs: `map` (textarea, required — stakeholders or groups), `cadence` (text), `channels` (text) → Matrix: audience · message · channel · frequency · owner role · feedback loop; plus escalation path and the one message that must never be left informal.
- **f063 · OKR Drafting Assistant** — strategy · P1 — Inputs: `theme` (text, required), `period` (select: Quarter/Half year/Year), `baseline` (textarea, optional) → 3 objectives (qualitative, inspiring) each with 3 measurable key results using the baseline if given, plus the leading indicator to review monthly.
- **f064 · Strategy Alignment Checker** — strategy · P1 — Inputs: `initiative` (textarea, required), `objectives` (textarea, required — company objectives) → Alignment rating per objective (Strong/Partial/None) with reasoning, the strategic sentence to add, and the objective nobody is funding.
- **f065 · Benefit Realisation Plan** — strategy · P1 — Inputs: `benefit` (textarea, required), `baseline` (text), `target` (text), `measure` (text) → Benefit statement with baseline→target, measurement method, owner role, capture date, confidence, and the assumption most likely to make the benefit vanish.
- **f066 · Change Impact Assessment** — strategy · P1 — Inputs: `change` (textarea, required), `areas` (select: Process/People/System/All) → Impacted areas, roles affected with change load, adoption risks, communication needs, and a readiness verdict with the top 2 risks to manage.
- **f067 · Adoption Plan** — strategy · P2 — Inputs: `capability` (text, required), `users` (text), `deadline` (text) → Phases (awareness → trial → adoption → habit) with actions, owners, measures, the adoption metric to track weekly, and the group that will resist hardest.
- **f068 · Training Outline Designer** — strategy · P2 — Inputs: `skill` (text, required), `audience` (text, required), `hours` (number) → Session outline with timings, objectives, hands-on exercise, common mistakes to pre-empt, and a 1-week post-training check for retention.
- **f069 · Sponsor Q&A Prep** — strategy · P1 — Inputs: `situation` (textarea, required), `sponsor` (text) → 10 hard questions the sponsor will ask, a crisp answer for each grounded in the given facts, the 3 questions to volunteer proactively, and the one number to have ready.
- **f070 · Vendor Evaluation Scorecard** — strategy · P2 — Inputs: `vendors` (textarea, required), `criteria` (textarea, required), `weightNote` (text) → Weighted scorecard template (criteria × vendors with weights that sum to 100), scoring guidance per cell, the deciding question per vendor, and the commercial lever to use in negotiation.

### Batch 08 · f071–f080 — people leadership + governance depth

- **f071 · 1:1 Agenda Builder** — people · P1 — Inputs: `report` (text, required), `since` (text), `focus` (select: Delivery/Growth/Wellbeing/Mixed) → Agenda: status check, blockers to clear, one growth question, one wellbeing check, agreed actions; ≤25 minutes with time boxes.
- **f072 · Team Charter Drafter** — people · P2 — Inputs: `team` (text, required), `mission` (textarea), `constraints` (text) → Ways of working: working hours, decision rules, meeting diet, definition of done, conflict route, celebration ritual; each as a one-line agreement the team can sign.
- **f073 · Conflict Resolution Coach** — people · P2 — Inputs: `situation` (textarea, required), `parties` (text), `power` (select: Peer/Superior/Subordinate) → Neutral framing of both sides, the underlying interest for each, a 5-step mediation conversation script, and the escalation point if it does not resolve.
- **f074 · Onboarding 30/60/90 Plan** — people · P2 — Inputs: `role` (text, required), `team` (text), `context` (textarea) → Week-by-week plan for days 1–30/31–60/61–90 with goals, buddies, first deliverable, and the checkpoint that proves ramp-up.
- **f075 · Performance Feedback Drafter (SBI)** — people · P1 — Inputs: `situation` (textarea, required), `behaviour` (textarea, required), `impact` (textarea, required), `intent` (select: Corrective/Recognition) → SBI-structured feedback script (situation, behaviour, impact), the question to ask next, what to avoid saying, and the follow-up commitment to agree.
- **f076 · Document Quality Reviewer** — gov · P1 — Inputs: `document` (textarea, required), `standard` (select: Internal policy/Report/Procedure/Specification) → Scored review (structure, clarity, completeness, testability, consistency) with specific line-level issues, the 5 edits that matter most, and a verdict (publish / revise / rewrite).
- **f077 · Lessons Learned Capture** — gov · P1 — Inputs: `experience` (textarea, required), `phase` (select: Planning/Execution/Closure), `outcome` (select: Good/Bad/Mixed) → 4–6 lessons (what happened → why → what to do next time), each mapped to a process area and a concrete practice change; plus the one thing to standardise.
- **f078 · Audit Finding Response** — gov · P1 — Inputs: `finding` (textarea, required), `severity` (select: Critical/Major/Minor/Observation), `owner` (text) → Response: agreed statement, root cause, corrective action (with owner + due date), preventive action, evidence to attach, and the closure statement for the auditor.
- **f079 · Decision Record Writer** — gov · P1 — Inputs: `context` (textarea, required), `decision` (textarea, required), `status` (select: Proposed/Accepted/Deprecated/Superseded) → Decision record: context, decision, rationale, alternatives considered and rejected, consequences, review date — ready to paste into the decision log.
- **f080 · Governance Rule Author** — gov · P1 — Inputs: `requirement` (textarea, required), `scope` (select: All projects/Portfolio/Programme/Team), `strictness` (select: Advisory/Mandatory/Blocking) → Rule statement in plain language (trigger · condition · action · owner), exception path, evidence needed to prove compliance, and a worked example.

### Batch 09 · f081–f090 — compliance, narrative, data hygiene

- **f081 · Compliance Checklist Generator** — gov · P1 — Inputs: `standard` (text, required), `clauses` (textarea, required — pasted clause list), `context` (textarea) → Checklist rows (clause · control to evidence · owner role · status column), grouped by theme, the 5 controls most often failed, and what to evidence first.
- **f082 · Presentation Outline Builder** — status · P1 — Inputs: `topic` (text, required), `audience` (text, required), `minutes` (number), `message` (text) → Slide-by-slide outline with a title, one message and supporting detail per slide; timing per section; the opening line and the closing ask.
- **f083 · Data Narrator** — status · P1 — Inputs: `data` (textarea, required — pasted table/figures), `focus` (text) → Narrative paragraphs explaining the trend using **only** the supplied figures, the 3 most important movements, what cannot be concluded from the data, and the follow-up data worth collecting.
- **f084 · Project Data Quality Audit** — productivity · P1 — Inputs: `records` (textarea, required — rows with dates/owners/status) → Issue list (missing owner, invalid/conflicting dates, stuck statuses, orphan items, outliers) with the exact fix per row, a quality score with justification, and the 5 records to fix first.
- **f085 · Scope Creep Detector** — productivity · P1 — Inputs: `baseline` (textarea, required), `requests` (textarea, required — new asks), `budget` (text) → Classification per request (in scope / creep / legitimate change), cumulative impact if all accepted, the CR needed, and the sentence to use when declining.
- **f086 · Kickoff Agenda Designer** — productivity · P1 — Inputs: `project` (text, required), `attendees` (text), `duration` (number) → Timed agenda (objectives, roles, ways of working, plan overview, risks, decisions), pre-reads to send, the 3 questions that surface hidden assumptions, and the close-out commitment.
- **f087 · Cross-Project Collision Detector** — productivity · P1 — Inputs: `projects` (textarea, required — project + date + need per line) → Detected collisions (shared people/dates/dependencies), severity per collision, resolution options, and the sequence to avoid the worst overlap.
- **f088 · Time Estimate Calibrator** — productivity · P2 — Inputs: `task` (textarea, required), `history` (text — how long similar work took), `confidence` (select: High/Medium/Low) → Realistic estimate with padding, the factor that usually inflates it, a range, and the checkpoint at which to re-estimate.
- **f089 · Email Tone Check** — productivity · P2 — Inputs: `draft` (textarea, required), `recipient` (text), `goal` (select: Persuade/Apologise/Inform/Decline) → Revised message in the chosen register, three flagged phrases that undermine the goal, and the subject line that fits.
- **f090 · PMO Sandbox (ask anything)** — productivity · P2 — Inputs: `question` (textarea, required), `context` (textarea), `style` (select: Short answer/Detailed/Checklist) → Free-form PMO Q&A under the standing grounding rules: answer, assumptions, what data would sharpen it; refuses to fabricate project figures.

### Batch 10 · f091–f100 — knowledge ops + specialist depth

- **f091 · FAQ Builder** — knowledge · P2 — Inputs: `topic` (text, required), `facts` (textarea, required), `count` (number) → That many Q&A pairs drawn strictly from the facts, ordered by how often users ask, each answer ≤40 words, plus the question you cannot answer from these facts.
- **f092 · SOP Drafter** — knowledge · P2 — Inputs: `process` (textarea, required), `roles` (text), `controls` (textarea) → Numbered SOP: purpose, scope, roles, inputs/outputs, step-by-step with timings, exceptions, control points, revision history placeholder.
- **f093 · Knowledge Article Writer** — knowledge · P2 — Inputs: `howto` (textarea, required), `audience` (text), `system` (text) → Article with headings, numbered steps, prerequisites, common errors with fixes, and a "still stuck?" escalation route.
- **f094 · Glossary & Naming Standard** — knowledge · P2 — Inputs: `terms` (textarea, required — raw terms/acronyms), `domain` (text) → Glossary (term · definition ≤20 words · synonym to avoid), naming convention for new artefacts, and the 3 terms whose ambiguity causes rework.
- **f095 · User Story → Test Cases** — knowledge · P1 — Inputs: `story` (textarea, required), `style` (select: Table/Gherkin) → Positive, negative and boundary test cases (preconditions, steps, expected), coverage gaps in the story, and the data setup needed to run them.
- **f096 · Schedule Compression Advisor** — plan · P1 — Inputs: `phase` (text, required), `save` (number, required — days to save), `budget` (text), `riskAppetite` (select: Low/Medium/High) → Options to recover the days (fast-track vs crash vs descope) with cost and risk cost of each, the safest sequence, and what to monitor daily afterwards.
- **f097 · Risk-Adjusted Status Paragraph** — risk · P1 — Inputs: `topRisks` (textarea, required), `movement` (textarea — what changed since last status), `dimension` (select: Overall/Risk) → A 60–90-word status paragraph that reflects movement in the risk position, names the one risk that decides the outcome, and states the action already underway.
- **f098 · Opportunity Realisation Brief** — risk · P2 — Inputs: `opportunity` (textarea, required), `value` (text), `cost` (text) → Capture plan: probability × value, actions to raise the odds, owner role, trigger to act, and the trade-off against the threats it competes with for attention.
- **f099 · Capex/Opex Classification Guide** — cost · P2 — Inputs: `items` (textarea, required — spend lines), `policy` (text, optional) → Classification per item (Capex/Opex/needs finance review) with the reasoning rule applied, the items that are genuinely ambiguous, and the question to settle with Finance.
- **f100 · Financial Health Summary** — cost · P1 — Inputs: `budget` (text, required), `spent` (text, required), `forecast` (text), `evm` (text — CPI/SPI if known) → Finance paragraph for steering: position at completion, burn vs plan, the biggest cost risk, confidence level and the one control to tighten.

---

## 6. Verified icon pool (`lucide-react@0.525`)

Only names from this list may be imported (the structural test re-verifies every
import against the installed package). 286 names verified 2026-10-26:

`Activity, AlarmClock, AlertTriangle, Anvil, Aperture, Archive, ArrowLeftRight, ArrowUpRight, AtSign, Atom, Award, Backpack, BadgeAlert, BadgeCheck, Ban, Banknote, BarChart3, Bell, Bike, Blocks, Bomb, BookOpen, Bookmark, Bot, Boxes, Braces, Brain, BrainCircuit, BrickWall, Briefcase, Brush, Bug, Building, Building2, Calculator, CalendarCheck, CalendarCheck2, CalendarClock, CalendarDays, CalendarRange, Camera, Car, ChartColumn, ChartLine, ChartPie, Check, CheckCheck, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleDot, Clipboard, ClipboardCheck, ClipboardList, ClipboardPen, Clock, Cloud, Code, Coins, Columns, Columns3, Command, Compass, Component, Construction, Contact, Copy, Cpu, CreditCard, Crosshair, Crown, Database, Diamond, Dices, Dna, DollarSign, Download, Droplets, Earth, Edit, Egg, Euro, Eye, Factory, FileCheck, FileClock, FileCog, FileSearch, FileText, Film, Filter, Fingerprint, Flag, FlagTriangleRight, Flame, FlaskConical, Focus, Folder, FolderKanban, FolderOpen, Forklift, Fuel, GanttChartSquare, Gauge, Gavel, Gem, Gift, GitBranch, GitCommit, GitMerge, Globe, GraduationCap, Grid3X3, Hammer, Hand, Handshake, HardHat, Hash, Headphones, Heart, HeartPulse, HelpCircle, Highlighter, History, Hourglass, IdCard, Inbox, Infinity, Info, Joystick, KeyRound, Landmark, Languages, Laptop, Layers, Layers3, LayoutGrid, Leaf, Library, LifeBuoy, Lightbulb, Link, Link2, List, ListChecks, ListFilter, ListTodo, Lock, Mail, Map, MapPin, Megaphone, MessageCircle, MessageCircleQuestion, MessagesSquare, Mic, Microscope, Milestone, Monitor, Moon, MoonStar, Mountain, MousePointer, Network, Newspaper, Notebook, NotebookPen, Nut, Package, PackageCheck, Palette, PanelsTopLeft, Paperclip, PenTool, Percent, PersonStanding, PieChart, PiggyBank, Pin, Pointer, Presentation, Projector, Puzzle, QrCode, Quote, Radar, Radio, Receipt, Repeat, Rewind, Rocket, Route, Rss, Ruler, Save, Scale, Scale3D, Scan, ScanSearch, School, Scissors, ScrollText, Search, Send, Server, Settings, Settings2, Shapes, Share2, Shield, ShieldAlert, ShieldCheck, ShieldEllipsis, Ship, Shuffle, Sigma, Signal, Signpost, Siren, SlidersHorizontal, Smartphone, Snowflake, Sparkle, Spline, Split, SquareCheck, SquareStack, Stamp, Star, Stethoscope, StickyNote, Sun, Sunrise, Table, Tablet, Tag, Tags, Target, Telescope, Tent, Terminal, TestTube, Thermometer, ThumbsDown, ThumbsUp, Ticket, Timer, TimerReset, Tornado, ToyBrick, TrafficCone, Trees, TrendingDown, TrendingUp, Trophy, Truck, Tv, Type, Umbrella, Undo, Unlock, Upload, User, UserCheck, UserMinus, UserPlus, UserRound, Users, UsersRound, Variable, Vault, Video, Wand2, WandSparkles, Waypoints, Webhook, Weight, Wifi, Wind, Workflow, Wrench, X, XCircle, Zap, ZapOff`

Do **not** use `Cube`, `Podium`, `Screwdriver`, `Wishlist` (absent in 0.525) or
invent names — `tsc` and the structural test both fail on a bad import.

---

## 7. Batches, build order and gates

| Batch | Files | Features | Status |
|---|---|---|---|
| 01 | `batch-01.ts` + `f001…f010` | decision core | reference implementation (core) |
| 02 | `batch-02.ts` + `f011…f020` | plan depth | built in parallel |
| 03 | `batch-03.ts` + `f021…f030` | cost/scope/sprint | built in parallel |
| 04 | `batch-04.ts` + `f031…f040` | RAID health | built in parallel |
| 05 | `batch-05.ts` + `f041…f050` | agile + RACI | built in parallel |
| 06 | `batch-06.ts` + `f051…f060` | comms + personal | built in parallel |
| 07 | `batch-07.ts` + `f061…f070` | strategy | built in parallel |
| 08 | `batch-08.ts` + `f071…f080` | people + governance | built in parallel |
| 09 | `batch-09.ts` + `f081…f090` | compliance + data | built in parallel |
| 10 | `batch-10.ts` + `f091…f100` | knowledge ops | built in parallel |

Gates after every batch: `npx.cmd tsc --noEmit`, `npx.cmd eslint <batch files>`,
`npm.cmd test` (includes `tests/engines/ai-features.test.ts`), and the plan
integrity check `python scripts/verify-flow-workbook-import.py`.

## 8. Later embeds (not part of the 100 builds)

High-rank features can additionally be mounted where their data already lives —
e.g. f001 in the project workspace status tab, f002 next to the RAID log, f011 in
WBS. Each embed reuses the same component and is a separate, small change.
