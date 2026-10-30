"""Submit the dedicated skill VFX batch after recording the exact current schema."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import urllib.request
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "materials-20260928-power-vfx"
BASE = "https://api-test-new-v2.fxbusiness.cn:30685/ability-agent/api/v2/material-generation"
SCHEMA_PATH = EVIDENCE / "doubao-schema.json"

STYLE = (
    "Premium hand-painted 2D zombie survival game VFX, gritty graphic novel ink outlines, "
    "charcoal olive mustard rust palette with luminous amber and teal accents, restrained "
    "transparent-looking particle edges, NOT pixel art, NOT 3D. No words, letters, logos, "
    "numbers, UI, characters, weapons, ground, shadows or watermark. "
)
GRID = (
    "Exactly 4 by 4 regular equal square cells, 16 isolated chronological frames, no border "
    "or grid lines. Pure perfectly uniform magenta #ff00ff background, no magenta on the effect. "
    "Every effect stays fully inside its cell with generous clear margins and a centered anchor. "
)

PROMPTS = {
    "blast-vfx": STYLE + GRID + (
        "Sprite sheet for a chunky explosive bullet detonation in a top-down roguelite. "
        "One compact orange-gold blast per cell, clearly changing over time left to right and "
        "top to bottom: tiny ignition core, hot expanding fireball, broad bright shockwave with "
        "painted debris, then cooling smoky ember fragments. Strong readable silhouette, crisp "
        "alpha-like outer edge, transparent gameplay-ready visual, no text."
    ),
    "chain-vfx": STYLE + GRID + (
        "Sprite sheet for a teal and electric-white chain lightning hit segment in a top-down "
        "roguelite. Each cell contains one short horizontal zig-zag electrical bolt with bright "
        "impact nodes at both ends, designed to be stretched and rotated between enemies. "
        "Chronology: faint charge, branching arc, peak forked flash, fading sparks. Keep the "
        "bolt centered on a horizontal axis with generous transparent-looking margins; every "
        "frame distinct and usable as a looping hit effect."
    ),
    "frenzy-vfx": STYLE + GRID + (
        "Sprite sheet for a readable hero kill-streak frenzy aura, with no character included. "
        "A compact amber and rust-red circular energy crest with three small upward speed "
        "slashes and sparks, centered for attachment around a survivor. Chronology: dim ember "
        "seed, ignition ring, strong pulsing crest with outward sparks, then a clean dim loop "
        "frame. Leave the center open so the hero remains visible; avoid a solid opaque disc and "
        "avoid a giant screen-filling effect."
    ),
}


def main() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    if (EVIDENCE / "submission-attempt.json").exists():
        raise SystemExit("Submission already recorded; inspect the existing batch instead of reposting.")
    schema_response = json.loads(SCHEMA_PATH.read_text())
    result = schema_response["result"]
    schema = dict(result["json_schema"])
    schema["properties"] = {**schema["properties"], **result.get("common_fields", {})}
    schema["required"] = [*schema.get("required", []), "id"]
    materials = [
        {
            "id": f"emberline-power-vfx-20260928-{name}",
            "type": result["type"],
            "prompt": prompt,
            "model": "doubao-seedream-5-0-260128",
            "size": "2048x2048",
            "watermark": False,
            "max_retries": 0,
        }
        for name, prompt in PROMPTS.items()
    ]
    for material in materials:
        jsonschema.validate(material, schema)
    payload = json.dumps(
        {"materials": materials, "submitter": "codex-emberline-power-vfx-20260928"},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode()
    (EVIDENCE / "request.json").write_bytes(payload)
    (EVIDENCE / "intent.json").write_text(
        json.dumps(
            {
                "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "purpose": "Dedicated generated VFX atlases for blast, chain lightning, and kill-streak frenzy.",
                "materialIds": [m["id"] for m in materials],
                "schemaType": result["type"],
                "automaticRetries": 0,
                "requestSha256": hashlib.sha256(payload).hexdigest(),
                "submissionStatus": "submission_unknown_until_receipt",
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    request = urllib.request.Request(
        BASE + "/batch", data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(request, timeout=55) as response:
        reply = json.load(response)
    (EVIDENCE / "submission-response.json").write_text(json.dumps(reply, ensure_ascii=False, indent=2))
    if reply.get("code") != 0 or not reply.get("result", {}).get("batch_id"):
        raise SystemExit(json.dumps(reply, ensure_ascii=False))
    (EVIDENCE / "receipt.json").write_text(
        json.dumps(
            {
                "receivedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "batchId": reply["result"]["batch_id"],
                "materialCount": reply["result"]["material_count"],
                "requestSha256": hashlib.sha256(payload).hexdigest(),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    print(json.dumps(reply, ensure_ascii=False))


if __name__ == "__main__":
    main()
