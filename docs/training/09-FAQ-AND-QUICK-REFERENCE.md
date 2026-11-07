# 09 · FAQ & Quick Reference

> Keep this open during training and daily work. Every answer maps to a real
> screen — the **Go to** column is your fastest path.

## Everyday questions

**Q: Where do I start my day?**
Your home screen is set by your role — delivery roles land on the **Work
 Inbox** (`#/inbox`), executives on the **Executive Control Tower**
 (`#/dashboard`), read-only roles on **Reports**. Everything waiting for you is
 in the inbox.

**Q: How do I find anything quickly?**
`⌘K` (Ctrl+K) — global search across projects, tasks, risks, docs and people.

**Q: Can I edit a value directly in a list?**
Yes — **double-click** any editable cell in register/task/RAID lists and type.
The full form is always available in the row's drawer.

**Q: A colleague changed something and my dashboard looks stale.**
Dashboards refresh in realtime; if you suspect staleness, check the **Live**
badge time and the **Integrity** screen (`#/integrity`) freshness score.

**Q: My menu is missing screens other people have.**
That is least-privilege working correctly. Your role decides the menu; ask a
PMO admin if your role genuinely needs more (`Administration → Roles`).

**Q: I cannot open the Executive Control Tower.**
It requires `executive.view`. You will see a clear "Restricted area" panel with
shortcuts — ask your PMO admin if you need executive oversight.

## Delivery questions

**Q: The schedule dates moved — did we approve that?**
Check **Baselines** (`#/baselines`) and **Changes** (`#/changes`). Approved
date changes travel through change control; anything else is a bug — report it.

**Q: Why does EVM show no indices for my project?**
EVM is computed at **period close** with actuals present. Log/approve
timesheets, then close an EVM period (`#/evm`).

**Q: My project's freshness score is red. What now?**
Open **Data Integrity** — the panel names the worst feed. In practice it is
almost always timesheets or actuals older than the threshold; chase the feed,
the score recovers automatically.

**Q: Can I run the plan without touching the live data?**
Yes — **Planning Lab** (`#/tools`): what-if scenarios, CPM calculations and
leveling prescriptions never mutate the live plan until you adopt them.

**Q: Over-allocated resources keep appearing. Where do I fix them?**
`#/resources` shows the load; Planning Lab → Resource leveling proposes moves
that never touch critical tasks and honour float.

## Governance questions

**Q: A gate decision or CR approval — where do I act?**
**Governance** (`#/governance`) — pending gates and changes in flight, with
your decision buttons if you hold `gate.decide` / change approval rights.

**Q: Who changed this value last week?**
**Administration → Audit Trail** (`#/admin/audit`) — filter by entity, user or
date; before/after values are recorded.

**Q: The AI Assistant drafted an action — did it execute?**
Never automatically. AI drafts go through human review; AI proposes, people
decide.

## Admin questions

**Q: We need an extra field on projects — do we call IT?**
No. **Field Dictionary** (`#/admin/fields`) adds typed custom fields live;
**Form Tab Builder** (`#/admin/tabs`) places them on the form. Both apply
immediately, are filterable, reportable and API-visible.

**Q: Automations keep firing — is that safe?**
The scan endpoint deduplicates executions over 24 hours; every execution is
logged. Check **Control Automations** execution history before assuming a loop.

**Q: How do I give someone a custom set of permissions?**
**Roles & Permissions** — copy a template, adjust the matrix, assign to users.

## Quick reference card

| Task | Go to |
|------|-------|
| Find anything | `⌘K` |
| My tasks & approvals | `#/inbox` |
| Edit a cell in place | double-click |
| Portfolio overview | `#/dashboard` |
| Project list | `#/projects` (register twin: `#/register`) |
| Plan / WBS / schedule | `#/wbs`, `#/schedule` |
| Test a scenario | `#/tools` (Planning Lab) |
| Log/submit hours | `#/timesheets` |
| Cost truth | `#/financials` |
| CPI/SPI | `#/evm` |
| Risks & issues | `#/raid` |
| Raise/approve change | `#/changes`, `#/governance` |
| Data trust score | `#/integrity` |
| Board pack | `#/reports/leadership` |
| Self-service report | `#/reporting` |
| Trends | `#/analytics` |
| Automations | `#/automations` |
| Add a custom field | `#/admin/fields` |
| Who changed what | `#/admin/audit` |

## Keyboard & UI habits

- `⌘K` / `Ctrl+K` — global search.
- Double-click — inline edit.
- Hover a 3D chart — exact values; click — drill to source.
- "Live · HH:MM" badge — freshness of the current view.
- Every list: filter, sort, search — and every list exports.

## Who to call

| Situation | Owner |
|-----------|-------|
| Access / role questions | PMO Administrator (`pmo@pmct.io` in demo) |
| Plan/schedule disputes | Program Manager |
| Budget/forecast questions | Finance Controller |
| Platform/config changes | PMO Administrator (Administration group) |
| Suspicious data | Check Integrity first, then Audit Trail |

---

*PM Control Tower v3.1.0 — training pack. Companion to `docs/` guides:
01-DEPLOYMENT, 02-ADMIN, 03-USER, 04-ARCHITECTURE, 05-API, 06-DATA-MODEL,
07-RBAC-MATRIX, 09-OPERATIONS, 10-SECURITY, 11-INTEGRITY.*
