## The here-string check reads its own command back

The live run's `terminal` scenario checks *both lines of the here-string came back* with
`/alpha-one/.test(hereString.result) && /beta-two/.test(hereString.result)`, over the whole recorded result.
Every terminal observation ends with a `[terminal_diagnostic]` block that repeats the command, and the
here-string's command carries both words, so the check passes whether or not the shell printed anything. An
observation whose output is `(no output)` passes it. It passed on the first live execution of 2026-09-22, and
that pass is not evidence that the lines came back. The neighbouring *terminated* check reads the exit code and
the timeout from the diagnostic and is not affected.

Noticed 2026-09-27 while turning the `failed-word` shape into a regression guard for `PD-TOOLS-003`
([R-055](../product/requests.md#r-055)). That guard needed the same positive half, and reads it from the output
section alone through `outputOf`. Established by reading the code and by feeding the check an observation with
no output; not measured on a live run.

## Specs

None contradicted. This is a defect of the harness, a check that cannot fail, and not of the product.

## Relevant files

- `apps/desktop/scripts/live-run.mjs`: the `terminal` scenario's here-string checks.
- `apps/desktop/scripts/lib/terminal-shapes.mjs`: `outputOf`, which returns the `[terminal_output]` section
  without the diagnostic block.
- `packages/agent-tools/src/terminal/index.ts`: the diagnostic block's `command` field.
