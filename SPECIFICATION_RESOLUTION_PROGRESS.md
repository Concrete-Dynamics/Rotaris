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

## Roadmap — what is left before a production release (overhauled 2026-09-18)

This table overhauls the six-package acceptance tracker above into a
release tracker. The six rows are kept with their delivery state as of
2026-09-18; the rows after them are the work the acceptance scope did
not contain and a production release does. Ordering is by
release-blocking force, not by package number. Detail and evidence for
each row is in the dated entry at the end of this document
(`2026-09-18 — release-readiness audit`).

| # | Track | Contains | State as of 2026-09-18 |
|---|---|---|---|
| R0 | Primary-flow defects | `docs/defects/fixed/a-session-delete-leaves-its-plan-cycles-behind.md` (repaired 2026-09-18, store v20), `docs/defects/fixed/the-start-session-dialog-accepts-and-creates-nothing.md` (repaired 2026-09-18, no-throw session start + never-throw sends, checkpoint-proof isolated green), `docs/defects/fixed/the-start-session-dialog-does-not-fit-the-minimum-window.md` (repaired 2026-09-18, scroll-under-fixed-head/foot + run-start-mode first, ui-audit CLEAN 7/7), `docs/defects/fixed/expanding-a-member-of-an-activity-line-does-not-lift-the-display-caps.md` (repaired 2026-09-18, memberKey = rowKey, rows-proof reads 30/30 live) | **CLOSED 2026-09-18 — 0 open, 4 repaired** |
| R1 | Release gate and distribution | `REQ-STARTUP-156` gate unbuilt; portable stub, icon, `REQ-SHELL-140/142` notices bundle (ADR-0054); signed `SHA256SUMS.txt` (`REQ-STARTUP-167/168`); per-runner load proof (IC-3 item 3); Linux/macOS artifacts (IC-3 items 1, 2, 4); notices-generator section for provisioned tools (IC-7 remainder) | **BLOCKS RELEASE — Windows installer exists, release pipeline does not** |
| R2 | Owner rulings owed | ESC-36 (provider row visibility), ESC-37 (skill invocation surface), ESC-38 (Skills columns), ESC-39 (taken command name); OQ-58 (skill session scope), OQ-59 (file-or-dir chooser), OQ-60 (summary without teardown), OQ-62 branches 2–3 (discovery/ configured pricing), OQ-63 (application-log threshold) — ESC-40 ruled 2026-09-18 (domain 07 wins, REQ-CLI-065 amended), OQ-56 ruled and built 2026-09-18 (token to 58%, theme-proof green), OQ-61 ruled and built 2026-09-18 (`git_read`, REQ-TOOLS-193) | **BLOCKS RELEASE where the build proceeds under an interim reading — 4 ESC + 5 OQ open** |
| R3 | Confinement and platform proof | IC-8 proposed (six `REQ-SANDBOX-127` effects on real macOS/Linux hosts); IC-4 half 2 (rename machine, record figures); OQ-12 power-loss fault half (owner physical act, per platform); POSIX proof isolation (`proof-isolation-is-windows-only…`); platform-parameterised helpers (`platform-parameterised-helpers…`) | **BLOCKS multi-platform claims; Windows-only release needs ESC-6 disclosure + IC-4 half 2 or a recorded waiver** |
| R4 | Spec packages still pending | Providers and MCP (A5, A7, A8, OQ-6, OQ-18, OQ-21, OQ-22, OQ-50); Services/stores/recovery (OQ-1, OQ-2, OQ-43, OQ-47, OQ-48; OQ-45 ruled 2026-09-11, delivery unconfirmed); Traceability/presentation/benchmarks (OQ-24, OQ-25, OQ-29, OQ-32, OQ-33, OQ-34, OQ-40); Governance A1 | **BLOCKS a "spec-complete" claim; shippable only with each item waived or moved post-1.0 explicitly** |
| R5 | Should-fix defects (non-blocking) | `configured-per-token-prices-take-no-effect.md`, `the-analysis-completion-notice-does-not-match-its-requirement.md`, `a-chip-option-announces-its-label-and-hint-as-one-word.md`, `the-in-projection-scope-filter-is-never-reached.md`, `two-proof-scripts-assert-a-timeline-name-the-code-has-never-written.md`, `staging-failure-escapes-the-replacement-ladder.md` (claims repaired, verify + close) | **7 open — ship only with known-issue notes, or fix first** |
| R6 | Proof health | `theme-proof` green 2026-09-18 (OQ-56 ruled: token to 58%, all 15 cells pass); `delivery-proof` legacy red (85/86); `slice-proof` stale (needs pasted key); oldest green batch 2026-09-11 | **"all proofs green" still blocked by delivery-proof + slice-proof** |
| R7 | Live-model confirmation | Strict-schema rung fix (`REQ-ORCH-010`, accepted-not-sent) needs `pnpm live-run --confirm`; last green 2026-09-13 was 21/21 on `sign-in + requirements` only | **Owed before claiming the model boundary is proven** |
| R8 | Polish / hygiene | `the-git-table-clips-its-content-and-does-not-scroll.md`, `the-application-log-keeps-every-level-because-nothing-reads-one.md`, `the-directive-registers-count-is-prose-with-no-checker.md`, `plan-gate-proof-resume-sometimes-finds-no-session-row.md`, `role-gutter-truncation-rule-is-inert.md` + `live-rows-are-never-measured.md` (both carry Repaired 2026-09-15 — verify + close) | **Not blocking — close or carry as known issues** |

