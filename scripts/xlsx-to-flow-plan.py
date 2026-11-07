"""Convert the FLOW planning workbook into JSON for scripts/load-flow-plan.ts."""
import json
import re
import sys
from datetime import date, datetime

import openpyxl

SRC = r".zwork/attachments/bb5ff191-da66-49ae-bf5a-264af5e829a8/202601020 - Project Flow - Planning Q4 2026 - MA - offline copy.xlsx"
OUT = "examples/flow-plan-q4-2026.json"


def as_date(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, str) and re.match(r"\d{4}-\d{2}-\d{2}", v.strip()):
        return v.strip()[:10]
    return None


def as_int(v):
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return None


def as_pct(v):
    n = as_int(v)
    if n is None:
        return 0
    return max(0, min(100, n))


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)

    # ---------- Plan ----------
    plan_ws = wb["Plan"]
    rows = list(plan_ws.iter_rows(values_only=True))
    header = [str(c).strip().lower() if c is not None else "" for c in rows[0]]
    col = {h: i for i, h in enumerate(header)}
    activities = []
    for row in rows[1:]:
        get = lambda name: (row[col[name]] if name in col and col[name] < len(row) else None)
        aid = as_int(get("id"))
        name = (str(get("activity")).strip() if get("activity") else "")
        if aid is None and not name:
            continue
        activities.append({
            "id": aid,
            "ws": (str(get("ws")).strip() if get("ws") else "") or None,
            "sub": (str(get("sub")).strip() if get("sub") else "") or None,
            "name": name,
            "owner": (str(get("owner")).strip() if get("owner") else "") or None,
            "start": as_date(get("start date")),
            "end": as_date(get("end date")),
            "depends": str(get("dependencies") or "").strip() or None,
            "comments": (str(get("comments")).strip() if get("comments") else "") or None,
            "pct": as_pct(get("% completed")),
            "status": (str(get("status")).strip() if get("status") else "") or None,
        })

    # ---------- RAID ----------
    raid_ws = wb["RAID"]
    rrows = list(raid_ws.iter_rows(values_only=True))
    rheader = [str(c).strip().lower() if c is not None else "" for c in rrows[0]]
    rcol = {h: i for i, h in enumerate(rheader)}
    raid = []
    for row in rrows[1:]:
        get = lambda name: (row[rcol[name]] if name in rcol and rcol[name] < len(row) else None)
        rid = as_int(get("raid id"))
        rtype = (str(get("type")).strip() if get("type") else "")
        title = (str(get("title")).strip() if get("title") else "")
        if rid is None and not title:
            continue
        raid.append({
            "id": rid,
            "type": rtype or None,
            "ws": (str(get("workstream")).strip() if get("workstream") else "") or None,
            "title": title,
            "description": (str(get("description")).strip() if get("description") else "") or None,
            "impact": (str(get("impact")).strip() if get("impact") else "") or None,
            "likelihood": (str(get("likelihood")).strip() if get("likelihood") else "") or None,
            "severity": (str(get("severity")).strip() if get("severity") else "") or None,
            "owner": (str(get("owner")).strip() if get("owner") else "") or None,
            "mitigation": (str(get("mitigation / action")).strip() if get("mitigation / action") else "") or None,
            "due": as_date(get("due date")),
            "status": (str(get("status")).strip() if get("status") else "") or None,
            "escalation": (str(get("escalation / decision needed")).strip() if get("escalation / decision needed") else "") or None,
            "updated": as_date(get("last updated")),
        })

    doc = {"source": "202601020 - Project Flow - Planning Q4 2026 - MA - offline copy.xlsx", "activities": activities, "raid": raid}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)

    # ---------- summary ----------
    from collections import Counter
    print(f"activities: {len(activities)} (with dates: {sum(1 for a in activities if a['start'] and a['end'])})")
    print("  WS:", dict(Counter(a["ws"] or "?" for a in activities)))
    print("  status:", dict(Counter(a["status"] or "?" for a in activities)))
    print("  owner:", dict(Counter(a["owner"] or "?" for a in activities)))
    dep_ids = set()
    bad_deps = []
    for a in activities:
        if a["depends"]:
            for tok in re.split(r"[,;\s]+", a["depends"]):
                if not tok:
                    continue
                n = as_int(tok)
                if n is None:
                    bad_deps.append((a["id"], tok))
                else:
                    dep_ids.add(n)
    known = {a["id"] for a in activities if a["id"] is not None}
    print(f"  dependency refs: {len(dep_ids)} unique, unknown: {sorted(dep_ids - known)[:10]}, unparsed: {bad_deps[:10]}")
    undated = [a["id"] for a in activities if a["id"] is not None and not (a["start"] and a["end"])]
    print(f"  undated activities: {len(undated)} e.g. {undated[:12]}")
    milli = [a for a in activities if re.search(r"milestone|stage gate|go.?no.?go|go-?live|sign-?off|readiness", a["name"], re.I)]
    print(f"  milestone-like activities: {len(milli)} e.g. {[(a['id'], a['name'][:40]) for a in milli[:10]]}")
    print(f"raid: {len(raid)}")
    print("  type:", dict(Counter(r["type"] or "?" for r in raid)))
    print("  status:", dict(Counter(r["status"] or "?" for r in raid)))
    print("  severity:", dict(Counter(r["severity"] or "?" for r in raid)))
    print("  impact:", dict(Counter(r["impact"] or "?" for r in raid)))
    print("  likelihood:", dict(Counter(r["likelihood"] or "?" for r in raid)))
    print("  ws:", dict(Counter(r["ws"] or "?" for r in raid)))
    print(f"written → {OUT}")


if __name__ == "__main__":
    main()
