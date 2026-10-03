## `live-run`'s sign-in check passes on any agents.yaml, even one holding only the initialization record

`apps/desktop/scripts/live-run.mjs`'s sign-in scenario checks `existsSync(agentsFile)` under the label "the starter
agents.yaml was bootstrapped". It never reads the file. The workspace's `agents.yaml` is no longer written first by the
bootstrap: initialization records its outcome into `initialization:` at the open, before anyone signs in, through the
per-field writer, which creates the file when it is absent. A file holding only that record therefore satisfies the
check, and the check passes over the very defect it is named for: a first-run workspace that never receives the starter
document (acceptance finding F1, where `slice-proof` was red on the same file; its note,
`a-first-run-workspace-never-gets-the-starter-agents-yaml.md`, is recorded by a sibling bundle of the same round and is
not on this branch). `slice-proof` reads the content
(`default_persona: orchestrator`, `slice-proof.mjs:234`); the live run does not.

Acceptance finding F3 (2026-10-03, on merged main `1763f7f`). Found by reading the check against F1's observed file
(`initialization:` with `completed: [code-intelligence-setup]`); no live run was made that round to show it passing.

## Specs

None broken by the product. The check is the live run's evidence for REQ-CONFIG-025 and REQ-WORKSPACE-038 (the starter
document, its header, `default_persona` and the twelve explicit nulls); a check any non-empty file passes is no
evidence for them.

## Relevant files

- `apps/desktop/scripts/live-run.mjs`: the sign-in scenario's `check(existsSync(agentsFile), …)`.
- `apps/desktop/scripts/slice-proof.mjs`: the content check the live run lacks.
- `packages/config/src/writers.ts`: `starterDocument`, REQ-CONFIG-025's content as the product writes it.
