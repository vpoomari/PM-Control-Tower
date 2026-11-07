# 08 · Hands-On Workshop

> Audience: mixed groups (exec / PM / team) · Time: 90 minutes
> Prerequisite: modules 01–04 attended · Format: three parallel stations, rotate
> every 25 minutes, debrief together.

## Setup (facilitator, before the session)

1. Platform running; each participant has a laptop and login (see module 01).
2. Verify the reference project **PRJ-CZR-FLOW** is intact: 364 tasks, 44
   critical, finish 2028-04-01, FLW-001 float 521. It is the "healthy plan"
   the stations compare against.
3. Optional reset: `npm run db:seed:node` restores pristine demo data.

---

## Station A — The Executive's Eye (25 min)

**Persona**: COO / sponsor. **Login**: `ceo@pmct.io`.

1. Open the **Executive Control Tower**. From the telemetry strip alone, write
   the three issues you would raise in a steering meeting.
2. Use the **EVM dials**: are CPI/SPI healthy? Which side (cost/schedule) needs
   attention?
3. Drill: Forecast tile → EVM control → identify the worst project → return →
   click its cluster in **Earned Value by Project**.
4. **Project Health Matrix**: click the Red (or Amber) slice — how many
   projects sit there?
5. **Integrity Core**: find the project with the lowest freshness score. Would
   you decide on its numbers today?
6. Finish in **Leadership Control Tower**: which single section would you take
   into a board pack?

**Deliverable**: a 3-bullet verbal briefing — *situation, risk, decision needed*.

## Station B — The PM's Workbench (25 min)

**Persona**: project manager. **Login**: `pm.sarah@pmct.io`.

1. Create project `PRJ-WORKSHOP` (start next Monday, 3-week duration).
2. **WBS**: phases *Initiate → Design → Build → Handover*; 2 tasks each with
   owners (use the seeded team) and effort.
3. **Schedule**: link phases finish-to-start; open the **Network view** —
   identify the critical path and its total float.
4. Run the **Plan doctor**; fix all findings (orphans, unassigned effort);
   re-run until clean.
5. **Baseline** the plan ("Workshop baseline v1").
6. **RAID**: log one CRITICAL risk with mitigation; **Changes**: raise one CR
   (extend build by 1 week) and note the impact analysis.
7. **EVM**: explain to your neighbour why this new project shows no indices
   yet — and what event will create them.

**Deliverable**: a baseline-backed plan with a clean doctor score and two
governance records.

## Station C — The Team Member's Day (25 min)

**Persona**: technical lead. **Login**: `liam@pmct.io`.

1. **Work Inbox**: work through pending items — what is oldest?
2. **Boards**: move one assigned task to In Progress; open a second task and
   double-click its due date to edit inline.
3. **Timesheets**: log 6h Monday–Wednesday on your tasks; add one note;
   **submit**.
4. As approver (facilitator logs in as `pm.sarah@pmct.io`): approve Liam's
   timesheet — watch for the cascade (cost → EVM → freshness).
5. **Focus Planner**: block two hours tomorrow for your hardest task.
6. **Docs & Knowledge**: find the project SOP; **Message Boards**: post a short
   status update; `⌘K` to verify both are findable.

**Deliverable**: a submitted-and-approved timesheet plus an updated board.

---

## Group debrief (15 min) — connect the stations

Ask, in this order:

1. **Station C approved hours** → where did the money appear? *(Financials.)*
   Where did the performance appear? *(EVM.)* Where did trust improve?
   *(Integrity freshness.)*
2. **Station B's CR** → whose queue does it land in? *(Governance — visible on
   the Executive dashboard.)*
3. **Station A's red project** → which station's inputs would fix its freshness
   score? *(Station C's timesheets.)*
4. What would this cost a traditional PMO in emails, spreadsheets and slide
   decks — and what just happened in 75 minutes with three people?

## Scoring (optional, competitive)

| Checkpoint | Points |
|------------|--------|
| Station A: correct 3-bullet briefing | 10 |
| Station B: doctor score 100 + baseline created | 15 |
| Station B: CR raised with impact analysis | 5 |
| Station C: timesheet approved by approver | 10 |
| Station C: board + inbox cleared | 5 |
| Any station: freshness score improved on Integrity | 5 |

## Facilitator notes

- The demo DB is small (one active portfolio) — that is deliberate: participants
  see the whole system, not a forest of rows.
- If a station finishes early: have Station A explore Reporting Center
  subscriptions; Station B model a "what-if" in the Planning Lab; Station C ask
  the AI Assistant a question about their own tasks.
- Watch the clock at rotations — the debrief is where the mental model locks in.
