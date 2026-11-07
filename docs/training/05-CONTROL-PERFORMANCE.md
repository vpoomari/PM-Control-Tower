# 05 · Control Performance

> Audience: PMs, finance controllers, PMO · Time: 45 minutes
> Prerequisite: modules 01 & 03 · Screens: Control group

## Learning objectives

Operate the control loop: budgets and actuals in Financials, performance
measurement in EVM, exposure in RAID, governed change in Change Control, and
decision gates in Stage Gates & Governance — with Data Integrity as the trust
check.

---

## 1. Financials (`#/financials`)

The cost truth of the portfolio:

- **Baseline budget** (approved) vs **current budget** (post-change) vs
  **actual cost** (posted actuals) vs **forecast/EAC**.
- Actuals arrive from approved timesheets and direct-cost entries — they are
  never typed onto the dashboard.
- Budget utilisation % and variance are shown per project and rolled up.
- Finance roles (`FINANCE`) manage budgets; everyone else views.

## 2. Clients & Billing (`#/clients`)

Commercial layer: client accounts, contracts, billing schedules and invoices
linked to projects; ties revenue to delivery.

## 3. Investment & Business Case (`#/investment`)

Pre-approval stage: business case, NPV/IRR-style justification, funding rounds
and benefits tracking — connecting "why we started" to "what we achieved".

## 4. EVM (`#/evm`) — the instrument panel

Earned Value Management per project and in portfolio aggregate:

| Metric | Meaning | Healthy |
|--------|---------|---------|
| **PV** planned value | Budgeted cost of work scheduled | — |
| **EV** earned value | Budgeted cost of work performed | — |
| **AC** actual cost | Cost of work performed | — |
| **CPI = EV/AC** | Cost efficiency | ≥ 0.95 |
| **SPI = EV/PV** | Schedule efficiency | ≥ 0.95 |

- **Period close**: EVM is computed per period (status date) — the latest close
  feeds the Executive gauges.
- **Per-project view**: CPI/SPI columns, trend lines, variance explanations.
- **Breach rules**: when indices cross thresholds, an `EVM_BREACH` alert is
  raised and automations fire (e.g. notify the sponsor).
- Variances are measured against the **baseline** (module 03) — no baseline,
  no honest variance.

## 5. Health (`#/health`)

Project health is a computed score (0–100) blending schedule, cost, RAID and
milestone signals into RAG:

- Health changes are captured historically — the dashboard shows recent
  movements (e.g. Amber → Red).
- `HEALTH_CHANGED` is an automation trigger: a project going red can
  automatically summon the PMO.

## 6. RAID (`#/raid`) — Risks, Assumptions, Issues, Dependencies

1. **Log** the item with type, severity, owner, score (probability × impact),
   mitigation and status.
2. Top-scored risks flow to the Executive dashboard automatically.
3. `RAID_CREATED` triggers automations (e.g. alert the program board for CRITICAL
   items).
4. Close items with resolution notes — the register stays audit-clean.

## 7. Change Control (`#/changes`)

The governed route to change scope/schedule/cost:

1. Raise a **Change Request** — description, reason, impacted scope.
2. The platform attaches **impact analysis** (schedule/cost deltas vs baseline).
3. Workflow: Submitted → Assessed → Approved / Rejected — every transition is
   audited.
4. Approved CRs update the current budget and justify a new baseline.
5. `CHANGE_REQUESTED` triggers notifications to the approver chain.

## 8. Stage Gates (`#/gates`)

Phase checkpoints (Initiate → Plan → Execute → Close):

- Each gate has criteria and evidence attached to a project phase.
- Approvers (`gate.decide` permission — executives, PMO) **Pass / Hold / Fail**
  with comments; the decision is audited.
- Pending gates appear on the Executive dashboard governance queue and on the
  Leadership bundle.

## 9. Governance (`#/governance`)

The single queue where governance work happens: pending gates, change requests
in flight, open alerts and their states — the "governance section" of every
steering meeting runs off this screen.

## 10. Data Integrity (`#/integrity`) — trust, scored

- Every project gets a **freshness score** (0–100) from the recency of its
  feeds: timesheets, actuals, health captures, EVM periods. The **worst feed
  dominates** — one stale feed drags the score down and names itself.
- Levels: GREEN healthy → WARN → DEGRADE → CRITICAL (score < 40).
- The rule taught to every user: **below 40, do not decide — chase the feed.**
- AI-assisted remediation actions can be drafted here for human review.

## 11. Prioritization (`#/prioritization`)

Score and rank projects/programs (value, risk, strategic fit) to guide
funding decisions — feeding the Investment screen.

## 12. Exercise (20 min) — the control loop

1. Log in as `pm.sarah@pmct.io`; open **EVM** — find your project's CPI/SPI.
   Are you delivering under budget? Ahead of schedule?
2. Open **RAID**; log a CRITICAL risk ("vendor insolvency"); add mitigation.
3. Open the Executive dashboard (or ask the facilitator) — is the risk in Top
   Risks yet?
4. Open **Changes**; raise a CR to extend the schedule by two weeks. Note the
   impact analysis.
5. As facilitator (PMO): approve the CR in **Governance**; verify the audit
   trail (**Administration → Audit Trail**).
6. Check **Data Integrity** — which project needs timesheets chased?

**Discussion**: which of these steps would have been email + spreadsheet in a
traditional PMO? What did the audit trail capture for free?

## 13. Key takeaways

- Financials ↔ EVM ↔ Health form the measurement triangle; baselines make it
  honest; timesheets make it true.
- RAID, Changes and Gates are the three governance muscles — all audited.
- Integrity scores convert "data hygiene" into a managed KPI with a stop rule.
