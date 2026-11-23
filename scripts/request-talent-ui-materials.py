"""Submit the approved talent-tree UI art batch using the current V2 contract."""
import os
import datetime
import hashlib
import json
import urllib.request
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/materials-20260929-talent-ui"
BASE = os.environ.get('MATERIAL_API_BASE', 'https://example.invalid/ability-agent/api/v2/material-generation')

STYLE = (
    "Production 2D game UI asset for Emberline Survivors, a hand-painted graphic-novel "
    "zombie survival roguelite. Match the existing charcoal black, weathered warm steel, "
    "muted army olive, ivory and restrained mustard amber palette. Crisp inked edges, "
    "flat orthographic front view, subtle wear only on rims, no glow haze. NOT pixel art, "
    "NOT sci-fi neon, no text, no letters, no numbers, no logos, no watermark. "
    "Use pure flat magenta #ff00ff outside each isolated asset for chroma key. "
)

PROMPTS = {
    "talent-nodes": STYLE + (
        "Create exactly a 2 by 2 grid of four isolated square talent-node frames on a 2048x2048 canvas. "
        "Each cell is 1024x1024 with generous magenta margins and one centered frame only. "
        "All four frames have the same 760px square silhouette, thin layered steel rim, dark charcoal center "
        "left empty for a gameplay icon, and a small blank circular rank socket at the bottom edge. "
        "Top-left is an available node with a single warm amber rim. Top-right is a selected node with a brighter "
        "ivory-and-amber double rim and four tiny corner ticks. Bottom-left is a locked node with desaturated olive "
        "rim and a very simple blank keyhole cutout in the center. Bottom-right is a maxed node with a teal-amber "
        "rim and three tiny blank rank sockets along the bottom. Keep the center completely empty: no icon and no text. "
        "No connecting lines, no cards, no background tiles, no shadows outside each cell."
    ),
    "talent-panels": STYLE + (
        "Create exactly a 2 by 2 grid of four isolated wide UI plates on a 2048x2048 canvas. "
        "Each cell is 1024x1024 with one centered horizontal plate and generous magenta margins. "
        "All plates are designed for nine-slice stretching with straight edges, shallow 22px chamfered corners, "
        "a thin double steel rim and a large empty center for runtime text. "
        "Top-left: deep charcoal selected-detail panel with a narrow mustard accent strip on the left. "
        "Top-right: muted olive branch header plate with a thin amber underline. "
        "Bottom-left: dark locked-detail panel with a desaturated rim. Bottom-right: warm amber primary action button "
        "with a dark ink edge and an empty center. Keep all centers perfectly flat and empty: no icons, no words, "
        "no numbers, no symbols, no rivets in the text area. No protrusions and no drop shadow outside each plate."
    ),
}

if (EVIDENCE / "submission-attempt.json").exists():
    raise SystemExit("Submission intent exists; query the recorded batch and never resubmit.")

schema_result = json.loads((EVIDENCE / "materials_doubao_llm_generated_image.json").read_text())["result"]
schema = dict(schema_result["json_schema"])
schema["properties"] = {**schema["properties"], **schema_result["common_fields"]}
schema["required"] = [*schema.get("required", []), "id"]
materials = [
    {
        "id": f"emberline-talent-ui-20260929-{name}",
        "type": schema_result["type"],
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

payload = json.dumps({"materials": materials, "submitter": "codex-emberline-talent-ui-20260929"}, ensure_ascii=False).encode()
(EVIDENCE / "request.json").write_bytes(payload)
(EVIDENCE / "submission-attempt.json").write_text(json.dumps({
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "sha256": hashlib.sha256(payload).hexdigest(),
    "image_limit": len(materials),
    "automatic_retries": 0,
    "status": "submission_unknown_until_receipt",
}, indent=2))

request = urllib.request.Request(BASE + "/batch", data=payload, headers={"Content-Type": "application/json"})
with urllib.request.urlopen(request, timeout=55) as response:
    receipt = json.load(response)
(EVIDENCE / "submission-response.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
assert receipt["code"] == 0 and receipt["result"]["batch_id"]
assert receipt["result"]["material_count"] == len(materials)
print(json.dumps(receipt, ensure_ascii=False))
