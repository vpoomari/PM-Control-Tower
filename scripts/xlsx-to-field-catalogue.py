# PM CONTROL TOWER — convert Jira_Enterprise_PMO_Field_Catalogue.xlsx into a Form Tab
# Builder import document (fields only) consumable by POST /api/tabs/import and
# scripts/seed-field-catalogue.ts. Pure stdlib + openpyxl; no app imports.
#
# Usage: python scripts/xlsx-to-field-catalogue.py <workbook.xlsx> [out.json]

import json
import re
import sys

import openpyxl

SKIP_SHEETS = {"read me", "field types & config", "calculation reference"}


def norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def to_key(s: str) -> str:
    k = re.sub(r"[^a-z0-9]+", "_", (s or "").lower()).strip("_")
    k = re.sub(r"_+", "_", k)[:60]
    return k if re.fullmatch(r"[a-z][a-z0-9_]{1,63}", k) else "f_" + k


SEG = r"[A-Z][A-Za-z0-9 &/()+.'’-]{1,34}"
SLASH_LIST = re.compile(rf"(?<![A-Za-z])({SEG}(?:\s*/\s*{SEG}){{2,}})")


def extract_options(desc: str):
    """Pull an explicit choice list out of the description ('Low / Medium / High / Critical')."""
    for m in SLASH_LIST.finditer(desc or ""):
        parts = [p.strip(" .") for p in m.group(1).split("/")]
        parts = [p for p in parts if 1 < len(p) <= 40]
        # junk guard: sentences disguised as lists (many words per segment)
        if 3 <= len(parts) <= 12 and sum(len(p.split()) for p in parts) <= len(parts) * 3:
            return parts
    return None


def map_type(raw: str, desc: str):
    """Map the 'Recommended Jira / Data Type' text onto FIELD_DATA_TYPES."""
    s = (raw or "").lower()
    opts = extract_options(desc)
    if "multi-select" in s:
        return ("MULTI_SELECT" if opts else "TEXT", opts, bool(opts))
    if "rag" in s:
        return ("DROPDOWN", opts or ["Red", "Amber", "Green"], False)
    if "user picker" in s or "user field" in s:
        return ("USER_LOOKUP", None, False)
    if "email" in s:
        return ("EMAIL", None, False)
    if "url" in s:
        return ("URL", None, False)
    if "phone" in s:
        return ("PHONE", None, False)
    if "checkbox" in s or "boolean" in s:
        return ("BOOLEAN", None, False)
    if "date" in s:
        return ("DATE", None, False)
    if any(k in s for k in ("currency", "number", "score", "percentage", "ratio", "calculated", "formula")):
        return ("NUMBER", None, False)
    if any(k in s for k in ("dropdown", "select list", "workflow", "priority", "pick")):
        if opts:
            return ("DROPDOWN", opts, False)
        # Jira dropdown without a documented value list — store as TEXT until configured
        return ("TEXT", None, True)
    return ("TEXT", None, False)


def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else "Jira_Enterprise_PMO_Field_Catalogue.xlsx"
    out = sys.argv[2] if len(sys.argv) > 2 else "examples/jira-field-catalogue.import.json"

    wb = openpyxl.load_workbook(src, data_only=True)
    by_name: dict[str, dict] = {}
    used_keys: set[str] = set()

    for ws in wb.worksheets:
        if norm_name(ws.title) in SKIP_SHEETS:
            continue
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            continue
        header = [norm_name(str(c) if c else "") for c in rows[0]]
        if "field name" not in header:
            continue
        col = {name: i for i, name in enumerate(header)}
        get = lambda row, name: (row[col[name]] if col.get(name) is not None and col[name] < len(row) else None)

        for row in rows[1:]:
            name = (get(row, "field name") or "").strip() if isinstance(get(row, "field name"), str) else get(row, "field name")
            if not name:
                continue
            name = str(name).strip()
            if not name or norm_name(name) in ("field name",):
                continue
            jira_type = str(get(row, "recommended jira data type") or "").strip()
            mandatory = str(get(row, "mandatory") or "").strip()
            purpose = str(get(row, "description purpose") or "").strip()
            owner = str(get(row, "suggested owner") or "").strip()
            usage = str(get(row, "reporting usage") or "").strip()

            nk = norm_name(name)
            if nk in by_name:
                rec = by_name[nk]
                if ws.title not in rec["sheets"]:
                    rec["sheets"].append(ws.title)
                continue

            data_type, options, needs_config = map_type(jira_type, purpose)
            desc_parts = []
            if purpose:
                desc_parts.append(purpose)
            meta_bits = []
            if owner:
                meta_bits.append(f"Owner: {owner}")
            if usage:
                meta_bits.append(f"Usage: {usage}")
            meta_bits.append(f"Jira type: {jira_type or 'n/a'}")
            if needs_config:
                meta_bits.append("configure dropdown options when the value list is agreed")
            desc_parts.append(" · ".join(meta_bits))
            description = " — ".join(desc_parts)
            if len(description) > 400:
                description = description[:397] + "…"

            key = to_key(name)
            n = 2
            while key in used_keys:
                suffix = f"_{n}"
                key = to_key(name)[: 60 - len(suffix)] + suffix
                n += 1
            used_keys.add(key)

            by_name[nk] = {
                "fieldKey": key,
                "label": name[:80],
                "dataType": data_type,
                "options": options if data_type in ("DROPDOWN", "MULTI_SELECT") else None,
                "description": description,
                "isActive": True,
                "sheets": [ws.title],
                "mandatory": mandatory.lower() == "yes",
            }

    fields = []
    for rec in by_name.values():
        if len(rec["sheets"]) > 1:
            extra = f"Used in: {', '.join(rec['sheets'])}."
            room = 400 - len(rec["description"]) - 1
            if room > 8:
                rec["description"] = (rec["description"] + " " + extra)[:400].rstrip()
        fields.append({k: rec[k] for k in ("fieldKey", "label", "dataType", "options", "description", "isActive")})

    fields.sort(key=lambda f: f["label"].lower())
    doc = {"version": 1, "fields": fields, "tabs": []}
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    from collections import Counter
    types = Counter(f["dataType"] for f in fields)
    dropdown_no_opts = sum(1 for f in fields if f["dataType"] == "TEXT" and "dropdown" in (f["description"] or "").lower())
    print(f"parsed {len(fields)} unique field(s) from {len(wb.worksheets)} sheet(s) → {out}")
    print("by type:", dict(sorted(types.items())))
    print(f"dropdowns stored as TEXT pending option list: {dropdown_no_opts}")
    mandatory_yes = sum(1 for r in by_name.values() if r["mandatory"])
    print(f"catalogue flags {mandatory_yes} field(s) as mandatory (apply per-tab in the Tab Builder)")


if __name__ == "__main__":
    main()
