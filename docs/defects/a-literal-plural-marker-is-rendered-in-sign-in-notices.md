## A literal "(s)" plural marker is rendered in the provider sign-in notices

A sign-in with discovery reports "Added Katalyst; discovered 1 model(s).": the literal parenthesised plural. The same
form is in every discovery message of the sign-in module.

Live-run finding: L11 (live runs of 2026-09-29)

## Specs

- `REQ-SHELL-044`: "the literal parenthesised '(s)' form is never rendered anywhere in the product". The notes triage
  counted at least fifteen more rendered sites outside this module (dialogs, Library, Settings, notices, timeline text,
  `summarise`); this note records the sign-in sites the live run showed.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), `sign-in/sign-in.png`: "Added Katalyst; discovered 1 model(s)."

## Relevant files

- `packages/providers/src/signin.ts:157`, `:174`, `:235`, `:252`, `:275` (twice), `:375` — the messages.
