#!/usr/bin/env python3
"""Merge Playwright cover + ReportLab body into the final overview PDF (A4-normalized)."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

COVER = "/home/z/my-project/scripts/overview-cover.pdf"
BODY = "/home/z/my-project/scripts/overview-body.pdf"
OUT = "/home/z/my-project/download/PM-Control-Tower-Platform-Overview.pdf"


def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.4 or abs(h - A4_H) > 0.4:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
writer.add_page(normalize_page_to_a4(PdfReader(COVER).pages[0]))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    "/Title": "PM Control Tower - Platform Overview",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "Executive overview and demo companion for the PM Control Tower platform",
})
with open(OUT, "wb") as f:
    writer.write(f)
print(f"final: {OUT} pages={len(writer.pages)}")
