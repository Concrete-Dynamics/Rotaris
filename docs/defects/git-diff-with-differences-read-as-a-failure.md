## `git diff` with differences read as a failure the agent had to explain away

Observed live 2026-09-18, run `cc6191a2` (logged as R-039): the run's `git diff --no-index` with differences
exited 1 carrying the payload — the answer, not an error — and the observation classified it `shell_failure`,
which the agent then had to explain away in its own words.

`REQ-TOOLS-112` test 4 ("a non-zero exit status … is a failure") is faithful for the general case and is kept.
What was missing is the carve-out for the commands whose exit 1 IS the success-with-output convention: `git
diff`/`diff` (differences found) and `grep`/`egrep`/`fgrep`/`rg`/`findstr` (no match is an answer). The map is
narrowed to those heads, matched on the command's own leading tokens, and a real failure kind still outranks it.

Recorded as ESC-41 in `docs/architecture/owner-decisions.md`: test 4 stands, the carve-out is the narrowed
reading the build proceeds under, and the amendment round writes it into the requirement.

## Specs

REQ-TOOLS-112 test 4 — narrowed reading under ESC-41; the amendment round is owed.

## Relevant files

- `packages/agent-tools/src/terminal/classify.ts` — `successExitOne`, the exit-1 branch in `classifyOutcome`.
- `packages/agent-tools/src/terminal/terminal.test.ts` — pure asserts plus the real `git diff`/`findstr` e2e.

Noticed 2026-09-18 by the run-autopsy of run `cc6191a2`; repaired on the same branch.
