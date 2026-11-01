# Hardening — the application measured against engineering standards

- **Created:** 2026-11-01, for [R-091](../product/requests.md#r-091) ("harden the behavior of the App according to
  software engineering standards"), from three read-only surveys of the checkout at `6dc7e8a3`. *(Numbered R-090 while
  it was written; another session's R-090 landed first, so the request and its companion R-092 took the next free numbers.)*
- **Governs:** nothing. It records what was measured, against which standard, what holds, what does not, and which
  bundle of the orchestrated build closes each gap. The requirements and directives it cites govern; a mechanism's
  first execution reports into the record that decided it and into [`first-executions.md`](first-executions.md).
- **Maintained:** each landing that closes a row changes its status here, in the same commit; a row closed by a
  measurement names the proof or test that pins it.

## 1. What was measured against what

| Standard | Source read | What it covers here |
|---|---|---|
| Electron security checklist (20 items) and fuses | the Electron documentation, `tutorial/security`, `tutorial/fuses` | the renderer perimeter, IPC, packaging |
| SQLite write-ahead logging | `sqlite.org/wal.html` | the session store's durability and integrity |
| OpenSSF Scorecard checks | `ossf/scorecard`, `docs/checks.md` | the repository: CI, dependencies, SAST, SBOM, policy |
| pnpm supply-chain settings | `pnpm.io/settings` | `minimumReleaseAge`, `trustPolicy`, `allowBuilds` |

The Electron documentation and the other three are public platform documentation, an approved input (`AGENTS.md`).
Nothing was read from the sources the hard boundary names.

## 2. Assets and trust boundaries

Five processes (ADR-0002): **main** holds the windows, the credentials (ADR-0029) and the supervision; **preload** is
the one frozen bridge; the **renderer** shows web content and is the only process whose input is a page; the **run
host** runs one live session, the model calls and the tools, under the permission gate; the **workspace service** opens,
migrates, backs up and restores the store. What is protected: the person's credentials, the workspace on disk, the
session record, and the person's attention (a run must not act unasked, REQ-TOOLS-011 to REQ-TOOLS-024). What is
untrusted: a model's output, a tool's output, a provider's response, an MCP server, the content a renderer page could be
made to show. The boundaries that hold today, in one line each:

- every cross-process shape is a zod schema in `contracts`, and the one IPC handler parses before it dispatches
  (`CommandRequestSchema`, `apps/desktop/src/main/index.ts`);
- the preload exposes one `command` method and subscribe-only listeners, never `ipcRenderer`;
- every window is `sandbox: true, contextIsolation: true, nodeIntegration: false`; the CSP meta tag allows `'self'`
  scripts and `connect-src 'none'`; the permission handlers deny everything but the application's own pages' audio
  and clipboard write (OQ-459);
- `shell.openExternal` admits `http:` and `https:` alone, parsed;
- the store opens in WAL with the mode read back, a write probe, `foreign_keys` read back, `synchronous = NORMAL`
  and `FULL` for the critical commits; documents are written by temp-fsync-rename; the restore is staged and
  journaled;
- every request to a utility process has a deadline (`ProcessLink`); main-to-child messages are schema-checked both
  ways;
- the permission gate is one decision point and fails closed (REQ-TOOLS-020); egress fails closed (REQ-SANDBOX-016);
  the file tools are fenced on the real path (`fence.ts`); one redaction pass serves the gate, the hooks, MCP, the
  terminal, the session writer and the model client;
- the updater verifies a signed manifest and a SHA-256 before anything in the installation is touched
  (REQ-STARTUP-126, REQ-STARTUP-167);
- CI runs the gate on every push with SHA-pinned actions and a read-only token (R-079).

## 3. The findings

Five clusters. Each row names the gap, the evidence and the bundle that closes it (section 5); a struck row is closed.

### 3.1 The Electron perimeter

| Finding | Evidence | Closes |
|---|---|---|
| No `will-navigate`, `will-redirect`, `setWindowOpenHandler` or `will-attach-webview` guard anywhere | `apps/desktop/src` has none; the only navigation hook releases modality (`main-windows.ts`, `did-start-navigation`) | A1 |
| `app.enableSandbox()` absent; sandboxing is per window | `main/index.ts` | A1 |
| No fuses flipped, no ASAR integrity, `onlyLoadAppFromAsar` off | `apps/desktop/electron-builder.yml`; `@electron/fuses` unused | A2 |
| `webSecurity`, `allowRunningInsecureContent`, `experimentalFeatures`, `webviewTag` left to defaults at eight window sites, nothing asserts them | `main-windows.ts:876,1129,1170`; `index.ts:719,759,898,996,1079` | A2 |
| The dispatcher's sender check falls back to the active window; no sender-origin check | `mainWindows.forCommand` (`main-windows.ts:282`); `runCommand` (`index.ts:1882`) | A1 |
| `runCommand` catches nothing; a throwing handler rejects the renderer's `invoke` | `index.ts:1893-1896`; [the note](../defects/the-command-dispatcher-catches-nothing-so-a-handler-that-throws-rejects-the-renderers-invoke.md) | A1 |
| `setDevicePermissionHandler` and `setDisplayMediaRequestHandler` unset | `main/permissions.ts` | A2, under OQ-459 |

Checklist items met today: 1 (no remote content), 2, 3, 4 (per window), 5, 6, 7 (meta tag, `style-src
'unsafe-inline'` remains), 8, 9, 10, 11, 12 (no webview), 15, 16 (Electron 44.3.0), 20. Open: 13, 14, 17, 19. Item 18
(a custom scheme) is deliberately not met under [OQ-466](../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-466)'s
ruling of 2026-11-01: the renderer stays on `file:`, `grantFileProtocolExtraPrivileges` stays enabled, and "the
application's own page" becomes one exported exact-path predicate (the built renderer's `index.html` under the
application's renderer directory, or the dev server's exact origin while unpackaged) shared by the permission handlers,
the navigation guard, the sender check and the reload.

