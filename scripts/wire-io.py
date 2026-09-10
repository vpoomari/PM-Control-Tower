#!/usr/bin/env python3
"""Wire Import/Export (io prop) into every module view's PageHeader — one-time scaffold."""
import re, sys

WIRING = {
  "src/views/portfolio/portfolios.tsx": 'io="portfolios"',
  "src/views/portfolio/programs.tsx": 'io="programs"',
  "src/views/portfolio/projects.tsx": 'io="projects"',
  "src/views/plan/register.tsx": 'io="projects"',
  "src/views/plan/requirements.tsx": 'io="requirements"',
  "src/views/plan/wbs.tsx": 'io="wbs-nodes"',
  "src/views/plan/tasks.tsx": 'io="tasks"',
  "src/views/plan/schedule.tsx": 'io="tasks"',
  "src/views/plan/milestones.tsx": 'io="milestones"',
  "src/views/plan/baselines.tsx": 'io="baselines"',
  "src/views/execute/resources.tsx": 'io="resources"',
  "src/views/execute/timesheets.tsx": 'io="timesheets"',
  "src/views/control/financials.tsx": 'io="budget-lines"',
  "src/views/control/evm.tsx": 'io="evm-periods"',
  "src/views/control/health.tsx": 'io="health-snapshots"',
  "src/views/control/changes.tsx": 'io="changes"',
  "src/views/control/gates.tsx": 'io="stage-gates"',
  "src/views/control/governance.tsx": 'io="governance-rules"',
  "src/views/admin/users.tsx": 'io="users"',
  "src/views/admin/audit.tsx": 'io="audit-events"',
  "src/views/control/raid.tsx": 'io={tab === "issues" ? "issues" : tab === "assumptions" ? "assumptions" : "risks"}',
}

failed = []
for path, io_attr in WIRING.items():
    with open(path, encoding="utf-8") as f:
        src = f.read()
    if "io=" in src and "PageHeader" in src and io_attr in src:
        print(f"skip (already wired): {path}")
        continue
    marker = "<PageHeader\n"
    idx = src.find(marker)
    if idx == -1:
        failed.append(f"{path}: no <PageHeader\\n found")
        continue
    out = src[: idx + len(marker)] + f"        {io_attr}\n" + src[idx + len(marker) :]
    with open(path, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"wired: {path} -> {io_attr[:40]}")

if failed:
    print("FAILURES:"); [print(" -", f) for f in failed]; sys.exit(1)
print("ALL WIRED")
