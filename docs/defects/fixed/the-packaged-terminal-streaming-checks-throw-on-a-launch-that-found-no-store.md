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
the task. Repaired since: see the outcome below.

## Outcome

Repaired 2026-09-29 under R-067 (acceptance finding A51). Confirmed first on `7ae8072` by the new test's end-to-end case:
the section's own `launch`, driven against a stand-in at the executable's path that exits at once and writes no store,
rejected with `TypeError: Cannot read properties of undefined (reading 'status')`, both launches' results lost.

Two changes in `apps/desktop/scripts/terminal-proof/packaged.mjs`. The store-count return now carries `probe` (whatever
the renderer logged) and `terminal: null`, as the overrun and success returns do. The checks moved into an exported
`packagedChecks(on, off)` that reads a `terminal` or `probe` that is `null` **or absent** as absent evidence (`?? null`,
`?.`), so a launch that stopped short reads false on every check it cannot support and never throws;
`packagedTerminalStreaming` returns both launches with those checks, and `terminal-stream-proof --packaged` folds them in
as before. What the checks claim is unchanged.

Pinned in `apps/desktop/scripts/terminal-proof/packaged.test.ts`: "both launches finding no store are reported, not
thrown, and every check reads false" (POSIX; each launch's `error` names the store count, `terminal` and `probe` are
`null`, all five checks false) and "the checks read an absent terminal and probe as absent, whatever shape the launch
returned" (each half missing its fields in turn, and both halves measured still passing all five). Both fail on the
first form; with only the store-count return put back as it was, the first fails. **Not measured on the packaged
application:** the section still needs `apps/desktop/release/win-unpacked/Rotaris.exe`, a Windows build this Linux host
cannot produce (IC-3), so `terminal-stream-proof --packaged` was not run against it; run standalone here, the section
refuses and says where it stopped (`available: false`), as it should. On Windows the end-to-end case is not applicable
(a script cannot run under an `.exe` name); the pure case runs there.
