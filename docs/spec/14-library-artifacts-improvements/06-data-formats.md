# Library, Artifacts, and Improvement Proposals — Improvement artifact record

Part 6 of 7 of [domain 14](../14-library-artifacts-improvements.md), which indexes every part.

## Data & Formats

### Improvement artifact record

- Held in the durable store the application keeps for the workspace (REQ-LIBRARY-042). No path, file or document format is contractual; the observable contract is the field set below plus the atomicity of REQ-LIBRARY-043.
- Top level: `artifact_id` (`impart_` + 8 base62), `source_session_id` (input alias `session_id` accepted), `source_run_type` (`task_run` | `improvement_run` | `integration_run`), `generated_at` (UTC ISO), `collector_model` (string | null), `proposals[]`, `considered_session_ids[]`, `notes` (string | null), `checkpoints[]`, `rolled_back_at` (UTC ISO | null).
- Proposal: `id` (`imp_` + 8 base62), `category` (10-value vocabulary), `summary`, `evidence[]` (≥ 1), `recommended_action`, `risk` (`low`|`medium`|`high`), `status` (`pending_review`|`approved`|`rejected`|`deferred`), `target_persona` (string | null), `proposed_verifier_section` (mapping | null), `created_at`.
- Evidence: `kind`, `text`, `source_task_id`/`source_artifact_id`/`source_session_id` (nullable), `excerpt` (optional).
- Checkpoint record: `sequence`, `ref`, `commit`, `kind` (`pre_improvement`|`applied`|`pre_rollback`), `created_at`, `files[]`, `proposal_ids[]`, `tree_root`.

### Recorded artifact versions

Each recorded version carries `{version, recorded_at, cause, artifact}` with cause ∈ {`collected`, `status_change`, `edit`, `delete`, `checkpoint`, `rollback`, `unknown`}, is reachable by artifact id and version number, and is never altered once recorded (REQ-LIBRARY-049). Retention 25 versions per artifact (version 1 protected while keep ≥ 2); fixed by REQ-LIBRARY-052 and not configurable, which also obliges the store to retain enough to state how many versions pruning dropped. Recording a version sits outside the artifact write's all-or-nothing boundary (REQ-LIBRARY-047), so a version can be absent because it was never recorded rather than pruned; that count covers pruning only, the artifact write records inside its own boundary that a version was due so the never-recorded case is separately countable (REQ-LIBRARY-047), and the export carries the two as two figures (REQ-LIBRARY-176).

### Git ref namespaces

Improvement checkpoints: `refs/rotaris/improvements/<artifact_id>/<sequence>`. Session checkpoints (adjacent domain): `refs/rotaris/checkpoints/...`. The namespaces are disjoint and pruned independently. Checkpoint retention: 10 per artifact, newest `pre_improvement` exempt; fixed by REQ-LIBRARY-071 and not configurable.

### Gate evidence mapping

JSON-serializable record carrying: gate state; configuration fingerprint; where the check suite was obtained and how it was declared; one entry per configured check (name, command, verification role, severity, working directory); probe results; per-check outcomes; and optionally the checks that could not be run and the verification roles left uncovered. Serialized key names are fixed by REQ-LIBRARY-027: `state`, `config_fingerprint`, `suite_origin`, `suite_declaration`, `checks` (`name`, `command`, `role`, `severity`, `cwd`), `probes` (`command`, `role`, `verdict`, `note`), `outcomes` (`name`, `status`, `exit_code`), `unrunnable_checks`, `uncovered_roles`. Rendered text lines: one line starting `gate state: `, one line per check starting `check <name> [<role>/<severity>]`, one line per probe and per outcome, one sentence for checks that never ran and one for uncovered roles; empty string when there is no state. Stamped gate evidence entry: `kind` = `verifier_gate_state`, text `gate state <state> at fingerprint <12 chars>` (`unknown` substituted for a missing state or fingerprint), `excerpt` = the dedupe key — 16 lowercase hex characters digesting the proposed block together with the gate state, fingerprint, unrunnable checks, and uncovered roles.

### Analyst I/O

Input: the six frozen snapshots of REQ-LIBRARY-017 — run progress, todo state, child reports, gate evidence, transcript summary, recent workspace improvement history — with an unavailable source kept distinguishable from an empty one (REQ-LIBRARY-019) and at most 5 prior artifacts of history (REQ-LIBRARY-034). Volume is bounded and elisions are marked with `…`; the bound values are the fixed, non-configurable constants of REQ-LIBRARY-165. Accepted model reply: a single JSON object carrying a `proposals` list and optional `notes` (an enclosing Markdown fence is tolerated and stripped).

### Session artifact store

Held per session in the workspace store: one full record per artifact plus a metadata index ordered by creation time, record and index entry written together indivisibly; the artifact's Markdown document, carrying its body, is a file on disk that the record references, placed by REQ-SESSION-002 (REQ-LIBRARY-087). Record ids `art_` + 8 base62; slugs kebab-case ≤ 64 chars, uniquified `-2`, `-3`, …; kinds `child_report` | `agent_published` | `system`; `status` drawn from the set REQ-LIBRARY-088 forms — the child-report status vocabulary of REQ-ORCH-112 plus `published` — which this line neither restates nor closes; tags from the closed vocabulary of REQ-LIBRARY-089, which is the single definition of that set and of its normalisation and refusal. Sidecar: YAML frontmatter (`id`, `slug`, JSON-quoted `title`, `kind`, `status`, optional source ids/tags/supersession links, timestamps), then `# <title>`, then fixed sections: Summary; Key Findings; Highlight Paths; Snippets; Edited Files; Created Files. Timeline diagnostic event kind on materialization/publish: `artifact_published`.

