## The packaged terminal-streaming checks throw on a launch that found no store, and lose both launches' evidence

`terminal-proof/packaged.mjs`'s `launch` returns early, with `error`, when it finds other than one workspace store below
the launch's own local data directory: `{ ...out, error }`, with no `terminal` and no `probe` field. The checks
`packagedTerminalStreaming` then computes read `on.terminal !== null && off.terminal !== null && on.terminal.status …`.
An absent field is `undefined`, not `null`, so the guard passes and `.status` of `undefined` throws a `TypeError`. The
function never returns, `terminal-stream-proof --packaged` loses the result of the other launch as well, and the file's
own rule, "a read that throws is reported, never thrown: one bad query must not lose the other launch's evidence", is
broken one level up. The failure a reader then sees is a `TypeError` in the proof, not "expected one workspace store".

The overrun return added on 2026-09-29 (`proofs-launched-through-spawnsync-cannot-end-an-overrun-launch`, repaired)
carries `probe: null, terminal: null` and so is not affected; the store-count return is.

## Specs

None contradicted by the product. The defect is the harness's: a proof that throws on its own bookkeeping reports
nothing about REQ-TOOLS-126 or REQ-TOOLS-127, which it exists to measure.

## Relevant files

- `apps/desktop/scripts/terminal-proof/packaged.mjs`: `launch`'s early `return { ...out, error: … }` when
  `stores.length !== 1`, and `packagedTerminalStreaming`'s `checks`, which assume `terminal` is present or `null`.

Noticed 2026-09-29 while moving the packaged launch onto `spawnBounded` under R-067. Not measured: the section needs
`apps/desktop/release/win-unpacked/Rotaris.exe`, a Windows build (IC-3), so it was read, not run. Not repaired: outside
the task.
