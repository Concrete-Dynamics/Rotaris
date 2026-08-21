---
req-id: SWR-2620
status: approved
trace: required
test: required
title: "The project's own check command is preferred, with a fallback"
epic: SWR-2600
priority: P1
date: 2026-08-20
---

# SWR-2620 — The project's own check command is preferred, with a fallback

SWR-2608 resolves at most one check per role and lets detector order — python →
node → make — decide which one. The stated reason was that a project-level target
is not guaranteed to be runnable on the host, so the portable invocation should
win by default.

That reason is sound and the conclusion it was used for is not. A synthesized
command is correct about its *tool* and routinely wrong about the *project*:

- this repository declares `uv run pytest -q --timeout=120 -n auto` and
  `mypy src/rotaris_core/` in its `Makefile`, and was verified with a synthesized
  serial `pytest -q` and a whole-tree `mypy .` instead;
- the serial run takes several times longer than the parallel one the project
  uses, outgrew the 600 s budget, and was killed;
- `mypy .` type-checked directories the project has never type-checked and
  failed on them.

Neither command was wrong about its tool. Both were wrong about this project, and
only the project can settle what it means by "test" — which it had already done,
in a file, in its own words. A scope, a set of excludes and a parallelism flag are
not things Rotaris can infer, and inferring them wrongly is not a neutral default:
it produced a verification pass that refused 1413 requirements.

Requirement: detection ranks the candidates for a role by **how specifically the
scope was declared**, and the runner falls back when the chosen one cannot start.

- Every check carries its `origin`: `config` (the user stated it under
  `verifier.checks`), `declared` (the *project* wrote it down — a `Makefile`
  target, an npm script, a tox environment), or `synthesized` (Rotaris composed
  it from a marker). The order is exactly that, and it is the only thing that
  decides a role's winner. Detector order still breaks ties *within* an origin,
  which is the part of SWR-2608's rule that was never wrong.
- The losing candidates are kept on the winner as `alternatives`, best first.
- The runner drops to the next alternative when the chosen command **cannot
  start** — the program is missing, or the target does not exist. A command that
  starts and *fails* is a real answer and MUST NOT be retried away: falling back
  from a red suite to a different suite is how a gate becomes a formality.
- Which candidate actually ran is recorded on the result, and a fallback is
  reported, so a user is never quietly verified by their second-choice command.
- A synthesized command uses the scope its tool's configuration states when it
  states one (`mypy` `files`/`packages`/`modules`, `pytest` `testpaths`).
  Configuration that states nothing leaves the default alone: an invented narrow
  scope is worse than an honest wide one.

## Acceptance criteria

- A workspace with both a `Makefile` test target and a `pyproject.toml` pytest
  marker runs the Makefile target, and the synthesized command is retained as its
  alternative.
- A chosen command whose program is absent falls back to the next candidate, and
  the result names the command that ran.
- A chosen command that runs and fails does **not** fall back.
- An explicit `verifier.checks` entry outranks every detected candidate and
  carries no alternatives.
- A `pyproject.toml` stating `mypy.files` produces a command scoped to it; one
  stating nothing produces the unscoped default.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Candidate ranking by origin; ties inside an origin keep detector order; alternatives are carried; stated scope is read from `pyproject.toml` and an absent one changes nothing | Detection API | `tests/unit/test_verifier_detection.py` |
| Unit | A check that cannot start falls back to its alternative and the result names what ran; a check that starts and fails does not fall back | Verifier runner API | `tests/unit/test_verifier_runner.py` |
| Integration | A workspace declaring its own targets is verified by them, and the resolved suite records which candidate ran | Suite resolution → runner | `tests/integration/test_verifier_post_change_run.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
