# Open questions — Specification questions (1 of 27)

Part 6 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-3, OQ-11, OQ-26, OQ-27, OQ-1, OQ-5, OQ-38, OQ-21 – OQ-23, OQ-28, OQ-36.

## Specification questions

### Resolved, and closed with the reason

Four entries are answered here, and a fifth — **OQ-28** — was resolved on 2026-09-02 and is closed in
place among the ADR-specific entries below, because the argument that closed it is long and belongs
beside the measurement it rests on. They keep their numbers and stay in the register because ADRs cite
them, and each says what closed it, so a reader who finds the citation is not left guessing. **Nothing is
listed as closed that the record did not actually settle** — three further questions the rulings expected
to close did not, and they are still open below with their residues stated (OQ-12, OQ-19, OQ-41).

***A sixth entry closed on 2026-09-02: OQ-49, closed by amendment rather than by argument.***
`REQ-STARTUP-163` now owns what makes two directory strings the same directory — what is resolved, what is
deliberately not reconciled, and the bounded cost of not reconciling it — with two additions ADR-0002 did
not state: a trailing separator carries no meaning, and abbreviated alternate spellings the filesystem
itself resolves are resolved. It states explicitly that it is **not** the definition of workspace identity,
which is `REQ-SESSION-197`'s and is never derived from a path. **Constraint W-25 moves from a ruling to a
requirement citation and ADR-0002 should now cite rather than decide.** The store side of the same hazard
is *not* closed by that requirement and is now a rule of its own — see constraint **W-27** and the entry
immediately below.

***One question a spike raised is answered rather than filed, and it is recorded here in the closed form
so the spike's own request for an entry is not silently ignored.*** `spikes/remote-and-synchronised-storage.md`
section 11 item 14 asked: **where does a first-statement store failure after a successful open belong?**
`REQ-EVENTS-084` governs "opening the store only"; `REQ-EVENTS-088` governs a write that fails *during* a
run; the measured case — a store that opens cleanly, reports and reads back its journal mode, owns its
shared-memory companion at the expected size, and throws on the very next statement — belonged to neither,
**30 times out of 30 on a mapped network drive**. It is **minted and closed in the specification rather
than left open here**: `REQ-EVENTS-179` requires the store to be *exercised* rather than merely opened,
by a write made and then undone, before the run starts; it resolves its own failure into `REQ-EVENTS-084`
and refuses on exactly that requirement's terms; `REQ-EVENTS-084` and `REQ-EVENTS-088` each gained the
boundary sentence that routes to it; and `REQ-SESSION-089` gained the matching clause on the run-lifecycle
side. **What is NOT closed and is listed under the spikes below is the cost of the probe itself**, which
has not been measured on the startup path. Constraints **W-04**, **W-08** and **E-05** carry it.

**OQ-3 — Is a second application instance on one workspace a supported configuration? *Resolved: no.***
*(ADR-0011, ADR-0030.)* `REQ-STARTUP-161` fixes at most one instance per user account and makes every
window a window of that one instance; SR-1 is the ruling behind it. The three pieces of evidence that
pointed to *yes* have each been re-read and none survives: `REQ-MONITOR-013` now says in terms that the
boundary it means "is never the boundary between two instances of the application"; `REQ-GIT-124`'s
"whether or not this application started it" now covers this instance's own runs and a lock an instance
that crashed left behind (constraint P-14); and `REQ-PROVIDER-152`'s cross-process credential lock
survives on a **narrower rationale** — every window of the one instance reaches the same per-user files,
several read-modify-write sequences can be in flight at once, and `REQ-STARTUP-164`'s reclaim path is one
interval in which two processes of this application genuinely coexist (constraint C-14). The finding
"the evidence points to yes" is struck. ESC-10, which rested on this, is dissolved.

**OQ-11 — Two incompatible Windows retry schedules. *Resolved — and the reason previously recorded here
was wrong. Rewritten rather than deleted, because ADRs cite it.*** *(ADR-0004.)* `REQ-LIBRARY-043`'s
five attempts within 1 second governed the improvement artifact store and `REQ-SESSION-033`'s five-step
ladder summing to 1.55 s governed every state file.

