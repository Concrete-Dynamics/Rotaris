# Rotaris-crw — system architecture — B. MEASUREMENTS STILL OWED — and whether any of them is a gate condition

Part 10 of 13 of [the architecture README](../README.md), which indexes every part.

#### B. MEASUREMENTS STILL OWED — and whether any of them is a gate condition

***The short answer to the question this category exists to answer: NO REMAINING MEASUREMENT IS A STATED
GATE CONDITION.*** Every measurement any record named as a condition of the Architecture Gate has been
taken. SR-7's gate clause was discharged by spike 20. ADR-0058's own open item on the commit was closed by
spike 21. And spike 22 — which the previous version of this section called an item that "deserves a spike
before the Architecture Gate, not after" — **has been run**. What is owed below is real and none of it is a
condition anybody wrote down. *Whether one of it should become one is category D's question, and this
record's recommendation is stated there.*

**B1. Eleven numbered spikes have never been started, and none of them blocks a decision that has already
been taken; each prices one that has.** *This count read "nine" while the list beneath it named eleven,
from the round that wrote it until 2026-09-03; the list was right and the count was wrong. Corrected rather
than quietly adjusted, because a summary that undercounts its own list is the failure this record spent
three rounds finding in other people's summaries.* Spikes 2 (Windows access-control read-back), 3 (tool-server
negotiation over our own transport), 4 (console suppression), 5 (the reserved-token branch), 6 (the
Responses dialect), 7 (the board projection crossing), 8 (store query latency against **declared** indexes,
plus store open, log recovery, an integrity check on the startup path, long-path behaviour, and the cost of
`REQ-EVENTS-179`'s write probe), 11 (parse-cache behaviour), 13 (forced synchronous commits at
recycler-pool scale), 15 (echo latency) and 18 (two run hosts on one store, which `REQ-TOOLS-089` and
`REQ-SANDBOX-038` permit and which spike 21 did not measure — only run-host-against-workspace-service was).

**B2. Four sub-cases went unmeasured inside spikes that otherwise passed, and they are listed rather than
absorbed, because a sub-case folded into a discharged spike is a gap nobody can see.**

- ***The re-run of the corrected restore. TAKEN AND DISCHARGED as IC-1 on 2026-09-02***
  (`spikes/corrected-restore-rerun.md`); **all five experiments pass and every counterfactual reproduces the
  original defect**. It is kept here rather than deleted because the entry is what the discharge answers.
  When it was written, all three corrections spike 22 produced were **exactly the paper reasoning that the
  four-for-four finding below says is not evidence**. The re-run is bounded and its two experiments are stated: race a
  launch into the window between the refusal of new runs and the run host's acknowledgement and confirm the
  second liveness evaluation catches it; and force the install rename to fail with the target name occupied
  and confirm the displace-then-rename reversal leaves the store byte-identical. It is **not** a stated gate
  condition and this record does not invent one.
- **The kill-in-the-gap case.** What a restore interrupted between the two renames leaves behind, with no
  process left to reverse anything. No power-loss or kill test was performed by any spike. It is now the
  only route to an absent store directory that the corrections do **not** close. ***Measured 2026-10-13
  (fin41), `pnpm restore-kill-proof`:*** killed 10 of 10 times between the renames, the disk was always the
  model's (target empty, displaced and staging stores whole), and the next open always created an empty store
  there and listed no session — finish, reverse or report is [OQ-266](../open-questions/57-spikes-and-later-questions-24.md#oq-266)'s (ADR-0058,
  the restore section's report). ***Repaired 2026-10-14 (fin43; OQ-266 ruled 2026-10-13 under R-072: reverse, at the
  next open):*** the restore journals the cut (`<identifier>.restore-pending`, before step 8), and the next open puts the
  displaced store back before creating anything — 10 of 10 in the same proof, byte-identical, the journal gone. A power loss
  in the gap is still unmeasured.
