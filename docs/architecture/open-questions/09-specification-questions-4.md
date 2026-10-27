# Open questions — Specification questions (4 of 27)

Part 9 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-41 – OQ-44.

**OQ-41 — CLOSED as a policy decision, 2026-09-06; implemented and the contended case STAGED 2026-09-13.**
*(ADR-0004, ADR-0040 — both of which cite this as "OQ-38", a provisional number that collided with the
entry above; ADR-0040 proceeds and does not treat it as blocking its own ratification.)*

The accepted review takes the closure this entry itself named — **`REQ-TRACE-061` gains a bounded ladder** —
and settles the residue on both halves. The write keeps its complete-file guarantee unnarrowed: a reader
never observes a partial file and two writers never leave a blend, whatever the contention. The **independence
promise is scoped to whole invocations and view freshness**, which is the reading `REQ-TRACE-502`'s own middle
sentence supports; ordering individual whole-file operations against one another is permitted, and is how the
single I/O owner of ADR-0040 meets the guarantee. **Exhaustion produces a recoverable error with the old file
retained** — the clause "an invocation SHALL NEVER fail … because another was running" is narrowed rather than
kept whole, because it could not be met as written, and the honest outcome of a held file is a failed operation
the user can repeat rather than a corrupted artifact. `REQ-TRACE-182`'s adapter keeps its catch-and-report
behaviour explicitly, because the test session is the one concurrent invocation the product still has.

***What building it found — two defects, both in the case this entry kept open.*** The ladder was cited by
name all over the implementation and **`REQ-TRACE-061` did not state one**; it said "the failure re-raised".
Worse, the generator that writes the artifact — `tools/symbol-artifact/generate.mjs`, the one the test session
runs — replaced it with a single `writeFileSync` **over the target**, with no staging, no rename and no ladder,
so a concurrent reader could observe a partial artifact (`REQ-TRACE-502` forbids that in terms) and a transient
failure escaped uncharacterised. And the adapter did not catch: `execFileSync` throws on a non-zero exit and a
throw out of vitest's `globalSetup` **fails the whole run before one test is collected**, which is exactly what
`REQ-TRACE-182` says SHALL NEVER happen. Both are repaired, and the write now goes through a shared
`tools/symbol-artifact/replace.mjs` carrying the requirement's own contract and constants.

***The contended case is STAGED, and it passes.*** The 2026-09-09 note below records that it was not — "the
contended case, a test session in the same checkout on Windows, was not staged and the residue stands".
`tools/symbol-artifact/replace.test.ts` now holds the artifact open with a real descriptor, drives the ladder
to exhaustion, and asserts the previous file byte-identical with no staged leftover. Residue **(a)** is
therefore measured rather than argued. Residue **(b)** — a foreign process, an editor, an indexer, antivirus, a
cloud-sync client — is *characterised* rather than removed: it produces the same recoverable failure, which is
what the amendment fixes as the correct outcome, and no product change can stop a foreign holder.

**Historical question — `REQ-TRACE-502` on Windows.**

**The ruling said this was dissolved. It is not, and the record must not record a closure it did not
earn.** SR-4 argued that "that defect is unreachable in a store whose readers do not block its writers" —
but `REQ-TRACE-502` governs the generated symbol artifact, the three baselines and the retired-identifier
log, and **SR-4's own table keeps all four as plain files in the user's own repository**. They never
reach the store. ESC-14 is ruled and SR-4 now carries the correction in place.

***What has changed since: the correction is now backed by a requirement rather than by an argument.***
`REQ-TRACE-513` was minted in the amendment pass and states positively that those four artifacts **SHALL
be plain files in the user's own repository and SHALL NOT be moved into any store the application keeps
for itself**, recorded as a boundary "so that relocating them is a change someone has to argue for rather
than an optimisation that can be made while every other requirement still appears satisfied". So no
store's concurrency properties reach them, and no future reader can close this entry by pointing at the
store. Constraint D-30.

