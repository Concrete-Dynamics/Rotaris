# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Fourth execution — 2026-09-28 (R-062), the palette launches measured again on the composer dock

Part 11 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

## Fourth execution — 2026-09-28 (R-062), the palette launches measured again on the composer dock

*The proof is `pnpm slash-proof --skip-build`, as root under Xvfb on Linux, Node 24, after one `pnpm build`, with no
other Electron process on the host.*

**Why it had not run since.** From 2026-09-15 the proof stopped at its badge assertion, and once that was repaired it
stopped at two evals scheduled at one offset, which its reader told apart by time alone
(`../../../defects/fixed/slash-proofs-model-chip-eval-shares-its-offset-with-the-usage-notice-read.md`). With the reader
matching offset and expression (`apps/desktop/scripts/lib/capture-evals.mjs`), the catalogue launch runs through, and
this execution's palette and restart launches ran for the first time since 2026-09-11.

**A reading the third execution's premise no longer holds.** Both executions above read "the ground" as the input's own
`backgroundColor` and assumed it was `--rt-bg`, which is what `highlight.ts` derives against. Since 2026-09-18 the input
is transparent inside `.composer__dock`, which paints `--rt-surface`; the read returned `rgba(0, 0, 0, 0)`, and the
proof's arithmetic took it for black. The proof now reads the first opaque ground from the input upwards (`GROUND`),
asserts it is opaque before measuring, and compares the restart like with like (the painted ground with the painted
ground, `--rt-bg` with `--rt-bg`). The falsified premise is kept in the two sections above as written.

**Found — a product red on this record's floor.** On the ground the dock paints, the partial shade is **4.06:1** on
`rotaris-dim` (ground `oklch(0.25 0 0)`), **4.25:1** on `nocturne` (`oklch(0.18 0 0)`) and **4.39:1** on
`high-contrast` (`oklch(0.12 0 0)`), and the unknown colour **4.32:1** on `rotaris-dim`; resolved and argument clear it
everywhere (9.2 to 16.0:1). The colours are still derived against `--rt-bg` — `rotaris-dim`'s partial
`oklch(0.60404 0.05 292)` and unknown `oklch(0.64 0.2 25)` are the second execution's values, at 4.50:1 and 4.79:1 on
`oklch(0.21 0 0)` — so the corrector is right and the surface it is given is not the one painted. The palette check "the painted ground is the
palette's `--rt-bg`" fails on all three for the same reason. Recorded, not repaired
(`../../../defects/fixed/the-slash-token-colours-clear-their-floor-on-a-ground-the-composer-no-longer-paints.md`; repaired 2026-09-29, the fifth execution below). Everything else
the proof asserts after it passed in a diagnostic run with its checks made non-fatal (not committed): the chip's
catalogue and REQ-CHAT-032's messages, `/stop` idle and during a run, the stash and both Pops, `/model scripted-2`,
Escape, `/theme` both ways, `/logout`, `/sessions`, `/new`, `/worktree`, the `/ ` escape, `/compress`, the stored theme
and the restart painting the same ground, `/logout` against the real registry and credential store, and REQ-CHAT-028's
two live rebuilds. Not shown: any of it on Windows or macOS (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).
