# Rotaris-crw — system architecture — The verdict

Part 11 of 13 of [the architecture README](../README.md), which indexes every part.

#### The verdict

**The build-wrong defect class is empty. What stands between this record and the Architecture Gate is now
four obligations that need a machine nobody has here, and one re-measurement — not a defect anybody has
found.** Every measurement that can be taken on this host has been taken, and every defect that would cause
a conformant implementation to be built wrong has been closed at its definition.

- ***Every measurement any record named as a gate condition has been taken.*** SR-7's clause was discharged
  by spike 20; ADR-0058's own open item on the commit by spike 21; and spike 22 — the item this verdict
  previously called the gate blocker on the architecture side — **has been run**. **No remaining measurement
  is a stated gate condition** (category B).
- ***The specification side carries no build-wrong defect.*** The one that stood here — a lock row naming
  another machine making a store permanently unrestorable — was closed on 2026-09-02 at both ends: at the
  root, by fixing what supplies `REQ-SESSION-046`'s `host` so that renaming a machine cannot produce the
  condition at all, and at the deadlock, by letting `REQ-SESSION-201` report such rows together and proceed
  on a confirmation that states the risk. The three that stood before those — `REQ-STARTUP-145`,
  `REQ-TRACE-061`, `REQ-EVENTS-098` — are all closed at the definition, each verified against the
  requirement text rather than taken from a round's report.
- ***The architecture side carries no build-wrong defect either.*** The three from spike 22 are closed:
  the close handshake now has a bound whose **expiry refuses rather than proceeds**, and a lease the run
  host expires by itself so the dual failure has an exit; the displaced-store name is milliseconds **plus an
  exclusive create**, because granularity alone is not uniqueness; and the artifact's container layout is
  converted into the store's layout as a step rather than assumed identical, with `origin.txt` written by
  the restore. The build check that certified nothing (item 8) is closed with them. **Three defects remain
  open in category A and none is in this class** — D5, D8 and D11 — alongside the two carried-over
  architecture items.
- ***What is left is category C, and it is now a hardware question rather than a record question.*** Four
  obligations need a clean Ubuntu host, a macOS host, and the three release runners. **Owner ruling GD-5
  defers them to a machine that exists and does not waive them**; they are IC-3. One of them grew this
  round rather than waiting: ADR-0056's build-time load proof was always the only check that catches an
  unloadable store binding, and defect D10 established that the rebuild it confirms exits 0 while compiling
  nothing. It is now the entire check.
- ***And the corrections above are no longer paper: they have been run.*** IC-1 was discharged the same day
  it was set, by `spikes/corrected-restore-rerun.md`. **All five experiments pass and every counterfactual
  reproduces the original defect** — the second liveness evaluation caught the raced run 30 of 30 and
  removing it destroyed the session 10 of 10; displace-then-rename returned the target byte-identical 30 of
  30 where the single-rename reversal reached the forbidden empty-store-directory state 10 of 10; the bound
  refused in 2,008–2,020 ms against no result at all inside 15,000 ms; the lease re-admitted runs 10 of 10;
  and the aside-name's counter was needed in 30 of 30 forced collisions. **This is the first mechanism in
  this record to be corrected on paper and then measured before anything was built on it**, and it is the
  first to survive first execution — because it was not its first execution.

- ***Four mechanisms decided on paper have now been implemented for the first time and every one held a
  defect no reading caught.*** That is the section above and it is deliberately not a footnote. It blocks
  nothing by itself. It is the best available estimate of what the unmeasured remainder holds, and the
  remainder is eleven unstarted spikes and four sub-cases.
- **Five measurements landed and every owner ruling survived. Several ADRs reached the right conclusion by
  reasoning the measurements disproved**, and those reasons are corrected in place with the falsified claim
  kept beside its replacement. The single correction most likely to be unwound is still the durability one:
  the stated ground was readability, readability is trivially testable, and the test says the weaker setting
  passes — so the next person optimising the terminal-save path will run exactly that test and be **right
  about the reason and wrong about the decision**. If a later pass compresses ADR-0058's durability section,
  that paragraph is the one that must survive.
- **Four build-host obligations** need infrastructure, not reasoning, and one grew materially: ADR-0056's
  load proof is no longer a belt-and-braces check but the **entire** check, because the rebuild it was meant
  to confirm reports success without producing anything.
- ***No escalation is open.*** Twenty-nine ruled, two answered by the specification itself. The seven this
  verdict last listed as open were all ruled on 2026-09-02 and all seven have landed in requirements —
  which discharges ESC-31's architecture consequence, so ADR-0024's choice of what identifies a
  permission-audit entry is no longer permitted-and-unblessed.