*The mechanism, unchanged:* `REQ-TRACE-502` requires concurrent invocations to be safe with no lock,
lease or coordination file, that **no invocation wait for another**, and that an invocation "SHALL NEVER
fail, hang or leave a lock behind because another was running." ADR-0004's own spike shows why the last
clause was unreachable: Node requests no share-delete, so an ordinary **reader** holding a descriptor
makes a concurrent replace fail with `EPERM`.

*What is now reached, and by what.* The premise was an unbounded population of concurrent toolchain
invocations in independent processes. **SR-1 removes it**, and two of its three supports are gone
outright: the toolchain has no command line (`REQ-TRACE-142`, `REQ-TRACE-144` to `REQ-TRACE-151`,
`REQ-TRACE-153`, `REQ-TRACE-184` to `REQ-TRACE-186` withdrawn), `REQ-TRACE-206` forbids launching the
engine as a process, `REQ-EVENTS-178` gives no programmatic entry point, and `REQ-STARTUP-161` removes
the second instance — so every invocation is in-process on ADR-0002's bounded worker pool; and
`REQ-GIT-140` gives each isolated run its own worktree, so `REQ-GIT-145`'s N concurrent runs read N
copies rather than being N readers of one file. C-13's use as an amplifier here is withdrawn. ADR-0040
discharges the rest with a **single I/O owner** over the four artifacts (constraint W-12): no descriptor
is open when the rename runs, so no coordination file, and what is ordered is individual whole-file
operations rather than invocations. `REQ-TRACE-502`'s own middle sentence supports reading the
no-waiting clause as a rule about **views** — "a check running beside a regeneration MAY legitimately
report the artifact stale even though the other invocation is in the act of refreshing it" — rather than
about I/O scheduling. A reader who rejects that reading should treat ADR-0040 as reaching "never fails"
and not "never waits", and the residue below grows accordingly.

*The residue, which is real and which two closures nearly hid.* On Windows a `REQ-TRACE-509`
regeneration can still fail because something else holds the file open. Two cases:
**(a)** a `REQ-TRACE-182` test session running in the same checkout — this one is squarely inside the
requirement's subject, "because another invocation was running"; **(b)** a foreign process — the user's
editor, an indexer, antivirus, a cloud-sync client — which `REQ-TRACE-502` does not speak to, so it is
not a conformance gap, but which a user will meet first and read as a defect. `REQ-TRACE-061` requires
either failure **re-raised** and states no retry ladder. **Bounded contention is exactly the condition
under which a bounded ladder becomes sufficient — the condition this question said did not hold — and the
corpus now states no ladder anywhere (OQ-44).** ADR-0004 deliberately declines to invent the constants.

***"What would close it" was wrong and is corrected, 2026-09-02.*** This entry named "a runtime API
exposing share-delete on open" as one of two closures. **That remedy does not exist because the problem
is not there.** `spikes/windows-writer-handle-compaction.md` §3.2 establishes the discriminator cleanly:
`fs.unlinkSync` and .NET `File.Delete` both **succeed** against a Node-held handle and both **fail**
against a .NET holder requesting only `FileShare.ReadWrite`, so the runtime's open **does** request
share-delete. What fails is `fs.renameSync`, which returned `EPERM` on every distinct open flag the
runtime exposes, and 20/20 even against a holder that explicitly permits delete. So the closer is a
**replace primitive**, not a share flag: `ReplaceFileW` succeeded 6/6 against a Node-held handle with no
torn or empty read, out of process at p50 767 ms and unmeasured in process. **The question is therefore
"who owns a native replace primitive", not "is a share flag available"** — and it is available at a
measured price rather than unavailable. ADR-0040 additionally declines to inherit the spike's own
verdict across domains: the spike prices the 767 ms spawn out of a *compaction* path, correctly, but
`REQ-TRACE-509` is a deliberate user action already spending about a second parsing the store under
`REQ-TRACE-501` and replacing at most five small files, and a second on the failure path of a user-asked
action is a different trade from a second on a per-event path. A reader may disagree; the reasoning is
on the page rather than folded into the conclusion.

