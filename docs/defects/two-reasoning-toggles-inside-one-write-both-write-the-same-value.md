## Two "Toggle reasoning bodies" activations inside one write both write the same value

`toggleReasoningBodies` (`packages/ui/src/display-host.ts`) reads `current()` and then awaits the write, whose store
update lands only once main has answered `prefs.set`. A second activation inside that round trip reads the same state, so
both write the same value and acknowledge the same new state: the user asked to flip twice and the preference flipped
once. Reproduced in `search-and-reasoning.test.ts` with a write that lands after a delay: the two activations answered
`true` and `true`. Unlikely by hand, since the palette closes on activation, but the slash mirror and a fast repeat reach
it. A fin41 review finding (`fin41/palette-and-hooks`, Task 1), carried by fin43 (`fin43-optional-findings`).

## Specs

- `REQ-CHAT-167`: toggling flips the reasoning-visibility preference and "MUST report the new state"; two toggles that
  report the same state, and leave the preference flipped once, report a state the second toggle did not make.

## Relevant files

- `packages/ui/src/display-host.ts` — `toggleReasoningBodies`, which reads the state before an asynchronous write.
- `packages/ui/src/commands/search-and-reasoning.test.ts` — the toggle's cases.
