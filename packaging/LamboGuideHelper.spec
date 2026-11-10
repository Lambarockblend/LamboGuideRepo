# PyInstaller spec for the LamboGuide helper (built on Windows by .github/workflows/release.yml).
# Output: dist/LamboGuideHelper/LamboGuideHelper.exe (+ addon/, packs/, bin/codex.exe, version.json)
import os

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
ADDON = ["LamboGuide.toc", "Core.lua", "Mailbox.lua", "Knowledge.lua", "Extras.lua", "GearData.lua", "Gear.lua", "Bindings.xml", "DejaVuSans.ttf", "DejaVuSans-LICENSE.txt"]

datas = [(os.path.join(ROOT, f), "addon") for f in ADDON]
datas += [(os.path.join(ROOT, "packs"), "packs"), (os.path.join(ROOT, "version.json"), ".")]
if os.path.exists(os.path.join(ROOT, "build", "bin")):
    datas += [(os.path.join(ROOT, "build", "bin"), "bin")]          # codex.exe + its license

a = Analysis([os.path.join(ROOT, "lamboguide_companion.py")], pathex=[ROOT], datas=datas,
             hiddenimports=["pystray._win32", "PIL.ImageDraw", "lg_setup", "lg_update", "lg_library", "lg_talents", "lg_mailbox", "lg_text"],
             noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="LamboGuideHelper", console=False, icon=None)
coll = COLLECT(exe, a.binaries, a.datas, name="LamboGuideHelper")
