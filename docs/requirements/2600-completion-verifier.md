---
req-id: SWR-2600
status: approved
trace: optional
test: optional
title: "Deterministic Completion Verifier"
---

# SWR-2600 — Deterministic Completion Verifier

A deterministic verification step for target-project changes: a configurable
check suite (build/test/lint/typecheck) that runs after code-modifying
iterations, feeds its results into the `ChildReportArtifact`, and hard-gates
completion classification. Replaces "the LLM says it is done" with visible
evidence, per the finding that false completion reporting is a top failure
class (arXiv 2605.29442) and the P0 requirement "Verifikation" in
[docs/research/marktanalyse-agentic-harnesses-2026-08.md](../research/marktanalyse-agentic-harnesses-2026-08.md).
This is also the substrate for the later ReqToCode productization
(evidence-gated completion per acceptance criterion). See
[NOTE-marktreife-priorisierung.md](NOTE-marktreife-priorisierung.md).

## Requirements

| ID | Title | Priority | Status |
| --- | --- | --- | --- |
| [SWR-2601](2600-completion-verifier/SWR-2601-check-suite-configuration.md) | Check-suite configuration & auto-detection | P0 | approved |
| [SWR-2602](2600-completion-verifier/SWR-2602-post-change-verifier-run.md) | Post-change verifier execution | P0 | approved |
| [SWR-2603](2600-completion-verifier/SWR-2603-verifier-evidence-in-report.md) | Verifier evidence in the child report | P0 | approved |
| [SWR-2604](2600-completion-verifier/SWR-2604-evidence-gated-completion.md) | Evidence-gated completion classification | P0 | approved |
| [SWR-2605](2600-completion-verifier/SWR-2605-bounded-repair-escalation.md) | Bounded repair loop & escalation | P0 | approved |
| [SWR-2606](2600-completion-verifier/SWR-2606-requirement-coverage-evidence.md) | Requirement-coverage evidence in the child report | P2 | draft |
| [SWR-2607](2600-completion-verifier/SWR-2607-scope-drift-reporting.md) | Scope-drift reporting for changes with no requirement | P2 | draft |
| [SWR-2608](2600-completion-verifier/SWR-2608-bounded-check-suite.md) | Bounded, non-duplicated check suite | P1 | draft |
| [SWR-2609](2600-completion-verifier/SWR-2609-live-verification-visibility.md) | Live verification visibility | P1 | draft |
| [SWR-2610](2600-completion-verifier/SWR-2610-user-skippable-verification.md) | User-skippable verification | P2 | approved |
| [SWR-2611](2600-completion-verifier/SWR-2611-verifier-progress-seam.md) | Verifier runner progress & control seam (technical, from SWR-2609) | — | approved |
| [SWR-2612](2600-completion-verifier/SWR-2612-gate-lifecycle-state.md) | Quality-gate lifecycle state & workspace fingerprint | P0 | approved |
| [SWR-2613](2600-completion-verifier/SWR-2613-gate-calibration-probe.md) | Calibration probe before a check binds | P0 | approved |
| [SWR-2614](2600-completion-verifier/SWR-2614-gatekeeper-persona.md) | Gatekeeper persona & sole write authority over the gate | P1 | approved |
| [SWR-2615](2600-completion-verifier/SWR-2615-greenfield-gate-authoring.md) | Gate authoring for a workspace that starts empty | P0 | approved |
| [SWR-2616](2600-completion-verifier/SWR-2616-invalid-check-and-gate-repair.md) | Invalid checks & deterministic in-run gate repair | P0 | approved |
| [SWR-2617](2600-completion-verifier/SWR-2617-gate-drift-proposals.md) | Gate-drift proposals from the improvement collector | P1 | approved |
| [SWR-2618](2600-completion-verifier/SWR-2618-per-check-working-directory.md) | Per-check working directory for multi-project workspaces (technical, from SWR-2615) | — | approved |
| [SWR-2619](2600-completion-verifier/SWR-2619-single-execution-authority.md) | Single execution authority for the bound check suite | P1 | approved |
| [SWR-2620](2600-completion-verifier/SWR-2620-the-projects-own-command-is-preferred.md) | The project's own check command is preferred, with a fallback | P1 | approved |
| [SWR-2621](2600-completion-verifier/SWR-2621-a-checks-budget-is-learned.md) | A check's budget is learned from what the check costs | P2 | approved |
| [SWR-2622](2600-completion-verifier/SWR-2622-test-result-ingestion.md) | Per-test results are ingested through one stable port | P0 | approved |
| [SWR-2623](2600-completion-verifier/SWR-2623-authored-report-adapters.md) | An adapter is authored for a runner Rotaris has never seen | P1 | approved |

