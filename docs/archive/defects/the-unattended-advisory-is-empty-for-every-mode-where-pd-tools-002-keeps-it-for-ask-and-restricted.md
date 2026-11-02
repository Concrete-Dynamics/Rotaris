## The unattended advisory is empty for every mode, where PD-TOOLS-002 keeps it for `ask` and `restricted`

`PD-TOOLS-002` empties the unattended advisory for an `autonomous` run and keeps it otherwise: "For `ask` and
`restricted` the advisory behaves as today except that it SHALL never claim a downgrade was applied. The advisory
requirements (REQ-TOOLS-072, REQ-TOOLS-192, REQ-SANDBOX-107) still govern that behaviour". REQ-TOOLS-072 makes the
advisory non-empty whenever an unattended run's effective mode would route a call to the headless resolver, naming the
three settings that resolve it. `unattendedAdvisory` in `packages/ui/src/StartSessionDialog.tsx` discards its input and
returns `''` for every mode, so the "Start session" dialog never shows the advisory (`data-testid="start-session-advisory"`
renders only for a non-empty string), and its doc comment says the `ask`/`restricted` behaviour is kept. Whether the
empty string is right for `ask` and `restricted` (for instance because a desktop-started run is always attended at
launch, REQ-TOOLS-069) or a gap is not settled by the record this note was written against.

Recorded 2026-10-07 from the R-072 consortium's ruling on OQ-222 (BP1), which asked for it; not repaired.

## Specs

- `PD-TOOLS-002`'s advisory bullet; REQ-TOOLS-072, REQ-TOOLS-192 and REQ-SANDBOX-107, which the directive says still
  govern for `ask` and `restricted`.

## Relevant files

- `packages/ui/src/StartSessionDialog.tsx` — `unattendedAdvisory` and the advisory paragraph.
- `apps/desktop/src/renderer/main.tsx` — the launch reads the advisory's three inputs.

## Closed — 2026-10-13, confirmed as built

Ruled as [OQ-239](../../architecture/open-questions.md) (UA1, under the owner's delegation, R-072): the empty advisory is
right for every mode, because every run the "Start session" dialog starts is attended at launch (a main window holds a
presenter registration from its creation; REQ-TOOLS-053, REQ-TOOLS-069, REQ-SANDBOX-101), so the unattended start that
REQ-TOOLS-072, REQ-TOOLS-192 and REQ-SANDBOX-107 attach the advisory to never occurs there. What was wrong was the comment
and the inputs, and they are corrected by fin34 (`fin34-record-and-cancels`): `unattendedAdvisory()` takes no input and its
comment states the ruling and its forward guard (a surface that can start a run with no registered presenter re-rules the
text first); `apps/desktop/src/renderer/main.tsx` no longer reads the mode or passes the opt-in for it. Pinned by
`packages/ui/src/start-session-advisory.test.ts`, whose first case is red on the old form (the function took one input),
beside render cases that the dialog shows no advisory with confinement available or not, that REQ-SANDBOX-130's disclosure
still renders, and that a non-empty advisory still renders its paragraph.