**It is not closed because "neither ladder has a file left to govern".** That was the closure this record
wrote and it is false. `REQ-SESSION-033` was **narrowed, not withdrawn**: it still governs the
human-readable summary — which `REQ-SESSION-028` rebuilds on every save, `REQ-SESSION-006` keeps a file
and `REQ-SESSION-140` names — it still states its constants (0.05, 0.1, 0.2, 0.4, 0.8 s), and it declares
itself "the only replacement ladder this domain states". ADR-0004's per-store policy table therefore
**keeps** its retry-schedule field with exactly one value in it, which is literally what that record's own
*Revisit if* predicted would happen.

**It is closed because the resolution turned out to be one-sided.** `REQ-LIBRARY-043`'s ladder went with
its document layout, and the requirement gives the reason: **no writer outside this application can reach
a record in that store** (`REQ-LIBRARY-158`), so there is no foreign handle for a ladder to defend
against. `REQ-SESSION-033`'s survived precisely because its file **is** reachable by one — an antivirus
scanner, an indexer, a cloud-sync client, or the user's own editor opened through `REQ-SESSION-191`.
There is now exactly one ladder in the corpus and nothing to reconcile: **the conflict is gone, the
ladder is not.** Constraint D-25 records the re-derivation.

**The caveat travelled with the closure and is now discharged.** It read: the one ladder the corpus states
is in the sessions domain, and `REQ-TRACE-061` — which faces exactly the case it was written for — still
requires a failed replace re-raised with none. That was **OQ-44**, whose own statement of fact was also
wrong and has been corrected. *Since the OQ-41 amendment of 2026-09-06, `REQ-TRACE-061` states its own
ladder — five attempts at 0.05 / 0.1 / 0.2 / 0.4 s, exhaustion producing a recoverable error with the
previous file retained — so the corpus now holds **two** ladders with two owners and no overlap: this one
for the toolchain's four repository artifacts, `REQ-SESSION-033`'s six attempts for the local summary file.
`REQ-EVENTS-145`'s export destinations cite this one rather than minting a third.*

**OQ-26 — Ordering between the delivery state write and the audit append. *Resolved.*** *(ADR-0041.)*
The delivery state, the requirement's history, `REQ-CONFIG-192`'s 200-entry prune and the audit record
are written in **one transaction**, so there is no "between them" for a crash to fall into and neither
the state-first argument nor `REQ-TRACE-133`'s opposite precedent has to be chosen between.
`REQ-TRACE-133` itself is untouched: it orders one file write against another in ADR-0040's store, which
stays files. What made the transaction available was a citation correction rather than the ruling —
neither `REQ-LIBRARY-042` nor `REQ-TRACE-502` reaches the delivery store, and no requirement subjects it
to atomic-replacement-alone (constraint C-10). **The audit trail now shares a durability domain with the
state it audits**, where under files the two could survive each other; no requirement asks otherwise, so
it is accepted rather than escalated, and it is recorded because it was not chosen deliberately.

**OQ-27 — Delivery record file granularity. *Resolved by dissolution.*** *(ADR-0041.)* The question's
stated stakes were that the choice "is observable to anyone who opens the workspace directory". Under
SR-4 nothing is. The store is rows; there is no file granularity to choose. Constraint Y-20 records that
the specification is still silent and that the silence no longer needs an answer.

### Named against a specific ADR

***No question in this group blocks an ADR from ratification any more.*** OQ-28 was the last one, and
ESC-13 unblocked it by ruling the trade instead of leaving the record to pay it. The heading is kept
because ADRs cite it, and each entry still names the record it decides something for; what it no longer
means is that the named record cannot be ratified until the question is answered. **Ratification is now
blocked by the gate items in `docs/clean-room/specification-gate.md` and by the escalations above, not by
anything in this list.**

**OQ-1 — Decision closed, 2026-09-07.** REQ-CHAT-041 now scopes the queue to
the application instance and session ID. The run host remains its authoritative
owner, with atomic queued-to-triggered transitions and session-filtered windows.
Cross-process conformance evidence is tracked in the resolution ledger.

**Historical question.** `REQ-CHAT-041` scopes queue
visibility and consumption to windows and runs "sharing the same process", and `REQ-CHAT-038` requires an
atomic queued-to-triggered transition **exactly one caller wins**, while `REQ-MONITOR-139` and
`REQ-ORCH-071` make the queue session-owned and let a run consume only its own session's prompts. Under
ADR-0002 the windows and the run engine are in different processes, so "the same process" is satisfied on
one side or the other but not both. The record places the service in the run host; **confirm, because it
decides whether the phrase is satisfied or merely not violated.** *Unchanged by SR-4, and SR-1 adds one
argument against the alternative: several main windows may display one session (`REQ-MONITOR-243`), so
"the window side" is not a single place to put it.*

