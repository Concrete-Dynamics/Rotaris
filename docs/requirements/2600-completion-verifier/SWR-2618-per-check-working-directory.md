---
req-id: SWR-2618
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2615
title: "Per-check working directory for multi-project workspaces"
epic: SWR-2600
date: 2026-08-12
---

# SWR-2618 — Per-check working directory for multi-project workspaces

A gate authored for a workspace that holds several projects (this repository's
own `src/rotaris_core` and `apps/rotaris`, a `packages/*` monorepo) cannot be
expressed today: every check runs at the workspace root, so a sub-project's test
command either does not resolve or silently verifies the wrong tree. One root
gate covering every project needs one field.

## Acceptance criteria

- `CheckConfig` and `ResolvedCheck` gain `cwd: str | None` — a workspace-relative
  directory the check runs in, defaulting to the workspace root. The runner
  applies it when executing the check.
- A `cwd` that escapes the workspace root is a configuration error surfaced at
  load time. A `cwd` that does not exist at run time makes the check `invalid`
  (SWR-2616) — a moved sub-project is gate drift, never a code failure.
- Detection walks recognized sub-project roots below the workspace root at
  bounded depth, skipping vendored, ignored, and build directories, and tags the
  checks it emits with the sub-project's directory.
- Role deduplication (SWR-2608) becomes per `(cwd, role)`: a root `pyproject.toml`
  and an `apps/x/pyproject.toml` both keep their `test` check, while a root
  `Makefile` duplicating the root's own detected test check is still suppressed.
- Check names are unique across directories and carry the sub-project, e.g.
  `pytest:apps/rotaris`, so evidence, repair context, and timeline events remain
  unambiguous.
- The suite budget is unchanged and shared: `verifier.suite_timeout` still caps
  one whole run across every directory, so adding sub-projects extends coverage
  without extending the ceiling.
- The resolved `cwd` is recorded per check in `state/run_config.json` and in the
  verifier evidence, so a report says which tree a check actually verified.
- The runner builds one terminal per distinct directory and reuses it, so two
  projects cost two terminals rather than one per check.
- A per-test report (SWR-2622) written inside a sub-project is rebased onto the
  workspace before attribution. Its paths are relative to the directory the check
  ran in and every covering-test site is relative to the workspace; without the
  rebase the two never meet and a sub-project's tests read as unobserved forever,
  silently.
- A uv workspace keeps one lockfile at its root and none in its members, so a
  member's synthesized command still takes the `uv run` prefix that resolves it.

## Test coverage

Unit coverage of the schema field, the escaping-path rejection, the missing-directory
`invalid` path, and per-`(cwd, role)` deduplication lives in
`tests/unit/test_config_schema.py`, `tests/unit/test_verifier_suite.py`, and
`tests/unit/test_verifier_detection.py`; the runner's use of `cwd` and the shared
budget across directories in `tests/unit/test_verifier_runner.py`. The
originating product flow is SWR-2615's authoring of a single root gate for a
multi-project workspace, covered end to end in
`tests/integration/test_verifier_gate_lifecycle.py`.

Derived from: [SWR-2615 — Gate authoring for a workspace that starts empty](SWR-2615-greenfield-gate-authoring.md)

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
