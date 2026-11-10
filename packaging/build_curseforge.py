"""Addon-only zip for CurseForge (no helper, no executables)."""
import argparse
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ["LamboGuide.toc", "Core.lua", "Mailbox.lua", "Knowledge.lua", "Extras.lua", "GearData.lua", "Gear.lua", "Bindings.xml", "DejaVuSans.ttf", "DejaVuSans-LICENSE.txt"]

ap = argparse.ArgumentParser()
ap.add_argument("--version", default="dev")
ap.add_argument("--out", default="dist")
a = ap.parse_args()
out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)
target = out / f"LamboGuide-{a.version}-curseforge.zip"
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
    for name in FILES:
        z.write(ROOT / name, f"LamboGuide/{name}")
    import json
    repo = json.loads((ROOT / "version.json").read_text(encoding="utf-8")).get("repo") or "<GITHUB_REPO>"
    z.writestr("LamboGuide/README.txt", (ROOT / "packaging" / "CURSEFORGE.md").read_text(encoding="utf-8").replace("<GITHUB_REPO>", repo))
print(target)
