## The live run's interrupt check reads OQ-168's Windows soft pause as still running

Read 2026-10-15 from the code at `a7540444`, before any live terminal run on Windows (the Windows ARM64 session's B7, which
asks for this note first). On win32, OQ-168's ruling (2026-10-06, R-071) has a poll after an interrupt write nothing and
answer as a soft pause whose detail says the command may have ended and the next command will report how
(`INTERRUPT_UNSEEN_NOTE`): Windows gives no way to tell whether the shell holds its terminal again. The live run's
`terminal` scenario reads that poll through `interruptedPollReading` (`lib/terminal-shapes.mjs`), which names any
`soft_pause` `still-running`, "the defect's signature", and `live-run.mjs` then fails two checks on it: "a poll after C-c did
not read the interrupted command as still running" and "it handed the command over as ended without an exit status of its
own (OQ-147)". So a live run on Windows goes red there on the product's ruled behaviour, by design of the check rather than of
the product.

Not repaired (record-only). The repair is the check's: read OQ-168's Windows soft pause (its detail carrying the ruling's
sentence) as its own kind, neither `still-running` nor `ended`.

## Specs

None contradicted by the product: OQ-168's ruling (REQ-TOOLS-096/098) is what it does. The check contradicts the ruling.

## Relevant files

- `apps/desktop/scripts/lib/terminal-shapes.mjs` — `interruptedPollReading`.
- `apps/desktop/scripts/live-run.mjs` — the two checks after the `interrupt` shape's poll.
- `packages/agent-tools/src/terminal/index.ts`, `foreground.ts` — `INTERRUPT_UNSEEN_NOTE` and the win32 poll after an
  interrupt.