- **What is genuinely settled is larger than what is not.** Twenty-nine escalations ruled and two answered
  by amendment; **every specification defect this record raised before today closed, each closure verified
  against the requirement text by this pass** — the one specification defect now open was raised by this
  round rather than carried into it; five inter-record contradictions closed with their losing arguments
  preserved; zero dangling citations across 1,214 requirement references, re-checked mechanically after this
  round against a corpus of 4,397; and the two questions this record was most likely to get wrong — what
  identifies a workspace, and where the event history's trim belongs — settled on requirement text rather
  than on preference.

**No ADR is blocked from ratification by an open question.** Several remain unratifiable because a
measurement they name has not been taken — category C's build-host group and category B's unstarted spikes.
**ADR-0058 is a new case and should be named as one:** the mechanism it describes has now been run, and of
the eleven defects that run exposed, **three are corrected and eight are not**. It is not unratifiable for
want of a measurement. **It is unratifiable because it is currently wrong or silent in seven enumerated
places** — list A items 3 to 9 — three of which are in the build-wrong class.

***THE ONE QUESTION THE GATE TURNS ON — is there anything left that would cause a conformant
implementation to be built wrong? NO.***

*This block previously answered **"YES. FOUR THINGS, and the shape of the answer has changed"**, and that
answer is **withdrawn on 2026-09-02** rather than deleted. The four are kept below with the closure beside
each, under this record's standing rule: a record that quietly loses a question it once answered yes cannot
be re-derived, and the next reader has no way to tell a closure from an omission.*

**All four are closed, and the fifth adjacent to them is closed with them. What is not uniform is what each
closure rests on**, and the gate is entitled to that distinction rather than to a single word. Two are
measured against the defect they close, one was exercised without being aimed at, and two rest on argument
alone.

1. **A machine rename makes every session's lock foreign, every foreign lock is live by construction and is
   never reaped, and a restore is refused while any session is live. CLOSED at both ends, on argument.**
   `REQ-SESSION-046` now fixes what supplies `host` — an identifier the product mints once per machine and
   keeps machine-locally, never the operating-system name, and a machine rename must not change it — which
   removes the mass case at its source; `REQ-SESSION-201` reports foreign rows **together, as one
   condition**, and lets the user confirm and proceed on a confirmation that states the risk, which removes
   the deadlock in which the recovery action was blocked by exactly the records it was about to replace.
   ***Neither half has been run.*** Spike 22 measured the defect and its counterfactual; nothing has
   measured the fix. *Specification. Owned now — it was the entry marked "unowned" and it is not.*
2. **A build implementing ADR-0058's close handshake as written waits for an acknowledgement that may never
   come. CLOSED, and MEASURED against the defect.** The acknowledgement is bounded at 2,000 ms and
   **expiry refuses rather than proceeds**, because a bound that proceeds was measured to fail later, after
   mutation; the run host's refusal is a lease it expires by itself at 30,000 ms, so a dead workspace
   service releases the workspace by doing nothing. IC-1 E3a refused in **2,008–2,020 ms, 10 of 10**, with
   the target byte-identical and no staging left, against the original's no result and no error inside a
   15,000 ms watchdog; E3b re-admitted runs **10 of 10** where that state had persisted for the life of the
   instance. *Architecture.*
3. **A build choosing second resolution for the displaced store's UTC timestamp fails the first mutating
   step of the restore. CLOSED, and MEASURED against the defect — including which half of the fix is
   load-bearing.** IC-1 E4 forced the collision the correction exists for, because at millisecond
   granularity it never arose on its own and **a correction that is never exercised is not measured**. The
   counter was needed in **30 of 30** and both displaced stores survived openable; the pre-correction name
   failed `EPERM` **30 of 30** and lost a displaced store every time. **It is the counter, not the
   granularity**: finer resolution only makes the collision rarer. *Architecture.*
4. **A build expanding the artifact "in full" into staging and renaming staging onto the identifier produces
   a store directory holding the container's layout rather than the store's. CLOSED, on argument, and
   exercised without being aimed at.** Staging is arranged into the store's layout as a step before the
   install rename, the manifest stays outside the store, and `origin.txt` is written by the restore.
   IC-1 ran both on every successful path and neither failed, **which is weaker than a test of either** and
   is recorded as such in that spike's section 7. *Architecture.*

**And the fifth, adjacent: a release build that runs `electron-rebuild` and trusts its exit status has
verified nothing** — it exits 0, prints success, compiles nothing, and the loader prefers the prebuild
anyway. **CLOSED as a rule and unrun as a rule.** ADR-0056 rule 1a makes the artifact the evidence rather
than the command, and rule 4's load is now the entire check — **which is precisely why it is IC-3 item 3,
owed on all three release runners and taken on none.** Harmless on this binding version, by luck rather
than by the check working.

