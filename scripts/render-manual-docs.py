#!/usr/bin/env python3
"""render-manual-docs.py - Markdown -> print-ready HTML (PDF) and Word-ready HTML (DOCX).

Usage:
    python scripts/render-manual-docs.py [input.md] [outdir]

Defaults:
    input  = docs/ENTERPRISE-USER-MANUAL.md
    outdir = %TEMP%\\pmct-manual-build   (TEMP/pmct-manual-build elsewhere)

Produces in outdir:
    manual-print.html  inline mermaid SVG diagrams  -> Edge  --print-to-pdf  -> PDF
    manual-word.html   local <img> JPEG diagrams    -> Word  SaveAs2(16)    -> DOCX
    img/dN.jpg         diagram images for the Word variant

Diagram rendering goes through mermaid.ink (no local mermaid install, no new
dependencies beyond the already-installed `markdown` package).  If a diagram
cannot be rendered it degrades to a fenced <pre> block, so conversion never
blocks.  Headings get GitHub-style ids/anchors so the manual's own table of
contents links work in the browser, in the PDF and in Word.

Follow-up commands (PowerShell):
    & "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --headless `
        --no-pdf-header-footer --print-to-pdf="...\\docs\\ENTERPRISE-USER-MANUAL.pdf" `
        "file:///.../manual-print.html"
    # Word COM: Documents.Open(manual-word.html) -> SaveAs2(..., 16)
"""
from __future__ import annotations

import base64
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

import markdown

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    )
}

CSS = """\
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Calibri, Arial, sans-serif; font-size: 10.5pt;
       line-height: 1.45; color: #1c2b3a; margin: 0;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4; margin: 18mm 16mm; }
h1 { font-size: 27pt; line-height: 1.15; color: #0b2545; margin: 0 0 6pt;
     letter-spacing: -0.5pt; }
h2 { font-size: 15.5pt; color: #0b2545; border-bottom: 2pt solid #0e7490;
     padding-bottom: 3pt; margin: 0 0 10pt;
     page-break-before: always; break-before: page; page-break-after: avoid; }
h3 { font-size: 12pt; color: #0e7490; margin: 14pt 0 6pt;
     page-break-after: avoid; }
h4 { font-size: 10.5pt; color: #0b2545; margin: 10pt 0 4pt; }
p { margin: 0 0 7pt; }
a { color: #0e7490; text-decoration: none; }
table { border-collapse: collapse; width: 100%; font-size: 9pt;
        margin: 4pt 0 12pt; }
th { background-color: #0b2545; color: #ffffff; text-align: left;
     padding: 4pt 6pt; border: 1pt solid #9fb0c2; font-weight: bold; }
td { padding: 4pt 6pt; border: 1pt solid #c4cfda; vertical-align: top; }
tr { page-break-inside: avoid; }
code { font-family: Consolas, "Courier New", monospace; font-size: 9pt;
       background-color: #eef2f6; color: #16324a; padding: 0 3pt; }
pre { background-color: #f4f7f9; border: 1pt solid #d6dfe8;
      border-left: 3pt solid #0e7490; padding: 7pt 9pt;
      font-family: Consolas, "Courier New", monospace; font-size: 8.5pt;
      line-height: 1.3; color: #16324a; white-space: pre-wrap;
      word-wrap: break-word; page-break-inside: avoid; }
pre code { background-color: transparent; padding: 0; color: inherit;
           font-size: inherit; }
pre.dense { font-size: 6.2pt; }
blockquote { margin: 8pt 0; padding: 6pt 10pt; border-left: 3pt solid #0e7490;
             background-color: #eef7f9; color: #2c4457; }
blockquote p { margin: 0 0 4pt; }
hr { border: none; border-top: 1pt solid #ccd7e2; margin: 14pt 0; }
ul, ol { margin: 4pt 0 9pt; padding-left: 18pt; }
li { margin-bottom: 3pt; }
strong { color: #0b2545; }
.diagram { text-align: center; margin: 8pt 0 4pt;
           page-break-inside: avoid; break-inside: avoid;
           page-break-after: avoid; break-after: avoid; }
.diagram img { max-width: 100%; }
.cap { text-align: center; font-size: 8.5pt; color: #5b6b7c;
       font-style: italic; margin: 0 0 10pt; }
"""

