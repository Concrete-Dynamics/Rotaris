---
req-id: SWR-2612
status: approved
trace: required
test: required
title: "Quality-gate lifecycle state and workspace fingerprint"
epic: SWR-2600
priority: P0
date: 2026-08-12
---

# SWR-2612 — Quality-gate lifecycle state and workspace fingerprint

The check suite a workspace is gated by MUST be a tracked fact with an explicit
lifecycle state, not a value re-inferred from scratch on every session. Today
detection (SWR-2601) re-reads the same markers each run, remembers nothing, and
cannot tell "this workspace has no gate yet" from "this workspace was checked
and needs none" — both resolve to an exempt suite, so an unverifiable run reads
as clean.

- The gate itself stays where a human edits it: `verifier.checks` in
  `<workspace>/.rotaris/agents.yaml`. Its lifecycle metadata lives beside it in
  a rotaris-managed `<workspace>/.rotaris/verifier.state.json`, which is never
  hand-authored and never holds the suite — one gate, one home.
- The state is one of four values:
  - `absent` — no recognized techstack marker and no source a gate could cover.
  - `pending` — the workspace carries code but no gate: `verifier.checks` is
    unset and detection resolved nothing, or a techstack event (SWR-2615) fired
    and authoring has not completed.
  - `calibrated` — a suite is bound and every check in it carries a probe
    verdict (SWR-2613) recorded at the current fingerprint.
  - `stale` — a suite is bound but is **not calibrated at this fingerprint**.
    That deliberately covers two situations that look different and are the
    same instruction: the fingerprint moved, and the suite was never probed
    here. Both mean *probe before trusting this*, which is why no fifth state
    is needed and why an explicitly configured `verifier.checks` is never
    `pending` — a stated suite is bound the moment it is stated, it has merely
    not been checked yet.
- The **fingerprint** is a content hash over the recognized marker files present
  at the workspace root and at each detected sub-project root — manifests
  (`pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`), lockfiles
  (`uv.lock`, `poetry.lock`, `package-lock.json`, `pnpm-lock.yaml`), tool
  configs (`mypy.ini`, `ruff.toml`, `tox.ini`), and `Makefile` — plus the
  presence or absence of the conventional test roots. Both the file set and each
  file's content contribute, so an added marker, a removed marker, and an edited
  marker all move the fingerprint.
- The state file records the state, the fingerprint, the bound suite's source
  (`config` | `detected` | `authored`), the per-check probe verdict with the
  timestamp it was taken, and the id of the run that last wrote it. It is
  advisory data about the gate, never the gate.
- The state is recomputed at session start and after any iteration whose file
  changes touched a marker; recomputation is filesystem reads only and never
  executes anything.
- An explicit configuration always wins and is never `pending`: a hand-written
  `verifier.checks` resolves to `calibrated` once probed, and an explicit
  `checks: []` resolves to `calibrated` with an empty suite — the user's stated
  decision that this workspace runs no verification (SWR-2601).
- A missing, unreadable, or malformed state file MUST NOT raise: it is treated
  as "not yet known" and recomputed, so deleting the file is a supported reset.
- The resolved state and fingerprint land on `SessionState.check_suite` and in
  `state/run_config.json` next to the suite source, so a session snapshot
  answers "was this run gated, and if not, why not".
- The state rides on `ResolvedCheckSuite.gate`, defaulting to `None` — *not
  computed*, which is deliberately not the same fact as `absent`. Resolving a
  suite is a pure, cheap read that several callers make per pass, while
  computing a fingerprint is a bounded filesystem walk that only a session start
  and a marker-touching iteration should pay for. So `resolve_check_suite`
  leaves the field unset and a separate call fills it in.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each of the four states resolves from its workspace shape; an explicit `checks: []` resolves `calibrated`, never `pending`; a missing/malformed state file recomputes instead of raising | Gate-state resolver API | `tests/unit/verifier/test_gate_state.py` |
| Unit | The fingerprint moves when a marker is added, removed, or edited, and is stable across unrelated source edits | Fingerprint function | `tests/unit/verifier/test_gate_state.py` |
| Integration | A session in a workspace with a bound suite records state, fingerprint, and suite source in `state/run_config.json`; a second session over an unchanged workspace reuses the recorded state without re-probing | Config loader → session state → snapshot | `tests/unit/test_session_diagnostics.py`, `tests/integration/test_verifier_gate_lifecycle.py` |
| User-flow E2E | A run in a workspace that has code but no gate reports its gate state to the user rather than reporting silently clean | Public product boundary → user-observable result | shared with SWR-2615 (`tests/integration/test_verifier_gate_lifecycle.py`) |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
