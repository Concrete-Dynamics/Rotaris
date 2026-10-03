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

## Outcome

Repaired 2026-10-03 in the acceptance round's repair loop (bundle `finacc-accept1-1`), in the live run's check; no
product code changed, and F1 itself is not repaired here.

- **The check reads the starter's content.** `starterMissing` (`apps/desktop/scripts/lib/starter-config.mjs`) names
  what of REQ-CONFIG-025's starter a file lacks: the comment header, `default_persona: orchestrator`, and each of the
  twelve null keys the requirement names, as top-level keys. A value beyond `default_persona` is not read, since the
  sign-in or the slots may have written one; the two retrospective keys the product's starter adds (PD-LIBRARY-002) are
  neither required nor refused. The sign-in scenario's "the starter agents.yaml was bootstrapped" now passes only when
  nothing is missing, and its detail names what is.

Confirmed on F1's own file, the workspace `agents.yaml` acceptance round 1's slice-proof left
(`/tmp/rotaris-slice-proof/Rotaris-crw-wt-accept/profile/workspace/.rotaris/agents.yaml`, 137 bytes, `initialization:`
alone): the old check (`existsSync`) reads it true; `starterMissing` names the header, the persona and all twelve keys.

Pinned by `apps/desktop/scripts/lib/starter-config.test.ts` (8 cases): the product's own `starterDocument()` lacks
nothing; F1's file, byte for byte, lacks everything; a starter that initialization recorded into and a sign-in pinned a
slot in lacks nothing; a dropped key, a changed persona and an indented key are named; and live-run's sign-in check uses
the reader rather than `existsSync(agentsFile)`, which fails on origin/main's script.

Shown with two live runs against the registered unmetered endpoint `katalyst` (`--confirm --skip-build --only=ask`,
load average 0.55 to 1.09, nothing else running): both PASSED, the check passing on a bootstrapped starter, once without
the code-intelligence bundle (setup failed at 2.7 s, bootstrap `written` at 5.7 s) and once with it (bootstrap `written`
at 6.7 s, setup's outcome at 11.0 s). Neither reached F1's order: the live run's sign-in presses at 2.2 s and lands
before setup records, so on this host the live run meets F1 only when setup finishes first, as slice-proof's did. The
failing side is shown by F1's file above, not by a live run.

F1 itself was repaired by the sibling bundle `finacc-accept1-3`, merged after this one
([a-first-run-workspace-never-gets-the-starter-agents-yaml.md](a-first-run-workspace-never-gets-the-starter-agents-yaml.md)):
the workspace's open writes the starter before initialization records. At its merge it took this note's reader, and
`slice-proof`'s first-launch scenario asks `starterMissing` too; `starter-config.test.ts` gained that case.