**OQ-5 — Decision closed, 2026-09-11.** `REQ-TOOLS-127` now states that the closing frame is a literal
replacement of the displayed text carrying an explicit marker that it is one, that its text is plain on the terms
the requirement already fixed, and that it is **the only frame of a stream of which any of that is true**. The
record's reading is ratified rather than replaced, and the amendment states the reason the conflict was never
real: `REQ-SHELL-095` and `REQ-SHELL-098` govern the stream **while the process is running**, and this frame is
emitted after it has exited — no cursor to paint, no alternate screen to be in, no further output to attribute to
a cell. The two bind different instants. **One thing nobody had noticed is fixed with it:** the closing sentence
bound a *foreground* stream only, while all three executions emitted a closing frame for `bg:` streams as well and
a proof asserted it — the code was ahead of the requirement rather than outside it, and the amendment covers both.
No code changed. Recorded in ADR-0021's ruling section of the same date.

**Historical question.** *(ADR-0021.)* `REQ-TOOLS-127` requires the
closing frame's text to **equal the observation's final output text**, which is plain, capped and
truncated from the oldest end — not terminal control bytes. `REQ-SHELL-095`, `REQ-SHELL-098` and
`REQ-SHELL-166` require a full character grid with alternate-screen fidelity, per-cell attributes and
sixteen colours, which plain text cannot carry. The record's reading is that the closing frame is a
literal plain-text replacement carrying an explicit marker, while every earlier frame is byte-faithful.
**That is a reading, not a fact**, and the alternative reading — plain text throughout — would contradict
three shell requirements.

*Executed three times (Parts AL, AL′, T″; 2026-09-09, 2026-09-11).* The reading is unchanged and now
exercised three ways: the closing frame is a `screen` carrying `closing: true` and the observation's final plain
text; the proof asserts that text equals the observation byte for byte against a real 10,000-line command
(`closingEqualsObservation`); and with the stream sampled in motion the window's grid, the transcript preview and
the persona card reset and write that text together, agreeing at the instant they do it. What the executions add is
only this: the alternative reading — plain text throughout — is no longer merely argued against, because the
same proof renders cursor addressing and an alternate screen from the VT deltas that precede the closing frame,
which plain text cannot carry (`REQ-SHELL-095`, `REQ-SHELL-098`). Nothing measured contradicts the record's reading
and nothing measured establishes it as the specification's intent. **Still the owner's.**

**OQ-38 — Decision closed, 2026-09-11, and the ruling narrowed the reading it ratified.** `REQ-CONFIG-117` now
states that `terminal_stream_interval_ms` is a **ceiling on batching and not a fixed cadence**, and `REQ-TOOLS-126`
cites it rather than restating it. The strict fixed-period reading was not rulable: it makes `REQ-SHELL-166`, a
SHALL with a demonstration obligation against a real pseudo-terminal, unmeetable at `REQ-TOOLS-126`'s own default
and at every larger value in its range. **What the ruling changed is who holds the licence.** The first execution
armed the flush on the agent's own `is_input` call as well, on the reading that an agent's keystroke is "the same
as the user's"; the amendment states that it is not, because the licence exists for `REQ-SHELL-166`'s gesture
budget and an agent waits on the observation rather than on a painted frame. Output alone never arms. That closes
the transport pressure this register priced: the licence is 50 frames/s per stream, and spending it only where a
person is watching leaves a background session framing at the configured period — **ten frames a second at the
default rather than fifty** — so twenty background sessions offer 200 deliveries a second against
`REQ-MONITOR-306`'s 1,000 rather than consuming the whole aggregate. `REQ-TOOLS-126`'s new citation of
`REQ-MONITOR-306` also discharges the half of **ESC-22** domain 05 was recorded as owing. The falsified reading is
kept beside its replacement in ADR-0021 and in the code that held it.

