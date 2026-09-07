# Accepted specification resolutions

## 2026-09-07 stable error classifications

- OQ-15: amended REQ-TOOLS-101, REQ-SANDBOX-083, ADR-0001 and the question register. Stable failure/outcome codes govern classification; validation retains `ValueError`, and wrap refusals use `SandboxUnavailableError`. Implementation exception names are optional redacted detail.
- Found and repaired a gate-level gap: an unknown terminal action failed schema validation before terminal diagnostics were produced. Executors can now supply a schema-refusal observation; terminal supplies its fixed compatibility label. Added gate coverage and five argument-combination regressions.
- Verification: gate and terminal suites passed (2 files / 37 tests, 37.55 seconds); TypeScript and `git diff --check` passed. The terminal run again emitted two `AttachConsole failed` helper diagnostics, retained under OQ-10's native-process audit.
- Remaining delivery: the current terminal has no confinement-wrapping integration. Its refusal observation and no-execution guarantee require implementation and regression coverage alongside the native confinement work (OQ-7/OQ-35). OQ-15 policy is closed; full delivery remains in progress.

## 2026-09-07 terminal capture clarification

- OQ-13: REQ-TOOLS-098, ADR-0020 and the question register now specify capture-aware soft-pause advice. The foreground PTY merges stdout and stderr; help and empty-output observations explain that capture and offer polling or interruption.
- Added a real PowerShell stderr-capture regression and strengthened the empty soft-pause assertions. The terminal suite passed: 1 file / 14 tests. Two native `AttachConsole failed` diagnostics remain tracked under OQ-10.
- Fresh verification after architecture/register reconciliation: terminal suite passed again (14 tests, 38.05 seconds); `pnpm exec tsc -p tsconfig.json --noEmit` and `git diff --check` passed.

## 2026-09-07 ownership and confinement clarifications

- Applied OQ-1 to REQ-CHAT-041: one application-instance/session-ID queue and atomic service-owned consumption.
- Applied OQ-7 to REQ-TOOLS-123: original host `.git`/`.rotaris` state preserved; inability to preserve it refuses the command.
- Applied OQ-9 to REQ-TOOLS-111: cleanup scope is terminal-tool process trees; hook-descendant survival remains explicit. Hooks Settings now explains that behavior.
- Applied OQ-16 to REQ-TOOLS-049: shipped preset lists and existing declared authoring controls.
- Applied OQ-35 to REQ-SANDBOX-079 and REQ-TOOLS-123: each confined command receives fresh inner-shell state initialized from configured cwd/environment; unconfined shell state remains persistent.
- The register records these as closed policy choices with historical questions preserved. Remaining delivery work: dependent ADR reconciliation, cross-process queue proof, native host-path/crash-cleanup evidence, confined-mode help/observation integration, and visual verification of hook help.
- `pnpm exec vitest run packages/engine/src/control.test.ts packages/hooks/src packages/agent-tools/src/policy.test.ts` passed: 7 files / 93 tests. This establishes regression safety for the exercised queue, hooks and permission paths; native confinement remains separately unverified.

## 2026-09-07 network work package

- OQ-36: REQ-TOOLS-086 delegates canonicalization to REQ-SANDBOX-006. Fixed bare IPv6 and host/port inputs; added idempotence and matching coverage. ADR-0023 and the register record the closure.
- OQ-37: explicit direct dispatcher on every production fetch hop; tool help and failures disclose proxy exclusion. Added a real local target/proxy regression with a proxied control request. The dependency was already present transitively and is now declared directly. Owning requirement, ADR and register amended.
- Current network verification: policy, fetch and direct-fetch suites pass, 3 files / 78 tests. The shared worktree advanced to `dd36106` during this work; no commit or push was issued by this agent. Earlier changes are present in current history; remaining edits are left uncommitted.
- Wider verification: `pnpm exec vitest run packages/agent-tools/src` passed, 8 files / 125 tests; TypeScript and `git diff --check` passed. The Windows PTY helper emitted two `AttachConsole failed` diagnostics during the wider run despite its successful exit. Carry that native-process evidence into OQ-10's platform validation.

Accepted: 2026-09-06. Scope: all 48 decisions in [the review](SPECIFICATION_REVIEW.md), including owning requirements, resolution history, dependent architecture, affected implementation and verification. Preserve stable requirement identifiers. Commits and pushes are deferred by user instruction.

## Completion rule

Each item requires current evidence for its operative specification, dependent contracts, implementation and relevant verification. Hardware-dependent measurements remain explicitly recorded as evidence debt under the accepted proposals. A decision's acceptance alone establishes its authority; the checklist below tracks its delivery.

## Work packages

| Package | Accepted items | State |
|---|---|---|
| Session lifecycle, durability and exports | A3, A6, A9, OQ-8, OQ-12, OQ-41, OQ-42, OQ-46 | In progress |
| Permissions, orchestration and terminal | A2, A4, OQ-4, OQ-5, OQ-7, OQ-9, OQ-10, OQ-13, OQ-15, OQ-16, OQ-17, OQ-35, OQ-36, OQ-37, OQ-38, OQ-39 | Pending |
| Providers and MCP | A5, A7, A8, OQ-6, OQ-18, OQ-19, OQ-20, OQ-21, OQ-22, OQ-50 | Pending |
| Services, stores and recovery | OQ-1, OQ-2, OQ-43, OQ-45, OQ-47, OQ-48 | Pending |
| Traceability, presentation and benchmarks | OQ-24, OQ-25, OQ-29, OQ-32, OQ-33, OQ-34, OQ-40 | Pending |
| Governance and final consistency audit | A1 | Pending |

