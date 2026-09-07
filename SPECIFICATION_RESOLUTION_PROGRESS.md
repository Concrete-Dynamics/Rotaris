# Accepted specification resolutions

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