**Historical question.** *(ADR-0021; changes what a configured key
does for a user who sets it.)* `REQ-TOOLS-126` names `runtime.terminal_stream_interval_ms` the **output
sampling period**, default 100 ms, range 20–2000. `REQ-SHELL-166` requires the character a keystroke
produces to be visible within `REQ-SHELL-150`'s **100 ms** gesture budget, measured key press to painted
frame, and the path crosses two process hops and a paint. Read as a fixed period, the default alone spends
the whole budget in the worst case and half of it on average before either hop is counted, so the echo
criterion is unmeetable at `REQ-TOOLS-126`'s own default **and at every larger value its range permits**.
Neither requirement notices the other. **The record's reading:** the period is a **ceiling on batching**,
and writing a keystroke to the pseudo-terminal arms an immediate flush of that stream's next output.
**That is a reading, not a fact**, and it is user-observable — under a strict fixed-period reading a
configured 2000 withholds the user's own echo for two seconds, and under this one it does not. If the
fixed-period reading is intended, one of the two published 100 ms figures has to move, which is a
product-owner decision rather than an architectural one. Spike 15 measures it. *(Numbering note: ADR-0004
and ADR-0040 cite "OQ-38" for a different question, drafted against a provisional number before this one
was filed; they mean **OQ-41**.)*

*Executed three times (Parts AL, AL′, T″; 2026-09-09, 2026-09-11), and the reading now has a price on
both sides.* Echo under the ceiling-plus-flush reading, with the interval configured to 2,000 ms: framed in
**16.2 ms** (first execution), **15.0 / 15.2 ms** (its addendum) and **12.8 ms** (2026-09-11); key press to painted
frame through the real window, **12.4–25.0 ms** (second execution) and **6.8–21.2 ms** (2026-09-11). A strict
fixed-period reading makes the same keystroke wait up to the configured 2,000 ms. **The new figure is the cost of
the reading**, which ADR-0021's "One coupling to OQ-38" asked for and could not state: the ceiling-plus-flush
reading licenses 50 frames/s per stream, so at `REQ-TOOLS-108`'s shipped default of twenty background sessions
those streams **alone offer 1,000 deliveries a second — `REQ-MONITOR-306`'s entire aggregate** — where the
strict fixed-period reading at `REQ-TOOLS-126`'s own 100 ms default would offer 200. The two readings therefore
differ by a factor of five in transport pressure as well as by 2,000 ms in echo. **Still the owner's**; if the
fixed-period reading is intended, one of the two published 100 ms figures has to move, which is a product decision.

**OQ-21 — Per-token prices: floating point in the format, exact decimal in the arithmetic.**
*(ADR-0031, ADR-0032; changes a persisted format.)* `REQ-PROVIDER-072` maps decimal-string prices "to
floating-point input/output cost per token" and the snapshot format types them as floats, while
`REQ-PROVIDER-121` states that no monetary amount — "**including the per-token pricing carried through
discovery**" — is computed in binary floating point anywhere. The same format block already types image
cost as a decimal string. **Recommended reading:** the price is carried and persisted as a decimal string
and the float typing is the defect, because a value that has been through a binary float cannot
afterwards be made exact.

> **Disposition, 2026-09-23 (R-049). RULED as recommended.** The price is carried and persisted as a decimal
> string and the float typing was the defect. Applied by amendment the same day: `REQ-CONFIG-088` types the
> fields as decimal ≥ 0 and takes a YAML number as the decimal its text states; `REQ-PROVIDER-072` and both
> snapshot formats carry decimal strings. ADR-0031 is accepted on the back of it, narrowed, and `PD-MONITOR-001`
> revision 2 makes configured rates produce a figure. See `owner-decisions.md`, "OQ-21 — per-token prices are
> decimal strings, ruled".

**OQ-22 — Does a spawned stdio child inherit the parent process environment?** *(ADR-0034; the
environment-resolution stage's signature differs by the answer.)* `REQ-MCP-087` and `REQ-MCP-090` fix the
precedence among sources of the environment map but never say whether the result **replaces or overlays**
the parent environment. Servers launched through package runners plainly need a search path, and
`REQ-MCP-037` judges availability by a path lookup, so some inheritance is implied — but "some" is not a
contract, and the official client library's own default is a curated safe subset, which would be a third
behaviour.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the overlay is ratified as built, with no scrubbing: a stdio server inherits the run host's environment with REQ-MCP-090's resolved map overlaid, as other coding tools launch their tool servers, and a secret in the run host's own environment reaching every stdio server is accepted. The two variables naming the launch's artifact, which main removes from its own environment before it starts any child (OQ-90, `PD-STARTUP-004`), are not a scrubbing list.

> **Reading taken on first execution, 2026-09-05 (Part S) — flagged for the owner, not resolved.** The child
> inherits the run host's environment **with the resolved map of `REQ-MCP-090` overlaid** (overlay, not
> replace): `REQ-MCP-087`'s "when the variable is unset, the key is omitted entirely" only makes sense as an
> overlay (an omitted key falls back to whatever the parent holds, or nothing), package runners need `PATH`,
> `HOME`/`APPDATA` and the `.cmd` wrap needs `ComSpec`, and the SDK's curated subset is a third behaviour the
> requirement never names. What is inherited is the run host's environment as it starts — no scrubbing is
> applied today (the ADR-0007/`REQ-GIT-031`-style name list is git's, not a general one; a general list would
> need the owner to say which names). Code: `resolveServerEnvironment` produces the overlay
> (`packages/config/src/mcp/environment.ts`), the run host hands the child `{ ...process.env, ...overlay }`
> through `OwnedStdioTransport`. The owner decides whether the parent environment should be scrubbed of
> named variables before the overlay and which; until then a secret in the run host's own environment reaches
> every stdio server.

