# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Alternatives considered

Part 2 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Alternatives considered

**A — One document for the whole store.** One read to build a board, trivially consistent, cheapest to
write. Under a no-locking read-modify-write rule *every* transition rewrites the whole store, so two
concurrent transitions on two **different** requirements can lose one of them, contradicting
`REQ-TRACE-388`'s "each being independent". It also makes forward-tolerant versioning unworkable: an
unsupported version on one record must leave its neighbours readable, which a single document cannot do.

**A′ — One document per requirement, plus an append-only audit log.** *The previous decision, and its
argument was a real one:* it gave per-record version tolerance, it made two transitions on different
requirements genuinely independent without a lock, it was inspectable by anyone who opened the workspace
directory, and it needed no store engine at all. What it could not give is the thing the requirements
ask for most often. Two files change per transition **with no transaction between them**, so the
ordering had to be chosen by argument (OQ-26) and a crash between them left a state no requirement
describes. `REQ-CONFIG-192`'s history pruning to 200 entries is a rewrite of the whole document on every
transition. `REQ-TRACE-476`'s restart rebuild is a directory scan. And `REQ-TRACE-239`'s 100 ms board
budget at `REQ-TRACE-300`'s hundred-column scale is N document reads, which this record flagged as
needing measurement before implementation. ADR-0003's own *Revisit if* named this exact case: "a
delivery store growing past the point where a directory scan per board refresh meets `REQ-TRACE-239`'s
budget".

**C — One document per transition, an append-only log per requirement.** Concurrency-free and a natural
fit for the audit trail. It fails the history limit: `REQ-CONFIG-192` requires older history entries to
be **pruned**, which an append-only log cannot do without rewriting, at which point it is A′ with more
files. It also makes the restart rebuild a fold over every transition ever recorded.

**B′ — Rows in the per-workspace database, behind the same capability-split handle.** Chosen.

**D′ — Rows, plus a mirrored per-requirement document on disk for inspectability.** Preserves A′'s one
genuine advantage. **Still refused**, and now for a sharper reason than when it was first refused. The
old reason: two copies that can disagree is the objection ADR-0003 raised against a database and the
only form in which that objection is actually true, and nothing in the specification required a person
to read a delivery record from disk — `REQ-CONFIG-192` requires it to be *reported* in three named
places, all of them surfaces. That reason survives. What has changed is the closing clause, which said
"if an export is ever wanted it is an **export command**, produced on request from the rows, never a
second write path". **An export is now wanted, by requirement**, and D′ is what a careless reading of
`REQ-TRACE-514` would produce: a continuously-maintained readable copy. The requirements refuse that
directly — both exports are "a user-initiated action producing a file at the moment it is asked for",
neither "SHALL refresh itself", and "no surface SHALL be built on repeating it". A mirror is a refreshing
export, which is the one thing the export may not be. The conditional clause has become the decision,
and the decision is below.

### Alternatives for the exports themselves

**F — One export path per record kind, each written where its records live.** The path of least
resistance: the delivery export in the traceability engine, the improvement export beside the
improvement store, the four session exports in the session record. Refused. `REQ-TRACE-514` and
`REQ-LIBRARY-176` both say, in almost the same words, that the guarantee "is `REQ-EVENTS-166`'s and is
not restated in a second form here" and that they apply it "on the same terms `REQ-SESSION-199`" applies
it. Six independent implementations of one guarantee is six places for the ordering clause, the
empty-record clause and the not-a-channel clause to be got subtly differently, and the failure is
invisible — an export that quietly reorders is still a file that opens.

**G — A generic row dumper: one mechanism that serialises any table on request.** Attractive because it
is written once and covers records not yet invented. Refused, and the reason is the whole of ESC-20's
boundary. A generic dumper's default answer to a new table is *yes*, and `REQ-SESSION-136`'s tool-call
evidence — which "deliberately holds unredacted arguments and never gains an export" — is a row in the
same store. A mechanism whose safe operation depends on someone remembering to exclude a table is a
mechanism that will export that table. ESC-20 examined the field and found this is the live hazard, not
a theoretical one: Codex rollouts are documented as carrying "prompts, command output, file paths, code,
and accidental secrets", and opencode ships a `--sanitize` flag on its export for exactly this reason.

**H — One export mechanism, per-record-kind projections, each declared explicitly.** Chosen. One piece
of machinery owns the destination, the writing, the not-a-channel discipline and the stock-parser
guarantee; each exportable record kind supplies a projection that names its fields. There is no route by
which a table acquires an export by existing.