- **`REQ-STARTUP-165`(c)'s "no usable preparation at all" branch and its notice**, not attempted by spike
  20. It is the only part of that requirement left untouched, ADR-0054 wrote it from scratch against the
  amended text, and its failure mode is a **missing warning** — the artifact is permanently slow and nothing
  says why — which is the outcome the clause exists to prevent.
- **ESC-21's second premise** — whether two machines signed into one synchronisation account can each
  succeed at exclusive create on the same lock name. *(2026-10-13, fin41: not owed while worktree integration
  is unbuilt — the lock it is about guards REQ-GIT-124/128's integration, which no code implements, whose
  "Merge selected" is disabled (`GitView.tsx`, "REQ-GIT-083: integration is owed") and which
  `first-release-plan.md` lists under "Deferred by 'thats it'"; and the specification already takes the safe
  strength, REQ-GIT-128's refusal, which the measurement could only relax. It un-defers with integration, and
  then needs the owner's two machines on one synchronisation account, about an afternoon.)* Spike 19 measured the first premise (2,500 races,
  exactly one winner in 2,500), stated the closing experiment precisely, called it one afternoon's work and
  **refused to invent the result**. Until it is taken, ESC-21's refusal-versus-warning **strength** rests on
  reasoning. What the spike can contribute is that the failure, if it occurs, is **undetectable after the
  fact by the lock itself**: the orderable timestamp step is about a millisecond while the measuring
  machine's own clock offset was about 855 ms, a process identifier means nothing across machines, and a
  host name distinguishes without ranking.

**B3. Two measurements are owed and are deliberately not numbered, and one of them shrank this round.** A
**power-loss test**, which is OQ-12's outstanding half and is now the **sole stated ground** for forcing the
stronger durability setting on a terminal save, since the readability clause that used to carry that
decision was tested and does not need it. And a **rebuilt-for-Electron confirmation run of the storage
measurements** — *materially advanced by spike 22 and not discharged*: the restore did run under Electron
44.1.0 in real utility processes with a from-source Electron-ABI binding, at a main-process event-loop lag
of 6 ms p50 and 13 ms max, and the ABI question underneath it is **answered** (the binding is Node-API,
there is no mismatch in either direction, and no rebuild is needed for this version). What is still not run
is the storage measurements themselves under that runtime, and **nothing has been packaged by any spike**,
so the asar-unpack obligation remains untested and the first-statement failure `REQ-EVENTS-179` governs was
measured on one binding on one machine.

**B4. Two things a reader should not mistake for measurements still owed.** `REQ-EVENTS-179`'s write probe
has still not been priced on the startup path, and it now belongs to spike 8 rather than floating — on spike
21's figures a single commit is sub-millisecond on local storage, so it is very likely free, **but "very
likely free" is exactly the phrase this record has been wrong with before**. And OQ-39's presenter lapse
window is still **not sized** *(ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the poll and the
window accepted as built)*, because spike 14's harness main process had no product in it; that is a
question, not a pending spike.

***What the five landed measurements left behind, kept because it is the evidence the gate rests on.***
Spikes 14, 16, 19, 20, 21 and 22 have all reported. **Every owner ruling survived.** One ADR's own stated
gate trigger fired, three platform facts this record asserted were disproved, one mechanism this record had
decided turned out not to work at all, and the survivors are now supported by the reasons that actually hold
rather than by the ones that were written down.

- **Spike 21 — `commit-on-the-publish-path.md`. Discharged.** The commit is 0.28 % of
  `REQ-MONITOR-222`'s budget at p95; the whole persist-then-publish interval 0.71 %; the ratio 0.971
  against a ceiling of 2. ADR-0058's own open item — "the commit is not yet measured on this path and the
  record should not pretend otherwise" — is **closed**, and its *Revisit if* on commit cost is marked
  **not triggered on evidence**. Its second trigger, cross-process write contention, is **partially**
  triggered: compliant contention is sub-millisecond, a rule-violating reader costs 205 ms. **What it did
  not settle:** a real schema (no indexes beyond two primary keys and one listing index, so
  `REQ-SESSION-042`'s listing and `REQ-TRACE-239`'s board budget are still unmeasured against declared
  indexes — spike 8); two run hosts contending, which `REQ-TOOLS-089` and `REQ-SANDBOX-038` permit and
  which shares one store and one write lock; any failure path at all (no torn write, no corruption, no
  disk-full, no read-only volume); packaging, so the native module's unpacking obligation is untested; and
  power loss, which is now the **sole** stated ground for forcing the stronger durability setting on a
  terminal save.