*The other closure is unchanged:* `REQ-TRACE-061` gaining a bounded ladder. `REQ-TRACE-502` should also
be amended to say what "concurrent invocations" now means, since the only concurrency left is in-process
work plus `REQ-TRACE-182`'s test session — and `REQ-TRACE-182` itself presupposes an invocable toolchain
the product no longer has, which is its own amendment. C-11 records the narrowing and the residual
conflict, now **split into its two halves with their two owners**, and does **not** report the property
satisfied.

*Part AJ (2026-09-09) measured one replace: every regeneration and baseline update in the proof replaced its files at attempt 1 through REQ-TRACE-061's ladder (5 attempts, 0.05/0.1/0.2/0.4 s), with the writer the workspace service's owner thread and no reader in the product holding a descriptor. The contended case — a test session in the same checkout on Windows — was not staged and the residue stands as ADR-0040 specific 6 records it.*

*Part R″ (2026-09-11): still unstaged, and now one concurrent launch away rather than hypothetical.* The
board's `end-to-end` path writes into the requirement source THROUGH the workspace service while the engine holds
the same store open. Recommended: keep open, and name `requirements-proof`'s `end-to-end` profile as the place to
stage it. It is also why `REQ-TRACE-513`'s replacement ladder is listed as met in part in lane R's closing
statement.

**OQ-42 — CLOSED as a policy decision, 2026-09-06; implementation evidence updated 2026-09-07.**

Accepted review OQ-42 chooses controlled cancellation of affected runs, store-wide
admission closure, and a frozen durable transcript. Separate in-memory notices
identify the failure, last durable event ordinal and recovery instructions.
Terminal persistence failure produces an explicitly unconfirmed caller outcome.
Explicit reopening waits for cancellation and performs a rolled-back write probe
before admitting execution. Failed probes preserve quarantine. The engine's
shared-store and projection-failure regressions cover these paths.

***Delivery completed 2026-09-13, and it found two defects.*** The **dependent-spec
consistency scan** turned up two continue-on-recording-failure clauses outside the pair the first pass
amended: `REQ-CLI-067` ("the run carries on with a logged warning … persistence trouble is never allowed to
fail a run") and `REQ-SESSION-145` ("an event that cannot be recorded is discarded with a warning"). Both
contradicted `REQ-EVENTS-088` in terms and are amended in place with their falsified reading kept beside
them; `REQ-MONITOR-221` needed no exception and gained none. The **cross-process propagation audit**
establishes the surface: the run host is the only process that opens a workspace store for writing
(ADR-0058, ADR-0005), main holds no handle and the workspace service opens one read-only for a restore
check, so propagation is exactly `notice.publish` and `run.result` — and `run.result` was **lossy**, because
the engine's `persistence: {confirmed: false, …}` had no field in `RunResultSchema` and stopped at the
boundary. Main therefore raised its own terminal notice beside the run host's, which is two notifications
for one failure where `REQ-EVENTS-088` allows exactly one. The field now crosses and main suppresses its
own. The **desktop notice** gained the recovery ACTION it was missing: reopening the session, mapped onto
`REQ-NOTIFY-044`'s existing `focus-session` member, with no member added to that closed vocabulary.

The following text preserves the historical question and its former interim policy.

**Historical OQ-42 — After a sticky mid-run store failure, may publication continue unanchored? *Narrowed on one
side by the amendment; the remaining half is harder, not easier.*** *(ADR-0010 consequence 7, which cites
this; not blocking, because the record states an interim behaviour.)*

***One half of this question is settled and the other is not.*** The **store-will-not-open** half is
closed by the amendment ESC-16 authorised: `REQ-SESSION-089` now requires the run **refused** as a
pre-run failure conveying the session id, that nothing was started, which store could not be opened and
the reason the store itself gave, and `REQ-EVENTS-084` gives the attach failure a definite user-visible
outcome — no `session.start`, exactly one `result` with status `error`, carrying the store's own reported
reason unaltered. Both requirements state their own reason: there is no longer a coherent state in which
a run has somewhere to record itself but nowhere to be recorded. *This was named as a known disagreement
in the Specification Gate and it is now agreement.*

**What remains is `REQ-EVENTS-088`'s sticky mid-run failure, and it is materially harder than when this
entry was filed.** Under a file a failed append left the earlier history intact and only that event
missing; under one transaction a transcript row and its event share a commit, so a commit that will not
commit means **the session record stops advancing altogether**, and the failure is workspace-wide rather
than per session. Continuing to publish therefore means showing rows a reattach genuinely cannot restore,
not rows whose event is merely absent. The record states the interim behaviour rather than re-deciding
it; the question is the owner's.

`REQ-EVENTS-088` marks the store failed for the remainder of the run and leaves the run going. D-16
(`REQ-MONITOR-221`) says every change is persisted before it is published and **states no exception**,
and `REQ-MONITOR-292` makes the persisted record authoritative wherever the two could disagree. So when
the record stops being writable, either the surface keeps showing a run whose state no resume can restore,
or it stops showing a run that is still happening. **Nothing settles which.** *SR-4 shifts the balance
against the previous answer, which is why it is returned as a question rather than re-affirmed:* under a
file a failed append left the earlier history intact and only that event missing; under one transaction
the transcript row and its event share a commit, so a commit that will not commit means **the session
record stops advancing altogether**, and the failure is workspace-wide rather than per session. The
interim behaviour, which both readings share and which is not in question, is that the run surfaces the
failure as a **session issue** and not only as `REQ-EVENTS-088`'s one warning — otherwise the user sees a
healthy transcript over a history that stopped being written. Until this is answered the record continues
to publish and marks the surface **unanchored**, so the condition is visible rather than inferred.

**OQ-43 — Does the single-instance gate admit a benchmark iteration? *Unchanged in substance; the gate it
asks about is now OURS rather than the platform's (2026-09-02).*** *(ADR-0042, ADR-0053, ADR-0055;
constraints P-16, P-17, W-14.)*

