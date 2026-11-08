# `mode-reset-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/mode-reset-proof.mjs`](../../apps/desktop/scripts/mode-reset-proof.mjs).

The composer's permission-mode chip arms `autonomous`, a run is started, and the run then operates under `autonomous` —
read where it is decided (the session record's own `permission_mode`, REQ-TOOLS-071's effective mode) rather than where
it is drawn, and beside it the chip's label after the run (REQ-TOOLS-077).

Two launches against one scratch workspace differ in exactly one thing, which is what makes the reading diagnostic:
the first opens Settings once and leaves it, the second never mounts it. Both then arm the chip and start a run.

Kept because it was **red**, and for the reason it exists. ADR-0037's Tier B lays the Settings screen's live state
(`config.liveState`, REQ-CONFIG-262) on top of the files at every run start, and until 2026-11-08 the screen's
publisher had no cleanup: the run host kept the last state it was handed for the life of the process, so the mode an
abandoned form held outranked the composer's own durable write (REQ-CONFIG-288 / REQ-CONFIG-328). The Settings-first
launch recorded `ask` with the chip falling back to `mode: ask` while the file held `autonomous`; the plain launch,
which mounted no screen, recorded `autonomous` throughout
(`docs/defects/a-settings-screens-live-state-outlives-the-screen-and-overrides-a-durable-write.md`). The repair
takes the state down when the window that published it lets go — main deciding which window owns the run host's one
state, and reporting a window's DOCUMENT going for a close as well as for a lost renderer — and the two launches agree
again.

The last assertion is the control, and it is deliberately the one that would have caught the defect on its own: the two
launches must agree, because opening Settings once must not change what a run does.