## History

- 2026-08-20 — SWR-2612..2619 implemented: the gate stops being a guess. It was
  re-inferred from filesystem markers on every session, remembered nothing, ran
  nothing to check its own commands, and could not tell a workspace that has no
  gate *yet* from one that needs none — both resolved to an exempt suite, so an
  unverifiable run read exactly like a verified one.

  `verifier/gate_state.py` gives it four states and a bounded content fingerprint
  over the recognized markers, persisted as metadata in
  `.rotaris/verifier.state.json`; the gate itself stays in `verifier.checks`
  where a human edits it. `stale` deliberately covers both "the fingerprint
  moved" and "never probed here", because both give a caller the same
  instruction.

  `verifier/calibration.py` probes a command before it binds, with the cheapest
  form that proves it resolves and finds work. Two asymmetries carry the weight:
  `empty` is produced only for a test role and only on a positively recognised
  zero-collection signal, so an unfamiliar runner's output can never demote a
  blocking check on a guess; and a denied or unreadable probe is `undecidable`,
  never a demotion, because what a policy forbids is the probe and that says
  nothing about the check. `unavailable` turned out to be the predicate SWR-2620
  already defined for its fallback — one definition of "this did not run", two
  consumers.

  `verifier/gate_writer.py` becomes the one path that writes the gate, and
  `authorize_gate_write` its whole automatic authority. The `gatekeeper` persona
  (SWR-2614) holds the pen through two internal tools no configuration can grant
  to anybody else, and the write tool evaluates that authority itself and refuses
  in band — a prompt instruction not to weaken the gate is one a model can lose
  track of, and this one it cannot reach. What a turn changed is read from the
  tool, never from the persona's own account of itself.

  `invalid` (SWR-2616) finally separates "the check says the code is wrong" from
  "the check is wrong". It never gates, never charges the SWR-2605 repair budget,
  and never enters the repair context — and where a probed same-role,
  same-severity equivalent exists the gate repairs itself deterministically,
  once per role per session, with no model call.

  Everything the automatic paths may not do reaches the user as a
  `verifier_gate_update` proposal carrying the concrete block approval would
  produce (SWR-2617), applied by the one writer rather than interpreted by an
  agent, and deduplicated by content key rather than by asking a model not to
  repeat itself.

  Two long-standing costs went with it: SWR-2618 lets one root gate cover a
  multi-project workspace — this repository's own `apps/rotaris` was invisible to
  detection until now — and SWR-2619 stops the acceptance persona re-running the
  bound suite, which a task reaching delegated acceptance had been paying for
  twice, in two terminals, with two chances to disagree about the exit code.