### 3.2 Failure handling outside main

| Finding | Evidence | Closes |
|---|---|---|
| The run host and the workspace service have no `uncaughtException` / `unhandledRejection` handler and do not end when the parent port closes | `run-host/index.ts`, `workspace-service/index.ts`; [the note](../defects/the-run-host-and-the-workspace-service-have-no-last-resort-exception-handler-and-end-without-a-word.md); [the orphaned run host](../defects/the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md) | B1 |
| A forked child's `ready` is not bounded | `main/index.ts:310`, `:413` | B1 |
| A lost run host or workspace service is logged and never surfaced | `main/index.ts:339`, `:418`; [OQ-462](../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-462) | B1 |
| No React error boundary; `createRoot` without error options | `renderer/main.tsx:1685`, `windows.tsx:30`, `packages/ui/src/AppShell.tsx` | B2 |
| A dead renderer is detached and logged; no reload, no notice; GPU loss unhandled | `main-windows.ts:1151-1159` | B2 |

### 3.3 Store integrity on open

| Finding | Evidence | Closes |
|---|---|---|
| No `quick_check` before a migration; no corruption-specific refusal | `packages/store/src/open.ts`; `workspace-service/store-open.ts` | C1 |
| `wal_autocheckpoint` and idle checkpoints left to the engine's defaults | `open.ts` | C1 |
| Migration immutability tested as a version sequence only, never as SQL text | `store.test.ts:1807` | C2 |
| `store` has 3 test files for 17 modules | `packages/store/src` | C2 |

Not a finding: the bundled SQLite is 3.53.4, past the WAL-reset fix of 3.51.3; C1 pins the floor in a test.

### 3.4 Bounds and sinks

