# Open questions — Escalations — product-owner decisions (2 of 3)

Part 4 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds ESC-18 – ESC-25.

### ESC-18 — ESC-3's ruling has been overtaken

**Where:** ADR-0058 consequence 5; ADR-0041. **Source:** ESC-3 as ruled, against `REQ-LIBRARY-042` read
under a transaction.

ESC-3 was ruled deliberately: match the specification, accept silent loss on the ordinary write path.
Under SR-4 the improvement store's read-modify-write is one transaction, so two genuinely interleaved
review decisions **can no longer lose one another**. Every guarantee `REQ-LIBRARY-042` states still holds
— no reader sees a partly applied change, the later replacement wins whole where the two do not
interleave, `REQ-LIBRARY-164`'s agreement is unaffected — and the accepted defect becomes unreachable.

That is divergence in the **safe** direction and needs no remedy. It is raised because the owner ruled on
it explicitly, on the reasoning that "adding a refusal to every write where the specification has none is
a larger change than the defect warrants" — and the defect is now gone without any refusal being added,
which is a different world from the one the ruling was taken in. Confirm, or state that the
specification's stated consequence must be reproduced.

### ESC-19 — SR-9(b)'s backup disclosure is not in the specification *(raised 2026-09-01; **RULED 2026-09-01; the specification has since landed both halves**)*

> **Status, 2026-09-02: CLOSED, and closed by requirement rather than by the ruling alone.** ESC-19 was
> ruled **option 1 *and* half of option 2**: mint the disclosure, add a whole-store backup and restore,
> and **refuse** the configurable store location. All three have landed. `REQ-SESSION-200` is the
> disclosure and is substantial — it names what sits outside a workspace backup, names what *is* carried
> so the statement is informative rather than alarming, names both remedies, requires reachability from
> `REQ-SESSION-182`'s session-management surface, and forbids delivery only inside a failure message.
> `REQ-SESSION-201` is the backup and restore, and it fixes far more than the ruling asked for: one
> artifact covering the whole store plus `REQ-SESSION-002`'s per-session files and nothing outside it, a
> user-chosen destination, validity **while runs are live**, a result that is "a state of the store that
> a reader could have observed at one moment", an explicit restore that never merges silently and is
> refused rather than half-done, and an artifact carrying the workspace identifier. `REQ-SESSION-182`
> places both actions. The store's location is unchanged and ESC-19 states in terms that ADR-0058's
> location decision does not reopen. **Constraint W-22 is relabelled MET; W-24 carries what the backup
> now forces.**
>
> **What is left is not this escalation and must not be filed under it.** One thing the pair *creates*
> is escalated separately below as **ESC-26**: `REQ-SESSION-201`'s restore and `REQ-SESSION-197`'s
> absolute identifier rule together make the intended disaster-recovery use end in a manual file edit.
> And the mechanism ADR-0058 built for it was entirely unmeasured — spike 22. ***That is no longer true.
> Spike 22 ran on 2026-09-02 and the restore as ADR-0058 wrote it failed in 30 of 30 attempts*** (
> `spikes/backup-restore-mechanism.md`). Three defects were found, all three are corrected in ADR-0058,
> `REQ-SESSION-201` and the new `REQ-SESSION-202`, and eight further defects the spike found are recorded
> uncorrected in the gate verdict. **None of it reopens this escalation**: the ruling asked for a
> whole-store backup and restore and the requirement states one; what the measurement corrected was the
> mechanism, which is the architecture's and not the owner's.

**Where:** ADR-0058; constraint W-22, and now W-24. **Source:** `owner-decisions.md` SR-9(b), against
`REQ-SESSION-198` and the absence of any requirement discharging it. **The options as they stood when
this was raised are kept below, because a ruling is only legible beside them.**

SR-9(b) ruled that a machine-local store changes what a backup protects and that **a requirement is
minted** so the product states the property rather than letting a user infer it from an absence.
**No such requirement exists.** Twenty-one domains contain no backup, restore or synchronised-folder
disclosure; `resolutions/07` records "the backup profile of a machine-local store" only as a *concern
raised*; and the ruling table in `docs/clean-room/specification-gate.md` lists SR-4 to SR-8 and does not
mention SR-9 at all.

