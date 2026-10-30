"""Derive project-ready talent tree sprites from the frozen service originals."""
from pathlib import Path
import hashlib
import json
import uuid

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/materials-20260929-talent-ui"
OUT = ROOT / "assets/resources/ui/talent"
OUT.mkdir(parents=True, exist_ok=True)

batch = json.loads((EVIDENCE / "batch-latest.json").read_text())["result"]
assert batch["completed_count"] == batch["total_count"] == 2
assert batch["failed_count"] == 0

def key_magenta(image: Image.Image) -> Image.Image:
    rgb = np.array(image.convert("RGB")).astype(float)
    chroma = np.minimum(rgb[:, :, 0] - rgb[:, :, 1], rgb[:, :, 2] - rgb[:, :, 1])
    alpha = 1 - np.clip((chroma - 20) / 40, 0, 1)
    alpha[alpha < 0.08] = 0
    rgba = np.dstack((rgb, alpha * 255))
    rgba[alpha == 0] = 0
    return Image.fromarray(np.uint8(rgba), "RGBA")

def sprite_meta(name: str, width: int, height: int, border: int = 0) -> dict:
    template = json.loads((ROOT / "assets/resources/art/arena.png.meta").read_text())
    old = template["uuid"]
    new = str(uuid.uuid5(uuid.NAMESPACE_URL, "emberline/talent-ui/" + name))
    metadata = json.loads(json.dumps(template).replace(old, new).replace("arena", name))
    data = metadata["subMetas"]["f9941"]["userData"]
    data.update(width=width, height=height, rawWidth=width, rawHeight=height,
                trimX=0, trimY=0, offsetX=0, offsetY=0, trimType="none",
                packable=False, borderTop=border, borderBottom=border,
                borderLeft=border * 2, borderRight=border * 2)
    data.pop("vertices", None)
    metadata["userData"]["hasAlpha"] = True
    return metadata

checks = []
contact = Image.new("RGB", (1200, 1120), "#26332f")
draw = ImageDraw.Draw(contact)

for sheet_name, names, size, border in [
    ("talent-nodes", ["available", "selected", "locked", "maxed"], (176, 176), 0),
    ("talent-panels", ["detail", "branch", "detail-locked", "action"], (640, 128), 24),
]:
    source = EVIDENCE / "originals" / ("nodes.jpeg" if sheet_name == "talent-nodes" else "panels.jpeg")
    keyed = key_magenta(Image.open(source))
    for index, name in enumerate(names):
        cell = keyed.crop((index % 2 * 1024, index // 2 * 1024,
                           (index % 2 + 1) * 1024, (index // 2 + 1) * 1024))
        size, border = ((640, 240), 32) if name.startswith("detail") else ((512, 128), 20) if sheet_name == "talent-panels" else ((176, 176), 0)
        # The generated sheet has opaque square backplates outside the metal frames.
        # Use the reviewed frame outlines instead of leaving those backplates visible.
        if sheet_name == "talent-nodes":
            bounds = [(132, 146, 866, 890), (160, 146, 896, 898),
                      (132, 136, 866, 866), (158, 136, 896, 868)][index]
            cell = cell.crop(bounds)
            w, h = cell.size
            mask = Image.new("L", (w, h))
            ImageDraw.Draw(mask).polygon([(42, 0), (w-42, 0), (w, 42), (w, h-42),
                                         (w-42, h), (42, h), (0, h-42), (0, 42)], fill=255)
            cell.putalpha(mask)
            if name == "locked":
                clean = keyed.crop((220, 245, 645, 670)).resize((480, 480), Image.Resampling.LANCZOS)
                cell.alpha_composite(clean, (127, 118))
        if sheet_name == "talent-panels":
            bbox = cell.getbbox()
            assert bbox
            cell = cell.crop(bbox)
        if sheet_name == "talent-panels":
            # The model kept the wide plate at a shorter aspect ratio than requested.
            # Fill the nine-slice source deliberately; the runtime will stretch its center.
            cell = cell.resize((size[0] - 4, size[1] - 4), Image.Resampling.LANCZOS)
        else:
            cell.thumbnail((size[0] - 4, size[1] - 4), Image.Resampling.LANCZOS)
        final = Image.new("RGBA", size)
        final.alpha_composite(cell, ((size[0] - cell.width) // 2, (size[1] - cell.height) // 2))
        path = OUT / f"{name}.png"
        final.save(path)
        path.with_suffix(".png.meta").write_text(json.dumps(sprite_meta(name, *size, border), indent=2))
        pixels = np.array(final)
        assert pixels[:, :, 3].max() == 255
        checks.append({
            "name": name,
            "source": source.name,
            "cell": [index % 2 * 1024, index // 2 * 1024, (index % 2 + 1) * 1024, (index // 2 + 1) * 1024],
            "size": size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "uuid": json.loads(path.with_suffix(".png.meta").read_text())["uuid"],
            "alphaRange": [int(pixels[:, :, 3].min()), int(pixels[:, :, 3].max())],
            "nineSlice": border > 0,
        })
        x = 30 + (index % 2) * 280 if sheet_name == "talent-nodes" else 620
        y = 30 + (index // 2) * 300 if sheet_name == "talent-nodes" else 30 + index * 265
        preview = final.copy()
        preview.thumbnail((550, 230))
        contact.paste(preview, (x, y), preview)
        draw.text((x, y + preview.height + 8), name, fill="#eee9d6")

contact.save(EVIDENCE / "contact-v2.png")
cost = sum(m["generate_result"]["consume"]["consumption_indicator"]["usage"] for m in batch["materials"])
(EVIDENCE / "artifact-checks-v2.json").write_text(json.dumps({
    "assets": checks,
    "costYuan": cost,
    "model": "doubao-seedream-5-0-260128",
    "validation": "Decoded dimensions, alpha, stable UUID and nine-slice metadata; final sprites are loaded by the Cocos UI.",
}, indent=2))
print("Prepared", len(checks), "talent UI sprites")
