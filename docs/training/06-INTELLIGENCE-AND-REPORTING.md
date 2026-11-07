# 06 · Intelligence & Reporting

> Audience: executives, PMO, anyone consuming reports · Time: 30 minutes
> Prerequisite: modules 01–02 · Screens: Intelligence group

## Learning objectives

Choose the right reporting surface for the audience — Leadership bundle, report
library, Reporting Center templates, or Analytics — schedule subscriptions, and
use the AI PM Assistant responsibly.

---

## 1. Which screen for which meeting

| Meeting | Screen | Output |
|---------|--------|--------|
| Monthly steering / board | **Leadership Control Tower** | Slide-ready executive bundle |
| Operational review | **Reports** | Standard report library |
| Ad-hoc / self-service | **Reporting Center** | 177 templates, generate & export |
| Trend & forecast session | **Analytics** | Time-series and predictive views |
| Quick question | **AI PM Assistant** | Instant answers over your data |

All of them read the same operational data — figures never disagree between
screens.

## 2. Leadership Control Tower (`#/reports/leadership`)

The executive's executive screen — a multi-section bundle generated from live
data:

- **Portfolio overview** — counts, values, health distribution.
- **Financial summary** — budget/actual/forecast, variance narrative.
- **EVM performance** — indices, trends, exceptions.
- **Risks & issues** — top exposures with severity.
- **Governance** — gates and changes awaiting decisions.
- **Delivery confidence** — schedule health and milestones.

Each section is presentation-formatted: copy into a board pack or present
directly. Period selector switches the reporting window.

## 3. Reports (`#/reports`)

The standard report library: portfolio status, project health, financial
summary, resource utilisation, RAID exposure, schedule performance, governance
digest and more. Pick report → pick scope (portfolio/program/project) and period
→ generate → export.

## 4. Reporting Center (`#/reporting`) — self-service factory

The most powerful reporting surface:

- **Template library** — 177 published templates across 13 categories
  (Executive, Financial, Schedule, EVM, Resources, RAID, Governance, Client,
  Benefits, Delivery, Quality, Compliance, Custom). Search, filter by category,
  preview.
- **Generate** — choose template + scope + period; the report renders with real
  data, charts included.
- **Charts** — interactive charts embedded in generated reports (RAG
  distribution, cost curves, EVM trends, resource histograms).
- **Save & publish** — save your generated report; PMO can publish custom
  templates for the whole organisation.
- **Subscriptions** — subscribe to a template with a cadence (daily/weekly/
  monthly); the platform delivers it on schedule to your notifications. Manage
  subscriptions in your profile area of the screen.

> Training tip: the fastest path to "can I get a report on X?" is Reporting
> Center → search the template name. If it does not exist, a PMO admin can
> publish one from any generated report.

## 5. Analytics (`#/analytics`)

Time-series intelligence across the portfolio:

- **Health timeline** — RAG/health-score movement per project over months.
- **EVM history** — CPI/SPI trends per project — the shape of the trend matters
  more than one period's value.
- **Timesheet weeks** — approved-hours volume (feeds the dashboard's Effort
  Telemetry).
- **RAID trend** — open items by month (is exposure growing?).
- **Throughput** — completed items per month (delivery velocity).

Use Analytics to answer "is it getting better or worse?" — use Reports to answer
"what is the state now?".

## 6. AI PM Assistant (`#/assistant`)

Natural-language questions over your project data ("Which projects are at risk
this quarter?", "Summarise FLOW's EVM position"):

- Answers cite the underlying records.
- Drafted remediation actions (e.g. proposed RAID entries) go through **human
  review** before anything is written — the AI proposes, people decide.
- Requires the `ai.use` permission.

## 7. Subscriptions in practice

A working rhythm for a PMO:

1. Weekly: *Executive Portfolio Digest* → every Monday 08:00 to leadership.
2. Monthly: *EVM Performance Report* → close day +1 to finance and PMs.
3. Per project: *RAID Exposure Report* → Fridays to project boards.

Subscriptions turn reporting from an event into a background service.

## 8. Exercise (10 min)

1. Log in as `ceo@pmct.io`; open **Leadership Control Tower**. Identify one
   insight and one decision needed — from the same page.
2. Open **Reporting Center**; search "EVM"; generate the EVM report for the
   FLOW project. Note the embedded charts.
3. Subscribe to it weekly.
4. Open **Analytics** → EVM history: is the portfolio trend improving?
5. Ask the **AI Assistant**: "Which projects need attention and why?"

**Discussion**: which of these outputs would you still rebuild in PowerPoint
every month — and what would you stop rebuilding?

## 9. Key takeaways

- One data source, five surfaces — pick by audience, never by data availability.
- Reporting Center + subscriptions make reporting a service, not a chore.
- Analytics shows trends; AI accelerates questions; humans keep the decisions.