## Work packages (acceptance scope, kept for history)

| Package | Accepted items | State |
|---|---|---|
| Session lifecycle, durability and exports | A3, A6, A9, OQ-8, OQ-12, OQ-41, OQ-42, OQ-46 | **Delivered 2026-09-13**, with one explicitly recorded evidence debt (OQ-12's power-loss measurement) |
| Permissions, orchestration and terminal | A2, A4, OQ-4, OQ-5, OQ-7, OQ-9, OQ-10, OQ-13, OQ-15, OQ-16, OQ-17, OQ-35, OQ-36, OQ-37, OQ-38, OQ-39 | In progress — **A2 and A4 delivered 2026-09-13** (A4's plan gate built and proven under REQ-ORCH-152..154 / ADR-0062); A4's found-by-building amendment round (hook skip-reason vocabulary) discharged 2026-09-14 |
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

### 2026-09-13 — the work package closed

Branch `session-lifecycle-exports`, merged to `main`. Every item was audited
against the code and the evidence rather than against this document, and the
audit is the reason six of the findings below exist: four items the summary above
did not list as outstanding were unapplied or non-conformant.

**A3 — verified, and given the evidence it lacked.** `REQ-SESSION-094`'s order
holds in the code: the terminal transaction runs under the held lock and the
release is in guaranteed cleanup after the sink is detached. The coverage asserted
the pipeline but not the ownership, so a blocking consumer now observes the lock
held at every delivered event, the terminal pair included, and gone once the run
has ended. The runtime view and `codebase.md` still described the **old** order —
the lock released inside the terminal transaction — and are corrected.

**A6 — dependent contracts reconciled, and a defect found doing it.**
`REQ-SESSION-153` now states the two scopes one document carries and cites
`REQ-EVENTS-138` as the owner of the derivation; `REQ-SESSION-193`'s inventory
needed no change; no ADR states a competing derivation. `duration_seconds` was
read off the segment's last `session.end` whatever it carried, so an end with the
figure and no status exported a non-zero duration beside `status: unknown`, and a
`result` that supplied the outcome had its own duration discarded. The duration is
now the outcome's own and zero when neither terminal event supplied a status.

**A9 — destination-failure coverage added, and it found a hole in the contract.**
A real refusal — a reader's open descriptor on Windows, a write-denied parent
elsewhere — drives the ladder to exhaustion; the regression asserts the recoverable
failure, the previous export byte-identical and no staging leftover.
`replaceDocument` created the destination's parent outside its own `try`, so a
parent that cannot be created **raised** out of `writeExport` instead of returning
a `Result`. Reachable because an export's destination is one the user picked in a
save dialog. Reported as `document.parent` now; ADR-0004 records the correction.

**OQ-8 — decided, applied and built.** `REQ-EVENTS-053` names the completed
provider request as the emission trigger, counts the usage a failed or partial
request reported, and skips a request that leaves the cumulative totals unchanged.
ADR-0009 consequence 8 and the register are reconciled. Building it found that the
event was raised once per iteration from the turn's returned report — which carries
only the attempts that survived — so a run that retried a transient failure or
resumed its parent spent tokens the session's totals, its terminal event and its
cost never counted.

**OQ-12 — the wording closes; the measurement does not.** `REQ-SESSION-034` is now
the product's single definition of durability in three levels: process-crash
atomicity for every successful write; operating-system and power-loss survival for
an acknowledged terminal commit and a completed backup artifact, subject to the
device honouring the flushes the product issues; and a stated permitted loss of
intermediate updates. `REQ-LIBRARY-138`'s "flushed to disk" and `REQ-LIBRARY-043`'s
"readable after a crash or loss of power" cite which level they mean.
**Evidence debt, unchanged and explicitly recorded**: no power-loss test has been
run on any supported platform. The harness exists; its fault half is a physical act
— a forced power-off or a kernel crash — that only the machine's owner can perform.
Tracked per platform in `docs/architecture/implementation-conditions.md`: owed on
Windows, blocked on Linux and macOS while IC-3 stands.

**OQ-41 — applied, and three findings.** `REQ-TRACE-061` states its bounded ladder
and the recoverable-error-with-old-file-retained outcome; `REQ-TRACE-502` keeps the
complete-file guarantee whole and scopes independence to invocations and view
freshness; `REQ-TRACE-182`'s catch covers the whole regeneration. The ladder had
been ruled under OQ-44 on 2026-09-02 and **its amendment never reached the
requirement**. The generator a test session runs replaced the artifact with a
single `writeFileSync` over the target — no staging, no rename, no ladder. And the
test adapter did not catch, so a failed regeneration would have failed the whole
run before collection. The contended case the register recorded as unstaged is now
staged and passing.

**OQ-42 — delivery completed.** The notice gained the recovery **action** it was
missing, mapped onto `REQ-NOTIFY-044`'s existing `focus-session` member with no
member added. The cross-process audit establishes that the run host is the only
process opening a workspace store for writing, so propagation is `notice.publish`
and `run.result` — and `run.result` was lossy: `persistence` had no field in the
contract, so main recognised an unconfirmed completion only from a sentence and
raised a **second** notice for a failure `REQ-EVENTS-088` allows exactly one
notification for. The dependent-spec scan found two continue-on-recording-failure
clauses still standing, `REQ-CLI-067` and `REQ-SESSION-145`, both amended in place.

**OQ-46 — applied, driven in the built app, and one defect.** `REQ-SHELL-155`
keeps its singular title and requires one aggregate warning for a batch;
`REQ-SESSION-062` keeps one entry per repaired session. The entry itself was
non-conformant on four of its five fixed fields. `pnpm app:drive` against three
planted stale sessions showed the built app raising one warning, "Sessions marked
interrupted", naming all three with "Open Overview" as its action, and the route
reaching the list; one stale session showed "Session marked interrupted" unchanged
and without an action.

**Verification.** `pnpm check` (symbols, typecheck, lint, the whole suite) and
`pnpm build` green on merged `main`. Focused suites were run after each coherent
change. `pnpm live-run` was **not** run: it spends the owner's money and no
approval was given.

**Remaining evidence debt in this package.** Two, both stated rather than worked
around. OQ-12's power-loss measurement, above. And the **rendered** form of OQ-42's
recording-failure notice in the built app: provoking a sticky durable-store failure
behind the built run host needs a fault-injection seam that does not exist, and no
evidence was fabricated for it. The path that notice travels — a `notice.publish`
carrying an action identifier, mapped in main to a member of the closed vocabulary,
rendered with its label and dispatched by the renderer — **is** exercised end to end
in the built app by the OQ-46 drive above; what is unexercised is the trigger for
this one identifier.

### 2026-09-13 — A2 audited and delivered

The first item of the permissions/orchestration/terminal package, checked the way
package 1 taught: against the requirement text and the code, not against the
2026-09-07 note above.

**The specification carries it.** `REQ-ORCH-008` states the accepted boundary in its
own sentence — the raw prompt truncated to 4,000 characters, a small metadata mapping,
and the optional prior-response field owned by `REQ-ORCH-012` with its own independent
4,000-character cap; additional repository retrieval excluded; prompt text and
historical response text may each contain code and each stays confined to its named
field; the field untrusted. `REQ-ORCH-012` keeps its text and its cap, and the
cross-domain record reads the same. No requirement was found stating a competing input
boundary.

**The code matches it.** `classificationUserText` cuts each field at `PROMPT_CAP`
separately and delimits both as quotations, the metadata mapping carries run context
only, the classification turn is dispatched with an empty tool list, and the system
prompt states that a prior response is untrusted context whose embedded instructions are
never followed. The A2 regression asserts all four boundaries at once, including
historical code surviving inside the truncated field.
`pnpm exec vitest run packages/engine/src/intent/intent.test.ts` passed on merged
`main`: 1 file / 13 tests.

**What the audit adds.** The bounded field has **no production producer**. The run
host's pre-flight supplies the prompt and the metadata only, so `priorResponse` is
exercised by the regression and never in the built product. That is `REQ-ORCH-012`'s own
delivery — the prior-response route, still listed as outstanding in
`docs/architecture/codebase.md` — and not a defect in the boundary A2 decides: a
contradiction over what the classifier input may contain is settled whether or not the
field is populated yet. **A2 is delivered; the route it bounds remains owed**, and it is
the natural first act of whoever builds `REQ-ORCH-012`.

### 2026-09-13 — A4's specification resolved, the mechanism owed

The second item of the permissions/orchestration/terminal package. A4 is a **contradiction across
three requirements**, so this round settles the text; the mechanism it describes is plan mode
(REQ-ORCH-152..154), which is **not built** and is owed by a Part of its own.

**The contradiction, and what carried it.** REQ-ORCH-025 promised that a `single` run spawns no
child; REQ-ORCH-072 spawned "the root child" at the start of every iteration of every run. The word
was doing two jobs — the run's own root agent, and an agent another agent delegated to. Every other
document in the corpus had already taken the second reading: REQ-MONITOR-043 and REQ-MONITOR-089 call
it "the run's synthetic root", REQ-CHAT-068 withholds the delegation-context header from it, and
ADR-0012 is titled for the *delegated*-child scheduler. REQ-ORCH-072 was the only sentence out of
step, and it is the one that changed. It now names the **root execution record**, states that it is
not a delegated child — no `delegate` call, none of REQ-ORCH-046's admission limits, no model slot of
REQ-ORCH-050, not presented as a task agent — and keeps its identity clause, made precise: a
canonical name and a task id in the same namespace, so a lookup naming the root resolves, with
REQ-TOOLS-155 and REQ-TOOLS-156's parent-scoping unchanged so a caller who may not read a record is
refused for **that** reason rather than told the root does not exist.

**The half nobody could have built.** REQ-ORCH-153 stated the plan gate as a restriction on
*spawning*: no child whose role holds a writing or command-running tool. Under `single` the entry
role holds exactly those tools, by REQ-ORCH-025 — so the gate as written either blocked a `single`
run from starting at all or said nothing about the one agent that would do the writing. The
replacement withholds **capability** and not the start: the run starts, its root execution record is
created with the entry role, and while the gate is held every agent holds **planning grants** — its
ordinary set less every tool declared as writing workspace files or running commands, an undeclared
tool counting as declaring all three — enforced **where a call is dispatched**, so the refusal binds
whatever route a tool reached a role by. The spawn restriction is kept beside that enforcement rather
than replaced by it, because a refusal at admission tells the model why at the moment it asked.
Approval installs the execution grants for the rest of the run.

**Two boundaries that had to be said out loud.** A hold is not a termination: no terminal status, no
terminal result, and the run the user answers is the run that reached the gate whether or not the
process that hosted it outlived the hold. And the gate blocks the work the run's *agents* do and
never the product's own recording — the session, the plan, the todo state and the events stay
writable throughout, because a gate that stopped the product recording what it was doing would lose
the plan it exists to obtain.

**Dependent contracts reconciled.** REQ-HOOKS-126 declared `"untrusted_workspace"` "the only defined
reason" for a withheld hook; it now defines exactly two, `"plan_gate"` emitted once per withheld
invocation rather than once per session, because that hold ends when the user answers while the trust
gate's verdict stands for the session. REQ-HOOKS-004's existing order — policy before hooks, so a
refused call starts no hook process — is what keeps the tool hooks of a gate-refused call from
firing, so the amendment needed to reach only the reason vocabulary.

**A debt closed in passing.** The domain-01 resolution record had carried an open item since its
sixth round: REQ-ORCH-016, REQ-ORCH-028 and REQ-ORCH-153 resolve capability questions against
REQ-CONFIG-231, which says in its own text that it owns no capability, while REQ-TOOLS-001 does. All
three now cite REQ-TOOLS-001. It was taken here because this round was already reading two of the
three sentences — which is the lesson the fifth round's own mis-pairing recorded.

**Rulings the owner made for the build, recorded so the Part does not re-litigate them.**

1. **Park, do not block.** The gate parks the way a message-limit pause does — durable status, the
   run segment ends, bindings released — rather than holding a live run. REQ-ORCH-153 already points
   at REQ-ORCH-087 for restart survival; REQ-SHELL-168 already says a session at the gate is not an
   active run; and parking makes the planning phase constant for a segment, so planning grants are a
   launch-time input rather than mutable mid-run state.
2. **The answer is a session command, not a control.** `CONTROL_OPS` is REQ-MONITOR-004's closed
   enumeration and there is no live run to control. Two commands, not one: the edited plan persists
   on its own so that REQ-ORCH-154's "editing alone never approves" is structural and a closed window
   does not discard the user's edits.
3. **A plan cycle is not an iteration.** It advances neither `iterations_completed` nor the message
   count; token usage is counted as it already is. REQ-ORCH-154 places no limit on revise cycles, and
   a cycle that spent an iteration would put REQ-ORCH-070's limit of 20 on them by the back door.
   REQ-ORCH-072's mechanics do not describe a plan cycle either: it selects no task, resolves none of
   REQ-ORCH-074's three outcomes, and emits no report artifact.
4. **The word `plan` stays where the specification put it.** REQ-ORCH-153/154 say plan, plan cycle,
   plan gate; the todo document keeps `todo` in its own names. Both entries belong in the
   orchestration context's `CONTEXT.md`, each citing its own requirement. No new word is coined.
5. **The mode is offered in the composer, and in the start dialog too.** The composer is where a run
   is started in every case after the first, and REQ-ORCH-152 promises the mode there. Per
   REQ-CONFIG-476 every surface offering it **writes `runtime.run_start_mode`** and none holds a mode
   of its own.

**Owed, and stated rather than worked around.** No code changed in this round. Plan mode is unbuilt —
only the configuration key and the settings control exist — so REQ-ORCH-153's planning grants have no
implementation to be audited against, and the architecture of the mechanism (an ADR for the phase and
its enforcement points) belongs to the Part that builds it. Two defects found while reading are
recorded in `docs/defects/` without being repaired here: the root execution record carries no
resolvable identity, which is REQ-ORCH-072's own clause and the first thing that Part will need; and
`presentationStatus` maps `interrupted` onto `paused` where REQ-NOTIFY-049 says `idle`, which is
unrelated to A4 and wants its own commit. *Update 2026-09-14: both were repaired — see the entry at
the end of this document.*

### 2026-09-13 — A4 delivered: the plan gate built and proven (REQ-ORCH-152..154, ADR-0062)

The mechanism of A4 is built, proven in the built app, and merged (`part-plan-gate`, commit `d9738ec`).

**Delivered mechanism.**
- **Park, do not block (ADR-0062):** A plan-mode run is a sequence of run segments, launched through `SessionManager.launchContinuation`. In `plan` mode, unless classified in the answer group of REQ-ORCH-021 (`question`, `exploration`), iteration 0 runs a single turn of the entry role to produce the plan verbatim, parks at `awaiting_plan_decision` with `plan_cycle = 1`, and raises no terminal result or stop reason.
- **Three enforcement points for planning grants:** Withholding of file-modifying and command-running tools (`withheldUnderPlanGate`, covering all MCP/plugin tools fail-closed) is enforced: (1) at port construction (`createToolPort`), (2) at dispatch (`Gate.dispatch`) as `blocked` ahead of permission/hook evaluation, and (3) at child admission (`IterationChildren.delegate`). Meta tools remain exempt (`REQ-TOOLS-014`).
- **Hook skip reason:** Hook invocations withheld during the hold emit `hook.finish` with `skipped: true` and `skip_reason: 'plan_gate'` once per withheld invocation (`REQ-HOOKS-126/130`).
- **Durable half (schema v17):** Dedicated table `plan_cycles` persists every cycle verbatim, optional user edits, and the decision taken (`approve`, `revise`, `cancel`). `sessions.plan_cycle` and `sessions.plan_released` track active gate state and one-way execution release across application restarts (`REQ-ORCH-153/154`).
- **Session commands:** Direct user plan editing via `session.planEdit` persists user edits without approving. Three-way decision via `session.planDecision` handles `approve` (one-way execution release), `revise` (launches next plan cycle with specified changes), and `cancel` (marks session paused with `user_cancelled`).
- **Surface:** Hosted inside `WorkspaceView` (`PlanGate.tsx`) per `REQ-SHELL-168` with verbatim monospace presentation, inline editing, and sticky keyboard-accessible decision buttons. Composer is locked while gate holds. Mode is offered and persists via `runtime.run_start_mode` in both composer chip and start session dialog.
- **Verification:** Unit and integration coverage in `packages/engine/src/run/plan-gate.test.ts` (10 tests), `packages/agent-tools/src/gate.test.ts`, `packages/agent-tools/src/planning-grants.test.ts`, `packages/hooks/src/engine.test.ts`, and `packages/store/src/store.test.ts`. Full end-to-end built-app proof executed in `apps/desktop/scripts/plan-gate-proof.mjs` and recorded in `docs/architecture/first-executions.md`.

### 2026-09-14 — A4's amendment round discharged, and both recorded defects repaired

Three closures this document did not yet record, verified against git history on `main` before writing:

- **The hook skip-reason amendment round (the defect found by building the plan gate).**
  `docs/spec/20-event-history-replay-export.md`'s two stale restatements — `REQ-EVENTS-047`'s
  "the only defined value" parenthetical and the `hook.finish` row of the event-payload table — were
  amended to name both members of `REQ-HOOKS-126`'s closed set, keeping the restriction to
  `untrusted_workspace` where the sentence describes the trust-gate case. Commit `644bca0`, merged as
  `6e7fb6f` (`fix-plan-gate-hook-skip-reason-spec`). The round the defect owed is discharged; the
  defect note records the repair.
- **`interrupted` presents as `idle`.** The unrelated mapping defect was repaired in
  `packages/contracts/src/status.ts` with its own arm and the REQ-NOTIFY-049/160 citation, plus the
  regression in `packages/contracts/src/contracts.test.ts` asserting one stated arm per member of
  REQ-SESSION-073's fourteen. The "wants its own commit" note above is satisfied.
- **The root execution record's identity.** The second defect recorded during A4's reading round
  also carries its Repaired section as of 2026-09-13. The identity REQ-ORCH-072 asks for — the
  canonical name and task id that make a lookup naming the root resolve — exists in the record now,
  and the note's own text describes what was delivered.

One correction to this document made while verifying: the A4 entry below cited the plan-gate merge
as `d9738ece8`; the commit's actual short hash on `main` is `d9738ec`, and it now reads so. The rest
of that entry's claims were confirmed against history rather than taken from it: the merge exists,
its message names REQ-ORCH-152/153/154 and ADR-0062, and the entry's predecessor commits (`70a12c3`,
`60ff8c5`) are the A4-specification and A2-audit rounds this document narrates.

### 2026-09-18 — release-readiness audit (roadmap overhaul)

Audited against `main` at `4861978`: `pnpm check` green
(symbols 4,399 ids, typecheck, lint, 1,639 passed / 25 skipped),
19 open defect notes (24 fixed), IC-1/2/5/6 discharged, IC-3 open,
IC-4 half-open, IC-7 half-open, IC-8 proposed, 5 ESC + 7 OQ branches
open, 43 proof scripts, `pnpm package` Windows-only, `REQ-STARTUP-156`
gate unbuilt, last `live-run` 21/21 on two scenarios only.

**R0 — closed 2026-09-18 (4; the last item repaired, none open).** Each broke a primary flow
against a live requirement, so none rode as a known issue:
(1) ~~session delete orphans `plan_cycles`~~ repaired: store v20 rebuilds `plan_cycles` with
`ON DELETE CASCADE` (`REQ-SESSION-166`, `REQ-ORCH-154` — note in `docs/defects/fixed/`);
(2) ~~start-session dialog Accept creates nothing, silently~~ repaired: the accept-to-submit path
threw instead of refusing — two unguarded relays in `session.start` (`REQ-SESSION-084`,
`REQ-GIT-118`, `REQ-SHELL-125`), a throw-transparent renderer send, a composer that wedged busy
with its text cleared — so every shape of the silence is now a reported refusal: link rejections
funnelled into the refused paths (notice + log, orphan tree removed), the early returns logged,
the eleven sends never-throw, the submit busy-safe with REQ-CHAT-012 holding on a throw
(note in `docs/defects/fixed/`, `checkpoint-proof` isolated green on the note's own gestures);
(3) ~~the same dialog overflows the 1,000×680 minimum~~ repaired: the panel caps at the viewport
with the choices scrolling under a fixed head and foot, run-start mode first (`REQ-SHELL-022`,
`REQ-SHELL-125` — note in `docs/defects/fixed/`, `ui-audit` CLEAN 7/7);
(4) ~~expanding an activity-line member does not lift the display caps~~ repaired: the member's card is
keyed by `memberKey` — the member's own `rowKey`, the identity step 4 holds the caps against — instead of
`callKey ?? index` (`REQ-CHAT-061/166/059` — note in `docs/defects/fixed/`, `rows-proof` reads 30/30 live).

**R1 — the release pipeline is the second blocker, not the installer.**
`pnpm package` produces a Windows installer and its load proof, but a
production release additionally owes: the `REQ-STARTUP-156` gate
(version/pin guards, per-platform notices validation, `SHA256SUMS.txt`
covering every asset with matching digests, detached `.sig` against a
key every offered artifact carries, seven-element body, every artifact
of each of the three platform keys downloaded and launched to first
paint offline — two runs for a self-preparing portable — with any
unestablishable check recorded `not performed` = FAIL); the portable
stub, the icon, and `REQ-SHELL-140/142` (ADR-0054); the signed
checksums (unsigned binaries are by design, `REQ-STARTUP-021/023`,
disclosed per `REQ-STARTUP-035(6)`); the per-runner load proof
(IC-3 item 3); and the IC-7 remainder (notices-generator "Tools
provisioned after installation" section, `REQ-STARTUP-141/142/143`).
Linux/macOS artifacts stay bound by IC-3 items 1, 2 and 4; shipping
them before discharge is shipping on an untested platform.

**R2 — rulings owed (4 ESC, 5 OQ branches; ESC-40, OQ-56 and OQ-61 ruled and built 2026-09-18).**
The build proceeds under stated interim readings for ESC-36 (row visibility stays on
`REQ-PROVIDER-140`), ESC-37 (force-loaded skill block, no chip),
ESC-38 (seven Skills columns), ESC-39 (suffixed command names),
and OQ-58 (per-session skill state), OQ-59 (file filter + `/skill <path>`),
OQ-60 (NULL summary), OQ-62 branches 2–3 (discovery
pricing blocked on OQ-21; configured rates deliberately unbuilt),
OQ-63 (keep everything). ESC-40 ruled for the domain-07 log level with REQ-CLI-065 amended;
OQ-56 ruled for the raised disabled token with `theme-proof` green; OQ-61 ruled for the read-only
`git_read` member with the unit suite green. OQ-62 branch 1 (provider-reported cost) was
ruled 2026-09-16 as `PD-MONITOR-001` and built. A release needs each
row ruled or explicitly waived; the interim is recorded, not assumed.

**R3 — platform proof.** IC-8 binds any confinement claim: none of the
six `REQ-SANDBOX-127` effects has been demonstrated on a real host;
the Windows `available: false` refusal path is proven
(`pnpm sandbox-proof`, ESC-6). IC-4 half 2 needs the owner-run rename
+ reboot with figures recorded. OQ-12's fault half needs the owner's
physical act per platform (wording closed, measurement owed on
Windows, blocked on Linux/macOS while IC-3 stands). Two harness gaps
make cross-platform proof undecidable: proof isolation sets only
`LOCALAPPDATA`/`APPDATA` (POSIX runs touch the real data directory),
and five helpers take `platform` but read the host separator
(`REQ-STARTUP-145`, `REQ-MCP-021/037`, `REQ-CHAT-015`, W-27).
Windows-only release posture: keep ESC-6's disclosure on the surface
and in the advisory, close or waive IC-4 half 2.

**R4 — acceptance packages still pending.** Providers and MCP (A5, A7,
A8, OQ-6, OQ-18, OQ-21, OQ-22, OQ-50 — A5/OQ-19/OQ-20 amended with
regressions, selector/attachment integration and the shared
effective-capability resolver still owed); services/stores/recovery
(OQ-1, OQ-2, OQ-43, OQ-47, OQ-48); traceability/presentation/
benchmarks (OQ-24, OQ-25, OQ-29, OQ-32, OQ-33, OQ-34, OQ-40);
governance A1. Session lifecycle is delivered 2026-09-13 with the two
recorded evidence debts (OQ-12 measurement; OQ-42 notice rendered
form, trigger unexercised for want of a fault seam). Permissions/
orchestration/terminal is A2 + A4 delivered, remainder open
(`priorResponse` has no producer — owed as the `REQ-ORCH-012` route).

**R6/R7 — evidence health.** `theme-proof` is red by design
(`rotaris-dim` `--rt-text-disabled` misses 3:1 on cards — OQ-56; needs
a design-or-requirement ruling either way, not a code tweak).
`delivery-proof` legacy red (85/86) should be retired or repaired, not
carried silently. `slice-proof` (2026-09-05) is stale by construction.
`pnpm live-run` last green 2026-09-13 covers `sign-in + requirements`
only; the strict-schema fix (`REQ-ORCH-010` first real execution
2026-09-16) is accepted-not-sent until a confirmed live run.

**Suggested release order.** R0 → R2 rulings that unblock R0/R1
(ESC-40, OQ-61, OQ-56) → R1 gate + IC-7 remainder → R3 Windows
posture (IC-4 half 2, proof isolation, separator helpers) → R5/R8
verify-and-close sweep (`staging-failure…`, `live-rows…`,
`role-gutter…`) → R7 live-run → R4 triage (waive vs post-1.0 per
item, explicitly). IC-3/IC-8 stay as the multi-platform gate.
