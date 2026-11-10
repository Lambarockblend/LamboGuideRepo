"""LamboGuide mailbox (helper side). See Mailbox.lua for the idea and frame layout.

The game writes the LamboGuideU### bits into AddOns.txt with SaveAddOns(); we read them.
We write the LamboGuideD#### lines; the game re-reads them with ResetAddOns().
"""
from __future__ import annotations

import os
import time
import zlib
from pathlib import Path
from typing import Callable

UP_BITS, DOWN_BITS = 768, 1024
UP_SIZE, DOWN_SIZE = UP_BITS // 8, DOWN_BITS // 8
HEAD, TAIL = 7, 2
F_FIRST, F_LAST, F_ZIP = 1, 2, 4
MAGIC = 76
RESEND = 8.0
UP_NAMES = [f"LamboGuideU{i:03d}" for i in range(1, UP_BITS + 1)]
DOWN_NAMES = [f"LamboGuideD{i:04d}" for i in range(1, DOWN_BITS + 1)]
BANK = frozenset(UP_NAMES + DOWN_NAMES)
BANK_TOC = """## Interface: 16001
## Title: |cff777777LamboGuide kanal|r
## Notes: LamboGuide helper link bit. Empty on purpose, keep it installed.
## LoadOnDemand: 1
## Category: LamboGuide
## Group: LamboGuide
"""


# ---------------------------------------------------------------- codec
def fletcher(data: bytes) -> int:
    a = b = 0
    for x in data:
        a = (a + x) % 255
        b = (b + a) % 255
    return b * 256 + a


def encode(size: int, flags: int, seq: int, ack: int, epoch: int, payload: bytes = b"") -> bytes:
    if len(payload) > size - HEAD - TAIL:
        raise ValueError("payload too large")
    body = bytes([MAGIC, flags & 255, seq & 255, ack & 255, (epoch >> 8) & 255, epoch & 255, len(payload)]) + payload
    body += b"\0" * (size - TAIL - len(body))
    s = fletcher(body)
    return body + bytes([s >> 8, s & 255])


def decode(raw: bytes, size: int):
    if len(raw) != size or raw[0] != MAGIC:
        return None
    n = raw[6]
    if n > size - HEAD - TAIL or fletcher(raw[:-TAIL]) != (raw[-2] << 8 | raw[-1]):
        return None
    return {"flags": raw[1], "seq": raw[2], "ack": raw[3], "epoch": raw[4] << 8 | raw[5], "payload": raw[HEAD:HEAD + n]}


