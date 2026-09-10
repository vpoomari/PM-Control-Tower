#!/usr/bin/env python3
"""Render the PM Control Tower architecture infographic at 12,000 x 9,000 px via CDP tiled capture."""
from playwright.sync_api import sync_playwright
from PIL import Image
import base64
import io
import os

HTML = "file:///home/z/my-project/scripts/architecture.html"
OUT = "/home/z/my-project/download/PM-Control-Tower-Architecture.png"
TMP = "/tmp/archtiles"
COLS, ROWS = 2, 3
CW, CH_ = 2000, 1000
SCALE = 3

os.makedirs(TMP, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--force-color-profile=srgb", "--hide-scrollbars"])
    page = browser.new_page(viewport={"width": 1200, "height": 800}, device_scale_factor=1)
    page.goto(HTML)
    page.wait_for_timeout(600)
    cdp = page.context.new_cdp_session(page)
    n = 0
    for r in range(ROWS):
        for c in range(COLS):
            clip = {"x": c * CW, "y": r * CH_, "width": CW, "height": CH_, "scale": SCALE}
            res = cdp.send("Page.captureScreenshot", {
                "format": "png", "clip": clip, "captureBeyondViewport": True,
            })
            img = Image.open(io.BytesIO(base64.b64decode(res["data"])))
            img.save(f"{TMP}/tile_{r}_{c}.png")
            n += 1
    browser.close()
print(f"captured {n} tiles at {CW*SCALE}x{CH_*SCALE} px each")

tiles = [[Image.open(f"{TMP}/tile_{r}_{c}.png") for c in range(COLS)] for r in range(ROWS)]
tw, th = tiles[0][0].size
full = Image.new("RGB", (tw * COLS, th * ROWS))
for r in range(ROWS):
    for c in range(COLS):
        full.paste(tiles[r][c], (c * tw, r * th))
full.save(OUT, compress_level=6)
print("stitched:", full.size, "->", OUT)
