#!/usr/bin/env python3
"""Compare the live FLOW project graph to the source planning workbook."""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import sqlite3
from pathlib import Path

from importlib.machinery import SourceFileLoader

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
LOADER = SourceFileLoader("flow_importer", str(HERE / "import-flow-workbook.py"))
IMPORTER = LOADER.load_module()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=IMPORTER.DEFAULT_WORKBOOK)
    parser.add_argument("--db", type=Path, default=IMPORTER.DEFAULT_DB)
    args = parser.parse_args()
    plan, raid, stages = IMPORTER.read_source(args.workbook)
    conn = sqlite3.connect(f"file:{args.db.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    project = conn.execute("SELECT * FROM Project WHERE code=?", (IMPORTER.PROJECT_CODE,)).fetchone()
    failures = []
    if not project:
        raise SystemExit(f"FAIL: project {IMPORTER.PROJECT_CODE} does not exist")
    pid = project["id"]

    tasks = conn.execute("SELECT * FROM Task WHERE projectId=?", (pid,)).fetchall()
    task_by_code = {row["code"]: row for row in tasks}
    source_by_code = {str(row["ID"]).strip(): row for row in plan}
    if len(tasks) != len(plan):
        failures.append(f"task row count {len(tasks)} != workbook {len(plan)}")
    if set(task_by_code) != set(source_by_code):
        failures.append(f"task business-code set differs (missing={len(set(source_by_code)-set(task_by_code))}, extra={len(set(task_by_code)-set(source_by_code))})")

    # Compare all source-controlled task fields and linked WBS/owners.
    user_names = {r["id"]: r["name"].casefold() for r in conn.execute("SELECT id,name FROM User")}
    wbs_by_id = {r["id"]: r for r in conn.execute("SELECT id,projectId,parentId,code,name FROM WBSNode WHERE projectId=?", (pid,))}
    owners_checked = dates_checked = priorities_checked = statuses_checked = 0
    for code, src in source_by_code.items():
        live = task_by_code.get(code)
        if not live:
            continue
        if live["name"] != str(src.get("Activity") or code).strip():
            failures.append(f"{code}: activity name differs")
        if live["priority"] != IMPORTER.priority(src.get("Priority")):
            failures.append(f"{code}: priority mismatch")
        else:
            priorities_checked += 1
        if live["status"] != IMPORTER.task_status(src.get("Status"), src.get("% completed")):
            failures.append(f"{code}: status mismatch")
        else:
            statuses_checked += 1
        source_dates = (IMPORTER.iso(src.get("Start date")), IMPORTER.iso(src.get("End date")))
        if (live["startDate"], live["endDate"]) != source_dates:
            failures.append(f"{code}: planned date mismatch")
        else:
            dates_checked += 1
        owner = IMPORTER.clean(src.get("Owner"))
        if not live["assigneeId"] or user_names.get(live["assigneeId"]) != owner.casefold():
            failures.append(f"{code}: owner account link mismatch")
        else:
            owners_checked += 1
        node = wbs_by_id.get(live["wbsId"] or "")
        if not node or node["projectId"] != pid or node["parentId"] is None:
            failures.append(f"{code}: missing substream WBS linkage")

    # Compare the complete task-dependency edge set, by business code.
    actual_edges = {
        (r["predecessor"], r["successor"])
        for r in conn.execute(
            """SELECT p.code predecessor,s.code successor FROM Dependency d
               JOIN Task p ON p.id=d.predecessorId JOIN Task s ON s.id=d.successorId
               WHERE d.projectId=? AND p.projectId=? AND s.projectId=?""",
            (pid, pid, pid),
        )
    }
    expected_edges = set()
    external = collections.defaultdict(set)
    code_set = set(source_by_code)
    for row in plan:
        succ = str(row["ID"]).strip()
        for ref in (IMPORTER.clean(row.get("Dependencies")) or "").split(","):
            ref = ref.strip()
            if ref in code_set:
                expected_edges.add((ref, succ))
            elif ref:
                external[succ].add(ref)
    if actual_edges != expected_edges:
        failures.append(f"dependency edge set differs (expected={len(expected_edges)}, actual={len(actual_edges)})")
    for code, refs in external.items():
        notes = task_by_code.get(code)["notes"] or ""
        if not all(ref in notes for ref in refs):
            failures.append(f"{code}: external dependency refs not preserved in notes")

    # Hierarchy and RAID/stage cardinalities.
    hierarchy = conn.execute(
        """SELECT COUNT(*) FROM Project p JOIN Program g ON g.id=p.programId
           JOIN Portfolio f ON f.id=p.portfolioId WHERE p.id=? AND g.portfolioId=f.id
           AND f.code=? AND g.code=?""",
        (pid, IMPORTER.PORTFOLIO_CODE, IMPORTER.PROGRAM_CODE),
    ).fetchone()[0]
    if hierarchy != 1:
        failures.append("portfolio -> program -> project linkage is invalid")
    wbs_count = len(wbs_by_id)
    expected_wbs = len({IMPORTER.clean(r.get("WS")) for r in plan}) + len({(IMPORTER.clean(r.get("WS")), IMPORTER.clean(r.get("Sub"))) for r in plan})
    if wbs_count != expected_wbs:
        failures.append(f"WBS node count {wbs_count} != expected {expected_wbs}")
    risk_count = conn.execute("SELECT COUNT(*) FROM Risk WHERE projectId=?", (pid,)).fetchone()[0]
    issue_count = conn.execute("SELECT COUNT(*) FROM Issue WHERE projectId=?", (pid,)).fetchone()[0]
    assumption_count = conn.execute("SELECT COUNT(*) FROM Assumption WHERE projectId=?", (pid,)).fetchone()[0]
    milestone_count = conn.execute("SELECT COUNT(*) FROM Milestone WHERE projectId=? AND code LIKE 'FLOW-CP-%'", (pid,)).fetchone()[0]
    expected_raid = collections.Counter(IMPORTER.clean(r.get("Type")) for r in raid)
    expected_issues = expected_raid["Issue"] + expected_raid["Dependency"]
    for label, actual, expected in (
        ("risks", risk_count, expected_raid["Risk"]),
        ("issues and RAID dependencies", issue_count, expected_issues),
        ("assumptions", assumption_count, expected_raid["Assumption"]),
        ("critical-path milestones", milestone_count, len(stages)),
    ):
        if actual != expected:
            failures.append(f"{label}: {actual} != expected {expected}")

    project_dates = (project["startDate"], project["endDate"])
    expected_start = IMPORTER.iso(min(IMPORTER.day(r.get("Start date")) for r in plan if IMPORTER.day(r.get("Start date"))))
    expected_finish = IMPORTER.iso(max(IMPORTER.day(r.get("End date")) for r in plan if IMPORTER.day(r.get("End date"))))
    expected_project_dates = (expected_start, expected_finish)
    # SQLite stores the same UTC ISO strings for this importer.
    if project_dates != expected_project_dates:
        failures.append(f"project date range differs: {project_dates} != {expected_project_dates}")
    if project["ownerId"] is not None or project["managerId"] is not None:
        failures.append("project-wide owner/manager exists but is not specified by the workbook")
    critical_flags = sum(1 for row in tasks if row["isCritical"])
    if critical_flags:
        failures.append(f"{critical_flags} persisted CPM-critical flags exist; this import does not run CPM")
    audit_count = conn.execute("SELECT COUNT(*) FROM AuditEvent WHERE entityType='FLOW_WORKBOOK' AND entityId=?", (pid,)).fetchone()[0]
    if not audit_count:
        failures.append("no FLOW_WORKBOOK audit event exists")

    report = {
        "project": {"code": project["code"], "status": project["status"], "ownerId": project["ownerId"], "managerId": project["managerId"]},
        "sourceTasks": len(plan), "liveTasks": len(tasks),
        "taskFieldsChecked": {"ownerLinks": owners_checked, "dates": dates_checked, "priorities": priorities_checked, "statuses": statuses_checked},
        "wbsNodes": wbs_count, "expectedWbsNodes": expected_wbs,
        "internalDependencies": len(actual_edges), "expectedInternalDependencies": len(expected_edges),
        "externalDependencyLabels": sum(len(v) for v in external.values()),
        "risks": risk_count, "issuesIncludingRaidDependencies": issue_count,
        "assumptions": assumption_count, "criticalPathMilestones": milestone_count,
        "persistedCriticalFlags": critical_flags,
        "resourceRecords": conn.execute("SELECT COUNT(*) FROM Resource").fetchone()[0],
        "projectAssignments": conn.execute("SELECT COUNT(*) FROM Assignment WHERE projectId=?", (pid,)).fetchone()[0],
        "auditEvents": audit_count,
        "failures": failures,
    }
    conn.close()
    import json
    print(json.dumps(report, indent=2, default=str))
    if failures:
        raise SystemExit(1)
    print("FLOW_WORKBOOK_VERIFICATION=PASS")


if __name__ == "__main__":
    main()
