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
