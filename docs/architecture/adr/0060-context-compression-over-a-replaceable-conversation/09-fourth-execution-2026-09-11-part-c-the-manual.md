# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing — Fourth execution — 2026-09-11 (Part C″), the manual arm re-measured on the build three lanes merged into

Part 9 of 11 of [ADR-0060](../0060-context-compression-over-a-replaceable-conversation.md), which indexes every part.

## Fourth execution — 2026-09-11 (Part C″), the manual arm re-measured on the build three lanes merged into

*Recorded under GD-10; the proof is `pnpm chat-controls-proof`, evidence under `.chat-controls-proof/`. Defects are
numbered `C2-n`; the manager assigns the ordinals at merge.*

**What this wave owed this record.** Nothing new was built on the compression mechanism — wave 3 is proof and
measurement. What it owes is whether the third execution's arm still does what it said once every lane's wave-2 work
is under it, and whether its figures move when the machine is busy.

**Measured** (four launches, the scripted provider, ~2.1 GB free with two other agents building on the same machine;
the proof PASSED **twice consecutively**): one press with two live conversations compressed both — `orchestrator`
7 → 3 messages and `child-a` 3 → 2; "Compressing…" with the control disabled and `data-pending=1`, recorded by the
MutationObserver armed before the click; the completion toast "Compressed context for 2 active agent(s)."; the label
restored and no persistent notice; one `context_compressed` entry per agent with `trigger: manual` and no threshold
field. With `fail-if:CHILD-SLICE-MARKER` the root compressed alone, the persistent notice read "1 of 2 active agent
context(s) compressed; 1 failed." with `child-a: the compressing pass failed: scripted compressor failure (HTTP 500)`
in its copyable detail block, and no completion toast. Idle: the header control disabled with "Start or continue a run
to enable run controls.", the palette entry toasting "No run is active.", and `/compress` refused through the one
persistent slot as "Command not run" / "No run is active.". **Every structural figure is the third execution's
exactly.** What moved is the scripted compressor's latency — 4–8 ms there, **25 ms and 16 ms** here — which is the
machine, not the mechanism, and is recorded rather than smoothed.

**The catalogue's route to the same arm** is measured beside it in `pnpm slash-proof`: `/compress` typed during a live
run reaches the ARMED control and never wave 1's "the run host does not support forceCompression yet", in both of that
proof's consecutive runs.

**Found — nothing.** No defect in the compression arm on this build.

**Still not exercised, carried forward unchanged from the third execution:** a manual pass against a real provider;
the single-flight join with the automatic trigger's pass in flight; `REQ-MONITOR-091`'s `no_active_conversations`
refusal (a scripted run always holds a live turn while it runs); a pass during a parent resume; REQ-CHAT-084's
busy-transcript limb, which the store's synchronous transactions give no producer.
