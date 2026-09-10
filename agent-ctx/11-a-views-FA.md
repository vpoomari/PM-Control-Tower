# Task 11-a — views-FA (Portfolio + Plan frontend)

Agent: views-FA
Scope: 11 registered views + shared components + workspace tabs (paths fixed by src/views/registry.tsx)

## Files owned / verified / fixed

Top-level views (default export, wired in registry):
- src/views/portfolio/portfolios.tsx — card grid (code/name/status/programCount/projectCount/RAG/budget bars), create+edit dialog (code, name, description, owner, budgetTarget, dates, strategicObjective), detail dialog with program chips + project table → workspace
- src/views/portfolio/programs.tsx — DataTable + portfolio filter + stats; row click → drawer with projects (ragStatus, healthScore, progress, budget); create/edit dialog
- src/views/portfolio/projects.tsx — project register: search + status/RAG filters, DataTable (code, name, program→portfolio, PM, status, priority, RAG+health, progress, dates, budget), New Project dialog, row click → #/projects/[id]; realtime ["project:created","project:updated","project:health"]
- src/views/project/ProjectWorkspace.tsx — flagship workspace: header (code/name/status/RAG/phase/progress/PM/dates + budget vs actual vs EAC mini-metrics), 13 shadcn tabs, header bundle from GET /api/projects/[id]
- src/views/plan/register.tsx — read-only register from /api/projects?take=500 + CSV Blob export + row click → workspace
- src/views/plan/requirements.tsx — ProjectPicker + stat cards + RequirementsPanel
- src/views/plan/wbs.tsx — ProjectPicker + shared WbsTree
- src/views/plan/tasks.tsx — ProjectPicker + stat cards + TasksPanel (status/progress quick edit, "Open Gantt" link)
- src/views/plan/schedule.tsx — ProjectPicker + shared GanttChart + CPM summary
- src/views/plan/milestones.tsx — ProjectPicker + MilestonesPanel (add/complete/delete)
- src/views/plan/baselines.tsx — ProjectPicker + BaselinesPanel (create snapshot / activate)

Shared (src/views/plan/shared/):
- ProjectPicker.tsx — Select of /api/projects, persisted to localStorage "pmct.plan.project" (useStoredProjectId)
- WbsTree.tsx — nested tree rows, add (parent select)/edit/delete with 409 guard surfaced via toast
- GanttChart.tsx — pure-div CPM Gantt: weekly+monthly time axis, one row per task (WBS indent), bars from ES→EF, critical #dc2626, non-critical #2563eb, summary dark navy, total-float dashed outline extension (LF−EF), today marker, hover tooltip (ES/EF/LS/LF/float/dur/progress/status), legend, sticky info columns, predecessors column (code+type+lag), CPM summary cards; also used by workspace Schedule tab
- RequirementsPanel.tsx / TasksPanel.tsx / MilestonesPanel.tsx / BaselinesPanel.tsx — shared panels used by both plan pages and workspace tabs

Workspace tabs (src/views/project/tabs/):
- types.ts (ProjectDetailBundle mirror of GET /api/projects/[id])
- OverviewTab (charter/objectives/success criteria, CPI/SPI/EAC/VAC/TCPI cards, latest health snapshot, open items, financial strip)
- ScopeTab (charter + RequirementsPanel with inline status edit)
- FinancialsTab (/api/financials categories + /api/financials/budget-lines, stacked recharts BarChart, variance table + totals)
- EvmTab (12 metric cards + CPI/SPI LineChart + POST /api/evm snapshot)
- HealthTab (recharts RadialBarChart gauge + snapshot history + POST /api/health recalc)
- RaidTab (risks/issues/assumptions tables + add dialogs + status PATCH + delete)
- ChangesTab (CR table, transitions mirror, decision dialog → PATCH /api/changes/[id] {status,decision})
- GatesTab (sequence stepper cards, decision dialog → PATCH /api/gates/[id] {decisionStatus, evidence})
- AuditTab (/api/projects/[id]/audit DataTable)

## Fixes applied this session
1. DataTable<T extends Record<string, unknown>> constraint: interfaces don't get implicit index signatures → converted row types to type aliases in plan/register.tsx, portfolio/projects.tsx, plan/shared/RequirementsPanel.tsx, project/tabs/AuditTab.tsx (2 tsc errors each).
2. HealthTab.tsx: `latest` was `HealthSnapshot | project-shape` union (reading .cpi/.spi/.eac… on union) → removed `|| health.data.project` fallback, condition uses `latest` directly (19 tsc errors).
3. EvmTab.tsx: RUNTIME TypeError "Cannot read properties of undefined (reading 'replace')" at line 81 — GET /api/evm `evm` is the live computeEVM() result which has NO `source`/`statusDate`; typed evm/current as EvmLive (Omit) and description now reads latestSnapshot?.statusDate / latestSnapshot?.source. Verified in browser — overlay gone.

## Verification
- bunx tsc --noEmit → 0 errors in src/views/** (app-wide only 2 pre-existing errors remain in skills/ scripts, not app code)
- bun run lint → 0 problems in src/views/portfolio|plan|project (remaining 4 errors/6 warnings are Task-10 foundation files: dashboard/shell/realtime/client + scripts — outside batch scope)
- Browser smoke (agent-browser --session fa): login via PMO chip → #/portfolios (cards+dialogs render live data) → #/programs (row→drawer with 3 projects) → #/projects (register+filters) → first project → ALL 13 workspace tabs verified with content (Overview/Scope/WBS/Schedule/Milestones/Baselines/Financials/EVM/Health/RAID/Changes/Stage Gates/Audit) → #/register → #/requirements (created PRJ-DATA-002-REQ-005, then deleted it) → #/wbs → #/tasks (quick edits + Open Gantt link) → #/schedule → #/milestones → #/baselines. Zero Runtime TypeError overlays after EvmTab fix; dev.log clean (200s only).
- Gantt hover tooltip verified (ES/EF/LS/LF/float); screenshot → /home/z/my-project/.zscripts/fa-gantt.png
- localStorage persistence verified: picker selection ("pmct.plan.project") survives across plan pages.