- 2026-08-13 — SWR-2619 authored: one suite, one runner. Reviewing the adaptive
  gate surfaced a duplication that predates it — `agents/prompts/verifier.md`
  instructs the delegated `verifier` persona to run `make lint`, `make
  typecheck`, and `make test` itself, which are the roles detection already
  binds, so a slice that reaches acceptance runs the whole suite twice and can
  come back with two different answers about the same exit code. The
  deterministic run already happened before the orchestrator could delegate, and
  a red gate never needed the persona at all: SWR-2604 downgrades the verdict and
  SWR-2605 re-queues with the failing output attached. The persona keeps the duty
  the gate cannot discharge — request-clause coverage, todo items checked against
  the code on disk, scope creep — and consumes the SWR-2603 evidence for
  everything else, with a fallback to running commands itself only where no
  evidence exists (exempt suite, `pending` gate, an iteration that changed no
  files). The wording follows the duty: the deterministic gate is the final gate,
  and the persona is the acceptance grader in front of it.

- 2026-08-12 — SWR-2612..2618 authored: the gate becomes adaptive. Until now the
  suite was re-inferred from filesystem markers on every session (SWR-2601),
  remembered nothing, executed nothing to check its own commands, and could not
  distinguish a workspace that has no gate yet from one that needs none — both
  resolved to `exempt`, so an unverifiable run reported clean. Three lifecycles
  were missing. A **fresh workspace** has no markers to detect at all, because
  the techstack is what the first run produces: SWR-2615 fires a techstack event
  on the no-marker → marker transition and has the new `gatekeeper` persona
  (SWR-2614) author the suite afterwards, while a run without a gate finishes but
  says so — the state is on the child report and warned in the run header rather
  than silently exempt. A **living repo** changes shape, and a stale gate today
  fails like broken code: SWR-2616 adds the `invalid` outcome, which never gates
  and never charges the SWR-2605 repair budget, and repairs the gate
  deterministically (re-detect + probe, same role and severity) before spending a
  model call. Anything that would **weaken** the gate — dropping a role, lowering
  a severity, emptying the suite — is outside every automatic path's authority
  and becomes an approval-gated `verifier_gate_update` proposal in the existing
  improvement loop (SWR-2617), which is what makes the automatic paths safe. The
  supporting facts: SWR-2612 gives the gate an explicit state
  (`absent`/`pending`/`calibrated`/`stale`) and a marker fingerprint in a
  rotaris-managed `.rotaris/verifier.state.json` — metadata only, since the gate
  itself stays in `verifier.checks` where a human edits it; SWR-2613 requires a
  cheap probe (`pytest --collect-only`, `make -n`, `npm run --dry-run`) before a
  check binds, so a suite collecting zero tests can never read as verified; and
  SWR-2618 adds `cwd` per check so one root gate can cover a multi-project
  workspace within the existing `suite_timeout`.

- 2026-08-12 — SWR-2610/SWR-2611 approved after the Skip button was found not to
  skip. Pressing it killed the check's terminal, which is what the timeout path
  does, but the blocking poll loop in `TerminalSession.execute` reads the screen
  to decide when a command ended: a dead pane returns empty output forever, and
  libtmux does not raise on it, so the runner sat until the check's own 600s
  timeout while the header kept counting. Skip now sends the terminal's interrupt
  (`TerminalExecutor.interrupt` — Ctrl+C, or `SIGINT` to the process group), which
  returns the shell to a prompt and ends the poll loop the way the loop expects.
  The check also runs on a daemon thread the runner owns rather than through
  `asyncio.to_thread`, raced against the skip signal, so a command that traps the
  interrupt is abandoned after a short grace period with its terminal torn down —
  bounded either way. Only that abandoned case rebuilds the executor; a check that
  stopped cleanly leaves a healthy terminal for the next one.

- 2026-08-11 — SWR-2608/2609/2610 authored from a live incident: a run whose
  agent had already succeeded sat silent for ten minutes inside
  `_run_post_change_verifier`. Two causes, one symptom. The detected suite for a
  workspace with both a `pyproject.toml` and a `Makefile` was six checks — three
  duplicate pairs — run sequentially at 600s each, so verification alone could
  consume an hour per iteration; and the runner reported nothing at all until the
  whole suite returned, so the run had no way to say what it was doing. SWR-2608
  bounds the suite (one check per semantic role, plus a `verifier.suite_timeout`
  covering the whole run), SWR-2609 makes the phase visible on the timeline, the
  event stream, and in the desktop run header, and SWR-2610 lets a user stop a
  check they do not need without that being read as a failure. SWR-2611 is the
  technical seam the latter two share: progress callbacks and a run control on
  `run_check_suite`.