def bits_to_bytes(states: dict[str, bool], names: list[str]) -> bytes:
    # WoW Forever leaves addons that are in their default state (enabled) out of AddOns.txt,
    # so a bank name that is not listed counts as enabled (seen in game 2026-11-10).
    out = bytearray(len(names) // 8)
    for i, name in enumerate(names):
        if states.get(name, True):
            out[i // 8] |= 1 << (i % 8)
    return bytes(out)


def bytes_to_bits(data: bytes, names: list[str]) -> dict[str, bool]:
    return {name: bool(data[i // 8] >> (i % 8) & 1) for i, name in enumerate(names)}


def inflate(data: bytes) -> bytes | None:
    for wbits in (-15, 15, 31):           # raw deflate, zlib, gzip
        try:
            return zlib.decompress(data, wbits)
        except zlib.error:
            pass
    return None


# ---------------------------------------------------------------- AddOns.txt
def parse_states(text: str) -> dict[str, bool]:
    states = {}
    for line in text.splitlines():
        name, sep, value = line.partition(":")
        if sep:
            states[name.strip()] = value.strip().lower() == "enabled"
    return states


def replace_states(text: str, wanted: dict[str, bool]) -> str:
    nl = "\r\n" if "\r\n" in text else "\n"
    lines, seen = [], set()
    for line in text.splitlines():
        name, sep, _ = line.partition(":")
        key = name.strip()
        if sep and key in wanted:
            lines.append(f"{key}: {'enabled' if wanted[key] else 'disabled'}")
            seen.add(key)
        else:
            lines.append(line)
    for key, on in wanted.items():
        if key not in seen:
            lines.append(f"{key}: {'enabled' if on else 'disabled'}")
    return nl.join(lines) + nl


def ensure_bank(addons: Path) -> int:
    """Create the empty bit addons. Returns how many were created (new ones need a full game restart)."""
    made = 0
    for name in UP_NAMES + DOWN_NAMES:
        toc = addons / name / f"{name}.toc"
        if not toc.exists():
            toc.parent.mkdir(parents=True, exist_ok=True)
            toc.write_text(BANK_TOC, encoding="utf-8", newline="\n")
            made += 1
        else:
            try:  # older banks (no Category line): refresh the TOC text, the bit state lives in AddOns.txt
                if toc.read_text(encoding="utf-8") != BANK_TOC:
                    toc.write_text(BANK_TOC, encoding="utf-8", newline="\n")
            except OSError:
                pass
    return made


def find_state_file(account_dir: Path) -> Path | None:
    """The AddOns.txt the running character saved most recently that lists our bank."""
    best, best_t = None, -1.0
    for p in account_dir.glob("*/*/*/AddOns.txt"):
        try:
            t = p.stat().st_mtime
            if t > best_t and "LamboGuideU" in p.read_text(encoding="utf-8", errors="replace"):
                best, best_t = p, t
        except OSError:
            pass
    return best


# ---------------------------------------------------------------- link
class Link:
    """Stop-and-wait link with the game. Call step() often (every ~50 ms)."""

    def __init__(self, account_dir: Path | None, on_message: Callable[[str], None], log: Callable[[str], None] = lambda s: None,
                 state_file: Path | None = None, clock: Callable[[], float] = time.monotonic):
        self.account_dir = account_dir
        self.path = state_file
        self.on_message = on_message
        self.log = log
        self.clock = clock
        self.epoch: int | None = None
        self.baseline = True
        self.peer_seq = 0
        self.seq = 0
        self.out: list[dict] = []
        self.cur: dict | None = None
        self.parts: list[bytes] | None = None
        self.part_zip = False
        self.mtime = None
        self.last_heard = None
        self.last_find = -1e9
        self.zip_ok = False
        self.retries = 0
        self.ignored = None
        self.started_wall = time.time()

    # -- public
    def send(self, text: str):
        data = text.encode("utf-8")
        zipped = False
        if self.zip_ok and len(data) > 200:
            c = zlib.compressobj(9, zlib.DEFLATED, -15)
            packed = c.compress(data) + c.flush()
            if len(packed) < len(data):
                data, zipped = packed, True
        room = DOWN_SIZE - HEAD - TAIL
        n = max(1, -(-len(data) // room))
        chunks = []
        for i in range(n):
            flags = (F_FIRST if i == 0 else 0) | (F_LAST if i == n - 1 else 0) | (F_ZIP if zipped else 0)
            chunks.append((flags, data[i * room:(i + 1) * room]))
        self.out.append({"chunks": chunks})

    def connected(self) -> bool:
        return self.last_heard is not None and self.clock() - self.last_heard < 30

    def busy(self) -> bool:
        return self.cur is not None or bool(self.out)

    # -- internals
    def _next_seq(self) -> int:
        self.seq = self.seq % 255 + 1
        return self.seq

    def _start(self, msg, now):
        msg["idx"], msg["seq"], msg["sent"] = 0, self._next_seq(), now
        self.cur = msg

    def _locate(self, now) -> Path | None:
        if self.account_dir and (self.path is None or now - self.last_find > 3.0):
            self.last_find = now
            found = find_state_file(self.account_dir)
            if found and found != self.path:
                self.log(f"mailbox: using {found}")
                self.path, self.mtime = found, None
        return self.path

    def _read(self, path: Path) -> str | None:
        for _ in range(5):
            try:
                return path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                time.sleep(0.01)
        return None

    def _stable_read(self, path: Path) -> str | None:
        """The game writes AddOns.txt in place. A copy read in the middle of that is cut short, and writing it back
        would drop the player's own addon lines (a disabled addon loaded again, seen in game 2026-11-10).
        Only use a copy that ends with a line break and reads the same twice."""
        a = path.read_text(encoding="utf-8", errors="replace")
        if a and not a.endswith(("\n", "\r")):
            return None
        time.sleep(0.02)
        b = path.read_text(encoding="utf-8", errors="replace")
        return a if a == b else None

    def _write(self, path: Path, wanted: dict[str, bool]) -> bool:
        for _ in range(8):
            try:
                text = self._stable_read(path)                                  # fresh copy: keep the game's latest bits
                if text is None:
                    self.retries += 1
                    time.sleep(0.03)
                    continue
                tmp = path.with_name(path.name + ".lgtmp")
                tmp.write_text(replace_states(text, wanted), encoding="utf-8", newline="")
                os.replace(tmp, path)
                self.mtime = path.stat().st_mtime_ns
                return True
            except OSError:
                self.retries += 1
                time.sleep(0.015)
        return False

    def _accept(self, f):
        if f["flags"] & F_FIRST:
            self.parts, self.part_zip = [], bool(f["flags"] & F_ZIP)
        if self.parts is None:
            return
        self.parts.append(f["payload"])
        if f["flags"] & F_LAST:
            data = b"".join(self.parts)
            self.parts = None
            if self.part_zip:
                data = inflate(data)
            if data is None:
                self.log("mailbox: could not unpack a message")
                return
            text = data.decode("utf-8", errors="replace")
            if text.startswith("H"):
                self.zip_ok = "zip=1" in text
            try:
                self.on_message(text)
            except Exception as exc:          # never let a handler kill the link
                self.log(f"mailbox handler: {exc!r}")

    def step(self):
        now = self.clock()
        path = self._locate(now)
        if not path or not path.exists():
            return
        try:
            mt = path.stat().st_mtime_ns
        except OSError:
            return
        resend_due = self.cur is not None and now - self.cur["sent"] > RESEND
        if mt == self.mtime and not resend_due and not (self.out and self.cur is None):
            return
        text = self._read(path)
        if text is None:
            return
        self.mtime = mt
        states = parse_states(text)
        up = decode(bits_to_bytes(states, UP_NAMES), UP_SIZE)
        if up:
            self.last_heard = now
            if up["epoch"] != self.epoch:
                # new game session or helper (re)start: continue right after the last frame the game took
                # (its ack), otherwise the game may treat our next frame as an old copy and drop the message
                self.seq = up["ack"]
                self.epoch = up["epoch"]
                self.peer_seq, self.parts, self.ignored = 0, None, None
                if self.baseline and path.stat().st_mtime < self.started_wall - 2:
                    self.ignored = up["seq"]           # written before we started: old news, do not answer it
                    self.log(f"mailbox: game session {self.epoch:04x} (old frame ignored)")
                else:
                    self.log(f"mailbox: new game session {self.epoch:04x}")
                    if self.cur:
                        self._start(self.cur, now)       # resend from the start for the new session
            self.baseline = False
            if self.cur and up["ack"] == self.cur["seq"]:
                self.cur["idx"] += 1
                if self.cur["idx"] >= len(self.cur["chunks"]):
                    self.cur = None
                else:
                    self.cur["seq"], self.cur["sent"] = self._next_seq(), now
            elif resend_due:
                self._start(self.cur, now)
            base = self.ignored if self.ignored is not None else self.peer_seq
            if up["seq"] != 0 and 1 <= (up["seq"] - base) % 255 <= 120:      # only newer frames; a stale copy of the file is ignored
                self.ignored = None
                self.peer_seq = up["seq"]
                self._accept(up)
        elif self.baseline:
            self.baseline = False
        if self.epoch is None:
            return
        if self.cur is None and self.out:
            self._start(self.out.pop(0), now)
        if self.cur:
            flags, data = self.cur["chunks"][self.cur["idx"]]
            frame = encode(DOWN_SIZE, flags, self.cur["seq"], self.peer_seq, self.epoch, data)
        else:
            frame = encode(DOWN_SIZE, 0, 0, self.peer_seq, self.epoch)
        if bits_to_bytes(states, DOWN_NAMES) != frame:
            self._write(path, bytes_to_bits(frame, DOWN_NAMES))
