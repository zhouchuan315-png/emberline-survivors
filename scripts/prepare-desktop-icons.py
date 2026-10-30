"""Convert the existing game portrait into desktop icon formats."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
out = root / 'build' / 'desktop-icons'
out.mkdir(parents=True, exist_ok=True)
portrait = Image.open(root / 'assets/resources/roster/vanguard-portrait.png').convert('RGBA')
portrait.save(out / 'icon.png')
portrait.save(out / 'icon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
portrait.resize((1024, 1024), Image.Resampling.LANCZOS).save(out / 'icon.icns')
print(f'Desktop icons: {out}')
