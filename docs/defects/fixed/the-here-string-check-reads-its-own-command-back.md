## The here-string check reads its own command back

The live run's `terminal` scenario checks *both lines of the here-string came back* with
`/alpha-one/.test(hereString.result) && /beta-two/.test(hereString.result)`, over the whole recorded result.
Every terminal observation ends with a `[terminal_diagnostic]` block that repeats the command, and the
here-string's command carries both words, so the check passes whether or not the shell printed anything. An
observation whose output is `(no output)` passes it. It passed on the first live execution of 2026-09-22, and
that pass is not evidence that the lines came back. The neighbouring *terminated* check reads the exit code and
the timeout from the diagnostic and is not affected.

Noticed 2026-09-27 while turning the `failed-word` shape into a regression guard for `PD-TOOLS-003`
([R-055](../../product/requests.md#r-055)). That guard needed the same positive half, and reads it from the output
section alone through `outputOf`. Established by reading the code and by feeding the check an observation with
no output; not measured on a live run.

## Specs

None contradicted. This is a defect of the harness, a check that cannot fail, and not of the product.

## Relevant files

- `apps/desktop/scripts/live-run.mjs`: the `terminal` scenario's here-string checks.
- `apps/desktop/scripts/lib/terminal-shapes.mjs`: `outputOf`, which returns the `[terminal_output]` section
  without the diagnostic block.
- `packages/agent-tools/src/terminal/index.ts`: the diagnostic block's `command` field.

## Repaired — 2026-09-28, under R-062

The check reads the output section alone. `apps/desktop/scripts/lib/terminal-shapes.mjs` gains
`hereStringLinesReturned(result)`: `outputOf` first, then both words in what the shell printed, and `false` for an
observation with no output section at all. The `terminal` scenario in `live-run.mjs` calls it, and its detail names
each word's presence in the output section rather than in the whole result.

Pinned by `apps/desktop/scripts/lib/terminal-shapes.test.ts`, "the here-string check": an observation built from the
shape's own command on both platforms with `(no output)` as its output still matches `/alpha-one/` and `/beta-two/`
over the whole text — the old check's pass — and `hereStringLinesReturned` answers `false` for it; it answers `true`
only when both lines were printed, `false` on one line, on an observation with no section and on `undefined`.
Measured: `pnpm vitest run apps/desktop/scripts/lib/` — 100 tests, 7 files, green. Not measured on a live run: it
spends the owner's money, and the next live run of `terminal` is the first the repaired check sees.