The consequence is user-visible and is not small. A user's session history, permission audit, improvement
library and artifact bodies now live outside anything they back up when they back up their project. The
failure mode is a user who backs up their workspace, restores it, and finds their history was never in
it. Every mitigation this record has is an **export**, and `REQ-SESSION-199` forbids building anything
that repeats one. **ADR-0058 cannot close this from the architecture side** — it can place the store, and
it cannot make the product tell anyone.

1. **Mint the disclosure requirement**, which SR-9(b) calls the minimum honest fix.
2. **Take the structural option** SR-9(b) explicitly does not foreclose — a configurable store location,
   or an explicit backup action covering the whole store rather than per-record exports. This returns
   ADR-0058's alternative N and makes the store's location a user setting, with a second set of failure
   modes (a location on a share re-creates ESC-15; a location that moves orphans a history).

### ESC-20 — SR-9(a)'s two exports are not minted, and the argument reaches a third record the specification excludes *(raised 2026-09-01; **RULED 2026-09-01; the specification has since landed it in full**)*

> **Status, 2026-09-02: CLOSED.** ESC-20 was ruled: mint SR-9(a)'s two exports, and **draw the boundary
> on redaction safety rather than on readership**. `REQ-LIBRARY-176` and `REQ-TRACE-514` mint the two,
> each applying `REQ-EVENTS-166`'s guarantee "on the same terms `REQ-SESSION-199` applies it to the
> timeline, the issues record, the metrics document and the permission audit". The third case went the
> way this entry could not predict: `REQ-TOOLS-190` **gains** an export, in its continuation paragraph,
> and the readership sentence quoted below as the possible stopping point **has been deleted from the
> requirement** and replaced by the test itself, which `REQ-TOOLS-190` now calls "the product's single
> statement of that test" — *a record gains an export when it carries no unredacted user or tool content,
> and does not gain one when it does.* The one case this entry said must never be swept in is protected
> by the same requirement, in stronger terms than were asked for: `REQ-SESSION-136`'s tool-call evidence
> "MUST NEVER gain an export — not under this rule, and not under any later widening of it", and a
> future requirement proposing one "MUST be refused rather than reconciled". **Constraint W-23 is
> relabelled MET.**
>
> **One residue, and it is disclosure rather than boundary.** `REQ-SESSION-201`'s backup carries the
> tool-call evidence because it carries the store whole. The requirement states that itself and obliges
> the product to convey it where the action is offered, so it is not a widening — but a reader who meets
> it without that sentence will conclude the prohibition is porous, which is exactly the argument for
> widening it. ADR-0024 and ADR-0058 both state the distinction rather than omitting it.

**Where:** ADR-0024, ADR-0041, ADR-0058; constraint W-23. **Source:** SR-9(a) and SR-6, against
`REQ-SESSION-199`, domain 14, and `REQ-TOOLS-190`. **The question as it stood is kept below.**

SR-9(a) ruled improvement artifacts and delivery records into the export list "on the same terms as the
four in SR-6". `REQ-SESSION-199` carries the four. **Neither of the two exists**: domain 14 contains no
occurrence of the word *export* at all, and no export requirement for delivery records exists in domain
08 or 15.

The second half is sharper, because it is not an omission. `REQ-TOOLS-190`'s verification-gate record is
reached by the **identical** argument — it was a file under the withdrawn evidence set, a user could read
it, and unlike the tool-call evidence it carries no argument values that would make an export unsafe —
and `REQ-TOOLS-190` excludes it by a positive sentence: *"that only this application reads it is why it
is a record rather than a file the user is offered."* Either that sentence is SR-6's stated stopping
point, in which case SR-6's reasoning has a boundary nobody has drawn, or the list is short again.

**One case must never be swept in whichever way this goes.** `REQ-SESSION-136`'s tool-call evidence
deliberately holds **unredacted** arguments; the permission audit exports safely only because
`REQ-TOOLS-079` gives an entry no argument values at all. That is the principled line between the two
cases and it is stated in ADR-0024.

### ESC-21 — the one lock with a cross-machine obligation is the one the product cannot enforce *(raised 2026-09-01; **RULED IN DIRECTION 2026-09-01; strength pending spike 19**)*