**OQ-23 — What the reserved-token branch must do.** ***RESOLVED 2026-09-06 — the recommended reading, taken by
the first execution (Part T, ADR-0035's note; `spikes/code-intelligence-branch.md`).*** *(ADR-0035.)* `REQ-MCP-033`
describes the branch only as answering the protocol on standard streams, while `REQ-MCP-036` derives a command line
from the same entry and `REQ-MCP-099` runs it with three setup subcommands. **Recommended reading:** the branch is a
general pass-through and `REQ-MCP-033` describes what happens when the remaining arguments select the
server. If answered the other way, one of the two requirements must change.

> **Taken as the pass-through.** `apps/desktop/src/main/sentinel.ts` hands every remaining argument to the bundled
> runtime unchanged and propagates its exit status; `start-mcp-server …` makes it the server of `REQ-MCP-033`, and the
> three setup subcommands of `REQ-MCP-099` (`project create`, `project index`, `memories initialize`, each with the
> workspace root last) reach the runtime through the same branch — measured in the proof's setup launches (three
> `succeeded`, the marker written). Neither requirement changes. **One thing the entry did not anticipate:** Electron's
> binary on Windows exits before any JavaScript when a scheme-looking positional (the token's colon) is followed by
> another positional, so the launch is `Rotaris.exe builtin:code-intelligence -- …` — the token still first, `--` the
> branch's separator, dropped by it. Recorded in the spike and on ADR-0035.

**OQ-28 — What the two structural counts mean for a document-model interface.** ***RESOLVED 2026-09-02 —
the specification chose, and it chose reading 2 and then relaxed the requirement that reading breaks.***
*(ADR-0045, ADR-0051 consequence 3.)*

> **The live item this entry named — "the specification has not moved" — is discharged, and the sentence
> that carried it must not be cited.** It read: "`REQ-UIBENCH-050` still supports both readings in one
> paragraph and `REQ-UIBENCH-054` still states the invariant … while `resolutions/21` holds the drafted
> relaxation back." Both halves are now false. `REQ-UIBENCH-050` states in bold that **"The counting rule
> stated here is framework-neutral and is the operative one"**, spells reading 2 out — "a rendered
> paragraph, code block or list item inside a transcript row is a `widget`, and an element whose box is
> degenerate at the moment of counting is not" — and closes the escape route this entry identified as
> reading 1: the framework clause "explains only why absolute numbers do not travel between revisions or
> implementations; it does **not** license a product to count only the elements its own layout declares
> and to leave out what it drew." And `REQ-UIBENCH-054` carries the relaxation, in ESC-13's own terms:
> the element-count invariant is **withdrawn as unsatisfiable by any admissible implementation**, not
> merely as unmet, because the only structure that could hold it is a canvas and a canvas forfeits
> `REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and `REQ-SHELL-144`.
>
> **The measurement is what makes this a resolution rather than a preference, and it is preserved below
> rather than replaced by the conclusion.** Spike 1 established that the two readings diverge in a
> running window in every run, at the `construct_window` → `apply_fixture` boundary, by +147 or +85, and
> that under reading 2 the count is a property of where the reader is scrolled rather than of the
> transcript. That is the fact the requirement was amended against.
>
> **The cost ESC-13 accepted is unchanged and is not softened by the closure**: under the operative
> reading the product ships a benchmark whose headline structural invariant is gone, in a domain whose
> whole point is determinism. `REQ-UIBENCH-088` makes it informational either way. ADR-0045 stands.

*The question as it stood, and the two readings between which it could not choose, are kept below.*

**Two things changed and neither is an answer.** *A ruling:* ESC-13 is decided — accessibility wins, the
canvas is refused outright, and if the framework-neutral reading is the operative one then
`REQ-UIBENCH-054` is **relaxed**. ADR-0045 therefore survives **either** reading, and this question stops
being existential for it: it decides which counting rule gets written down, and it changes a benchmark
field and nothing a user can see. *A measurement:*
`spikes/renderer-invariance-and-benchmark-cadence.md` settles whether the conflict is real in a running
window, which is what spike 1 was filed to establish, and **it is**. Under reading 1 `widgets` was
**629 at all 384 observations** — 84 phase records across twelve runs, 130 intra-phase probes, 110
tail-loop samples, 60 resize steps, two scroll variants, onscreen and offscreen — invariant by
construction rather than by where the phases happen to end. Under reading 2 it moves **630 → 777**
(reader at the top) or **630 → 715** (reader at the bottom) at the `construct_window` → `apply_fixture`
boundary, **in every run**, before any of the phases this entry discusses, by +147 or +85, and padding
cannot repair it because a zero-size element is excluded by the definition itself. Under reading 2 the
count also stops being a property of the transcript and becomes a property of **where the reader is
scrolled** — 777 at the top, 668 at the bottom, 747 at minimum window size, same product, same fixture,
same iteration. The spike declines to choose between the readings and so does this entry; what it
establishes is that the choice is real.

**The specification has not moved, and that is the live item.** `REQ-UIBENCH-050` still supports both
readings in one paragraph and `REQ-UIBENCH-054` still states the invariant, so the corpus currently
states a requirement its own definition breaks on one live reading — while `resolutions/21` holds the
drafted relaxation back. That is a specification-side action.

Two readings are
live and they do not differ by a number — they differ by whether the chosen architecture is admissible,
and **`REQ-UIBENCH-050` supports both in one paragraph.** **Reading 1:** it says both counts are "defined
against the interface framework the product is built on" and that their absolute values are "deliberately
not comparable between product revisions or between implementations", so the product says which of its own
elements are structural — application-owned layout elements in `widgets`, content nodes inside a row in
the informational `ui_objects` (`REQ-UIBENCH-109`). **Reading 2:** the same requirement defines `widgets`
by an observable test — "the number of live visual elements of the constructed window — those that occupy
space in the window's layout and can be painted" — and `docs/spec/resolutions/21-ui-performance-benchmark.md`
row 29 records the counting rules as "fixed in framework-neutral terms", while row 13 renames the second
field to `ui_objects` precisely because the old name "leaks one GUI toolkit's vocabulary into a schema". On
that reading the framework clause explains only why absolute numbers are not portable, and a rendered
Markdown paragraph, code block or list item **is** a `widget`. **Why it blocks:** under reading 2 the count
inside a row varies with content; `apply_fixture`, `ordered_appends`, `streaming_updates` and
`tail_replacements_1000` all change content; so ADR-0045's recycler fails `REQ-UIBENCH-054` for the same
reason a conventional virtualiser does, and the only structure that passes is a canvas, which
`REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and `REQ-SHELL-144` rule out. **Under reading 2,
`REQ-UIBENCH-054` and the selection-and-accessibility requirements cannot both be satisfied** — *and
that is now a measured fact rather than a prediction.* **What has changed since this paragraph was
written:** the sentence that used to close it — "ADR-0045 proceeds on reading 1 and is **withdrawn rather
than amended** if reading 2 is confirmed" — is **withdrawn**, together with ADR-0045's own Revisit-if
clause and consequence 3 that carried it. ESC-13 ruled the exchange instead of leaving the record to pay
it: the requirement is relaxed and the architecture stands. The cost of that ruling is real and is stated
in ESC-13's own words rather than softened — under reading 2 the product ships a benchmark whose headline
structural invariant reports false, informational or not, in a domain whose whole point is determinism.

**OQ-36 — CLOSED by accepted review, applied 2026-09-07.** REQ-TOOLS-086
cites REQ-SANDBOX-006's unbracketed IPv6 canonical form. Brackets belong to URL
authority serialization. The classifier handles bare IPv6 and DNS host/port
inputs; regression coverage verifies repeated normalization and matching.

### Silence and under-determination
