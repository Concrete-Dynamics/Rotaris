# Accepted review amendments — 2026-09-06

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
