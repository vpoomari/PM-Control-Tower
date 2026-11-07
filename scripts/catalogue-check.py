import json
doc = json.load(open("examples/jira-field-catalogue.import.json", encoding="utf-8"))
fields = doc["fields"]
print("total:", len(fields))
# rows where the Jira type cell was empty -> likely section headers / blank filler
no_type = [f for f in fields if "Jira type: n/a" in (f["description"] or "")]
print("fields with no Jira type at all:", len(no_type))
for f in no_type[:25]:
    print("  -", f["label"], "|", (f["description"] or "")[:70])
print()
print("sample entries:")
for f in fields[:5] + fields[200:203] + fields[-5:]:
    print("  ", f["fieldKey"], "|", f["dataType"], "|", f["label"], "|", (f["description"] or "")[:60], "| opts:", f["options"])