> **Status, 2026-09-02: direction settled and carried by requirement; strength still owed to a
> measurement that is running.** ESC-21 was ruled: **the product must not promise cross-machine mutual
> exclusion it cannot enforce**, and the integration operation must detect the condition and refuse
> rather than proceed under a lock that does not lock. There was no field precedent to borrow — every
> harness surveyed is single-machine and the one with multi-device continuity uses a server this product
> does not have and does not want — so this was reasoned rather than copied. The specification now
> carries it: `REQ-GIT-128`'s second paragraph refuses the integration where the workspace is classified
> as replicated and requires the lock **not be created at all**; `REQ-GIT-124` places that refusal in its
> ordered list **ahead of** the lock check "because it is exactly the condition under which the lock the
> next check reads does not mean what it says"; and `REQ-GIT-128` forbids domain 06 making the storage
> determination again or raising a second notice — the classification is `REQ-STARTUP-166`'s and the
> notice is `REQ-STARTUP-166`'s.
>
> **Two things are genuinely still open and one of them is not a measurement.** *(a)* **Strength.**
> Spike 19 decides whether refusal or a proceed-past warning is right. ADR-0005 states that if the answer
> is a warning, one refusal becomes a confirmation and its four mechanism rules are unaffected either
> way. *(b)* **The residual the mechanism cannot reach, which no spike closes.** An unrecognised
> synchronisation client classifies as *unknown*; `REQ-STARTUP-166` makes an inconclusive determination a
> silent negative, "and a silent negative is the only safe answer to an unknown"; `REQ-GIT-128` carries
> that forward in terms — a workspace the product could not classify does not refuse either. So the
> refusal removes the **recognised** cases and no more, and the worst outcome in this record — two
> machines merging into one base branch at once, silently — remains reachable through an unrecognised
> client. ADR-0005 records this as an unclosed residual rather than hiding it, and the owner should see
> it in the same breath as the ruling that produced it.

**Where:** ADR-0005, ADR-0058; constraints C-01, W-20. **Source:** `REQ-GIT-128` against
`REQ-STARTUP-166`. **The question as it stood is kept below.**

`REQ-GIT-128` keeps the integration lock a **file** deliberately: what it protects is the base
repository, which is the user's own material and travels with the workspace, so "a second machine
reaching the same checkout must meet the same lock". Under ESC-15 the session lock became machine-local
and got **safer**; the integration lock got **lonelier**, and it is now the only lock in the product with
a cross-machine obligation.

**Exclusive create is a real primitive on a true network filesystem. Inside a file-synchronisation
client's tree it is not.** Such clients replicate after the fact, so two machines can each successfully
create the file and the conflict is reconciled afterwards — by which time both integrations have started
and both are merging into one base branch. A silent double promotion into one base branch is the worst
outcome anywhere in this record.

`REQ-STARTUP-166` is the **only** mechanism in the product that distinguishes storage another machine
reaches directly from storage an agent replicates, and it drives only a warning about the user's own
files (constraint B-24). This is the one place where that distinction changes a **safety** property, and
nothing connects the two. Options are: extend `REQ-STARTUP-166`'s determination to gate integration on
replicated storage; state the limitation in the requirement and accept it; or give the integration lock a
second, non-filesystem interlock, which is a new mechanism.

### ESC-22 — the aggregate terminal-frame rate is unbounded, and a conformance budget now depends on it *(new 2026-09-01; **RULED AND APPLIED 2026-09-02**)*

