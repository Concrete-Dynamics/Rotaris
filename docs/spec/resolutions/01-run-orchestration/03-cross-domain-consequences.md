# Resolution Record — Domain 01, Multi-Agent Run Orchestration — Cross-domain consequences

Part 3 of 4 of [domain 01's resolutions](../01-run-orchestration.md), which indexes every part.

## Cross-domain consequences

- **Exit codes.** Domain 20 (`REQ-EVENTS-025`, `REQ-EVENTS-026`) mapped this domain's run statuses
  onto process exit codes for a command-line surface. The status vocabulary is unchanged and remains
  citable; the numeric codes are no longer stated here, so that mapping had no counterpart in this
  domain and was domain 20's to withdraw under its own sweep. It did: REQ-EVENTS-025 is withdrawn,
  and REQ-EVENTS-026 now cites REQ-ORCH-083's set rather than holding a copy of it.
- **Model slots.** REQ-ORCH-009 now names `small_model`, `fallback_model` and
  `default_summary_model` from REQ-CONFIG-064 and REQ-CONFIG-065 rather than describing them, and
  states that the run-level `fallback_model` is meant, not the per-role fallback of REQ-ORCH-144.
- **Model tiers.** The `small`/`medium`/`large` vocabulary and its ordering are read from the tier
  aliases of REQ-CONFIG-070 and REQ-CONFIG-071 rather than defined afresh.
- **Playbook global scope.** REQ-ORCH-026 now resolves the global override directory to the
  `playbooks/` subdirectory of the per-user configuration directory of REQ-CONFIG-001.
- **`single` delegation strategy.** REQ-ORCH-025 now withholds the `delegate` tool from every role
  for the run, which is the behavior REQ-CONFIG-263 already describes for the `single` delegation
  strategy. The two are now the same rule stated in two domains.
- **Tool capability declarations.** REQ-ORCH-016, REQ-ORCH-028 and REQ-ORCH-153 resolve the
  direct-work bundle, the definition of an implementation delegation, and the plan gate's spawn
  restriction against the per-tool declarations of the public tool-name registry (REQ-CONFIG-231).
  **The owner named here is the wrong one, and has been since the fifth reconciliation round.**
  REQ-CONFIG-231 states in its own text that it fixes the referential-validation rule alone and owns
  no capability, and until the sixth round no requirement in any domain stated the classification
  these three read. The sixth round put it in REQ-TOOLS-001, which now declares the three facets —
  reads workspace files, writes workspace files, runs commands — as part of the registry it owns.
  These three requirements have not yet been re-pointed at it and still cite REQ-CONFIG-231; that
  belongs to the next round and is recorded as open in `docs/clean-room/provenance.md` *(removed 2026-10-26)*.
  **Executed in A4's round, 2026-09-13.** All three now cite REQ-TOOLS-001 for the classification they
  read. REQ-CONFIG-231 keeps the referential-validation rule it does own and is no longer cited here for
  a capability it never carried. The round that did it was the one amending REQ-ORCH-153 anyway, which is
  why it was taken here rather than left for a sweep of its own.
- **New configuration settings.** Four settings are added to this domain's table and will need
  entries in the settings domain: the per-task consecutive-retry limit (default 3), the relentless
  audit timeout (default 60 s), the run-start mode (default `auto`), and the per-check
  `failure_pattern`.
  **Executed in the sixth reconciliation round, five rounds after it was written.** Three of the four
  needed a key in domain 15 and had none: `task_consecutive_retry_limit` is now REQ-CONFIG-474,
  `relentless_audit_timeout` REQ-CONFIG-475, and the run-start mode key REQ-CONFIG-476, each
  registering the key, its type and its default and holding no copy of the rule here that consumes
  it. The fourth needed nothing there — `failure_pattern` is a field of a check declaration, which
  this domain states itself. A sentence in a resolution record saying another domain "will need" a
  requirement is not a requirement, and nothing in the first five rounds was looking for one.
- **New vocabulary.** The timeline-event vocabulary gains `plan_gate_opened` and
  `plan_gate_resolved`; the issue-kind vocabulary gains `model_override_rejected`; the session
  execution status gains `awaiting_plan_decision`. Domains consuming this domain's diagnostics
  should expect all three.
  **Checked in the sixth reconciliation round, and only one of the three was owed anywhere else.**
  The session execution status is REQ-SESSION-073's closed vocabulary, so `awaiting_plan_decision`
  had to be admitted there and is: domain 07 carries it, and REQ-SESSION-076 maps it. The
  timeline-event and issue-kind vocabularies are this domain's own and no other document enumerates
  either, so `plan_gate_opened`, `plan_gate_resolved` and `model_override_rejected` were owed to
  nobody. "Domains should expect" was the wrong form of words for the one obligation that was real.
- **New surfaces.** The plan gate (REQ-ORCH-153, REQ-ORCH-154) and the surface set closed by
  REQ-ORCH-155 are new obligations on the desktop shell domain, within the views of REQ-SHELL-023.
  **Executed in the sixth reconciliation round.** REQ-SHELL-168 is the shell domain's answering
  requirement: it states that this window hosts those surfaces, that each is presented inside the
  primary view the run belongs to and offers its actions in the one action vocabulary of
  REQ-SHELL-048, that it holds no copy of what each surface must convey, that window-level Escape
  never answers the gate, and that a session waiting at the gate is not an active run for the close
  guard of REQ-SHELL-119. Between this record and that round the obligation was recorded and
  unanswered.
