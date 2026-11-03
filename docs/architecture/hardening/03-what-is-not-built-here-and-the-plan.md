# Hardening — the application measured against engineering standards — What is not built here

Part 3 of 4 of [the hardening record](../hardening.md), which indexes every part.

## 4. What is not built here

- **Authenticode signing, the macOS artifact** (IC-3), and the Linux artifact's acceptance (ADR-0066): the owner's.
- **Proofs in CI**: R-079 decided none; a reversal is a new request.
- **GitHub branch protection** and the harness's live-run allow rules: repository and host settings. The owner approved
  the one rule for the acceptance tree's live-run launch on 2026-11-01, written to the checkout's git-ignored local
  settings; adding or widening one stays the owner's.
- **A repository-wide formatter**: a reformat touches every in-flight branch; the owner decides when.
- **`strict-type-checked`**: a follow-up plan once the type-aware baseline (E1) has landed and its lint time is known.
- **Credentials at rest** ([OQ-463](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-463)): ruled not wanted on
  2026-11-01; the plain JSON file under REQ-PROVIDER-016's protection stays, and the entry names the conditions under
  which the question may return as a new request.

## 5. The plan — two build plans and one acceptance plan

Executed through the `orchestrated-build` skill (`.agents/skills/orchestrated-build/SKILL.md`): a bundle is two tasks
on one branch by one builder, reviewed by an agent that did not build it, landed by rebase with the gate green on the
pushed head. `hrd1` builds the runtime (lanes 1 to 3), `hrd2` the engineering (lanes 4 to 6); `hrda` runs the acceptance
on the merged head: the full proof sweep, the live runs against the registered unmetered endpoint (R-068), the autopsy.

| Lane | Bundle | Closes |
|---|---|---|
| 1 main perimeter and supervision | **A1** `perimeter-guards`: the `web-contents-created` guard, `app.enableSandbox()`; `runCommand` catches and checks the sender's origin | 3.1 rows 1, 2, 5, 6 |
| | **A2** `secure-windows-and-fuses`: one `secureWebPreferences()` for every window; fuses flipped at package time and read back; device and display-media handlers (OQ-459) | 3.1 rows 3, 4, 7 |
| | **B1** `child-process-failure`: last-resort handlers and parent-port exit in both utility processes; a bounded `ready`; the notice of OQ-462 | 3.2 rows 1 to 3 |
| | **B2** `renderer-failure`: an error boundary and `createRoot` error options reporting through `notice.report`; a bounded reload on `render-process-gone` | 3.2 rows 4, 5 |
| 2 the store | **C1** `store-open-integrity`: `quick_check` before migrating, a `corrupt` refusal into the held-refusal path (OQ-281, REQ-SESSION-089); explicit checkpointing; the SQLite floor | 3.3 rows 1, 2 |
| | **C2** `migration-immutability-and-store-tests`: a SHA-256 manifest of shipped migrations; tests for `recover.ts`, `backup.ts`, the lock rows and the read modes | 3.3 rows 3, 4 |
| 3 bounds and sinks | **D1** `ipc-bounds-and-redaction`: `.max()` per OQ-467; main's log through `redact()` | 3.4 rows 1, 2 |
| | **D2** `log-sinks`: the diagnostics `light` level for the application log (REQ-STARTUP-129 to REQ-STARTUP-133); the session-log bound OQ-465 rules | 3.4 rows 3, 4 |
| | **D3** `fence-hardening`: case folding only where the file system folds; write through a handle re-verified after the check | 3.4 row 5 |
| 4 static analysis | **E1** `type-aware-lint`: `projectService`, `recommendedTypeChecked`, the promise rules, `--max-warnings 0`, `import-x` | 3.5 rows 1 to 3 |
| | **E2** `typecheck-coverage`: the script and tool tests typechecked, `checkJs` over `.mjs`, per-process tsconfigs | 3.5 rows 4, 5 |
| 5 tests | **F1** `coverage`: `@vitest/coverage-v8` with a ratcheting threshold in CI; mock hygiene; the naming guard over `apps/` | 3.5 row 6 |
| | **F2** `property-tests`: fast-check over redaction, the fence, `CommandRequestSchema`, `ProcessMessageSchema` | 3.5 row 7 |
| | **F3** `thin-packages`: `shell` and `kernel` tests; a `driver-proof` scenario for malformed, oversized and throwing commands | 3.5 row 7 |
| 6 supply chain | **G1** `dependency-policy`: `minimumReleaseAge` explicit, `trustPolicy`, `engineStrict`, a catalog, `.node-version`; Dependabot | 3.5 rows 8, 9 |
| | **G2** `ci-security`: `pnpm audit`, CodeQL, a CycloneDX SBOM on the release draft, `SECURITY.md`, `CODEOWNERS` | 3.5 row 10 |
| 7 the decision archive (R-092) | **I1** `archive-tooling-and-open-questions`: `docs/archive/` and the re-runnable migration (`pnpm archive:migrate`); the gates read live and archived parts alike; every ruled, closed or withdrawn open question moves, an index line stays | §6 rows 1, 2 |
| | **I2** `archive-decisions-and-notes`: ruled escalations and gate rulings, historical ADR passages, `docs/defects/fixed/` | §6 rows 3 to 5 |
| | **I3** `archive-superseded-requirements`: a superseded or withdrawn requirement's text moves verbatim; its identifier, anchor, definition line and back-pointer stay in `docs/spec/`; the artifact's counts hold | §6 row 6 |
| 8 traceability (R-092) | **H1** `traceable-references`: `rotaris/requirement-citations-resolve` in `pnpm lint`; `req-coverage --since` (branch-relative) and `--drift` (requirement changed after its code) | §6 rows 7 to 9 |
| | **H2** `coverage-ratchet`: a per-domain baseline of uncited requirements that may only shrink, held in `pnpm lint`; the summary in CI; `verify:plan` names the requirements a diff's files cite | §6 rows 10, 11 |