> ***RULED: bound it. APPLIED the same day.*** `REQ-MONITOR-306` is minted: live terminal output reaching
> surfaces is bounded **in aggregate** — across every live stream, of every session, delivered to every
> window — at **1,000 frames per second**, counted **per delivery**, so a stream shown in two windows counts
> twice. It cites `REQ-TOOLS-126` for the per-stream period and `REQ-TOOLS-127` for what a frame is and
> copies neither; what it adds is that **the number of live streams is not a multiplier on the per-stream
> period**, which is the whole of what this escalation said was missing. It is bounded **on frames and
> deliberately not on volume**, because a byte bound could be honoured only by discarding output, which
> `REQ-SHELL-103` and `REQ-MONITOR-294` both forbid. And it is stated as a **condition of
> `REQ-MONITOR-222`** rather than as a smoothness concern: it may not be widened, made configurable or
> raised by any per-stream setting unless `REQ-MONITOR-222` is re-measured at the new rate, and conformance
> is the **delivered aggregate rate**, never the appearance of a terminal grid. `REQ-MONITOR-287` and
> `REQ-SHELL-103` cite it and hold no copy of the figure. **The ground the owner gave is the IPC
> measurement**: transcript p95 rose sixfold at 65.5 MB/s and ninety-eightfold at 12,000 frames per second
> while staying at 1.51 ms at 999, so an unbounded rate left a load-bearing property resting on a default.
> **The entry below is kept as the statement of what was decided between.**
>
> **Re-checked against the amended corpus and unchanged.** `REQ-TOOLS-108` still reads "default 20,
> minimum 1" with **no maximum**, and `REQ-CONFIG-116` registers the key as `int ≥ 1, default 20`. The
> amendment pass did not touch either. One of the two factors in a conformance budget is still
> user-writable without a ceiling, and the three remedies below are unchanged. **Nothing about this is
> architecture's alone.**

**Where:** ADR-0021, ADR-0044; constraints T-42, X-19. **Source:**
`spikes/ipc-hop-latency.md` §6 question 2 and §7.1, against `REQ-TOOLS-108` and `REQ-MONITOR-222`.

Measurement shows a distinct Electron IPC **channel name is not a distinct transport**, so ADR-0044's
stated isolation for terminal frames does not exist as described and the architecture's whole protection
for `REQ-MONITOR-222` is ADR-0021's coalescing cap. That cap licenses an aggregate of
*(stream count × 50 frames/s)* at its 20 ms floor, and the stream count is bounded only by
`runtime.shell_max_background_sessions` — default 20, **minimum 1, no maximum** (`REQ-TOOLS-108`), each
publishing its own stream (`REQ-TOOLS-127`) — plus `REQ-MONITOR-285`'s 20 agents. **One of the two
factors in a conformance budget is user-writable without a ceiling.**

At the licensed rate nothing showed a problem (transcript p95 1.514 ms at 999 frames/s). At 12,000
frames/s it rose 97.8× to 126.207 ms. Three remedies and none is architecture's alone:

1. **State a maximum on the key** — a specification change.
2. **Impose an aggregate rate budget across streams**, which is an architecture decision but changes what
   a user who configures many background sessions observes.
3. **Adopt the direct message port**, measured holding transcript p95 at 1.119 ms under 12,000 frames/s —
   ADR-0044's and ADR-0002's, and cost without a requirement behind it.

**The failure this protects against is invisible to every detector the record has.** In the measured
collapse nothing was dropped and nothing was reordered — every one of 586,960 frames arrived, in order,
`refused = 0` — so `REQ-MONITOR-226`'s gap counter never fires and the only symptom is a stale interface.

### ESC-23 — `REQ-CONFIG-423` loses its antecedent under ESC-1 *(raised 2026-09-01; **ANSWERED BY AMENDMENT 2026-09-02, no ruling needed**)*

> **Status: CLOSED, and closed in favour of the first of the two candidate rules named below.** Both
> requirements have been amended. `REQ-CONFIG-288` no longer states the coupling in the present tense —
> it now *takes* the decision ESC-1 ruled, in its own voice: "**The composer's permission-mode control
> writes only its own key, and commits nothing else.** The decision this requirement previously handed
> over is taken here rather than left open, and it is taken against the coupling", through
> `REQ-CONFIG-441`'s scoped per-field writer, refusing outright where the target file cannot be read
> (`REQ-CONFIG-442`), with every pending Settings edit staying pending and still undone by Discard. And
> `REQ-CONFIG-423`'s antecedent is restored rather than deleted: a change to that field made while
> Settings is open "**by any other surface — the composer's control, which writes that key alone
> (`REQ-CONFIG-288`), or any other writer of it** — lands in that pending state". The dependence on the
> shared save path is gone; the pending state tracks the field however it was written. `REQ-CONFIG-423`
> additionally states why, which the entry below could not: "where a permission mode has been changed
> elsewhere and applied to a live run, a settings screen that went on showing the user's unsaved choice
> would be showing a mode no run is operating under."
>
> **ADR-0037 has not been swept against this and is stale in two places** — it says "The requirement has
> not been amended, and this record must not pretend otherwise" and treats `REQ-CONFIG-423`'s second
> sentence as having lost its antecedent. Reported under the ADR sweep rather than fixed here.

