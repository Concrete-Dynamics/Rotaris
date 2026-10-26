# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — Alternatives considered

Part 2 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

## Alternatives considered

**A — A terminal emulator library with its default input and link handling.**

*For:* a mature parser, a correct screen model including the alternate screen, per-cell attributes and
reverse video, and a fast renderer.
*Against:* as configured by default it **is** the input path — it attaches key handlers and writes
sequences to whatever is attached. The arming gate forbids a keystroke reaching the process until
armed; the closed encoding vocabulary forbids inventing any sequence for a key outside it; and the wheel
rule fixes exactly three rows per notch with fractional accumulation, which is not the library's own
sensitivity behaviour. **Adopting the defaults would fail three hard constraints quietly.**

**B — The library used as a *screen*, with the product owning input entirely.** The emulator receives
bytes and maintains the grid; every key event is intercepted before the library sees it, and what
reaches the process is produced by our own encoder implementing the closed vocabulary. Chosen.

*For:* keeps the hard part — parsing, the alternate screen, wide characters, per-cell attributes — and
replaces exactly the parts the specification fixes differently. The arming gate, the
transmit-nothing-for-unknown-keys rule, the five-rule priority ordering and the wheel arithmetic all
become our code, which is where the requirements put them. Theme integration is straightforward: the
sixteen colours are theme tokens and the cell geometry derives from the theme's monospace face.
*Against:* we are fighting a library's defaults, which needs discipline — a custom key handler that
refuses everything, no data wiring to the backend, our own wheel handler, our own
selection-to-text extraction.

**C — Our own parser and grid.** Total control, nothing to fight. *Against:* a terminal parser is a
deep, adversarial surface — the bytes come from arbitrary programs — and getting the alternate screen,
scroll regions, wide and combining characters and attribute handling right is a project of its own,
while `REQ-SHELL-166` demands demonstration against a real pseudo-terminal with full-screen programs
repainting without corrupted cells. Not worth it.