HTML_TMPL = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Control Tower - Enterprise User Manual</title>
<style>
%s
</style>
</head>
<body>
%s
</body>
</html>
"""


def fetch(url: str, tries: int = 3) -> bytes | None:
    last: Exception | None = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as resp:
                return resp.read()
        except Exception as exc:  # noqa: BLE001 - any failure just retries
            last = exc
            time.sleep(2)
    print(f"    fetch failed after {tries} tries: {last}")
    return None


def diagram_urls(code: str):
    payload = {"code": code, "mermaid": {"theme": "default"},
               "backgroundColor": "white"}
    wid = base64.urlsafe_b64encode(
        json.dumps(payload, ensure_ascii=False).encode("utf-8")
    ).decode("ascii").rstrip("=")
    return f"https://mermaid.ink/svg/{wid}", f"https://mermaid.ink/img/{wid}"


def gh_slug(text: str, seen: dict) -> str:
    """GitHub-style heading slug so the manual's own TOC anchors resolve."""
    text = re.sub(r"<[^>]+>", "", text)          # strip inline tags
    text = text.replace("&amp;", "&").lower()
    text = re.sub(r"[^\w\- ]", "", text, flags=re.UNICODE)
    slug = re.sub(r"\s", "-", text.strip())
    if not slug:
        slug = "section"
    if slug in seen:
        seen[slug] += 1
        slug = f"{slug}-{seen[slug]}"
    return slug


def add_heading_ids(html: str) -> str:
    seen: dict = {}

    def repl(match: re.Match) -> str:
        level, attrs, inner = match.groups()
        if re.search(r"\bid\s*=", attrs):
            return match.group(0)
        slug = gh_slug(inner, seen)
        # <a name> makes Word create a real bookmark; id makes it work in browsers/PDF.
        return (f'<a name="{slug}"></a>'
                f'<h{level}{attrs} id="{slug}">{inner}</h{level}>')

    return re.sub(r"<h([1-6])([^>]*)>(.*?)</h\1>", repl, html, flags=re.S)


def heading_title_before(source: str, pos: int) -> str:
    """Nearest markdown heading above a position, minus its numbering."""
    matches = list(re.finditer(r"^#{2,3}\s+(.+)$", source[:pos], re.M))
    if not matches:
        return ""
    title = matches[-1].group(1).strip()
    title = re.sub(r"^[\d.]+\s+", "", title)
    return title


