#!/usr/bin/env python3
"""Post-process footers: explicit PAGE field format switches (Roman for front matter, arabic for body)."""
import re
import shutil
import sys
import zipfile

path = sys.argv[1]
tmp = path + ".tmp"

with zipfile.ZipFile(path) as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

doc = data["word/document.xml"].decode("utf-8")

# Map section order -> footer rIds (footerReference in sectPr order)
sect_footers = re.findall(r'<w:footerReference w:type="default" r:id="(rId\d+)"/>', doc)
rels = data["word/_rels/document.xml.rels"].decode("utf-8")
rid_to_file = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(footer\d+\.xml)"', rels))

# Sections order in document.xml: [front-matter sectPr, body sectPr] (cover has no footer ref)
fmt_by_index = ["ROMAN", "arabic"]
for i, rid in enumerate(sect_footers[:2]):
    fname = "word/" + rid_to_file.get(rid, "")
    if fname not in data:
        continue
    fx = data[fname].decode("utf-8")
    fmt = fmt_by_index[i]
    fx = re.sub(r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
                rf"\1 PAGE \\* {fmt} \\* MERGEFORMAT \2", fx)
    data[fname] = fx.encode("utf-8")
    print(f"patched {fname} -> {fmt}")

# Remove empty pgNumType from cover section
doc = doc.replace("<w:pgNumType/>", "")
data["word/document.xml"] = doc.encode("utf-8")

with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        zout.writestr(n, data[n])
shutil.move(tmp, path)
print("footers patched OK")
