## checkpoint-proof and sessions-proof time their steps by fixed offsets a slower Git outruns

The Windows ARM64 session's C2 ran `pnpm checkpoint-proof` and `pnpm sessions-proof` three times each (Windows 11 ARM64
(build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, at `30d35b3c`; the machine awake, per the System
log's Kernel-Power 506/507, except for sessions-proof's second run). Four of the six went red, and each red is a step the
proof places at a fixed millisecond offset from the launch, which this host's Git took longer than to reach:

- **checkpoint-proof, `loaded-restore` (runs 1 and 2).** The second holder was planted 22,622 ms and 17,432 ms into the
  launch, past the proof's own 15,000 ms guard, because the resumed run ended later than the guard assumes; the restore's
  clicks sit at 16,000–25,200 ms. The proof threw before it read the refusal, which its log carries on both runs ("refused:
Could not persist the safety checkpoint on the session: Session … is held by pid 4242 on" the planted host).
- **checkpoint-proof, `isolated-restore` (run 3).** The confirm-time preview took 6,617 ms in the workspace service (2,204 ms
  and 1,589 ms on the other runs, 11 Git invocations each), so at `ROTARIS_CAPTURE_AFTER_MS` (18,000 ms) the dialog still
  read "Restoring checkpoint 1…" and the launch quit mid-restore; the file was not restored and the proof threw "the worktree
  was not restored". Main also logged that the run host was still running 2,000 ms after it was ended. What a quit during a
  restore leaves behind was not examined here.
- **sessions-proof, `delete` (run 1).** Session A's delete took 1,825 ms in the run host (242 ms on run 3), so the probe at
  5,800 ms, 1.6 s after the confirm click, found no report yet: "A's delete report reads """.

The fourth red (sessions-proof run 2) was the machine entering Modern Standby during the `seed` launch (09:09:10 UTC), not the
proof. Every product reading the reds left unread was read on the other runs: the restore, the refusal and the delete
report all appeared on the runs that waited long enough.

## Specs

None: the product did what its requirements ask, later than the proofs' schedules. The proofs' failures are false reds on
a slower host, and an offset raised to fit this host would be a guess; a wait on the condition (the checkpoint's restore
line, the run's end, the report element) instead of a clock would hold on either host. Not repaired: C2 measures and does
not authorize repairs to the proofs.

## Relevant files

- `apps/desktop/scripts/checkpoint-proof.mjs` — `loaded-restore`'s 15,000 ms planting guard and its click offsets;
  `isolated-restore`'s clicks and its 18,000 ms `ROTARIS_CAPTURE_AFTER_MS`.
- `apps/desktop/scripts/sessions-proof.mjs` — `delete`'s `ROTARIS_CAPTURE_PROBE_AT` at 5,800 ms after clicks at 1,200–4,200 ms.