def mark_dense_blocks(html: str) -> str:
    """Tag code blocks whose lines are too wide for the page.

    Without this, long ASCII diagrams soft-wrap and their box-drawing
    alignment falls apart (wrapping shifts every column).  Dense blocks get
    a smaller monospace size so every line fits the text column instead.
    """
    longest = 0

    def repl(m: re.Match) -> str:
        nonlocal longest
        txt = re.sub(r"<[^>]+>", "", m.group(1))
        txt = (txt.replace("&amp;", "&").replace("&lt;", "<")
               .replace("&gt;", ">"))
        lines = max((len(line) for line in txt.splitlines()), default=0)
        longest = max(longest, lines)
        if lines > 100:
            return m.group(0).replace("<pre>", '<pre class="dense">', 1)
        return m.group(0)

    out = re.sub(r"<pre>(.*?)</pre>", repl, html, flags=re.S)
    print(f"  longest code line: {longest} chars "
          f"({'dense class applied' if longest > 100 else 'all fit'})")
    return out


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    md_path = Path(sys.argv[1]) if len(sys.argv) > 1 else (
        root / "docs" / "ENTERPRISE-USER-MANUAL.md"
    )
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(
        os.environ.get("TEMP", "/tmp")
    ) / "pmct-manual-build"
    img_dir = out / "img"
    out.mkdir(parents=True, exist_ok=True)
    img_dir.mkdir(parents=True, exist_ok=True)

    text = md_path.read_text(encoding="utf-8")
    print(f"input: {md_path} ({len(text.splitlines())} lines)")

    # 1. Pull out mermaid fences -> tokens; keep code + caption for later.
    blocks = []
    for i, m in enumerate(re.finditer(r"```mermaid[ \t]*\n(.*?)\n[ \t]*```",
                                      text, re.S)):
        blocks.append({
            "token": f"@@DIAGRAM{i}@@",
            "code": m.group(1),
            "title": heading_title_before(text, m.start()),
        })
    # Tokenise in document order: one substitution pass, tokens assigned
    # in the same order the fences appear (finditer order == blocks order).
    pattern = re.compile(r"```mermaid[ \t]*\n.*?\n[ \t]*```", re.S)
    order = iter(blocks)

    def _tokenize(match: re.Match) -> str:
        return f"\n\n{next(order)['token']}\n\n"

    text, n = pattern.subn(_tokenize, text)
    if n != len(blocks):
        print(f"WARNING: tokenised {n} of {len(blocks)} mermaid blocks")
    print(f"diagrams found: {len(blocks)}")

    # 2. Markdown -> HTML.
    html = markdown.markdown(text, extensions=["tables", "fenced_code"])
    html = mark_dense_blocks(html)
    leftover = re.findall(r"```", html)
    if leftover:
        print(f"WARNING: {len(leftover)} unconverted fence markers remain")

    # 3. Render diagrams (vector SVG for print, JPEG for Word).
    for idx, b in enumerate(blocks):
        print(f"  diagram {idx + 1}/{len(blocks)}: {b['title'] or '(untitled)'}")
        svg_url, jpg_url = diagram_urls(b["code"])
        svg = fetch(svg_url)
        jpg = fetch(jpg_url)
        b["svg"] = svg.decode("utf-8", "replace") if svg else None
        b["jpg"] = None
        if jpg and jpg[:3] in (b"\xff\xd8\xff",):
            jpg_path = img_dir / f"d{idx}.jpg"
            jpg_path.write_bytes(jpg)
            b["jpg"] = jpg_path
            b["jpg_url"] = jpg_path.as_uri()
        print(f"    svg={'ok' if b['svg'] else 'FAIL'} "
              f"jpg={'ok' if b['jpg'] else 'FAIL'} "
              f"({len(svg) if svg else 0} / {len(jpg) if jpg else 0} bytes)")

    def svg_box(b: dict) -> tuple[float, float] | None:
        if not b.get("svg"):
            return None
        # viewBox="min-x min-y width height" - origins can be negative
        # (sequence diagrams with activator/alt overflow), so read w/h only.
        m = re.search(
            r'viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"', b["svg"]
        )
        return (float(m.group(3)), float(m.group(4))) if m else None

    def fit(vw: float, vh: float, max_w: float, max_h: float) -> tuple[int, int]:
        # Never upscale past mermaid's natural size: bigger is not more
        # readable across figures, and narrow chains get ugly oversized.
        scale = min(max_w / vw, max_h / vh, 1.0)
        return max(1, round(vw * scale)), max(1, round(vh * scale))

    def diagram_html(b: dict, variant: str, idx: int) -> str:
        cap = (f'<div class="cap">Figure {idx + 1} &mdash; {b["title"]}</div>'
               if b["title"] else "")
        box = svg_box(b)
        if variant == "print" and b["svg"]:
            body = b["svg"]
            if box:
                # Explicit px size: fit the A4 text column (673px) and the
                # usable page height (810px) instead of stretching to the
                # container width (which blows tall diagrams past the page
                # and shrinks wide ones to unreadable strips).
                w, h = fit(box[0], box[1], 673.0, 810.0)
                head_end = body.index(">")
                head, rest = body[:head_end], body[head_end:]
                head = re.sub(r'\sstyle="[^"]*"', "", head)
                head = re.sub(r'\swidth="[^"]*"', "", head)
                head = re.sub(r'\sheight="[^"]*"', "", head)
                head = head.replace("<svg",
                                    f'<svg style="width:{w}px;height:{h}px"', 1)
                body = head + rest
                print(f"    fitted {w}x{h} (natural {box[0]:.0f}x{box[1]:.0f})")
        elif variant == "word" and b["jpg"]:
            vw, vh = box if box else (900.0, 600.0)
            w, h = fit(vw, vh, 600.0, 800.0)
            body = (f'<img src="{b["jpg_url"]}" alt="Figure {idx + 1}: '
                    f'{b["title"]}" width="{w}" height="{h}">')
        else:
            body = (f'<pre><code class="language-mermaid">'
                    f'{_esc(b["code"])}</code></pre>')
        return f'<div class="diagram">{body}</div>{cap}'

    def _esc(s: str) -> str:
        return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

    for variant in ("print", "word"):
        out_html = html
        for idx, b in enumerate(blocks):
            block = diagram_html(b, variant, idx)
            wrapped = f"<p>{b['token']}</p>"
            if wrapped in out_html:
                out_html = out_html.replace(wrapped, block)
            else:
                out_html = out_html.replace(b["token"], block)
        out_html = add_heading_ids(out_html)
        if "@@DIAGRAM" in out_html:
            print(f"WARNING: unreplaced diagram token in {variant} html")
        if "**" in out_html:
            print(f"WARNING: unparsed bold marker in {variant} html "
                  f"({out_html.count('**')} occurrences)")
        page = HTML_TMPL % (CSS, out_html)
        dest = out / f"manual-{variant}.html"
        dest.write_text(page, encoding="utf-8")
        print(f"wrote {dest} ({dest.stat().st_size} bytes, "
              f"{page.count('<table')} tables, "
              f"{page.count('class=\"diagram\"')} diagrams)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
