# Accepted review amendments — 2026-09-06

## OQ-1, OQ-7, OQ-9, OQ-16, OQ-35 — ownership and confinement (2026-09-07)

- REQ-CHAT-041 assigns one session-scoped queue to the application instance.
- REQ-TOOLS-123 adopts REQ-SANDBOX-077's original-host-path preservation rule.
- REQ-TOOLS-111 scopes termination to terminal-tool process trees and preserves
  REQ-HOOKS-033's explicit descendant exception, now disclosed in Hooks Settings.
- REQ-TOOLS-049 defines permission rule lists as shipped presets; the existing
  declared controls remain authorable.
- REQ-SANDBOX-079 defines fresh confined-shell state and preserves persistent
  unconfined-shell behavior. Help and observations disclose the active lifetime.

The question register closes these policy choices separately from implementation
and platform proof. The root progress ledger records remaining evidence.

## OQ-36 and OQ-37 — host identity and direct transport (2026-09-07)

REQ-TOOLS-086 now cites REQ-SANDBOX-006 as the canonical-host owner. IPv6
matching uses unbracketed canonical literals. The implementation also fixes
bare IPv6 and host/port normalization, with idempotence regression coverage.

REQ-SANDBOX-022's direct-transport amendment makes proxy behavior explicit.
Every production request and redirect uses a dedicated direct dispatcher.
Tool help and connection failures disclose the policy. Undici 7.29.0 was
already resolved in the repository and is now a declared agent-tools dependency.
The local socket regression installs a global proxy dispatcher, verifies direct
target delivery with zero proxy contacts, and confirms the control request
reaches the proxy. ADR-0023 and the question register record both closures.

## OQ-15 — stable error classifications (2026-09-07)

REQ-TOOLS-101 preserves `ValueError` as a
fixed compatibility label through schema validation. REQ-SANDBOX-083 fixes wrap
refusals to `SandboxUnavailableError`. Stable failure/outcome codes govern machine
classification; optional implementation exception detail is redacted. ADR-0001 and
the question register reflect this policy; the progress ledger tracks wrapper delivery.

## OQ-13 — foreground capture (2026-09-07)

REQ-TOOLS-098 now requires capture-aware empty soft-pause advice. Foreground PTYs
merge stdout and stderr; tool help and observations describe that stream and offer
polling or interruption. Redirection advice is reserved for backends that exclude
stderr. ADR-0020 and the question register record the amendment. Real PowerShell
PTY coverage checks stderr capture and the empty soft-pause observation.

Authority: the user accepted all recommendations in the repository-root
`SPECIFICATION_REVIEW.md`, with evidence-led adjustments permitted. This record
tracks applied cross-domain decisions; the root
`SPECIFICATION_RESOLUTION_PROGRESS.md` tracks implementation and verification.

## A2 — classifier input boundary

REQ-ORCH-008 now explicitly includes REQ-ORCH-012's independently bounded
prior-response field. Historical code may travel in that untrusted field;
additional repository retrieval remains excluded. The implementation already
uses separate prompt/history caps and exposes no classifier tools. Added
regression coverage verifies both 4000-character boundaries and historical code.

## A3 — terminal lock ownership (applied)

REQ-SESSION-094 now keeps the session lock through terminal-state persistence,
the terminal event pair and committed publication. Cleanup detaches the sink,
removes session bindings and releases ownership even after a failed terminal
commit. REQ-EVENTS-098 continues to own history-writing authority. ADR-0008's
earlier lock-delete-in-transaction interpretation is labeled historical and
replaced with this accepted order. Recording failure behavior is coupled to
OQ-42; implementation of that separate item remains tracked in the progress
ledger.

## A4 — the root execution record and the planning execution path (applied)

REQ-ORCH-072 now names the **root execution record** and states that it is not a delegated
child: it arrives through no `delegate` call, counts against none of REQ-ORCH-046's admission
limits, holds no model slot of REQ-ORCH-050, and is not presented as a task agent. Its identity
— a canonical name and a task id in the same namespace a delegated child's lives in — is kept,
so a lookup naming the root resolves to it, while the parent-scoping of REQ-TOOLS-155 and
REQ-TOOLS-156 is unchanged. REQ-ORCH-025's "no child is ever spawned" reads **no delegated
child**, and a `single` run is exactly one root execution record per iteration and zero
delegated children.