*2026-10-21 (the Windows ARM64 session's C6): the gate this question asks about was measured on Windows — the named pipe's claim, hand-over and reclaim (ADR-0055, "The claim over a named pipe, measured"). A benchmark iteration's admission was not exercised; nothing here changes the ruling.*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the exception is stated as built in [`PD-STARTUP-002`](../../product/directives/pd-startup-002.md#pd-startup-002), which narrows REQ-STARTUP-161: a launch the product starts itself under a reserved token — the code-intelligence child, the update-restart successor and a benchmark iteration child — is neither the instance nor handed to it. The first two are built; the benchmark harness and its marker (W-14) are not.

***What changed and what did not.*** ADR-0055's claim moved from the platform's single-instance primitive
to our own record file, **on measurement** — the primitive blocked 20.0 s against `REQ-STARTUP-164`'s 5 s
interval, performed no reclaim, and dropped the hand-over (constraint P-16). **That makes the sentinel
branch entirely ours to define and the composition easier to state**, because the admission rule is now a
line in our own claim rather than a behaviour of a component we do not control. **It does not touch the
requirement-level ambiguity this question records**, which is the whole of the question: nothing in
`REQ-UIBENCH-037` to `REQ-UIBENCH-039` or in `REQ-STARTUP-161` says how the two compose, and W-14's marker
remains architecture-invented on a specification silence. ADR-0055 still cites this question for three
cases — the bundled code-intelligence server, the benchmark iteration child, and the update-restart
successor. `REQ-UIBENCH-037` to `REQ-UIBENCH-039` make a benchmark iteration a fresh
child process **of the product's own program that the product itself starts**, with `XDG_CONFIG_HOME` and
one benchmark-private variable redirected; `REQ-UIBENCH-046` makes it an acceptance criterion that the
user's real stored settings hold the same bytes afterwards. `REQ-STARTUP-161` says a second launch is
handed to the running instance. **An iteration is a second launch by any naive test.** If the gate catches
it, the iteration never receives its redirected configuration home, the measurement runs against the
user's real preferences, and `REQ-UIBENCH-046` fails **silently — the run still completes and still
reports numbers.** The specification does not say how the two compose. The architecture's answer is W-14,
a marker the parent sets that no user can set, but "which processes the gate admits" has a security
flavour and deserves stating in the requirement rather than being inferred. **If the answer is that the
gate admits no exception, `REQ-UIBENCH-046` is unimplementable and this becomes an escalation** between
the benchmark's isolation and the one-instance rule.

**OQ-44 — `REQ-TRACE-061` faces the one case a ladder is for, in the one domain that has none. *RESOLVED
2026-09-02 by amendment, at BOTH sites, in the platform-defect round.*** *(ADR-0004, ADR-0040; constraints
D-25, C-11, D-06. Successor to OQ-11 and to OQ-41's residue.)*

***The amendment this entry records was ruled and NOT applied, and that was found on 2026-09-13.*** OQ-41's
delivery read `REQ-TRACE-061` and found it still saying "the failure re-raised", with no ladder in it, while
this entry, the surrounding register text and the implementation all cited the constants by name. The ruling
stands and is unchanged; what was missing was its application to the requirement, which the OQ-41 amendment
now carries in full, including the "only ladder this domain states" declaration and the `REQ-TRACE-514`
scope below. **A closure recorded in this register is not evidence that the requirement carries it**, and
this is the second time that gap has been found by going to the requirement rather than to the record.

***The answer, and it is the one this entry asked for rather than a borrowing.*** `REQ-TRACE-061` **now
states a ladder of its own**: at most five attempts in total, delays of **0.05 / 0.1 / 0.2 / 0.4 s** before
the four retries, the last attempt beginning no more than **0.75 s** after the first, an attempt that
succeeds reporting nothing, and no attempt leaving a temporary artifact behind. It declares itself **the
only replacement ladder its domain states** and covers every whole-file replacement the domain performs —
the generated artifact, the three baselines of `REQ-TRACE-126`, the retired-identifier log of
`REQ-TRACE-137`, and the destination an export of `REQ-TRACE-514` writes to. Its constants are **this
domain's own and were deliberately not borrowed** from `REQ-SESSION-033`, which the entry below insisted
on; both requirements now say so in terms and neither may be cited in place of the other.

***The clause that makes it close the measured case rather than half of it.*** The retry **MUST NOT be
conditioned on this application being able to attribute the failure to another process holding the
target.** The measured 6.2 % first-attempt failure occurred **with no other opener present at all**, and a
build that retries only where it can identify a foreign handle absorbs none of it and does not satisfy the
requirement. That sentence is the difference between a ladder and a ladder that works, and it is the one an
implementer would otherwise have supplied from the wrong intuition.

***The second site is closed too, and by two requirements rather than one.*** `REQ-LIBRARY-176` **cites**
`REQ-TRACE-061`'s ladder rather than stating a third. And a hole this entry did not see was closed with it:
a ladder for a *replacement* hangs on there being a replacement, so `REQ-EVENTS-145`'s one-step-visibility
obligation was made the product's single statement of what an export write owes a user-chosen destination —
without it a build could truncate and write in place, never perform a replacement, satisfy every word of
the ladder, and still destroy a user's previous export. `REQ-SESSION-189` and `REQ-SESSION-199` cite it.

***What is NOT closed, stated so it is not absorbed:*** the three export destinations domain 20 itself
governs now carry the one-step obligation and **no ladder**, and whether that document should cite
`REQ-TRACE-061` or state its own is recorded as unsettled in
[`../spec/resolutions/20-event-history-replay-export.md`](../../spec/resolutions/20-event-history-replay-export.md).
It is a narrower residue than this question, on the same shape, and minting a competing ladder owner would
be the wrong answer to it. **OQ-41's half (a) is also untouched** — a test session in the same checkout is a
`REQ-TRACE-502` conformance gap, not a ladder problem.

**The entry as it stood is kept below**, because it was right about what was owed and its measurement is
what the amendment was made against.

***The measurement, and why it changes what kind of question this is.*** This entry, and ADR-0004, and the
writer-handle report all derive the ladder from **local reader contention** — a foreign handle held for a
moment, rare, absorbed by belt and braces. `spikes/remote-and-synchronised-storage.md` §8 measured the same
call on ordinary shared storage and found it failing at **6.2 % — 37 of 600 first attempts — WITH NO OTHER
OPENER PRESENT AT ALL**, against **0 of 300** locally. So the ladder is not a defence against a rare case;
on the storage this requirement's artifacts actually live on, **it is the normal path for roughly one
document write in sixteen**, and its cause is not the one `REQ-SESSION-033` names. **The requirement's
failure policy is *re-raised*, so today that is a user-initiated regeneration failing for a reason the
user cannot act on, at that rate, on the platform the product mandates.**

***The measurement fixes the shape of the answer without supplying its numbers*** — the existing ladder
absorbed every failure, 29 of 30 on the second attempt and all 30 within two extra attempts, 0 of 600 gave
up — so what is owed is a requirement, not a research question. **Two qualifications this entry must
carry.** Every remote figure came from one client talking to a server on the same machine over loopback:
no latency, no packet loss, no reconnection, and an unknown protocol dialect, so **6.2 % is a floor**. And
the inversion is worth stating: the one target that **has** a ladder (`summary.md`) moved to machine-local
storage under ESC-15 and no longer needs it for this reason, while the targets that have **none** are
exactly the ones `REQ-SESSION-198` deliberately leaves on whatever storage the user chose.

***The premise this entry was filed on is false and is corrected here rather than deleted, because the
question survives it.*** This entry asserted that "the corpus now states no Windows retry ladder
anywhere" and that both ladders "governed stores that are rows under SR-4, so both are withdrawable".
Neither is true. `REQ-SESSION-033` was **narrowed, not withdrawn**; it states a five-attempt ladder with
exponential backoff at 0.05, 0.1, 0.2, 0.4 and 0.8 s for the human-readable summary, and it declares
itself "the only replacement ladder this domain states" (D-06, and OQ-11 as rewritten).

**The real gap is narrower and sharper than this entry recorded.** One domain has a ladder for exactly
the case `REQ-TRACE-061` faces — a transient access-denied failure of a replacement caused by antivirus,
an indexer or a cloud-sync client holding a handle — and `REQ-TRACE-061` still **declares no ladder and
requires a failed replace to be re-raised**. OQ-41's residue is exactly that case, and its contention is
now *bounded*, which is precisely the condition under which a bounded ladder is sufficient rather than a
concession.

**ADR-0004 still declines to borrow the constants, and now has a second reason.** They are a sessions-
domain figure, and attaching one to a replace of the user's **version-controlled material** is a worse
kind of borrowing than attaching an invented one. Either the specification supplies a bounded ladder for
the traceability artifacts, or it states that re-raising on a foreign handle is intended and accepts that
a user's editor or an antivirus scanner momentarily holding `docs/requirements/retired-identifiers.tsv`
can fail a regeneration the user asked for. **No neighbouring store's constants may be borrowed to
pretend a ladder exists.**

***Widened 2026-09-02: the same gap now has a second site, and it is the one where a foreign handle is
likeliest of anywhere in the product.*** `REQ-SESSION-189`'s trajectory export, `REQ-SESSION-199`'s four
record exports, `REQ-LIBRARY-176`'s and `REQ-TRACE-514`'s new ones, and `REQ-EVENTS-145`'s trajectory
document all write to **a destination the user chooses through the platform's save dialog** — which over
an existing file is a whole-file replace in place, at a path the product does not own and may be on
removable media, a network share or a synchronised folder. `REQ-SESSION-033` scopes its ladder to "where
this domain replaces a whole file in place", names `summary.md` as "the one written **repeatedly**"
rather than as the only one, and then closes by declaring itself "the only replacement ladder this domain
states". **The text supports both readings and they differ in what a user observes** — a failed export
against a held file, or a successful one a second later. `REQ-EVENTS-145` states no ladder for the
trajectory document either. ADR-0004 consequence 9 records this as a specification question and does not
choose. *Same gap, two sites, and the second one is on a user-initiated action rather than a background
one.*

***A third closure now exists that this entry did not carry.*** OQ-41's correction applies here too: a
native replace primitive (`ReplaceFileW`, measured succeeding against a held reader) removes the need for
a ladder on the traceability path entirely, at a cost that is measured out of process and unmeasured in
process. That is a decision about who owns a native addon, not about constants.