***The honest ledger, because "closed" is doing different work in each row.*** Two of the five are measured
against the defect they close (2 and 3). One was exercised on every successful run of a measurement built
for something else (4). Two rest on argument alone (1 and 5), and the record's own four-for-four finding is the estimate of what argument alone is worth. **That does not reopen the question
this section asks**, because nothing in items 1, 4 or 5 is a defect anybody has found; it prices the
difference between a closure that was tested and a closure that was reasoned, and the gate should be told
which is which rather than shown a uniform word.

***Everything else outstanding is a measurement, a build host, or an owner's decision, and each is listed
under its own heading above with nothing moved between them.*** Category D is empty — all four owner
decisions were ruled on 2026-09-02 and nothing waits on a person. Category C is four obligations deferred
to hardware by GD-5, owed and not waived, bound as IC-3. Category B holds eleven unstarted spikes and four
sub-cases, **one of which — the re-run of the corrected restore — has since been taken and discharged as
IC-1**, and none of which any record named as a gate condition. Category A holds D5, D8, D11 and the two
carried-over architecture rules, each stated with what it costs and **none of them in the build-wrong
class**.

### The open questions

**Forty-nine questions have been raised; nine are closed with their reasons and forty are open** — the
nine are OQ-3, OQ-11, OQ-14, OQ-26, OQ-27, OQ-28, **OQ-31**, OQ-44 and OQ-49. *This sentence read
"thirty-nine open and eight closed", which counted OQ-30 and OQ-31 outside the total as the visual design
reference's pair; **OQ-31 was closed by GD-1 without the reference**, so the pair is now one and counting
it separately hides rather than clarifies. **OQ-30 alone is the reference's, and it is bound by IC-2.***
*Three of the nine closed on 2026-09-02 and two of those had each been carrying an assertion of fact that
the amendment made false, so each was corrected rather than
been carrying an assertion of fact that the amendment made false, so each was corrected rather than
deleted.* **OQ-14** is closed by `REQ-CONFIG-216`, which now fixes `secrets.yaml` at `0600` **explicitly on
every write** rather than inheriting it, denies `REQ-CONFIG-444`'s platform-default fallback to that one
file by name, and does not write at all where the protection cannot be applied — the entry had said the
requirement "says nothing about mode". **OQ-44** is closed at **both** its sites by `REQ-TRACE-061`, which
now states a five-attempt ladder of its domain's own with the clause that decides whether a build absorbs
the measured failure or none of it, by `REQ-LIBRARY-176` citing that ladder rather than minting a third,
and by `REQ-EVENTS-145` becoming the product's single statement of what an export write owes a user-chosen
destination — without which a build could satisfy every word of the ladder by never performing a
replacement at all. **The residue is narrower than the question**: domain 20's own three export
destinations carry the one-step obligation and no ladder, and that is recorded as unsettled in that
domain's resolutions rather than absorbed here. **OQ-49** is closed by `REQ-STARTUP-163` owning what makes
two directory strings the same directory, which moves constraint W-25 from a ruling to a requirement
citation. OQ-11's closure text was wrong and was rewritten rather than deleted: it is closed because
`REQ-LIBRARY-043`'s ladder went with its document layout, not because neither ladder has a file left to
govern.