- 2026-08-06 — SWR-2605 implemented; the epic is complete. The gate's re-queue
  is now bounded and informed. `src/rotaris_core/verifier/repair.py` supplies two
  pure functions: `decide_repair` charges one attempt per gated iteration
  against `verifier.max_repair_attempts` (default 2) and returns `retry` or
  `escalate`, and `build_repair_context` renders the failing blocking checks —
  name, command, status, exit code, output excerpt, and the path to the full
  log — as the block injected into the next attempt's execution payload. Before
  this, every retry re-ran the *same unchanged prompt* until the generic
  same-task guard hit `runtime.max_iterations`; the agent was never told what
  failed. Only blocking checks that did not pass appear in the context, since
  advisory failures never gate. The injected block replaces the previous one:
  both loop-appended markers are stripped before a new block is added, so a
  task re-queued repeatedly cannot accumulate stale failure output. On
  escalation the report becomes `failed` with the checks named, which abandons
  that task through the existing outcome dispatch; `report.escalation` is
  deliberately left unset, because that field aborts the whole session and one
  red check must not take the other tasks with it. The decision travels on the
  report as `repair` — runner-owned like `verifier_results` and
  `completion_gate`, and stripped from LLM output by
  `SummaryAgent._normalize_payload`, so a model cannot claim a repair attempt it
  never spent — and is emitted as `repair_attempt_scheduled` /
  `repair_escalation` timeline events plus a duck-typed
  `RalphIterationObserver.on_repair_escalation` hook for interactive hosts. The
  budget is per task id and reset per run; a task that verifies clean releases
  it, so a later regression starts from a full budget. It is charged only on the
  gate's own re-queue path — the incomplete-todo path keeps recording the gate
  decision without a charge, because the todo state machine already writes its
  own continuation payload and two budgets would race for one task. Repair
  attempts are ordinary iterations: they still count toward the message limit
  and the same-task guard, so no safeguard is bypassed.
- 2026-08-06 — SWR-2604 implemented: the evidence is now authoritative. A new
  pure function in `src/rotaris_core/verifier/gate.py` turns a `VerifierEvidence`
  into a `CompletionGateDecision` — `gated`, `passed`, or `exempt` — and
  `RalphLoop` applies it *after* the LLM completion classifier, so a `COMPLETE`
  verdict on an iteration whose blocking checks failed is downgraded rather than
  trusted; the overruled verdict is kept on the decision so the override is
  auditable. Inside an executed suite, a blocking check gates unless it actually
  passed: a permission-denied check is `skipped` (SWR-2501/2602) and counts as a
  missing check, never as a passing one. Advisory failures never gate but are
  named on the decision. A suite that did not run at all is `exempt`, not
  gated — a read-only research task, `verifier.checks: []`, an undetectable
  suite, and the degraded path where the verifier itself failed all land there,
  because gating them would turn every unconfigured workspace into a re-queue
  loop. A gated report is rewritten to `status: "partial"`, the status the loop
  and the scheduler already understand as "re-queue this task", so no new status
  vocabulary leaks into the artifact store or the hosts. The decision travels on
  the report as `completion_gate` — runner-owned like `verifier_results` and
  stripped from LLM output by `SummaryAgent._normalize_payload`, so a
  summarizing model cannot declare its own work gate-passed — and is emitted as
  a `completion_gate_decision` timeline event. Gating is on by default and can
  be turned off per workspace with `verifier.gate_completion: false`, which
  keeps the checks running and the evidence reported while letting the LLM
  verdict stand. Still open: SWR-2605 must bound the resulting repair attempts
  and feed the failing check output into them, since today a persistently
  failing check re-queues until `runtime.max_iterations`.