| Finding | Evidence | Closes |
|---|---|---|
| `prompt`, every `path` and every name unbounded in `CommandRequestSchema` | `packages/contracts/src/commands.ts`; [OQ-467](../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-467) | D1 |
| Main's application log bypasses `redact()` | `main/app-log.ts`; [the note](../defects/mains-application-log-lines-bypass-the-redaction-pass.md) | D1 |
| Application log to stdout alone in a packaged build; diagnostics (REQ-STARTUP-129 to REQ-STARTUP-139) not built | `main/app-log.ts` | D2 |
| Session log unbounded | `run-host/tools.ts:26`; [OQ-465](../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-465) | D2 |
| The fence folds case on every platform; a check-then-write gap | `agent-tools/src/tools/fence.ts:52-82` | D3 |
| Terminal, git and MCP writes outside the file tools' fence | `write-scope.ts`; [OQ-464](../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-464), ruled 2026-11-01: the boundary is per tool — the fence binds every first-party tool that takes a path, the gate's key scoping binds a path key, and the terminal and MCP are bounded by OS confinement where it exists and by nothing on native Windows (IC-8); the wording the user reads is [OQ-468](open-questions/69-spikes-and-later-questions-36.md#oq-468) | D3 (the invariant test) |

### 3.5 Engineering hygiene

| Finding | Evidence | Closes |
|---|---|---|
| Lint is not type-aware: `recommended` alone, no `projectService` | `eslint.config.js:101` | E1 |
| Warnings do not fail the gate; unused disable directives pass | `package.json`, the `lint` script | E1 |
| No import-cycle or extraneous-dependency rule | `eslint.config.js` | E1 |
| About 110 test files never typechecked; proof scripts never linted; `.mjs` untyped | `tsconfig.json:7-18`; `eslint.config.js:95` | E2 |
| One tsconfig for every process: DOM types in main, Node types in the renderer | `tsconfig.json:4`, `tsconfig.base.json:20` | E2 |
| No code coverage, no thresholds | `vitest.config.ts` | F1 |
| No property-based tests; `shell` and `kernel` thin | `packages/shell` (1 test file), `packages/kernel` (4) | F2, F3 |
| `minimumReleaseAge` implicit; no `trustPolicy`; no `engineStrict`; duplicated specifiers | `pnpm-workspace.yaml`, `.npmrc` | G1 |
| No dependency-update bot | `.github/` | G1 |
| No audit, no SAST, no SBOM, no `SECURITY.md`, no `CODEOWNERS` | `.github/workflows/`, the root | G2 |

Scorecard checks met today: Binary-Artifacts, CI-Tests, Dangerous-Workflow, License, Maintained, Pinned-Dependencies
(actions by SHA, a lockfile), Token-Permissions. Open and closable here: Dependency-Update-Tool, Fuzzing (property
tests count), SAST, SBOM, Security-Policy, Vulnerabilities. The owner's: Branch-Protection, Code-Review, Signed-Releases
(signing, R-071).

## 4. What is not built here

- **Authenticode signing, the macOS artifact** (IC-3), and the Linux artifact's acceptance (ADR-0066): the owner's.
- **Proofs in CI**: R-079 decided none; a reversal is a new request.
- **GitHub branch protection** and the harness's live-run allow rules: repository and host settings. The owner approved
  the one rule for the acceptance tree's live-run launch on 2026-11-01, written to the checkout's git-ignored local
  settings; adding or widening one stays the owner's.
- **A repository-wide formatter**: a reformat touches every in-flight branch; the owner decides when.
- **`strict-type-checked`**: a follow-up plan once the type-aware baseline (E1) has landed and its lint time is known.
- **Credentials at rest** ([OQ-463](../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-463)): ruled not wanted on
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

## 6. Requirements traceability and the decision archive — R-092

**The paper.** ReqToCode (arXiv 2603.13999, 2026) inverts recovery-based traceability: a requirement is a generated,
language-native, deprecable code element (a *Traceable*) that implementations and tests reference, grouped in
*RequirementSets*; a reference to a missing Traceable fails the build, a deprecated one warns, and coverage, orphans
and drift are computed from the references on any revision. It reports no evaluation; its mechanism is the claim.

**What this repository already has** (ADR-0040 #4, ADR-0056): `pnpm symbols` writes `packages/kernel/src/generated/requirements.ts`
from `docs/spec/` and `docs/product/directives/`, one typed symbol per identifier with its domain, file, line and
withdrawn flag, `@deprecated` where withdrawn or superseded (the Traceable, its set and its lifecycle);
`pnpm req-coverage` reports every live shipping requirement's citing files by kind, implementation, test or proof
(the coverage analysis); directives carry back-pointers both ways (the governing text is never ambiguous). The
specification's domains are the RequirementSets; its contiguous, never-reused identifiers are the paper's stable ids.

**What the paper has and this repository does not** (each a row the plan closes):

| Finding | Evidence | Closes |
|---|---|---|
| ~~Ruled, closed and withdrawn open questions sit beside the open ones: 69 parts, 311 entries, most of them history~~ **Closed 2026-11-01 by I1:** `pnpm archive:migrate` moved 301 entries of 296 settled questions out of 62 parts into [`docs/archive/architecture/open-questions/`](../archive/architecture/open-questions/) (62 files, none continued); 22 entries stay live, 12 open (OQ-401, OQ-402, OQ-450 to OQ-458, OQ-468) and 10 deferred, each part keeping one index line per moved entry | `docs/architecture/open-questions/` | I1 |
| ~~The gates read the record by index and parts, with no notion of an archive~~ **Closed 2026-11-01 by I1:** `docs/archive/` mirrors the record (`docs/README.md`, ["The archive"](../README.md#the-archive)); `record-parts.mjs` reads it (`archivePartsOf`, `readRecordWithArchive`), the claims gate and the record tests read live and archived entries alike, the link and budget gates walk it, and `tools/archive/migrate.mjs` (`pnpm archive:migrate`, `--dry-run`, `--check`) moves and repoints, idempotent | `tools/record-parts.mjs`, `check-open-question-claims.mjs`, `check-record-links.mjs`, `check-doc-budget.mjs` | I1 |
| Ruled escalations and gate rulings sit in the live register | `docs/architecture/owner-decisions.md` (15 parts) | I2 |
| Falsified reasons and correction blocks sit inside the ADRs' decision text | `docs/architecture/adr/` (66 records) | I2 |
| 829 repaired defect notes sit under `docs/defects/fixed/` | `docs/defects/fixed/` | I2 |
| A superseded or withdrawn requirement's text sits in the live specification (268 withdrawn, the superseded ones named by `SUPERSEDED_BY`) | `docs/spec/`; the generator reads definition lines only | I3 |
| Citations are comment strings: 906 files cite 4,456 distinct identifiers, 2 code sites use the typed symbol; a citation of an undefined identifier passes `pnpm lint` | `grep -rho "REQ-[A-Z]*-[0-9]*" packages apps` | H1 |
| No branch-relative coverage (the paper's §3.6) | `tools/requirement-coverage/coverage.mjs` | H1 |
| No drift detection: a requirement edited after the code that cites it was last touched (the paper's §4.7) | the same | H1 |
| Coverage is report-only; an orphaned requirement never fails anything (the paper computes it in CI) | the same; `.github/workflows/ci.yml` | H2 |
| A diff does not name the requirements it claims | `tools/verify-plan/` | H2 |

**The archive's shape** (settled here as the orchestrator's design; the owner chose what moves, 2026-11-01):
`docs/archive/` mirrors the record's paths (`archive/architecture/open-questions/<part>.md`,
`archive/architecture/owner-decisions/…`, `archive/architecture/adr/<nnnn>-history.md`, `archive/defects/…`,
`archive/spec/<domain>/…`). An entry moves whole, under its own anchor, and the live file keeps one line per moved
entry: the identifier, its state and date, and the archive link. The move is a script (`tools/archive/migrate.mjs`,
`pnpm archive:migrate`), idempotent and re-runnable, which also repoints every link in the record to the moved
anchor; a landing reruns it after its rebase instead of merging moved text by hand, the way `pnpm proofs:index`
regenerates the proof index. The gates learn the archive once (`record-parts.mjs`): `questionStates` reads live and
archived entries, the link gate walks `docs/archive/`, and the budget applies there too. `docs/spec/` keeps every
identifier defined where it is: a withdrawn or superseded requirement keeps its definition line, its anchor and its
back-pointer, and its text moves verbatim; the generator's counts are unchanged, and the counts test holds.

Open questions this plan raised and rules before building: [OQ-462 to OQ-467](../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-462)
and [OQ-459](../archive/architecture/open-questions/68-spikes-and-later-questions-35.md#oq-459), all ruled 2026-11-01 by the orchestrator's
consortium under R-072; two rulings minted directives, [`PD-SESSION-004`](../product/directives/pd-session-004.md#pd-session-004)
(the session log's bound, from OQ-465) and [`PD-CHAT-011`](../product/directives/pd-chat-011.md#pd-chat-011) (a refused
draft or image, from OQ-467), and OQ-464's ruling raised [OQ-468](open-questions/69-spikes-and-later-questions-36.md#oq-468),
left open. Numbers reserved for the plans: OQ-469 to OQ-492. The first executions owed: the fuses on the packaged artifact, `quick_check` on open, the guards' first
refusal, and type-aware lint's cost to the gate, each a row in `first-executions.md`.
