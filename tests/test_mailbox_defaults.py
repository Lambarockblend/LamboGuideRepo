"""WoW Forever leaves default-state (enabled) addons out of AddOns.txt: missing bank names must read as enabled."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import lg_mailbox as MB  # noqa: E402

frame = MB.encode(MB.UP_SIZE, 3, 7, 0, 0x237E, b"H1 zip=1")
bits = MB.bytes_to_bits(frame, MB.UP_NAMES)
# the game only writes the disabled ones (and a few enabled ones it toggled before)
text = "\n".join(f"{n}: disabled" for n, on in bits.items() if not on) + "\nLamboGuideU018: enabled\n"
got = MB.decode(MB.bits_to_bytes(MB.parse_states(text), MB.UP_NAMES), MB.UP_SIZE)
assert got and got["payload"] == b"H1 zip=1" and got["seq"] == 7, got

# the state file is found even when U001 itself is not listed
import tempfile  # noqa: E402
with tempfile.TemporaryDirectory() as d:
    f = Path(d) / "1#1" / "93" / "Char-Realm" / "AddOns.txt"
    f.parent.mkdir(parents=True)
    f.write_text("LamboGuideU005: disabled\n", encoding="utf-8")
    assert MB.find_state_file(Path(d)) == f
print("mailbox defaults OK")

# a half-written AddOns.txt (game still writing) must never be written back: the player's own lines would be lost
with tempfile.TemporaryDirectory() as d:
    f = Path(d) / "AddOns.txt"
    half = "WoWForeverAI: disabled\nLamboGuideU001: enab"          # cut mid-line, no line break at the end
    f.write_text(half, encoding="utf-8")
    link = MB.Link(None, lambda s: None, state_file=f)
    assert link._write(f, {"LamboGuideD0001": True}) is False
    assert f.read_text(encoding="utf-8") == half
    f.write_text("WoWForeverAI: disabled\nLamboGuideU001: enabled\n", encoding="utf-8")
    assert link._write(f, {"LamboGuideD0001": False}) is True
    out = f.read_text(encoding="utf-8")
    assert "WoWForeverAI: disabled" in out and "LamboGuideD0001: disabled" in out, out
print("half-written file guard OK")
