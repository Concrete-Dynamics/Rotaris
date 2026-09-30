## `driver-proof` can type before the composer holds focus

`driver-proof`'s step 6 sends `Ctrl+2`, waits for `.composer__input`, sends `Ctrl+L` and then types
`driver proof draft` at once. It does not wait for the focus that `Ctrl+L` gives. The product's `focusComposer`
(`packages/ui/src/AppShell.tsx`, `nowOrAfterMount`) focuses the input at once when it can, and otherwise tries again
two frames later. A character sent before the focus lands goes nowhere. Once, on 2026-09-29, the check "typed
characters reach the focused control" read `""`. That was the first launch after a build, in one run of four on an
otherwise quiet host (load average near 1). The next three runs passed. The step is not a changed one. It met the race
the seam exists to remove: a step sent before its condition holds.

Noticed 2026-09-29 while running `driver-proof` for the driver's quit and shot repairs (R-067).

## Specs

None. `driver-proof` is verification tooling (AGENTS.md, "Driving the built app"). The product behaviour it reaches is
REQ-CHAT-002's `Ctrl+L`, which is not in question.

## Relevant files

- `apps/desktop/scripts/driver-proof.mjs`: step 6, and the second launch's prompt, which types the same way.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. Both typing steps now wait with `until` until `document.activeElement` is the
composer's input (`COMPOSER_FOCUSED`), and only then type. `activeElement` is used rather than a `:focus` selector
because it does not depend on the window holding the system focus. The cause was seen once and not reproduced. The
repair makes the step wait for the condition it needs, which is the principle the driver was built on. It is pinned by
`driver-proof` itself, green in every run after the change.
