# `restore-kill-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/restore-kill-proof.mjs`](../../apps/desktop/scripts/restore-kill-proof.mjs).

ADR-0058's restore killed between its two renames (README B2; since fin41, 2026-10-13): `restoreStore` runs in a plain Node child bundled with esbuild from `packages/store/src/restore-kill.child.ts` — no Electron, no display — and is SIGKILLed at its `betweenRenames` hook, `--trials=N` times (default 10); it FAILs when the kill missed the gap or the disk is not the model's (target empty, the restore's journal `<id>.restore-pending` beside it, displaced and staging stores whole), and, since fin43 (2026-10-14, OQ-266 ruled), unless the workspace service's next open put the displaced store back: the two previous sessions listed, nothing migrated, `cutRestore` naming it, the reinstated `workspace.db` byte-identical to the displaced one, the journal gone and the staging copy kept (until then the next open's empty store was a FINDING only)