## Execution notes

- Initial current-state inspection: only the review was untracked. Refreshed the code index; its context endpoint returned an error, so focused source inspection is the fallback.
- A3: updated REQ-SESSION-094, ADR-0008, the cross-domain resolution record, writer terminal persistence and run cleanup. Ownership remains held during inserts, commit and blocking delivery; detachment precedes release in guaranteed cleanup. Regression coverage checks that order and injected terminal-write rollback with cleanup. Related recording-failure behavior remains tracked under OQ-42.
- A6: updated REQ-EVENTS-138, its dated resolution and `readTrajectory` to derive outcome from the latest run segment. Added resumed/incomplete-run, result-fallback, end-precedence and post-terminal-usage coverage. `pnpm exec vitest run packages/engine/src/session-actions.test.ts`: 1 file / 12 tests passed on 2026-09-06. Dependent ADR/schema and summary-field consistency audit remains pending.
- A9: `writeExport` already uses the canonical five-attempt replacement ladder. Updated owning specification and resolution history. Successful file export is covered by the passing session-actions suite; destination failure and previous-file preservation coverage remains to be inspected.

- OQ-42: updated REQ-EVENTS-078/088 and the cross-domain resolution record. Added sticky writer failure subscriptions, immediate run cancellation, a separately labeled in-memory notice with durable boundary/recovery instructions, and an explicitly unconfirmed caller outcome on terminal persistence failure. A failed message-limit pause enters teardown. Remaining: store-wide admission closure and sibling-run propagation, presentation/recovery integration, expanded failure injection, and dependent ADR/register reconciliation.
- A6 follow-up: inspection of the runtime event producer showed that `result` carries its outcome under a nested `result` key. Export fallback now reads that shape and retains compatibility with flat events; the regression uses the actual nested shape.
- Verification 2026-09-06: `pnpm exec tsc -p tsconfig.json --noEmit` passed. `pnpm exec vitest run packages/engine/src/run/run.test.ts packages/engine/src/session-actions.test.ts packages/engine/src/control.test.ts` passed: 3 files, 35 tests. These checks cover this work package's current changes; the full 48-item completion audit remains pending.

### 2026-09-07 — OQ-42 shared-store and projection follow-through

- Quarantine is shared by writers using the same open database. All affected live runs receive cancellation; starts and continuations return `store-failed` before admitting work. Direct writer creation/open also respects quarantine.
- Explicit reopening waits for affected runs to settle, then runs a rolled-back write probe. Failure preserves quarantine. Success reconstructs the opened session's writer and projection; previously failed writers remain closed until explicitly reopened.
- Projection failure cancels pending growth/record timers, restores cached committed text, and serves the frozen state on reattach. Run-host notices already use a separate `notice.publish` message, outside the event transcript.
- Added regressions for sibling cancellation, admission refusal, failed/successful recovery and unchanged event boundaries; added a projection regression for already-painted ephemeral text, queued updates and reattachment with unreadable storage.
- Verification: four focused suites (`run/run`, `session-actions`, `control`, `projection-failure`) passed, 37 tests. TypeScript check passed. ADR-0008, ADR-0010 and OQ-42's register entry now distinguish the accepted policy from historical interim text.
- Remaining OQ-42 proof: desktop notice/recovery interaction, cross-process failure propagation audit, and full dependent-spec consistency scan. The decision is closed; delivery verification remains in progress.

### 2026-09-07 — A2 and A5 contract clarification

- A2: REQ-ORCH-008 now names the independently bounded prior-response field owned by REQ-ORCH-012 and permits historical code within that untrusted field. Existing classifier behavior matches the accepted input boundary. Added regression checks prompt and history caps independently, historical code preservation, the untrusted instruction and an empty tool list.
- A5: REQ-PROVIDER-149, its REQ-PROVIDER-072 dependency and the snapshot format table now specify optional boolean/unknown consistently. Added discovery regressions for explicit true/false, absent capability, text-only modalities, and JSON round trips. Full selector/attachment integration remains coupled to OQ-18; the current code search found discovery support and no shared effective-capability resolver.
- Verification: `pnpm exec vitest run packages/engine/src/intent/intent.test.ts packages/providers/src/discovery.test.ts` passed, 2 files / 18 tests.

### 2026-09-07 — OQ-19 and OQ-20

- OQ-19: updated REQ-PROVIDER-018/063 and ADR-0029 to permit adjacent coordination locks and scope staging cleanup per operation. Inventory diagnostics now accept locks; a regression verifies another active lock survives a completed credential write and stays outside credential enumeration.
- OQ-20: updated REQ-PROVIDER-012/057 and ADR-0030 to name the pre-contact exception. Removed last-error mutation from unsupported sign-in-method refusal. Regression verifies an actionable failure with zero provider contact, credential writes or diagnostics and unchanged last-error state.
- Both register entries are closed as decisions with historical questions preserved. `pnpm exec vitest run packages/providers/src/credentials.test.ts packages/providers/src/signin.test.ts` passed, 2 files / 26 tests.