**Four questions changed character on measurement and none of them closed, which is worth saying because "a
spike ran" reads as "a question closed".** **OQ-39** (sizing the presenter lapse window) has a floor and a
detection latency and is **explicitly not sized**, because the harness's main process had no product in it
*(ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the poll and the window accepted as built)*.
***OQ-44 has since CLOSED and the sentence that stood here — that it "stops being sufficient and unspecified
and becomes necessary on ordinary corporate storage and unspecified" — described it for one day.*** The
measurement fixed the *shape* of the answer without supplying its numbers, since two extra attempts sufficed
in every one of 30 retried renames; the platform-defect round then supplied the numbers. **OQ-12** gains a
second measurement pulling the same way: the naive directory-flush call returns an error on every spelling
including local, so "add the missing flush" produces a failure rather than a guarantee, and the available
call needs a deliberately write-opened handle whose guarantee is still unestablished. **OQ-43** (does the
single-instance gate admit a benchmark iteration?) *(ruled 2026-10-06,
[R-071](../../product/requests.md#r-071): the exception stated as built in `PD-STARTUP-002`)* is unchanged in
substance and now concerns **our** gate rather than the platform's, which makes the sentinel branch entirely
ours to define and the composition easier to state — the requirement-level ambiguity it records is
untouched.

**Two are more owed than they were, and one of them grew twice in one day.** **OQ-48** — reclaiming a
machine-local store whose workspace no longer exists — had three producers this morning and has **five**
now. ESC-26 added the third: a confirmed identifier establishment leaves the old identifier's store intact
and merely unreferenced, which is what makes a one-way-looking operation safe to confirm, and it means the
surface is the only route **back** to a store a user may well want rather than only the route to clearing
one they do not. **Spike 22 added the fourth and fifth by measurement**: a **full copy of the store** left
at `<identifier>.restoring-<n>` in every failure measured, which ADR-0058's layout block calls "transient"
and which no step deletes; and the `.obstruction-<stamp>` the corrected reversal displaces an occupying
name to. **ADR-0058 consequence 5 is the consequence that tracks these and it was not updated**, so the
count of leftover kinds rose while the record of them did not. **OQ-45** is narrowed and simultaneously
more owed; its product half was **ESC-30** and is now ruled and applied.

**One question was raised by a spike and is answered rather than filed.** Spike 19 asked where a
first-statement store failure after a successful open belongs, between `REQ-EVENTS-084` (opening) and
`REQ-EVENTS-088` (a write failing during a run), and recorded that the mapped-drive case lands in that gap
30 times out of 30. **It is closed in the specification rather than left open here**: `REQ-EVENTS-179` is
minted, it resolves the case into `REQ-EVENTS-084` and refuses the run on exactly the same terms, and
`REQ-EVENTS-084` and `REQ-EVENTS-088` each gained the boundary sentence that routes to it. It is recorded
in `open-questions.md` as minted-and-closed with a pointer rather than as a live question, so that the
spike's own request for an entry is answered rather than ignored.

**OQ-28 is closed because the specification moved under it, and it moved decisively.** That question
asked what the two structural counts mean for a document-model interface, and it recorded as its live
item that "the specification has not moved". It has. `REQ-UIBENCH-050` now states in bold that the
framework-neutral counting rule "is the operative one", spells out that a rendered paragraph, code block
or list item inside a transcript row **is** a widget, and closes the escape route — the framework clause
"does not license a product to count only the elements its own layout declares and to leave out what it
drew". And `REQ-UIBENCH-054` carries ESC-13's relaxation: the element-count invariant is withdrawn as
**unsatisfiable by any admissible implementation**, not merely as unmet, because the only structure that
could hold it is a canvas and a canvas forfeits `REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and
`REQ-SHELL-144`. The measured divergence — +147 or +85 at the `construct_window` → `apply_fixture`
boundary in every run — is the fact the requirement was amended against.

**Three questions changed shape rather than closing, and one is new.** **OQ-47**'s third paragraph is
discharged and preserved as the mistake it was: the two records do not disagree about what identifies a
workspace, they key two different objects, and both collapses are actively wrong. Its first two paragraphs
stay open *(ruled 2026-10-06, [R-071](../../product/requests.md#r-071): ADR-0058's behaviour ratified, the hand
edit accepted for the first release)*, and the dead end they record — "go and edit this file" — is now
reached by a second route, from the restore. **OQ-45** is narrowed (ADR-0041 takes the improvement store's
export and only the export) and simultaneously **more** owed; the interaction it named between
`REQ-LIBRARY-047`'s best-effort version write and `REQ-LIBRARY-176`'s "how many were dropped" clause is what
ESC-30 ruled on, and both requirements are now amended, so what stays open here is the storage half alone.
**OQ-48** is more owed again, at five leftover kinds rather than three: the restore and the corruption
ladder each displace a store and keep it, a confirmed establishment orphans one, and the restore now also
leaves a full staging copy and an obstruction aside-name — so **the operations a user in trouble reaches for
first are the ones that leave the most behind**, and the surface that would clear any of it exists nowhere.
**OQ-49** was new and is now closed by amendment: what makes two directory strings the same directory, which
ADR-0002 decided because it needed a key and `REQ-STARTUP-163` now owns.

**OQ-41's "what would close it" was wrong and is corrected.** It proposed a runtime API exposing
share-delete on open. That remedy does not exist because the problem is not there: the runtime already
requests share-delete, and the blocker is the replace-by-rename call, which fails even against a holder
that explicitly permits delete. The closer is a **replace primitive**, measured succeeding against a held
reader, available out of process at p50 767 ms and unmeasured in process. The question is who owns a
native replace primitive, not whether a share flag exists. And OQ-41's residue is now **split into its
two halves with their two owners**, because they are not the same problem: a test session in the same
checkout is the `REQ-TRACE-502` conformance gap; a foreign process holding a file is not, because an
editor is not an invocation — it is a `REQ-TRACE-061` re-raise problem.

All of it is in [`open-questions.md`](../open-questions.md).