REQ-ORCH-153 states the planning execution path. The gate withholds capability rather than
preventing the run from starting: every agent holds planning grants — its ordinary set less
every tool declared as writing workspace files or running commands, an undeclared tool counting
as declaring all three — enforced where a call is dispatched, so it binds whatever route a tool
reached a role by. The spawn restriction is kept beside that enforcement rather than replaced by
it. A `single` run is neither exempted nor blocked from starting. Approval installs the
execution grants for the remainder of the run. The hold raises no terminal status and no
terminal result, and the product's own recording stays writable throughout.

REQ-HOOKS-126 now defines exactly two skip reasons; `"plan_gate"` is emitted once per withheld
invocation rather than once per session. REQ-ORCH-016, REQ-ORCH-028 and REQ-ORCH-153 are
re-pointed from REQ-CONFIG-231 to REQ-TOOLS-001 for the capability classification they read,
closing an item the domain-01 resolution record had carried open since its sixth round. The
domain record holds the full disposition, including each falsified reading beside its
replacement. Delivery of REQ-ORCH-152 to REQ-ORCH-154 is tracked in the root ledger.

## A5 — optional image-input declaration

REQ-PROVIDER-149 now owns an optional boolean: true, false or absent/unknown.
Both false and unknown close attachment submission. The source precedence stays
YAML, latest discovery, then shipped metadata. REQ-PROVIDER-072 and the snapshot
format table now preserve absence. Discovery already represents these states;
new regression coverage checks explicit true/false, unknown-name handling and
JSON round trips. Selector integration is tracked with OQ-18 in the root ledger.

## A6 and A9 — exports (applied)

The owning domain's resolution record,
`20-event-history-replay-export.md`, records latest-run segment derivation and
the canonical export replacement retry policy.

## OQ-19 and OQ-20 — credential coordination and pre-contact failures

REQ-PROVIDER-018 permits REQ-PROVIDER-152's adjacent lock files. Each completed
operation removes its own staging files and preserves other active operations'
files. Enumeration remains credential-JSON-only. REQ-PROVIDER-063 now cites that
inventory without restating the superseded JSON-only rule.

REQ-PROVIDER-012/057 explicitly honor REQ-PROVIDER-013's pre-contact exception.
The unsupported sign-in-method branch now returns its actionable failure while
preserving last-error state. Regression coverage verifies zero provider contact,
unchanged credentials, no diagnostics and unchanged last-error state.

## OQ-46 — the repair announcement in the plural (applied)

REQ-SHELL-155 keeps its singular title for one repaired session and requires
exactly one aggregate warning for a batch, naming how many were repaired and
carrying a route to the surface the affected-session list is reached from; the
action stays inside REQ-NOTIFY-044's closed vocabulary, so no escalation follows.
REQ-SESSION-062 keeps one timeline entry per repaired session and now says so:
the record is not reduced by what is shown. Continuation is offered only once the
relevant batch has settled, which the run host's whole-workspace repair already
establishes by repairing every stale session inside one request.

Applying it found the entry itself non-conformant. REQ-SESSION-062 fixes type,
severity, actor, message and metadata keys; the implementation carried
`session_marked_interrupted`, severity `info`, a two-sentence message and
`previous_status` without `execution_status`. All five now match the requirement,
and the regression asserts each of them rather than a substring of the message.

## OQ-42 — durable recording failure (applied)

REQ-EVENTS-078 now scopes isolation to consumer-delivery faults. REQ-EVENTS-088
requires controlled cancellation and admission closure for affected work after
a sticky durable-store failure. In-memory failure status identifies the last
durable event ordinal and recovery action; terminal completion is unconfirmed
when persistence fails. The durable transcript remains at its saved boundary.
Implementation verification is tracked in the root progress ledger. The
2026-09-07 implementation quarantines all writers sharing the open database,
cancels sibling runs, blocks starts and continuations, and freezes projections
at their cached committed boundary. Explicit session reopening waits for all
affected runs to settle and performs a write probe that is rolled back. Probe
failure retains quarantine; successful recovery rebuilds the opened session's
writer and projection from persisted state. Existing failed writers remain
closed to further writes until their sessions are explicitly reopened.

