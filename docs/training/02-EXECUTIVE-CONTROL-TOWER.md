# 02 · Executive Control Tower

> Audience: executives, PMO, portfolio managers · Time: 30 minutes
> Prerequisite: module 01 · Screen: `#/dashboard` (Executive → Executive Control Tower)

## Learning objectives

Read the command center like an operator: interpret the telemetry strip, use the
five KPI tiles, drill from any 3D chart into its source records, and judge data
trust via the Integrity Core.

---

## 1. The command header

At the top: the title, a **Live** badge (green chip showing when the bundle was
generated — click refresh in a pinch), and a shortcut to the **Leadership
Control Tower** (the slide-ready executive bundle, module 06).

> Access note: this screen requires the `executive.view` permission. Users
> without it see a clear "Restricted area" panel with shortcuts to their own
> workspace — never a raw error.

## 2. The live telemetry strip (dark HUD band)

Six always-current readouts, refreshed by realtime events as teammates work:

| Readout | Shows | Watch for |
|---------|-------|-----------|
| **Portfolio** | Total projects + active/draft split | Portfolio growing faster than PM capacity |
| **Health score** | Portfolio-average RAG score /100 | Trend below 60 |
| **EVM indices** | Mean CPI / SPI across projects | Values < 0.95 turn amber |
| **Forecast** | Portfolio EAC + variance vs budget | Rose = forecast overrun |
| **Alerts** | Open governance alerts + overdue milestones | Any non-zero number |
| **Governance** | Pending stage gates + change requests | Queue growing week over week |

The footer carries the operating model: **Plan → Execute → Monitor → Control →
Govern → Deliver**.

## 3. The five KPI tiles

Each tile is a portal — click it and you land on the record set behind it:

| Tile | Click takes you to |
|------|--------------------|
| Portfolio Projects | Project register (`#/projects`) |
| Current Budget | Financials (`#/financials`) |
| Actual Cost | Financials (`#/financials`) |
| Forecast (EAC) | EVM control (`#/evm`) |
| Portfolio CPI / SPI | EVM control (`#/evm`) |

Tiles also carry a **delta chip** (e.g. ▲ x% forecast vs budget, coloured by
good/bad) and a **sparkline** of the recent trend where history exists.

## 4. The 3D chart wall

Four bespoke SVG 3D visualisations (no plug-ins, resolution-independent):

1. **Project Health Matrix** — an extruded 3D donut of the RAG distribution
   (Green / Amber / Red). *Hover a segment* to spotlight it and see its
   percentage; *click a slice or legend entry* to open the project register
   filtered to that health band. The centre shows total projects; the footer
   shows the average health score.

2. **Portfolio Investment Matrix** — isometric 3D columns per portfolio with
   three faces of data: **Budget** (blue), **Actual** (cyan), **Forecast**
   (amber). *Hover a cluster* for the tooltip with exact values; *click* to open
   Portfolios. This is the fastest way to spot a portfolio where the amber
   forecast column rises above the blue budget column.

3. **EVM Performance Dials** — two radial 3D gauges, **CPI** and **SPI**, from
   the latest period close. Green ≥ 0.95, amber ≥ 0.85, red below; the dashed
   tick marks the 0.95 target. The caption states plainly whether corrective
   control is advised.

4. **Earned Value by Project** — 3D CPI/SPI columns for the worst-performing
   projects. *Click a cluster* to jump straight into that project's workspace.

5. **Effort Telemetry** — a perspective 3D area chart of approved hours by week.
   Effort is the bridge between timesheets and cost: rising hours with flat
   value delivery is an early EVM warning.

## 5. The operational queues

Below the charts, three glass panels list what needs attention today:

- **Top Risks** — highest-scored exposures with severity dots; "Open RAID" jumps
  to the full register.
- **Governance Alerts** — automated threshold breaches (budget, schedule,
  threshold crossings) with type and timestamp; "Open queue" → Governance.
- **Capacity & Milestones** — over-allocated resources with load bars (rose above
  100%), plus overdue milestones with their due dates.

Then the **Governance Queue** panel: pending stage gates and change requests in
flight — the two decision lists a leadership meeting runs on.

## 6. The Integrity Core (dark panel, bottom right)

Trust before decisions. The panel shows:

- Recent **health changes** (project moved Amber → Red, etc.),
- A live **data freshness rail** — each project's 0–100 score with a coloured
  bar; the worst feed dominates the score. Red (< 40) means: the data is stale,
  do not decide on it — chase the timesheets/actuals first,
- A link to the full **Data Integrity** screen (`#/integrity`).

## 7. Realtime behaviour

The whole screen subscribes to live events (`project:health`, `actuals:changed`,
`alert:created`, `governance:changed`, `evm:changed`, `project:updated`). Leave
the dashboard open in a meeting — when a teammate logs hours or a health score
changes, the affected tiles and charts refresh themselves.

## 8. Exercise (10 min)

1. Log in as `ceo@pmct.io`; open **Executive Control Tower**.
2. From the telemetry strip, note the mean CPI/SPI. Are they healthy?
3. Click the **Forecast (EAC)** tile → you land on EVM control. Find the project
   with the largest cost variance; note its code.
4. Back on the dashboard, click the same project's cluster in **Earned Value by
   Project** → its workspace opens.
5. In **Project Health Matrix**, hover the Red segment (if any) and click it.
6. Scroll to the **Integrity Core** — which project has the lowest freshness
   score? What is its worst feed?

**Discussion**: you just moved from a portfolio-level number to a single
project's operational record in two clicks. How would this change a monthly
review meeting?

## 9. Key takeaways

- Six telemetry readouts = the meeting agenda; five KPI tiles = the drill points.
- Every 3D chart is interactive: hover for values, click for context.
- The Integrity Core answers "can I trust this number?" before you decide.