- **Spike 19 — `remote-and-synchronised-storage.md`. Discharged on its own question; it could not decide
  ESC-21 and says so.** It supported ESC-15 on stronger evidence, disproved that ruling's stated
  mechanism, and disproved ADR-0058's read-back guard as *sufficient*. It confirmed `REQ-STARTUP-166`'s
  direct storage classification as implementable, precise and cheap (p50 0.10–1.83 ms) **with a stated
  blind spot: any client that registers no platform sync root is invisible to it, and the one such client
  present on the measuring machine registered none**. It measured ESC-21's **first** premise — exclusive
  create is a genuine primitive over a network share, 2,500 races, exactly one winner in 2,500 — and
  **declined to fake the second**. See category B, sub-cases.
- **Spike 20 — `cached-portable-launch.md`. Discharged. SR-7's gate condition is met.** Warm cached
  launch **575.5–723.1 ms**, cold **897.3–1,414.6 ms**, against 5,000 ms; the exempt preparing run lands
  **inside** the bound it is exempt from at 1,634.7–2,091.3 ms; the fast-path version check costs
  **0.14–0.49 ms**, against 709.6–845.0 ms for the cheapest launch-time digest it rejects. Cache
  invalidation across an update did **not** produce the failure ADR-0054 called "the one outcome that
  would make the design wrong rather than slow". It also found **two defects in the mechanism as the ADR
  described it** — both fixed there, both invisible in any build that never meets a damaged preparation.
  See the four-for-four finding below.
