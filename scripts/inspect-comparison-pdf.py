"""Local visual QA for the synthetic comparison exported by the browser check."""
import json
import re
from collections import Counter
from pathlib import Path

import pdfplumber
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "artifacts"
expected = json.loads((root / "comparison-report.json").read_text(encoding="utf-8"))
with pdfplumber.open(root / "comparison-report.pdf") as document:
    texts = []
    for number, page in enumerate(document.pages, 1):
        text = page.extract_text() or ""
        assert "Mộc Digital" in text, f"Brand/footer missing on page {number}"
        assert re.search(rf"{number}\s*/\s*{len(document.pages)}\b", text), f"Page number {number}"
        assert len(text) > 80, f"Mostly empty page {number}"
        assert "\ufffd" not in text
        for char in page.chars:
            if not char["text"].strip():
                continue
            assert char["x0"] >= 15 and char["x1"] <= page.width - 15, (number, "horizontal clipping", char)
            assert char["top"] >= 15 and char["bottom"] <= page.height - 10, (number, "vertical clipping", char)
        texts.append(text)
    full = "\n".join(texts)
    assert "Xu hướng điểm theo tháng" in full
    expected_titles = Counter(finding["title"] for site in expected["websites"] for findings in site["changes"].values() for finding in findings)
    for title, count in expected_titles.items():
        assert full.count(title) >= count, ("Missing findings", title, count, full.count(title))
    assert expected["project"]["name"] in full
    print(f"PASS: {len(document.pages)} A4 pages; all {sum(expected_titles.values())} findings, selected monthly chart, branding, footer/page numbers and text bounds.")

files = sorted(root.glob("comparison-pdf-page-*.png"))
for offset in range(0, len(files), 4):
    sheet = Image.new("RGB", (1080, 1570), "#dce3d7")
    draw = ImageDraw.Draw(sheet)
    for index, file in enumerate(files[offset:offset + 4]):
        page = Image.open(file).convert("RGB")
        page.thumbnail((520, 735))
        x, y = 10 + index % 2 * 540, 28 + index // 2 * 785
        draw.text((x, y - 18), file.stem, fill="#263a2c")
        sheet.paste(page, (x, y))
    sheet.save(root / f"comparison-pdf-contact-{offset // 4 + 1}.png")
if (root / "comparison-panel.png").exists():
    image = Image.open(root / "comparison-panel.png")
    image.crop((0, 0, image.width, min(1100, image.height))).save(root / "comparison-panel-preview.png")
