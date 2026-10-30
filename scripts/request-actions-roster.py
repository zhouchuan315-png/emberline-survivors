"""Submit one reviewed full-body acting batch for all three heroes.
The schema and references are imported from the already reviewed, current-contract script.
"""
from pathlib import Path
import importlib.util, sys
R=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('fullbody',R/'scripts/request-fullbody-motion.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
if len(sys.argv)!=1: raise SystemExit('No arguments; this script performs one guarded submission.')
items=[mod.actions_video(hero) for hero in ('vanguard','scout','medic')]
mod.submit('actions-roster',items)