### Injected context blocks

- `PRIOR SIBLING ARTIFACT INDEX` — every artifact rendered on its own single line carrying slug, id, persona, status and a ≤ 160-character summary; 10,000-char budget, unsuccessful statuses ordered ahead of `succeeded` (REQ-LIBRARY-097), elision marker naming the omitted count and the `artifact_list` tool.
- `PRIOR AGENT CONTEXT (FULL)` — full bodies of explicitly attached artifacts, 48,000-char budget, missing references and elided ids reported.
  > *Note, 2026-10-07:* the budget is 100,000 characters with skip-and-continue, by [`PD-TOOLS-006`](../../product/directives/pd-tools-006.md#pd-tools-006) revision 5 (REQ-LIBRARY-098's back-pointer); the line above is kept as written.
- `persona_memory_<persona>` — the persona's memory file content (≤ 200 lines), injected at agent creation only.

### Saved prompts

Two ordered lists of strings — prompt history and prompt stash — held in the workspace store (REQ-LIBRARY-138); history ≤ 200 entries, stash ≤ 100 entries (REQ-LIBRARY-139). No path or document format is contractual.

### Persona memory files

`<workspace>/.rotaris/persona_memory/<persona>.md` — plain Markdown, ≤ 200 lines, newline-terminated, atomic writes; persona names constrained to `^[A-Za-z0-9_.\-]+$`. These stay **files** deliberately: REQ-LIBRARY-150 makes them visible, inspectable and hand-editable, and REQ-LIBRARY-153 reads a hand edit back on the next persona load.

### Configuration keys

- `runtime.improvement_collector_enabled: bool = true`
- `runtime.improvement_collector_timeout: int = 60` (min 1)
- `improvement_collector_model: string | null = null` (+ independent thinking override), fallback: medium-tier model.

These three are the whole configuration surface of this domain. Evidence bounds (REQ-LIBRARY-165), history retention (REQ-LIBRARY-052), checkpoint retention (REQ-LIBRARY-071), and the prompt-history and stash caps (REQ-LIBRARY-139) are fixed constants and are settable by no key of any scope. Desktop-only preferences, such as the Prompts tab's splitter position (REQ-LIBRARY-106), live in the per-user desktop preference store (REQ-SHELL-006) and not in this surface.

### Improvement-artifact inspection and rollback (desktop)

- Artifact list (REQ-LIBRARY-166): newest first by `generated_at`; per row the artifact id, generation time to whole-second precision, whether a rollback point exists, and per-status proposal counts in the order `pending_review`, `approved`, `rejected`, `deferred`, zero counts omitted.
- Artifact detail (REQ-LIBRARY-167): id, `generated_at`, `source_session_id`, status counts, rollback point identified by Git reference and 12-character abbreviated commit, `rolled_back_at` when set, the artifact's proposals in stored order, and the "Roll back" and "Start improvement run" actions.
- Version history (REQ-LIBRARY-168): retained versions newest first with version number, recorded time, and cause; read-only.
- Export (REQ-LIBRARY-176): one artifact or the whole workspace, written to a file the user chooses, carrying the artifact container, its proposals with their evidence, and every retained version in recorded order with **two** separate figures — how many versions retention dropped (REQ-LIBRARY-052) and how many were never recorded (REQ-LIBRARY-047) — never merged, each named for its cause, and each stated as zero when it has not occurred. Replacing an existing file at the chosen destination takes the ladder of REQ-TRACE-061; this domain states none of its own. Read-only, not a channel, and it never follows an evidence entry's source ids into the material they name.
- Rollback (REQ-LIBRARY-169 through REQ-LIBRARY-171): preview first, per-path labels `delete` / `restore` / `revert`, explicit confirmation defaulting to Cancel, a separate override for the dirty-tree refusal only, and a reported outcome in every case.

### Desktop notices and labels

Persistent notices: `<N> improvement proposal(s) ready` (success, action "Review proposals"), "Improvement analysis complete — no proposals" (info), `Proposal marked <status with spaces>` (success, action "Undo"), "Could not save prompt history". Notices whose information content is fixed but whose wording is left to the implementation: the analysis-failed warning (REQ-LIBRARY-124), the analysis-enabled-but-no-model notice (REQ-LIBRARY-037, action opening Settings at the improvement-collector model slot), the rollback success, refusal and restored-with-warning notices (REQ-LIBRARY-171), the stale-proposal and persistence-failure reports (REQ-LIBRARY-173), the spent-Undo reports (REQ-LIBRARY-116), and the improvement-run start reports (REQ-LIBRARY-172). Relative time labels: `now` (< 60 s), `<n>m` (< 1 h), `<n>h` (< 24 h), `<n>d` otherwise. Activity label: "Reviewing run for improvements…".