- **Spikes 14 and 16 — `presenter-liveness-and-instance-claim.md`. Spike 16 discharged and its ADR's rule
  fired; spike 14 measured but OQ-39 not closed.** *(ruled 2026-10-06,
  [R-071](../../product/requests.md#r-071): the poll and the window accepted as built)* The instance-claim
  consequence is in section 1 above. The liveness consequence is in section 4. **What spike 14 did not
  settle is the thing it was raised for**: the window is still not sized, because the harness's main process
  has no product in it and does not reproduce the loaded state the window must survive.
- **Spike 22 — `backup-restore-mechanism.md`. Discharged, and the mechanism it measured did not work.**
  It found eleven defects; the three it corrected and the eight it did not are in list A. **What it settled and what a later pass
  must not disturb:** ESC-26's three identifier cases, including the confirmed establishment, where the
  store recorded under the old value stayed intact, unreferenced, openable and holding its sessions, and
  re-writing the old value by hand re-resolved the workspace to them — **the undo the confirmation
  promises, demonstrated**; all five unreadable identifier shapes classified as unreadable with the file
  **byte-unchanged** in every one; all three refusal gates, including the older-schema case that must
  **not** refuse and which restored and was left to the ordinary migration path; **ADR-0005 consequence 11
  against its own counterfactual** — with the correction, sessions arrive reachable and the ordinary repair
  settles them, and without it they arrive naming a dead machine, live, not repairable, and releasable only
  one at a time; the one-rename installation, with the reader in 20 of 20 gap observations seeing an absent
  store directory and **never a mixed one**; and the displaced store retained, findable, openable, with its
  per-session bodies intact. **It also priced the whole action**: store unavailable 64 ms / 144 ms /
  **1.45 s** at 68 KB / 11.8 MB / 313 MB, whole restore 2.67 s at 313 MB, both renames flat at 3–5 ms at
  every size, and the gap between them 3–5 ms whatever the store weighs — *the part of the mechanism that
  is not atomic is the part that does not scale*. **And it answered ADR-0056's owed figure with the
  opposite of the expected answer** (list A item 8). *One thing the record got right that is worth naming
  because it was tested to fail and did not:* the error text on the double-failure path names **both**
  directory paths, which is the only reason that end state is recoverable by a person at all. It was
  specified before it was ever run.

#### C. BUILD-HOST OBLIGATIONS — which nobody closes by reasoning

**Four, and stating them as merely "outstanding" understates what it takes to clear them. They need
infrastructure.**

> **DEFERRED TO HARDWARE, 2026-09-02, by owner ruling GD-5.** All four remain **owed** and none is
> closed. They cannot be discharged on the machine this record was produced on, and they are now
> recorded as **IC-3** in [`implementation-conditions.md`](../implementation-conditions.md) so that they
> bind the work rather than sitting in a verdict category. Deferral is a fact about available machines
> and not a judgement that they will pass: **every one of them is in the class of things this record
> has never executed**, and every mechanism taken from paper to first execution has held a defect no
> reading caught. An implementation that reaches a Linux or macOS artifact before IC-3 is discharged is
> shipping on an untested platform.

1. **Spike 12 — the Linux image's runtime on an unmodified baseline installation.** Needs a Linux machine
   that has never had the legacy FUSE library installed. ESC-11 is ruled and applied; what spike 12 decides
   is which of the ruling's two options the release actually takes, and it stays undecided until such a host
   exists.
2. **Spike 17's two remaining platform keys.** A macOS host and a Linux host of their own keys, because
   `REQ-STARTUP-155` binds all four artifacts and only the Windows two were built.
3. **ADR-0056's build-time native-module load proof, on all three release runners — and this one grew this
   round.** It was always the only check in the record that catches an unloadable store binding. Spike 22
   then measured that `electron-rebuild` **exits 0, prints success, and produces no binary** against the
   chosen binding, and that the loader prefers the shipped prebuild over anything built beside it (list A
   item 8). **So the load proof is not a belt-and-braces check; it is the entire check**, and it must be
   shown *constructible* on each runner rather than assumed.
4. **The instance claim, which is now entirely ours on three platforms and measured on one.** macOS must
   additionally compose with the convention that a second launch of a bundle produces no second process; the
   Linux singleton is different code from the Windows path that failed, so the 20-second result says nothing
   either way about it. ADR-0055's rule correctly does not wait on that — the primitive is refused on
   measurement and alternative III was withdrawn by SR-1, so there is no second destination to fall back to
   — but the verification is **relocated rather than discharged**. And `REQ-STARTUP-156`'s release gate
   observes "downloaded and launched to first paint" per artifact; it does **not** require launching the
   entry point twice on one user account, which is what `REQ-STARTUP-152` makes the release-checkable form
   of SR-1 and is the check that would catch this failure on a platform nobody has measured.

**Nothing was packaged by any spike**, on any platform, so the asar-unpack obligation that survives from
ADR-0058 consequence 1 is untested everywhere — including under the Electron run spike 22 performed, which
loaded the binding from `node_modules`.

#### D. OWNER DECISIONS OUTSTANDING — ALL FOUR RULED 2026-09-02

***No escalation is open. Thirty-one were raised, twenty-nine are ruled and two were answered by the
specification itself.*** Four things were left for the owner, none of them an escalation because none was
a choice about what the product is. **All four are now ruled**, as GD-1 to GD-4 in `owner-decisions.md`.
They are recorded here with what each one changed, because the category is where a reader looks to find
out whether anything is still waiting on a person: **nothing is.**

1. **The two design-reference dependencies — ruled GD-1, and the two were separated.** The reference is
   **not a condition of this gate**: every mechanism in this record was shown independent of it, and
   holding a gate about mechanism for material no mechanism depends on delays every unrelated decision and
   improves none. But the other half of that finding is acted on too — **no screen can be built without
   it** — and it is recorded as **IC-2** in `implementation-conditions.md` rather than left as an
   observation. OQ-30's theme palettes and token values ~~stay open and~~ stay the reference's *(OQ-30 closed
   2026-09-04 by the IC-2 implementation; IC-2 still bounds `REQ-SHELL-128`'s other two themes)*, with the
   information architecture of the seven views, the benchmark and diagnostics layouts, and
   `REQ-SHELL-149`'s glyph vocabulary.

   > **Corrected 2026-09-03. This entry was written as though the reference were missing, and it is not.**
   > `docs/design/` has held the approved design language since 2026-09-01 — tokens, type, spacing, radii,
   > elevation, motion, iconography, motif, copy voice, 27 typed components, twenty specimen cards, the
   > fonts and the mark — with an adoption rule and a full reconciliation against `REQ-SHELL-023`. So
   > **OQ-30 is partly satisfied**: the default palette and the token set exist; the `nocturne` and
   > `high-contrast` palettes and the per-theme metadata do not. **The information architecture was never
   > the reference's to supply** — `docs/design/README.md` §2 assigns it to `docs/spec/` and treats the
   > mockup as craft, not structure — and `REQ-SHELL-149`'s glyph vocabulary is served by the iconography
   > rules. **GD-1's ruling stands unchanged**; only this entry's premise about what was absent was wrong,
   > and IC-2 is rewritten accordingly.

   **OQ-31 was ruled without the reference and is closed**, because the
   Markdown dialect turned out to be a question about what the renderer accepts from model output rather
   than about appearance: GitHub Flavored Markdown, less raw HTML, less image loading, with no image ever
   loaded from a Markdown image reference whether it names a remote location or a local one.
   `REQ-CHAT-056` carries it.
2. **The two rulings resting on disproved reasons — ruled GD-2: corrected in place, conclusions
   unchanged.** ESC-15 and SR-7 now carry dated correction blocks stating what was measured against what
   was claimed. ESC-15's reason is replaced by the three failures the measurement found instead, each worse
   than the one it rested on — a store that reports WAL enabled, reads it back, owns its shared-memory
   segment and still loses the next write silently, and a failure that depends on **how the path is
   spelled**. SR-7's identification moves from the packaging tool's variable (**0 of 157**) to our own
   declared variable (**149 of 149**); its timing evidence is untouched. Neither conclusion moved, which is
   the point: a record whose conclusions are right for reasons that are false cannot be re-derived.
3. **The re-run of the corrected restore — ruled GD-3: a condition on its implementation, not on this
   gate.** The recommendation this record offered was taken, with one thing checked rather than assumed —
   **no register of implementation-time conditions existed**, so the ruling created one.
   `implementation-conditions.md` holds it as **IC-1**, bounded to the two experiments the corrections
   changed and the measurement has not seen: a run raced into the window between the refusal of new runs
   and the run host's acknowledgement, and an install rename forced to fail on an occupied name. Without
   that file the option would have been the do-nothing option under another name.
4. **The two questions a measurement made askable — ruled GD-4, both into `REQ-SESSION-201` as clauses.**
   A restore under way **is acknowledged and is visible** — the gesture answered on `REQ-SHELL-150`'s
   ordinary terms and the user told the workspace's sessions are unavailable — with **no proportion, no
   stage list and no estimate**, because reporting stages would mean reporting from inside a sequence whose
   value is that it is indivisible, and would create standing pressure to make it interruptible. This
   creates no duration budget and leaves the deliberate silence intact. And **a backup in progress may be
   abandoned**: the partial artifact is discarded, the store is untouched, and nothing partial or
   unreadable is left at the destination the user chose. That one mostly writes down a property the
   mechanism already has, and leaving it unspecified would have been the same shape — a requirement
   enumerating cases with the residue undefined — that produced `REQ-SESSION-043`'s defect.

**What this does not change.** The gate verdict does not turn on this category and did not before. It
turns on **A** and **C** — the build-wrong defects and the build-host obligations — and neither was
changed by these rulings. *Both moved later the same day and by other means: A's build-wrong class was
emptied by the defect-closure round, and C was deferred to hardware by GD-5 without being waived.*

#### THE FOUR-FOR-FOUR FINDING — stated in the verdict rather than in a footnote

*This heading read **THE THREE-FOR-THREE FINDING** until 2026-09-03. The fourth arrived on 2026-09-02 and
is the one that says most about the other three, so the count is corrected rather than the entry appended
under a stale title.*

**Four mechanisms in this record have now been decided on paper, implemented for the first time by someone
measuring them, and every one of the four contained a defect that no reading had caught.** They are
recorded as ADR-0058 consequence 17 and they are named here because a product owner authorising
implementation should be told them together rather than meet them one at a time.

- **ADR-0054's commit step could not commit.** It said the preparation is "written into a sibling directory
  and then **renamed onto the token-named path as the last step**". On Windows a directory cannot be renamed
  onto an existing directory and the platform's replace-existing flag does not apply to directories. Two
  observed outcomes: with the marker deleted, the redo could not commit, deleted its own work and launched
  from the still-damaged directory, so **the artifact would re-prepare on every launch for ever**; with the
  entry point deleted, the spawn failed and **the launch produced nothing at all**. Now displace-then-rename,
  measured at 2.17–3.18 ms. Simplifying it back to a bare rename reintroduces both failures.
- **ADR-0054's completeness check returned a cache hit on a preparation that cannot run.** Its triggers were
  marker and entry point; a deleted runtime library and a truncated payload archive each **passed**, the
  damaged image launched, and **no window ever appeared** — confirmed independently by running the prepared
  executable directly. That is `REQ-STARTUP-165`(c) unmet in the requirement's own words. The marker now
  carries the path and length of every prepared file and the fast path checks them all, at 3.56–5.87 ms.
  **The residue is stated rather than hidden**: it does not catch in-place corruption at unchanged length,
  and the only thing that would is a digest of the prepared tree, priced at 3.89–5.50 s — 39–44 % of the
  whole budget. The escape hatch both records had reserved is now **explicitly withdrawn** rather than left
  available, because taking it would reintroduce a launch that produces no window.
- **ADR-0058's restore could not complete, in 30 of 30 attempts**, and two of its remaining steps each
  destroyed something: a live session, and the store's own recoverability. List A, items 3 to 9 and section 3
  above.
- **The harness built to measure the corrected restore had three defects on its first run**, and it is the
  fourth entry because **a harness is a mechanism** and this one was decided on paper like the rest. One of
  the three would have reported a **pass while testing nothing it claimed to test**: the race landed on the
  wrong side of the first liveness evaluation, so the first evaluation caught it and the second never ran.
  A second was **defect D8 arriving uninvited** — the byte-identical test counted the `-wal` and `-shm` any
  open connection creates. The third asserted byte-identity in the one experiment whose whole point is that
  a live run keeps writing. Recorded in [`spikes/corrected-restore-rerun.md`](../spikes/corrected-restore-rerun.md)
  section 8. *It was written by someone who had just finished writing up the other three.*

**What this licenses and what it does not.** It licenses **no** universal measurement obligation — the
record cannot afford one and the finding does not support one. It settles two narrower things. **An unrun
mechanism is not evidence that it works**; a record may not treat "every step is individually argued" as a
substitute, and this record did, four times. And **a defect found this way belongs in the record in place**,
beside the claim it falsified, rather than repaired quietly in the code that meets it — because a record
whose conclusions are right and whose reasons are false is a record that gets "simplified" back into the
defect by the next reader. *One detail is worth the space: the same platform fact — a directory cannot be
renamed onto an existing directory — broke ADR-0054's commit and ADR-0058's reversal independently, in two
records, months of reasoning apart, and neither reading caught it in the other.*

**And the honest use of it at the gate.** **Four of four is the best available estimate of what the
unmeasured remainder holds.** Eleven numbered spikes have never been started and four sub-cases are owed. This
record has no basis for saying that the rate is lower there, and it has four data points saying it is not.
**That does not block the gate** — the defects the estimate predicts are the kind that first execution finds
cheaply, which is what all three of these were — but it prices the difference between authorising
implementation and authorising it as if the record were verified. **It is not verified. It is argued, and
four times out of four where argument met execution, execution won.**
