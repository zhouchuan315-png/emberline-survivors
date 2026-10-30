"""Compatibility entry point: roster -run sheets are now authored 16-frame gaits.

Do not copy the mixed movement/attack/death atlases over these assets.
"""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('prepare-roster-gait.py')), run_name='__main__')