**Where:** ADR-0037; constraint G-19. **Source:** ESC-1 as ruled, against `REQ-CONFIG-423` and
`REQ-CONFIG-288`. **The question as it stood is kept below.**

ESC-1 rules that the composer's permission-mode control writes only its own key, through
`REQ-CONFIG-441`'s scoped per-field writer, and states that the decision "must not break
`REQ-CONFIG-423`". `REQ-CONFIG-423` fixes that a permission-mode change made while Settings is open **by
another surface that writes through the shared save path (`REQ-CONFIG-288`)** lands in the pending
settings state. Under the ruling the composer no longer writes through that path — so, read literally, a
composer change now lands in the file and **not** in the pending state, leaving an open Settings screen
showing a value the file no longer holds.

Two candidate rules exist and neither is stated: the composer's per-field write **also** updates the
pending settings state, or `REQ-CONFIG-423` is amended so the pending state tracks only the shared save
path. The difference is user-visible, in the same security-relevant control the ruling was made to
protect. *Related and separate:* `REQ-CONFIG-288` still states the coupling ESC-1 ruled against, in the
present tense, so an implementer reading it alone would build the coupling the owner refused.

### ESC-24 — a launch handed to an instance inside its force-exit allowance *(new 2026-09-01; **RULED AND APPLIED 2026-09-02**)*

> ***RULED: refuse the launch until exit completes. APPLIED the same day.*** `REQ-SHELL-169` is minted: such
> a launch is **refused rather than admitted**, and honoured once the shutdown has finished. Through that
> interval the instance builds no window, opens no workspace and writes nothing on the launch's behalf —
> **including the window `REQ-STARTUP-162` would otherwise have a window-less instance build**, which is the
> clause this entry identified as the trap. The refusal is **answered, never silent**, because an unanswered
> launch is the path `REQ-STARTUP-164` keeps for a process that *cannot* answer, and taking it for one that
> can would produce exactly the two simultaneous processes the refusal exists to avoid. **Domain 11 was
> amended in step so the two documents agree**: `REQ-STARTUP-164`(3) now states that an answered refusal
> stops the 5-second reclaim running at all — without which the launch would reclaim the record four seconds
> into a thirty-second allowance and become the second instance ESC-24 forbids — `REQ-STARTUP-162` gains the
> shutting-down exception to its build-a-window clause and states what a waiting launch shows, and
> `REQ-STARTUP-161` states that waiting is not a third outcome. **The owner's ground**: the force-exit
> allowance exists because a quit is already going wrong, so admitting a launch into it means two instances
> briefly exist at the one moment the product is least able to reason about its own state — and refusing is
> consistent with SR-1's own shape, in which a second launch never starts a rival process.
> **The entry below is kept as the statement of what was decided between.**
>
> **Re-checked against the amended corpus and unchanged in substance; one adjacent requirement now
> bounds it partly, which is worth stating precisely rather than letting a reader think it closed it.**
> `REQ-STARTUP-161` still releases the record "when that instance's process ends" and `REQ-STARTUP-162`
> still requires the hand-over to surface a window — and to **build** one where none is open — while
> writing nothing and reporting nothing. `REQ-STARTUP-164`(3) covers the case where the exiting instance
> **does not answer**: the launch reclaims after 5 seconds and retries once. It does **not** cover the
> case this escalation is about, which is the exiting instance **answering** the hand-over and being
> obliged to build a window in a process about to force-exit. *A second, adjacent case did close by
> amendment and should not be confused with this one:* `REQ-STARTUP-121`'s update restart now fixes the
> hand-over in terms — the record "passes from the current instance to the successor rather than being
> released for anyone to claim", and a launch arriving during it "SHALL be handed to whichever of the two
> holds the record at that moment and SHALL never start a third process". ADR-0055 meets that by argument
> rather than by construction and says so; see the gate verdict.

