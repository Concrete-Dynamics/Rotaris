# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — The builder — first executed 2026-09-12, and consequence 6 is what it cost

Part 13 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## The builder — first executed 2026-09-12, and consequence 6 is what it cost

Consequence 6 — "two entrances, one builder" — had never been executed, because there was one entrance and no
builder: the window was constructed inline in `main()`, and a launch-carried folder and a folder chosen from
inside the application could not have shared a construction path had the second existed.

`buildMainWindow({ workspace, origin })` is that builder. Two orderings turned out to be load-bearing, and
neither was visible on paper:

- **The renderer load must be the last thing the builder does.** Every listener the window needs — the relay
  attachment, the presenter registration, the close guard, `ready-to-show` — is attached before the load is
  awaited, or a renderer can paint and speak before the main process is listening for it.
- **The one call site must sit below `CHANNEL.command`'s handler.** A renderer's first act is a command, so a
  builder called where the construction used to be would race its own window's first message. The builder is
  therefore *declared* at that point and *called* two hundred lines further down.

Consequence 5's most-recently-focused ordering is executed here too, maintained on focus rather than on
creation, so a switch that briefly holds two windows still answers "which window" with the one the user is
looking at. The driver seam reads that ordering, which is how a proof addresses a second window at all.

**The builder found no defect.** The defects it exposed belonged to what it replaced and are recorded with the
registry at ADR-0048. The resolution precedence this record fixes (`REQ-SHELL-010`) is **not** executed yet: a
launch still either carries a folder or opens on the sentinel, and the remembered folder, the working directory
and the deferred 650 ms chooser are Stage B's.