**The dependent-spec consistency scan, 2026-09-13.** It found two continue-on-
recording-failure clauses still standing outside the two requirements the first
pass amended, and both are now amended in place with their falsified reading kept
beside them. REQ-CLI-067 said a run "carries on with a logged warning" when the
event store cannot be opened *or written* and that "persistence trouble is never
allowed to fail a run" — contradicting REQ-EVENTS-084 and REQ-EVENTS-088 in terms;
it now cites both and keeps only the part that was always true, that a streaming
consumer's own trouble never ends a run (REQ-EVENTS-078). REQ-SESSION-145 said an
event that cannot be recorded "is discarded with a warning rather than raised";
that survives for the serialization case REQ-EVENTS-088 names and is withdrawn for
durable failures, and the requirement now owns only the property it was written
for — the writer never *raises* into a run. REQ-MONITOR-221 needed no exception and
gained none; it states explicitly that a failed persistence publishes nothing and
that the in-memory status shown afterwards sits outside the authoritative
transcript. REQ-MONITOR-292 is unchanged and consistent as written.

**The cross-process failure-propagation audit, 2026-09-13.** The quarantine is per
open database and therefore per process; the audit establishes that this is the
whole of the propagation surface, because the run host is the only process that
opens a workspace store for writing (ADR-0058, ADR-0005) — main holds no handle on
it, and the workspace service opens one only read-only, and only to verify a
restore. What crosses a process boundary is therefore the run host's own
`notice.publish` and its `run.result`, and the audit found the second of those
lossy: the engine's `RunResult` carried `persistence: {confirmed: false, …}` and
the contract's `RunResultSchema` had no such field, so main could tell an
unconfirmed completion from any other error only by reading the summary sentence.
It now crosses as a field, and main uses it to suppress its own terminal notice for
such a run — REQ-EVENTS-088 allows exactly one failure notification per affected
run, and the run host has already published it. Two notices for one failure was a
live defect before this change.

**The desktop notice and its recovery action, 2026-09-13.** The notice carried the
last durable ordinal and a sentence telling the user to reopen the session; it
carried no action. Reopening is the product's own recovery — it waits for every
affected run to settle, runs the rolled-back write probe, and rebuilds the opened
session's writer and projection — so the notice now names it as an action, mapped
in main onto REQ-NOTIFY-044's existing `focus-session` member. No member is added
to that closed vocabulary.

## OQ-12 — the durability contract, in three levels (applied)

REQ-SESSION-034 is now the product's single definition of what "durable" promises
and every other durability claim cites it. The three levels are deliberately not
collapsible: process-crash atomicity for every successful write, owed
unconditionally; operating-system and power-loss survival for an acknowledged
terminal commit and a completed backup artifact, subject to the storage device
honouring the flushes the product issues; and a stated permitted loss of
intermediate updates between the two. The stronger terminal commit setting is
preserved and may only be reconsidered on power-loss and operating-system-crash
grounds, never on readability — which a spike already disproved as a reason.

REQ-LIBRARY-138 carried the corpus's only durability verb, "flushed to disk",
promising a level it never named; it now names level 1. REQ-LIBRARY-043's
"readable after a crash or loss of power" likewise says which level it means.

**The measurement is not discharged and the wording says so.** No power-loss test
has been run on any supported platform. The harness exists; its fault half is a
physical act only the machine's owner can perform. The proof is tracked per
supported platform — owed on Windows, blocked on Linux and macOS while IC-3
stands — and `docs/architecture/implementation-conditions.md` carries the debt.
Accepting the wording measured nothing, and no surface may claim more than the
three levels state.

## OQ-41 — the replacement ladder and the scope of independence (applied)

REQ-TRACE-061 states the bounded ladder its own domain owns; REQ-TRACE-502 keeps
the complete-file guarantee whole and scopes the independence promise to
invocations and view freshness; REQ-TRACE-182's catch covers the whole
regeneration. The owning domain's resolution record carries the detail, including
the two defects applying it found — a generator that replaced the artifact with a
plain `writeFileSync`, and a test adapter whose regeneration failure would have
blocked collection — and the contended case, staged and passing.