**Where:** ADR-0014, ADR-0055; constraints P-16, R-17. **Source:** `REQ-STARTUP-161` to
`REQ-STARTUP-164` against `REQ-MONITOR-131`.

`REQ-STARTUP-161` says the single-instance record is "released when the instance's process ends", and
during `REQ-MONITOR-131`'s 30 s force-exit allowance the exiting instance still holds it.
`REQ-STARTUP-162` then requires the hand-over to surface a window — and where no window is open, to
**build** one — while writing nothing and reporting nothing, not even an error.

Building a window in a process about to force-exit is wrong. Silently doing nothing is also forbidden.
Neither `REQ-MONITOR-131` nor `REQ-STARTUP-161` to `REQ-STARTUP-164` says which wins. Every available
answer is user-visible, and **SR-1 is what created the case**, so it belongs with the ruling rather than
with the ADR.

### ESC-25 — ESC-8's signature has no available placement, and rotation is a release commitment *(raised 2026-09-01; **ANSWERED BY AMENDMENT 2026-09-02, and answered against this entry's own conclusion**)*

> **Status: CLOSED. Both halves are settled, and the first is settled the opposite way to the one this
> entry and ADR-0054 both argued for.** This entry concluded that a detached `SHA256SUMS.txt.sig` "is not
> a thing this release may publish" and that the signature must therefore live *inside* the manifest.
> **That is withdrawn.** The specification took the third option — amend the two requirements that
> forbade it, individually. `REQ-STARTUP-032` now requires a release to publish, beside the manifest, "a
> detached signature over the manifest's exact published bytes, named `SHA256SUMS.txt.sig`", and states
> the reason the entry below missed: the manifest cannot carry a digest over a file derived from itself,
> and a detached signature leaves the manifest's bytes identical for the update path and for
> `sha256sum -c` alike. `REQ-STARTUP-152` excepts it from the naming-scheme agreement; `REQ-STARTUP-035`
> excepts it from the one-row-per-asset rule. `REQ-STARTUP-122` fixes the order — fetch manifest **and**
> signature, verify the signature, **then** parse the manifest, then stream, verify, apply — so untrusted
> bytes reach no parser of ours.
>
> **Rotation is settled too, and settled as this entry said it must be — in the build, at the release
> gate.** `REQ-STARTUP-167` fixes that every artifact carries the verification counterpart within itself,
> that the accepted set is fixed when the build is produced, and that nothing at run time may add to,
> replace or disable it. `REQ-STARTUP-168`(a) makes what a build carries **a set rather than a single
> value**; (b) requires a release to be signed with a key carried by every artifact it may be offered to,
> "decidable before publishing … and it SHALL be decided then rather than discovered afterwards", at
> `REQ-STARTUP-156`'s release gate. That is the operational commitment this entry asked the owner to see
> stated, and it is now stated. **ADR-0054 has been swept and carries the reversal**, with its superseded
> argument preserved and the reason it failed named: its premise was a requirement, and the requirement
> was amended.

**Where:** ADR-0054. **Source:** ESC-8 as ruled, against `REQ-STARTUP-152` and `REQ-STARTUP-035`.
**The question as it stood is kept below.**

ESC-8 rules that the checksums manifest is signed with a key shipped in the application. Two consequences
were not visible when it was ruled and neither is architecture's to settle.

**There is no detached signature file available.** `REQ-STARTUP-152` requires every published filename to
be a value of the one naming scheme and `REQ-STARTUP-035` allows exactly one release-body row per asset
except the manifest, so a `SHA256SUMS.txt.sig` is not a thing this release may publish. The signature
must therefore live **inside** the manifest, in a form the standard checking tool `REQ-STARTUP-032` names
still tolerates, or in the release body's manifest row. If neither placement is acceptable, **ESC-8 as
ruled is not implementable without amending `REQ-STARTUP-152` or `REQ-STARTUP-035`.**

**Rotation is a release problem, not a runtime one.** A client can only verify with the key it was built
with, so rotating strands every older client on "unverifiable" — invisible at check time under
`REQ-STARTUP-110` and visible and alarming at install time under `REQ-STARTUP-120`. The mitigation is
dual signatures across a window long enough to cover the versions in the field, which is an **operational
commitment** the owner should see stated rather than an architecture detail.