- 2026-08-06 — SWR-2603 implemented: the verifier's results now live *in* the
  child report instead of beside it. `src/rotaris_core/verifier/evidence.py`
  projects a `VerifierRunResult` onto a `VerifierEvidence` — the overall
  `verdict` (`passed`/`failed`/`skipped`), the suite source, the skip reason, and
  the per-check `CheckResult` list reused from the SWR-2602 runner. The verdict
  is a stored field rather than a derived property, so it survives the JSON
  round-trip every persisted report and host snapshot performs, and a suite that
  never ran reads as `skipped` — never as `passed`, so a later gate cannot
  mistake "nothing was checked" for "checks passed". `ChildReportArtifact` gains
  `verifier_results: VerifierEvidence | None = None`; the `None` default keeps
  reports and sessions written before the field loadable. `RalphLoop` attaches
  the evidence with `model_copy` immediately after the run and before any outcome
  is finalized, so it reaches both exits — the incomplete-todo requeue and the
  completion-classifier rewrite, which themselves use `model_copy` and preserve
  it. `SummaryAgent._normalize_payload` strips the runner-owned field from LLM
  output before validation, so a summarizing model can neither author nor
  overwrite the evidence — the enforcement is structural, not a prompt
  instruction. Nothing gates on it yet: SWR-2604 turns the verdict into a
  completion gate, SWR-2605 feeds the failing checks into a bounded repair loop.
- 2026-08-06 — SWR-2602 implemented: the resolved suite now actually runs.
  `src/rotaris_core/verifier/change_detection.py` decides whether an iteration
  modified workspace files — the mutating tool-call delta from `GlobalTracker`
  unioned with the files the child report declares, so neither an undeclared
  edit nor an untracked tool can suppress verification —
  and `src/rotaris_core/verifier/runner.py` executes the checks sequentially through
  `HardenedTerminalExecutor`, inheriting outcome classification (a command that
  exits 0 while printing test failures is `suspicious_success`, and therefore
  reported failed), the SWR-2501 permission policy (a denied check is `skipped`
  with the violated rule, never passed), and SWR-2507 sandboxing. `RalphLoop`
  runs it once per iteration before any outcome is finalized, storing the result
  on `last_verifier_run`, emitting `verifier_run_completed`/`verifier_run_skipped`
  on the diagnostics timeline with the full output under
  `<session_dir>/evidence/verifier/`, and offering it to hosts via the new
  `RalphIterationObserver.on_verifier_run` hook. Nothing gates on the evidence
  yet — SWR-2603 carries it into the child report, SWR-2604 gates completion.
- 2026-08-05 — SWR-2601 implemented: a workspace can now declare its check suite
  under a new top-level `verifier:` section (`VerifierConfig`/`CheckConfig` in
  `src/rotaris_core/config/schema.py`, layered through the existing global/workspace
  merge), and `src/rotaris_core/verifier/` resolves it. `checks` is three-valued —
  omitted means auto-detect from workspace markers
  (`pyproject.toml`/`package.json`/`Makefile`; tests and typecheck detected as
  `blocking`, lint as `advisory`), while an explicit `checks: []` records
  "no verification" as a decision. The resolved suite and its source
  (`config`/`detected`/`explicit_empty`/`detection_empty`) land on
  `SessionState.check_suite` and in `state/run_config.json`. Resolution never
  raises. Nothing executes the suite yet — SWR-2602 supplies the runner, so
  runtime behaviour is unchanged.
- 2026-08-03 — Epic created from the market gap analysis: completion was
  classified LLM-based (`ralph/completion_classifier.py`) and verification
  existed only as prompt discipline (orchestrator phase 3, SWR-1801). The
  deterministic pieces (terminal outcome classifier, `ChildReportArtifact`
  `tests`/`errors` fields) existed but were not wired into a gate.
