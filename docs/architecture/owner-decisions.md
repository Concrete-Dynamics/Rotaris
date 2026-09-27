# Product-owner decisions on the architecture record

- **Status:** decided. These are rulings by the product owner, not proposals.
- **Date:** 2026-08-31
- **Scope:** escalations ESC-1 to ESC-10 as raised in [`open-questions.md`](open-questions.md), plus two
  contradictions found inside the approved design material during its import, plus the structural rulings
  recorded at the end of this document, plus ESC-11 to ESC-18, delegated by the owner to the clean-room
  manager and ruled on 2026-08-31. **Every escalation raised against the architecture record is now
  ruled.** Where a ruling is contingent on an unrun spike, the contingency is stated in the ruling.

Escalations are cited by number *and* by content, because `open-questions.md` is being revised and the
numbering may shift. Where a ruling requires a requirement to be amended, that is noted explicitly: the
amendment is authorised by this record but is not yet made.

**Where the multi-window planning rulings live — not here.** The four taken while planning the work that reaches
a project folder from inside the window (build the window builder now rather than a single-window stopgap; the
new-window route as its own gesture; the same-folder offer in place of a silent no-op; and the refusal of a
second operating-system process) are requests and directives rather than escalations. Nothing in the record
contradicted itself: the owner asked for behaviour the specification does not have, which is the one case
`docs/product/README.md`'s table sends to the directive layer. They are logged in
[`../product/requests.md`](../product/requests.md) as R-001 to R-005 and ruled in
[`../product/directives.md`](../product/directives.md) as `PD-SHELL-001` and `PD-WORKSPACE-001`. This document
stays what it has been: where a corpus that disagrees with itself is settled.

---

## Design-material contradictions

**Motion tokens.** `docs/design/system/tokens/effects.css` governs: `--rt-duration-fast` 90 ms,
`--rt-duration` 160 ms, `--rt-duration-slow` 240 ms, `--rt-shift` 3 px. The values documented in
`guidelines/motion-tokens.html` (100 / 180 / 260 ms, 4 px) and repeated in prose in `guidelines/motion.html`
are corrected to match. The design brief already declares token names normative and `styles.css` the single
entry point, so the stylesheet is the artifact every component was built against; the guideline is
documentation that drifted.

**`Card.accented`.** The shipped CSS governs: the variant recolours the kicker to accent and draws no left
rule. `Card.d.ts` and `TableCard.d.ts`, which document "the 2px accent left rule", are corrected.

Beyond preferring the artifact over its documentation, a 2 px accent left rule on cards would sit one pixel
away from the 3 px left rule that `REQ-NOTIFY-034` to `REQ-NOTIFY-043` reserve for **severity** on the
persistent notice banner and `REQ-NOTIFY-019` reserves for error presentation on toasts. Two near-identical
left rules carrying different meanings is a worse outcome than no left rule.

---

## Escalations

### ESC-1 — the shared save path between Settings and the composer's permission-mode control

**Decided: the composer control writes only its own key**, through the scoped per-field writer that already
exists for this shape of write. Pending Settings edits stay pending.

`REQ-CONFIG-288` states the current coupling and then explicitly hands the decision over. The coupling is
preserved nowhere: choosing a permission mode must not commit unrelated pending edits, because the surprise
lands in a security-relevant control. The decision must not break `REQ-CONFIG-423` or `REQ-CONFIG-418`.

### ESC-2 — configuration write-back and comments

**Decided: preserve comments.**

`REQ-CONFIG-252` states that comments and formatting are lost. A spike run for the DATA proposal showed the
document API recommended for the tri-state model keeps comments, layout and key order through a targeted
edit, and that only parse-then-re-emit loses them — so preserving them is *less* work than deliberately
discarding them, and it saves the user the comment header the bootstrap itself wrote (`REQ-CONFIG-025`).

This departs from a stated observable, which the compatibility ruling recorded in the Specification Gate
permits: the target is behavioural inspiration, not conformance to the reference. `REQ-CONFIG-252` is
amended. Key order preserved and never alphabetised (`REQ-CONFIG-248`) is unaffected.

### ESC-3 — silent loss of a review decision under last-writer-wins

**Decided: match the specification.** Silent loss on the ordinary write path; the stated report on the undo
path (`REQ-LIBRARY-116`) and where an action's target is no longer present (`REQ-LIBRARY-173`).

`REQ-LIBRARY-042` fixes the semantics and accepts the consequence deliberately. Adding a refusal to every
write where the specification has none is a larger change than the defect warrants.

### ESC-4 — a workspace with no version-control repository has no undo

**Decided: accept the gap as specified.**

`REQ-GIT-044` resolves an unmanageable tree to disabled and `REQ-LIBRARY-163` requires such a workspace to
lose only the rollback capability. A content-addressed snapshot store of our own was assessed and rejected
in ADR-0039 because `REQ-GIT-029` requires checkpoints to be ordinary commit objects and `REQ-GIT-060`
requires overwritten content to be retrievable from the safety checkpoint's commit. A second snapshot
mechanism with its own restore semantics is not worth the divergence.

### ESC-5 — the pooled terminal backend

**Decided: ship one backend.** The pooled name and its two `kill_status` values are withdrawn; the backend
field is kept for forward compatibility.

The vocabulary is closed at two values and pooled-recovery behaviour is specified in detail, but nothing
states when a pooled backend is used, whether it must exist, or what selects it. It would also be POSIX-only
while Windows mandates a different shell, and the two backends are required to be observationally identical
apart from the name. `REQ-TOOLS-099`, `REQ-TOOLS-100`, `REQ-TOOLS-103` and `REQ-TOOLS-187` are amended.

### ESC-6 — Windows users get no confinement

**Decided: accept the specification for the first release**, and document it plainly on the settings surface
and in the launch advisory rather than only in a remediation string.

`REQ-SANDBOX-065` closes the platform set at two identifiers and forbids adding one; `REQ-SANDBOX-048`
forbids an opportunistic mode. A Windows user therefore runs every agent command unconfined, and an
unattended permissive run on Windows is always downgraded unless the opt-out key is set.

**This ruling is provisionally revisited** under the structural-soundness review (see below): running an
autonomous agent unconfined on the product's most common desktop platform is exactly the kind of inherited
constraint that review exists to challenge. Admitting a third platform identifier extends
`REQ-SANDBOX-127`'s real-host conformance obligation to a third continuous-integration platform, which is
the real cost.

### ESC-7 — the plugin language

**Decided: change the plugin language** to modules the host can genuinely import in-process. `REQ-TOOLS-165`
and the workspace layout are amended; the `*.py` extension is withdrawn.

`REQ-TOOLS-163` requires plugins to execute "inside the host process with exactly that process's OS
privileges", and ADR-0001 chose TypeScript on Node. Changing the language is the **only** option that
satisfies `REQ-TOOLS-163` as written, and it costs nothing in bundle size or supply chain. Bundling an
interpreter in a sidecar would cost tens of megabytes, a second signing and update surface, and a fifth
process kind, in exchange for preserving a file extension.

### ESC-8 — what the update path establishes

**Decided: sign the checksums manifest with a key shipped in the application.**

`REQ-STARTUP-021`, `REQ-STARTUP-023` and `REQ-STARTUP-123` leave binaries deliberately unsigned, so the
update path establishes *what* was downloaded and nothing about *who* published it, over the same connection
the download came from. Signing the manifest gives publisher authenticity for updates, is materially cheaper
than full code signing and notarization, and does not change first-launch platform warnings. The signing key
and its rotation story are an architecture obligation, recorded against ADR-0054.

### ESC-9 — session retention

**Decided: leave retention unbounded and add the derived read index** ADR-0003 keeps as a named escape
hatch, outside the sessions tree and never on a correctness path.

Nothing is ever deleted, so no user loses history; the session browser and history surface stay inside
`REQ-SHELL-150`'s 100 ms gesture budget. This is purely an architecture decision and forecloses neither an
unbounded-and-slow product nor a later user-visible retention preference.

### ESC-10 — controlling a run owned by a second application instance

**Decided: refuse the control, with a reason naming the owning process.**

Consistent with `REQ-MONITOR-005`'s "a `false` outcome states the operation did not happen" and with
`REQ-SESSION-183`'s existing pid and host vocabulary, and it requires no new mechanism. A filesystem control
mailbox is rejected outright: the session-directory root is closed by `REQ-SESSION-001`, and a command
channel over the filesystem is a pattern this product does not adopt.

**Superseded in part** — see below. Under the single-instance ruling, a second application instance holding
a session ceases to exist as a normal case, and this refusal becomes a defence against a state that should
not arise rather than a routine user-visible behaviour.

---

## Standing direction: inherited structure is not a reason

The product owner has directed that patterns carried over from the reference product's shape are to be
challenged rather than reproduced:

> If we are already rewriting my Rotaris app, there is no need to take over bad structural decisions,
> communication patterns and architectural choices.

This is a **standing amendment to the requirement-amendment policy**. Where a requirement encodes a
structural choice that follows from the reference product being a multi-process command-line and terminal
tool, and this product is one graphical desktop application, the requirement is a candidate for amendment
rather than a constraint to design around. The Specification Gate already permits divergence for behavioural
conflicts; this extends the same latitude to structural ones.

It does **not** license divergence for convenience, for implementation difficulty, or from requirements that
encode a genuine product behaviour the owner wants. The test is whether the requirement exists because of a
process model this product does not have.

---

## Structural rulings under the standing direction

The first three findings of that direction, ruled on 2026-08-31. Together they remove filesystem-mediated
communication from the product entirely. Files remain the system of record; they are no longer a transport.

### SR-1 — one running instance

**Decided: a second launch of the application surfaces the running instance rather than starting a rival
process.** Multiple workspaces and multiple windows remain fully supported; they are windows of the one
instance.

This is the root change. `REQ-SESSION-159` named three cases in which a session runs in a process other
than the one displaying it — a second window of this application, another instance opened on the same
workspace, and a run detached into the background. Under the architecture's process topology the first and
third are already inside one process tree and reach the session over the internal channels. Only the second
required the filesystem, and it no longer occurs.

### SR-2 — a run this application does not own cannot be viewed

**Decided: a session is either live and owned by this application's run host, or it is not running and
exists as a persisted record.** There is no third condition. A session that is not live is opened from its
record and may be continued.

A session left behind by a crash or a force-quit is *stale*, not foreign: the existing lock-reap path
(`REQ-SESSION-047`, `REQ-SESSION-058`, `REQ-SESSION-183`) settles it, after which it opens as an ordinary
persisted session. Nothing becomes permanently unreachable — a session is unreachable only while another
process is running it, and no other process can now be running it.

This withdraws the live tail-following protocol: the resumable byte-offset read, the restart flag, the
truncation-marker dropped-count comparison, the placeholder-row gap filling and the re-seed-without-
observable-empty rule. `REQ-SESSION-159`'s closing guarantee — that following a session and reopening it
afterwards produce identical transcripts — becomes trivially true, because only one derivation remains.

**The event journal is unaffected.** `evidence/events.jsonl` stays byte-identical to the wire
(`REQ-EVENTS-079`, `REQ-EVENTS-080`), stays comparable as a file by conformance requirements
(`REQ-EVENTS-166`, `REQ-MONITOR-299`), and is now the durable anchor for the persist-before-publish rule.
What is withdrawn is the protocol for *following* it live from another process, not the file.

### SR-3 — no polling

**Decided: the polling cadences are withdrawn.** `REQ-MONITOR-287`'s 750 ms foreign poll goes with the
feature it served. `REQ-MONITOR-288`'s 2000 ms local reconcile poll is replaced by **monotonic per-session
sequence numbers on view updates, with gap detection**: a surface that observes a gap knows immediately it
missed an update and reconciles from a whole-state read.

That is strictly stronger than the poll it replaces — detection is immediate rather than up to two seconds
late, and it costs nothing while nothing is lost. It also composes with the existing rule that an apply
stage which cannot correctly apply an increment declines it and re-renders from a whole read.

`REQ-SESSION-071` already forbids re-reading persisted state on a timer as a way to follow a run. That rule
now has no exception.

**On the diagnosis:** polling here is not an artifact of an implementation language. It is an artifact of a
*process model*. Independent processes sharing only a filesystem have no channel to push over, so they
poll. This is the signature to look for in the remaining audit: wherever the record assumes two processes
that cannot talk to each other, there is a fossil.

### SR-4 — a database is the store for what only the application reads

**Decided: the product uses a database for application-owned session data, and files for everything a
human, another tool, or version control is meant to read.** ADR-0003's "files are the system of record;
there is no database anywhere in the product" is reversed in part and rewritten.

**The principle, which is what makes this decidable later rather than a list to memorise:**

> A **file** when a human or another tool is meant to read or edit it, or when version control must
> track it. A **database row** when only the application reads it and it is high-volume, queried, or
> transactional.

| What | Where |
|---|---|
| Sessions: metadata, session state, transcript rows, the event history, the timeline, evidence, the permission audit, the delegated-child ledger, the checkpoint index, delivery records, the improvement library | **database, one per workspace** |
| Configuration, personas, model slots — the things a user edits, and whose comments matter (ESC-2) | **YAML under `.rotaris/`, visible to version control** |
| Requirement documents, the generated symbol artifact, baselines, the tombstone log | **plain files in the user's own repository** — their versioned material, unchanged |
| Global configuration, the discovery snapshot, desktop preferences | **per-user configuration and data directories** |
| Artifacts, attachments, images | **on disk, referenced by row — never stored as blobs** |
| Provider credentials | **individual protected files.** `REQ-PROVIDER-016` requires `0600` plus an explicit Windows access-control list, read back. That is a filesystem guarantee a row cannot make |

**The event history stays exportable.** `REQ-EVENTS-166` requires a stored history to yield every field to
a stock parser on a machine with none of this product's code present. That obligation is honoured by an
**export**, not by the write path: the user can always get their history out in a plain line-delimited
format. What is withdrawn is line-delimited JSON as the *runtime write path*, not the guarantee.

**Why, in one paragraph.** Three of the four arguments that produced the no-database verdict do not survive
inspection. `REQ-CONFIG-192`'s unmigrated-record rule is an argument about *configuration*, which stays in
files. `REQ-MONITOR-299`'s entry-by-entry directory comparison is a conformance-test methodology encoded as
a product requirement, and a fossil under the standing direction. "A database is a second copy that can
disagree with the contract copy" assumes its own conclusion — it is only true if the files are kept as
well. And `REQ-TRACE-502` is not satisfied by the file design either: OQ-41 records that on Windows an
ordinary *reader* blocks an atomic replace, and under `REQ-GIT-145`'s unbounded concurrency those read
windows overlap continuously, so a regeneration fails "because another invocation was running" in the
requirement's own words.

> **Correction, 2026-08-31.** An earlier version of this ruling concluded that the defect "is unreachable
> in a store whose readers do not block its writers", and listed OQ-41 among what the database dissolves.
> **That reasoning is wrong and must not be cited.** The artifacts `REQ-TRACE-502` governs — the
> requirement documents, the baselines, the generated symbol artifact and the tombstone log — are the
> user's version-controlled material and stay **files** under this ruling's own table. They never reach
> the database, so the database's concurrency properties do not touch them.
>
> The conclusion is nearly right by a different route: **SR-1** removes the premise the defect rested on.
> Unbounded concurrent *processes* on one workspace can no longer exist, so the overlapping read windows
> that made retry exhaustion continuous are gone. That is a sharp **narrowing, not a dissolution**, and a
> residue remains — a user-visible failure in a user-initiated action on Windows, recorded as ESC-14 and
> OQ-44. What survives as an argument here is only that objection 1 was never a good reason to keep
> files. It is not a claim that the database fixes it.

**What this dissolves rather than fixes:** the writer's-handle discipline of ADR-0004 rule 3 and constraint
D-28; the compaction paths that rename over a held append handle; the truncation marker and the byte-offset
restart detection; the two incompatible retry ladders of OQ-11; and the ten-second debounce that made
persist-before-publish collide with `REQ-MONITOR-218`, since rows are written individually rather than by
rewriting a whole file. **Not OQ-41** — see the correction above.

**What it costs, recorded so it is not discovered later:** ADR-0003 and ADR-0004 are foundational and
everything numbered above them inherits the change. On the specification side it withdraws or amends the
fixed session-directory layout and the line-delimited byte-format requirements — a second amendment pass.
And a database file is a single corruption domain where per-session directories lost one session at a
time; scoping the database per workspace bounds the blast radius, and that must be **stated in the
decision record rather than assumed**.

### SR-5 — a workspace held by another machine is refused, and that refusal is a safety feature

**Decided: refusal is intended.** SR-1's "one running instance" is one instance *per machine*. A workspace
on shared or synchronised storage, opened from a second machine, presents a session lock naming a host
this instance cannot probe. It cannot prove the lock unheld, so it does not reap it: the session is
refused as a pre-run failure that does not steal the holder's lock, reporting the session identifier with
the process identifier and host the lock records (`REQ-SESSION-083`), with explicit release as the only
remedy (`REQ-SESSION-183`).

The host field of `REQ-SESSION-046`, the cross-host vocabulary of `REQ-SESSION-054` and
`REQ-SESSION-056`, the explicit-release path of `REQ-SESSION-183`, and `REQ-GIT-093` **all stay**.

**Why this is not merely tolerated.** The question was raised before SR-4 was applied, and SR-4 changes
the answer. A database on network or file-synchronised storage is a well-known corruption vector, because
the locking primitives such a store depends on are not reliable there. Detecting that a workspace is held
by another machine therefore stops being an awkward edge case and becomes a **safety check**. Declaring
the configuration unsupported and shrinking the host vocabulary would mean the product no longer detects
the situation at all — and a silently corrupted workspace database is a far worse outcome for a user than
a loud refusal.

**On SR-2's "nothing is ever unreachable".** That statement is qualified rather than contradicted: a
session is unreachable only while another owner holds it, which is the same rule that has always applied.
What is new is that the other owner may be on a machine whose liveness this instance cannot establish, so
the refusal cannot be resolved by reaping and requires a person.

**Two refinements adopted with this ruling.** The first follows from it directly; the second is an
addition, recorded separately so it can be reversed on its own:

1. The refusal must convey **what is actually wrong** — that the workspace is open on another machine —
   rather than reporting a lock conflict and leaving the user to infer it from a host name.
2. **New:** the product should detect shared or synchronised storage *directly* rather than only
   noticing it when a lock collides, and warn about it. Under SR-4 the risk is to the workspace database
   itself and is not limited to sessions another machine happens to be running. This needs a new
   requirement and is not merely an amendment.

### SR-6 — the export obligation covers every record a user could previously read for themselves

**Decided (ESC-17): extend the export.** SR-4 gave the event history an export in a stock, line-delimited
format so `REQ-EVENTS-166`'s guarantee survived the move off files. That same obligation now covers **the
timeline, the issues file, the metrics document and the permission audit**, each in a format a stock tool
can read, and each reachable whether or not the session is live.

**Why this and not the reduction.** `REQ-SESSION-191` currently keeps these reachable by revealing the
session directory in the platform's file manager — an affordance that means nothing once the records are
rows. Without an export, moving them into the database is a straight reduction in what a user owns about
their own runs. That matters most for the **permission audit**, which is exactly the record a user
consults *when they do not trust this application's rendering of events*. An audit log only this
application can read is a materially weaker audit log, and no amount of good faith in the renderer
substitutes for being able to check.

Widening the export is cheap: the mechanism already exists for the event history, and it is the same
obligation applied to four more record kinds rather than a new one.

**Consequences.**

- `REQ-SESSION-191` needs amendment. Its "reveals the session directory in the platform's file manager"
  action no longer reaches the timeline, issues, metrics or audit records, and the requirement must state
  the export in its place. `evidence/debug.log` stays a file (ADR-0003's worked examples place it there,
  citing `REQ-SESSION-142`), so the log half of the requirement survives unchanged.
- The export must not itself become a way to observe a live run, which `REQ-SESSION-071` forbids on a
  timer and SR-2 forbids through a second derivation. It is a user-initiated action producing a file, not
  a channel.
- The permission audit's export inherits the audit's own integrity obligations: whatever ordering and
  append-only character the record has in the store must be evident in what is exported, or the export
  is decorative.

---

## Escalations ESC-11 to ESC-18 — ruled 2026-08-31

Delegated by the product owner to the clean-room manager. Where a ruling is contingent on a measurement
that has not been taken, the contingency is stated rather than hidden.

### ESC-11 — the Linux artifact's runtime

**Decided: ship on the stable line with the runtime pinned explicitly (option 2); if that line does not
permit pinning, ship on the pre-release line (option 1).** Options 3 and 4 are refused — option 3
contradicts `REQ-STARTUP-024` as written, and option 4 is forbidden by `REQ-STARTUP-031`'s closed
four-artifact set. Spike 12 establishes whether pinning is possible; it is a choice between 2 and 1, not a
reopening.

The deciding argument is not packaging convenience. The legacy image runtime **disables the shell's own
process sandbox unconditionally** on a distribution that restricts unprivileged user namespaces, where the
static runtime disables it only where namespaces are genuinely unavailable. ADR-0002 makes the sandboxed
renderer load-bearing: the transcript renders Markdown a model wrote and the terminal grid renders bytes an
arbitrary process wrote. "Linux users get that surface unsandboxed" is a **different product**, not a build
flag.

**Separately, and independent of which option is taken:** `REQ-STARTUP-156`'s release gate runs on a
machine the release owner controls, not on the unmodified baseline `REQ-STARTUP-024` names — so the gate
can pass while the requirement fails. That is a defect in the gate regardless of this ruling and must be
amended.

### ESC-12 — the tool-server protocol era floor

**Decided: the 2.x line with the pre-2026 offered-version entries retained (option 1).** This is ADR-0033's
own recommendation and it gives the widest server compatibility.

The stated cost — resting the product's tool story on a major release that is one month old — is real but
recoverable, and it decays with time. The alternatives are not: option 3 breaks every 2025-era server a
user already has, and option 2 makes current-era servers present as servers offering **no tools** rather
than as an error, which is the worst possible failure presentation. What a user observes differs under all
three and the choice is not cheaply reversible once configurations exist, so prefer the one that breaks
nothing.

### ESC-13 — the benchmark invariant against screen-reader access

**Decided: accessibility wins, and this is ruled now rather than left conditional on OQ-28.** If OQ-28
resolves to the framework-neutral reading, then `REQ-UIBENCH-054` is **relaxed** (option 2). The canvas
(option 3) is refused outright.

A canvas forfeits native text selection, keyboard navigation and per-row accessible names — all hard
requirements (`REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065`, `REQ-SHELL-144`) — and its failure mode is
that a screen-reader user cannot read the conversation. `REQ-UIBENCH-088` makes the element-count
invariants **informational** under either reading. Trading a blind user's access to the product for an
informational benchmark number is not a trade this product makes, at any exchange rate.

**This ruling de-blocks OQ-28.** That question stops being existential for ADR-0045 and becomes what it
should have been: a definitional question about how a number is counted, whose answer changes a benchmark
field and nothing a user can see.

### ESC-14 — corrections to SR-4's own reasoning

**Decided: option 1, correct the paragraph. Already actioned** — see the correction block inside SR-4
above. The decision stands on the three arguments that hold; the OQ-41 claim is withdrawn and the
`REQ-CONFIG-192` phrasing tightened. Nothing about the storage decision changes.

### ESC-15 — a workspace on a network share or in a cloud-sync folder

**Decided: the workspace database is stored machine-locally and always, keyed by a workspace identifier
that travels with the workspace.** It does not live at `<workspace>/.rotaris/workspace.db`.

**This reverses ADR-0058's scope decision and that ADR must be rewritten accordingly.**

The problem is not slowness. A store on such a filesystem can fail in a way that leaves **no session in that
workspace able to start at all**, where under the file design the workspace worked, merely slowly. This is
the single most likely way a real user meets an SR-4 regression, and a corporate user may be in this
position by default without knowing it.

> **Correction, 2026-09-02 (GD-2). The reason this ruling originally gave is false, and the truth is worse
> than the claim it replaces. The ruling stands unchanged.**
>
> This section originally read: *"Write-ahead logging is unsupported on network filesystems, so the store
> opens read-only; acquiring a session lock is now a write; therefore no session in that workspace can start
> at all."* Spike 19 measured **both clauses false**. Write-ahead logging succeeded on a UNC path over SMB
> in 320 process-trials with zero errors: `PRAGMA journal_mode = WAL` returned `wal`, the read-back ADR-0058
> prescribes returned `wal`, and the 32 KiB shared-memory segment WAL requires was obtained over SMB. The
> store never opened read-only in any measured configuration — `db.readonly` was `false` in every network
> case.
>
> **What was measured instead, and why the conclusion is firmer rather than weaker.** Three failures, each
> worse than the one originally claimed. A store can report WAL enabled, read it back as WAL, own a valid
> shared-memory segment, and still fail its next write with a disk I/O error — with the failed write
> *silently absent* from the following read, so the store reports a row count that never included it.
> The condition is **path-spelling dependent**: the same share succeeds addressed as a UNC path and fails
> addressed through a mapped drive letter, which means whether a user's workspace works depends on how they
> happened to spell the path to it. And a store can open with `db.readonly` false and have its reads fail
> too. A failure that is loud, immediate and identical everywhere — which is what the original reason
> described — is a far easier thing to build against than one that reports success and loses the write.
>
> Always-local remains the answer for the reasons the rest of this section gives, and the measurement
> strengthens the one about detection being unreliable: a conditional path would now have to detect not
> "this is a network filesystem" but "this is a network filesystem addressed in a spelling that fails".

**Why relocate always rather than only on detection.** Detecting "this directory is inside a sync client's
tree" is unreliable — OneDrive and Dropbox folders look like ordinary directories, and detection would have
to be maintained against every client. A conditional path also means two storage layouts to build, test and
support. Always-local is one layout that is always correct.

**Why this is coherent rather than a workaround.** SR-5 already established that sessions are effectively
machine-bound: a session held by another machine is refused because its liveness cannot be established. A
machine-local session store is the honest expression of a property the product already has. Meanwhile the
user's own material — the repository, the requirement documents, the configuration — stays exactly where
they put it and synchronises perfectly well, because syncing a git repository is ordinary and syncing a
live database file is not.

**The cost, and its mitigation.** A machine-local store does not travel with the workspace, so moving or
renaming a workspace folder would orphan its sessions. Mitigated by writing a small, stable, human-readable
**workspace identifier** into `.rotaris/`, which *does* travel with the workspace and synchronise. The
database is located by that identifier, not by path. Moving the folder keeps the sessions; two machines
holding the same synchronised workspace each keep their own local session history, which is correct under
SR-5 rather than a compromise.

Spike 19 is retained, but its question changes: it no longer asks whether a synced workspace is usable, but
whether anything *else* the product writes into `.rotaris/` misbehaves on synchronised storage.

### ESC-16 — a store that will not open means no run at all

**Decided: accept the refusal.** The session refuses to start, with a stated reason naming the store and
the engine's own error. `REQ-SESSION-089` and `REQ-EVENTS-084` are amended.

`REQ-SESSION-089` requires a run to proceed with a logged warning when the durable event store cannot
open. That partial-failure mode no longer exists, because the event store, the session state and the lock
are now one object — there is no longer a coherent state in which the run has somewhere to record itself
but not somewhere to be recorded. Running while quietly unable to persist anything, and reporting that as
a warning, is a worse outcome for a user than not starting: it produces work whose record cannot be
recovered.

### ESC-18 — ESC-3 has been overtaken

**Decided: accept the improvement.** Under a transaction, `REQ-LIBRARY-042`'s read-modify-write becomes
atomic and two genuinely interleaved review decisions can no longer lose one another.

ESC-3 was ruled "match the specification: silent loss on the ordinary write path". Every guarantee
`REQ-LIBRARY-042` states still holds; what has become unreachable is the *defect* the requirement
accepted. Reintroducing a race in order to remain bug-compatible is not a thing this product does, and the
compatibility ruling recorded in the Specification Gate does not ask for it. `REQ-LIBRARY-042`'s closing
concession is amended to record that the store now makes the interleaving impossible.

### SR-7 — the onefile portable extracts once to a cache

**Decided: the single-file Windows portable extracts to a cache on first run and launches from that cache
thereafter.** `REQ-STARTUP-013`'s single-executable observable and `REQ-STARTUP-031`'s closed artifact set
are **unchanged**. `REQ-STARTUP-155` gains a stated first-run exemption for onefile artifacts.

**The evidence.** Spike 17 measured first paint on the portable at **13,287–19,580 ms** against a 5,000 ms
budget, at every bundle weight tested **including a zero-payload build**, with no packaging setting that
closes the gap (deflate 7,433 ms; uncompressed 5,307 ms). The same payload installed as a directory tree
paints in **664–1,561 ms**, and 1,232–1,593 ms with a cold cache from a path never launched before. The
Electron runtime is not the problem; re-extracting an archive on every launch is.

**Why this option.** The alternatives each surrender something the specification deliberately fixes.
Amending the budget needs at least **17.5 s**, which is not a product anyone wants. Amending
`REQ-STARTUP-013` and `REQ-STARTUP-031` gives up "a single executable file that runs with no support tree
beside it", which is the whole observable a portable exists to provide. Extract-once keeps both and pays
the cost exactly once, which is also what users already expect from portable applications.

**What must be decided with it, and is:**

- **The cache lives in the per-user local application data directory, never beside the executable.** A
  portable artifact must run from read-only or removable media — that is its purpose — so a cache beside
  the executable defeats the artifact. This is consistent with ESC-15's ruling that machine-local state
  belongs in machine-local storage.
- **Keyed by artifact version and content digest**, so a new version extracts fresh rather than running
  stale code, and a superseded cache is identifiable for reclamation.
- **A partial, corrupt or unreadable cache re-extracts** rather than failing. Extraction is the recovery
  path, so it must never be the failure path.
- **"First run" means first run of a given artifact version**, and the exemption `REQ-STARTUP-155` gains
  must say so, or a reader will take it to mean first run ever.

> **Correction, 2026-09-02 (GD-2). The evidence above stands unchanged. One mechanism this ruling relies on
> does not exist, and is replaced.**
>
> This ruling depends on a launch being able to identify the artifact it started from, and the record
> assumed the packaging tool's own portable-executable environment variable would carry it. Spike 20
> measured that variable **null in 0 of 157 launches** through our launcher — all three of its spellings.
> The tool sets it only when the tool's own portable stub is the thing that runs, and under extract-once it
> is not: our launcher is. The variable was confirmed present and correct when the tool's stub *does* run,
> so this is a consequence of the ruling rather than a fault in the tool.
>
> **The replacement was measured in the same run.** The launcher's own declared variable carried the correct
> absolute artifact path in **149 of 149** launches that painted, and `process.execPath` reported a location
> inside the cached preparation in the same 149 of 149. Identification is therefore by our own declared
> variable, which we set and can rely on, and never by the packaging tool's.
>
> Nothing about the decision moves: the timing evidence that chose extract-once is untouched, and so is
> every bullet above. What moves is which mechanism `REQ-STARTUP-165`(e) and `REQ-STARTUP-106` are satisfied
> by.
- **Self-update is unaffected in intent but not in mechanism.** `REQ-STARTUP-106` and `REQ-STARTUP-125`
  target the running executable file. Spike 15 already established that under the portable flavour
  `process.execPath` points into the extraction directory rather than at the artifact; under a cache it
  points into the cache. The artifact is identified by the packaging tool's own portable-executable
  environment variable, not by `execPath`. This must be stated in ADR-0054 rather than discovered.

**Spike 20 is required before the gate:** the cached-launch figure, the cost of the version check on the
fast path, and cache invalidation across an update. The 0.7 s file-copy baseline says the target is
reachable; it has not been measured on this mechanism.

### SR-8 — REQ-ORCH-155's 100 ms is a percentile, not an absolute bound

**Decided: read as a p95, and amend the requirement to say so.**

Spike 10 measured the whole-session-update path at **p95 5.95 ms** unloaded and 7.81 ms under 65.5 MB/s of
terminal frames — 8× to 40× inside the budget. Read as an *absolute* bound the same data fails: 24 of
9,000 samples exceeded 100 ms, worst 125 ms unloaded. The requirement states no percentile, so the spike
reported both readings and declined to choose.

The absolute reading is not merely expensive, it is **unsatisfiable in principle**. No userspace program on
a preemptive multitasking operating system can bound the latency of every sample over an unbounded run:
scheduler preemption, garbage collection and paging are all outside the application's control. A
requirement that cannot be met by any implementation is not a requirement, it is a defect. The percentile
reading is therefore the only coherent one, and it is met with a wide margin.

The amendment must state the percentile explicitly rather than leave it inferred, since `REQ-MONITOR-222`
already states one and the silence in `REQ-ORCH-155` reads as deliberate contrast.

### SR-9 — two gaps the specification pass exposed in SR-4 and SR-6

Both were found by tracing guarantees rather than requirements, and neither is covered by an earlier
ruling.

**(a) The export list was too short by SR-6's own reasoning. Extended.** Improvement artifacts were
readable JSON under `.rotaris/improvement_artifacts/`, and delivery records were readable files under
`.rotaris/requirements/`. SR-4 makes both rows, and neither had an export. SR-6's argument — that moving
records a user could previously read for themselves into rows is a straight reduction in what a user owns
about their own runs — reaches these two exactly as it reaches the permission audit. The improvement store
additionally carries the recorded version history `REQ-LIBRARY-168` calls "the audit trail the write path
keeps", which is the same phrase that made the permission audit SR-6's strongest case.

**Both gain an export on the same terms as the four in SR-6.** This is an extension of SR-6 to cases its
reasoning already covered, not a new decision.

**(b) A machine-local store changes what a backup protects, and nothing tells the user. New requirement.**
Under the file design, backing up or synchronising a workspace backed up its session history. Under
ESC-15 it does not: the workspace travels, the sessions stay on the machine. The exports are now the only
way a user carries history anywhere durable.

This was never stated as a requirement, so nothing was strictly lost — but it is a **new user-visible
property that nobody owns**, and the failure mode is a user who backs up their workspace, restores it, and
discovers their session history was never in it. A requirement is minted so the product states the
property rather than letting a user infer it from an absence.

**This is the minimum honest fix and it is deliberately not the only option.** If the product owner would
rather solve it structurally — a configurable store location, or an explicit backup action covering the
whole store rather than per-record exports — that is a larger decision and this ruling does not foreclose
it. Recorded as reversible.

---

## Escalations ESC-19 to ESC-21 — ruled 2026-09-01, against comparative evidence

The product owner asked for these to be decided by comparison with how other coding harnesses solve the
same problems, rather than from first principles. Seven were examined: Claude Code, Codex CLI, Cursor CLI,
Amp, opencode, pi and Hermes. Sources are listed at the end of this section.

### What the field actually does

| Harness | Where session history lives | Format | How a project is keyed |
|---|---|---|---|
| Claude Code | `~/.claude/projects/<encoded-path>/*.jsonl` | line-delimited JSON | **encoded absolute path** |
| Codex CLI | `~/.codex/sessions/<date>/rollout-*.jsonl` | JSONL **plus a SQLite index** | generated id, no project key |
| Cursor CLI | `~/.cursor/chats/<id>/<uuid>/store.db` | **SQLite** | generated ids |
| Amp | `~/.local/share/amp/threads/*.json` + server | JSON, server-authoritative | thread id |
| opencode | `~/.local/share/opencode/opencode.db`, `%LOCALAPPDATA%` on Windows | **SQLite, WAL** | **a `project` row in the database** |
| pi | `~/.pi/agent/sessions/--<cwd>--/*.jsonl` | JSONL | **encoded absolute path** |
| Hermes | `~/.hermes/state.db` | **SQLite, WAL, FTS5** | session rows |

**Three findings, all of which bear on decisions this record has already taken.**

**Machine-local is universal.** Not one of the seven stores session history inside the user's project.
ESC-15 is not a deviation; it is what every comparable product does. opencode uses `%LOCALAPPDATA%` on
Windows — the same non-roaming location ADR-0058 chose, and for the same reason.

**SQLite is the majority and the direction of travel.** Four of seven use it, and three of those *migrated
to it*: opencode moved from JSON files to SQLite, Hermes replaced per-session JSONL with `state.db`, and
Codex added a SQLite index beside its rollouts. Hermes runs WAL "with fallback behaviour for filesystems
that cannot support WAL coordination" — the precise hazard ESC-15 identified. SR-4 is the consensus
position, not an experiment.

**The path-keyed tools have a documented, filed, painful bug — and we have already avoided it.** Claude
Code issues #33634 and #33636 record sessions being lost when a project directory is moved or renamed; one
user lost 63 sessions across 10 projects after reorganising repositories, and *even changing a folder
name's case* orphans everything. Roo Code has the identical defect, and the fix its users ask for is "a
stable `.rooprojectid` file". That is exactly what ADR-0058 already decided — a random identifier in
`.rotaris/`, deliberately not derived from the path. **This record solved the field's most-complained-of
storage defect before shipping.** That is a decision to protect against a later simplification, not to
revisit.

### ESC-19 — the backup disclosure

**Decided: option 1 *and* half of option 2. Mint the disclosure requirement, and add a whole-store backup
and restore action. The configurable store location is REFUSED.**

The comparison splits option 2 into two separable things, and they have opposite evidence.

**A whole-store backup action is proven and cheap.** Hermes ships `hermes sessions backup`, built on the
store engine's own online-backup facility so it is correct *while the application is running* and safe
under write-ahead logging. It also keeps `backups/` and `state-snapshots/`. This is the right shape and we
should copy it. It does not violate `REQ-SESSION-199`'s no-duplicate-export rule, because it is a
different artifact for a different purpose: an **export** is readable by other tools, a **backup** is
restorable by us. Per-record exports were never a backup story and SR-9(b) was right that the product
currently has none.

**A configurable store location is offered by nobody, and would re-create ESC-15.** No comparable product
lets a user relocate the session *data* store. What several offer — `CLAUDE_CONFIG_DIR`, `CODEX_HOME`,
`PI_CODING_AGENT_DIR` — relocates the whole configuration directory, and the comparative survey flags
these as a hazard precisely because they "silently relocate stores" into places like Dropbox and iCloud. A
user pointing our store at a share reproduces the total outage ESC-15 exists to prevent. Refused.

**Therefore ADR-0058's location decision does NOT reopen.** The condition the registrar attached to that
reopening — taking the structural option — is not met, because the half of it that was worth taking does
not move the store.

### ESC-20 — the export list, and where SR-6's reasoning stops

**Decided: mint SR-9(a)'s two exports, and draw the boundary on redaction safety rather than on
readership.**

`REQ-TOOLS-190` currently stops the list with a *readership* argument: "that only this application reads it
is why it is a record rather than a file the user is offered." That is the wrong test, and SR-6's own
reasoning defeats it — SR-6 exists precisely because records only this application reads are still records
a user owns.

**The right test is safety, and the record already states it.** The permission audit exports safely
*because* `REQ-TOOLS-079` gives its entries no argument values. `REQ-SESSION-136`'s tool-call evidence
deliberately holds **unredacted** arguments and must never gain an export, under any later widening. The
comparison confirms this is the field's live hazard: Codex rollouts are documented as carrying "prompts,
command output, file paths, code, and accidental secrets", and opencode's export command ships a
`--sanitize` flag for exactly this reason.

So: **a record gains an export when it carries no unredacted user or tool content, and does not when it
does.** Under that rule `REQ-TOOLS-190`'s verification-gate record gains one, and `REQ-SESSION-136` never
does. That is the boundary SR-6 lacked, stated once.

### ESC-21 — the integration lock on synchronised storage

**Decided in direction, with strength pending spike 19: the product must not promise cross-machine mutual
exclusion it cannot enforce.**

There is no field precedent to borrow — every harness surveyed is single-machine, and the one with
multi-device continuity (Amp) achieves it with a server, which this product does not have and does not
want. So this is ours to reason about rather than to copy.

Exclusive create is a genuine primitive on a network filesystem and is **not** one inside a
file-synchronisation client's tree, because such clients replicate after the fact and both machines can
succeed. `REQ-GIT-128` keeps the integration lock a file specifically so a second machine meets the same
lock; on synchronised storage that guarantee is false rather than weak.

The ruling: the integration operation must **detect** the condition and refuse rather than proceed under a
lock that does not lock. This composes with SR-5, which already requires synchronised storage to be
detected directly. Spike 19 decides whether refusal is the right strength or whether a warning suffices;
it does not reopen the direction.

### A consequence for ADR-0058 the comparison surfaced

opencode's ecosystem records `better-sqlite3` **failing silently under an Electron runtime** through a
native-module ABI mismatch, with the error swallowed. ADR-0058 chose `better-sqlite3`. The build toolchain
must rebuild it against the Electron ABI (ADR-0056), and a store that cannot load must fail **loudly** on
`REQ-SESSION-089`'s terms rather than be caught and degraded. Recorded so it is designed for rather than
discovered.

### Sources

- [Where Six AI Coding CLIs Store Your Session Logs](https://allaboutcoding.ghinda.com/where-ai-coding-clis-store-session-logs/)
- [Session Storage | Hermes Agent](https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage/)
- [Storage and Database | sst/opencode | DeepWiki](https://deepwiki.com/sst/opencode/2.9-storage-and-database)
- [Rollout Persistence and Replay | openai/codex | DeepWiki](https://deepwiki.com/openai/codex/3.5.2-rollout-persistence-and-replay)
- [Sessions lost when project directory is moved or renamed · anthropics/claude-code#33634](https://github.com/anthropics/claude-code/issues/33634)
- [Sessions lost when project directory is moved or renamed · anthropics/claude-code#33636](https://github.com/anthropics/claude-code/issues/33636)
- [Chat history keyed to absolute project path · RooCodeInc/Roo-Code#6618](https://github.com/RooCodeInc/Roo-Code/issues/6618)
- [Codex session logs grow to 700MB-2GB · openai/codex#24948](https://github.com/openai/codex/issues/24948)

### ESC-26 — a restore may establish the workspace identifier, on explicit confirmation, and only there

**Decided: `REQ-SESSION-197` gains one narrow exception. A restore MAY establish the workspace identifier
when the user explicitly confirms it, and no other action ever may.**

**The problem.** `REQ-SESSION-201` exists so a user can carry their history to another machine. But
`.rotaris/` is gitignored, so on the ordinary recovery journey — machine dies, clone the repository, open
it once, restore the backup — the clone mints identifier **B** while the artifact carries identifier
**A**, and `REQ-SESSION-197` forbids the product touching either. The sessions restore into a store the
open workspace will never resolve to, and the only remedy is editing a file by hand. The feature is
incomplete in exactly the situation it was minted for.

**The shape of the exception, which is what makes it safe:**

- It exists **only inside the restore action**. No other path gains it — not workspace open, not repair,
  not a migration, not a future convenience.
- It requires **explicit user confirmation**, naming both identifiers and stating that the workspace's
  existing sessions become unreachable from that workspace. It is never automatic and never a default.
- The absent-identifier case is unchanged and remains **not** an exception: where no identifier file
  exists the restore establishes one by exclusive create, which replaces nothing.
- A present-but-**unreadable** identifier is still reported and never overwritten, per `REQ-SESSION-197`
  as it stands.
- The displaced store is **moved aside and kept**, never deleted, consistent with the rule that the
  application never deletes a store.

**Why the exception is drawn this narrowly.** The absolute rule is the record's best-evidenced decision:
the comparative survey found that every path-keyed harness has a filed, painful bug where moving or
renaming a project folder orphans its sessions, and `REQ-SESSION-197`'s identifier is what keeps this
product out of it. Weakening it generally would trade a common protection for a rare recovery. Confining
the exception to one user-confirmed action inside one feature keeps the protection everywhere it earns its
place, and pays for the recovery path only where a user has asked for it in as many words.

### ESC-22, ESC-24 and ESC-27 to ESC-31 — ruled 2026-09-02

Delegated to the clean-room manager and ruled together. Each is small; two of them protect a user from
losing access to their own work, which is why they are not merely tidy.

| | Decided |
|---|---|
| **ESC-22** — no requirement bounds the aggregate terminal-frame rate | **Bound it.** |
| **ESC-24** — a launch arriving inside the force-exit allowance | **Refuse the launch until exit completes.** |
| **ESC-27** — `secrets.yaml` has no file mode | **`0600`**, matching credentials. |
| **ESC-28** — a withdrawn configuration key fails the load | **Report and carry on.** |
| **ESC-29** — a withdrawn key in *global* scope stops every workspace opening | **Report and carry on**, same rule. |
| **ESC-30** — a version never recorded is indistinguishable from one pruned | **Make them distinguishable.** |
| **ESC-31** — where the permission-audit entry's identifier lives | **In the entry.** |

**ESC-22.** `REQ-MONITOR-222` now depends on this bound, which it did not when the vocabulary was written:
the IPC measurement showed a separately named channel is not a separate transport, so the coalescing cap
is what keeps a high-volume stream from delaying a transcript row. The measurement also located the cliff
— transcript p95 rose sixfold at 65.5 MB/s and ninety-eightfold at 12,000 frames per second, while
staying at 1.51 ms at 999. An unbounded rate leaves a load-bearing property resting on a default.

**ESC-24.** The force-exit allowance exists because a quit is already going wrong. Admitting a launch into
that window means two instances briefly exist, which SR-1 exists to prevent, at the one moment the product
is least able to reason about its own state. Refusing is also consistent with SR-1's own shape: a second
launch never starts a rival process.

**ESC-28 and ESC-29 together, and this is the one that matters most.** A key the product itself invited a
user to write, in a build the product itself shipped, must never make their workspace unopenable — and in
the global scope it would make *every* workspace unopenable at once, from one line in one file, with no
way in the product to reach the file that caused it. The user is told what is unsupported and what is
being ignored, and the workspace opens. This is a deliberate departure from `REQ-CONFIG-183`'s hard load
failure for an unknown key: an unknown key a stranger wrote and a withdrawn key we solicited are not the
same case, and treating them alike converts our own deprecation into their outage.

**ESC-30.** A version absent because it was never recorded and one absent because retention removed it
mean different things to a user reading an audit trail — one is a gap in the record, the other is the
record working as designed. `REQ-LIBRARY-047` makes the version write best-effort and outside the
all-or-nothing boundary, so both cases genuinely occur.

**ESC-31.** The identifier belongs **in the entry**. `REQ-EVENTS-056` requires the locator to resolve
through the export on a machine carrying none of this product's code, so an identifier held anywhere else
does not survive the export, and the export is the whole point of the audit being an audit.

### Consequences to carry

- `REQ-MONITOR-013` **survives, clarified rather than withdrawn.** Its "a run executing in a different
  process" now unambiguously means the run host as against the window — which the architecture had already
  concluded the specification implied.
- **ESC-10 is dissolved.** There is no second instance whose control must be refused. The refusal remains
  as a defence against a state that should not arise, not as routine behaviour.
- The crash domain concentrates. This sharpens the objection the record already preserves from the DATA
  architect against ADR-0002: a run-host crash loses every in-flight run at once. Named here so it is not
  discovered later.

## Architecture Gate decisions — ruled 2026-09-02

The four things the Architecture Gate verdict left with the product owner, plus the one question the
verdict's category B raised and declined to answer for itself. None of these is what makes the gate
verdict NOT READY; that is the four build-wrong defects and the four build-host obligations, and none
of them is the owner's to close.

### GD-1 — the approved visual design reference is not a gate condition, and OQ-31 is ruled without it

**Decided, two parts.** The absence of the approved visual design reference **does not block the
Architecture Gate**. It becomes a precondition for the first screen rather than for the first line of
code, and is recorded as such in `implementation-conditions.md` so that it cannot lapse by being nobody's.
And **OQ-31 is ruled now**, on its own merits, rather than waiting on the reference.

**Why the reference does not block the gate.** `open-questions.md` states the position the architects
reached without it: every slice proposal is about mechanism — where state lives, what crosses a process
boundary, what paints a row — and **no mechanism depends on the reference, while no screen can be built
without it**. *(Corrected 2026-09-03: the second clause was written as though the reference were absent.
It is present — `docs/design/`, since 2026-09-01 — so the true statement is that no screen can be built
without **a** design language, and this product has one, adopted. GD-1's ruling that the reference does
not block the gate is unaffected and was right for the reason given.)* ADR-0050's theme mechanism is the
clearest case: themes as data, corrections computed,
contrast asserted from rendered pixels, all of it independent of which values the palette holds. Holding
a gate about mechanism for material no mechanism depends on delays every unrelated decision and improves
none of them.

**OQ-30 stays open and stays the reference's.** `REQ-SHELL-129` fixes the default theme's shell metrics
and token groups and `REQ-SHELL-133` fixes what each built-in theme's description must convey; the
palettes themselves are specified nowhere in `docs/spec/` and are not going to be invented here. The same
holds for the three things `open-questions.md` lists beside it — the information architecture inside each
of the seven primary views, the visual form of the benchmark card and the diagnostics view, and the glyph
vocabulary `REQ-SHELL-149`'s no-state-by-colour-alone rule requires to exist.

**Why OQ-31 is different, and is ruled here.** The Markdown dialect is not a visual question wearing a
functional hat; it is the reverse. The supported element list fixes what the transcript renderer will
accept from model output, and one entry on that list — images — is a security boundary rather than a
matter of taste. Waiting for a palette before deciding whether model output can name a resource the
renderer then loads is the wrong dependency.

**The ruling. The dialect is GitHub Flavored Markdown, less raw HTML, less image loading.**

- **Rendered**, in addition to the five treatments `REQ-CHAT-056` already fixes (fenced code blocks, bold,
  italic, inline code spans, hyperlinks): headings, block quotes, ordered and unordered lists, task lists,
  tables, thematic breaks, and strikethrough. Bare URLs are linkified and are activatable on
  `REQ-CHAT-076`'s terms, like any other link.
- **Raw HTML in Markdown source is not rendered as markup.** It is shown as the text it is. Rendering
  agent output as HTML would make every model response an injection surface into the renderer, and the
  renderer is the process holding the user's workspace in view. Nothing about the transcript needs it.
- **No image is ever loaded from a Markdown image reference.** An image reference renders as its alt text
  carrying an activatable reference, and never as fetched or read image content. For a remote URL this is
  already required — `REQ-CHAT-056` states that rendering "MUST complete synchronously and MUST NOT issue
  any network request" — and stating it as a dialect rule rather than leaving it as a consequence keeps a
  later reader from concluding that a local path is therefore fine. It is not: a transcript that reads
  arbitrary filesystem paths named by model output is a disclosure surface, and it would also make
  rendering depend on a filesystem read, which the same clause forbids.

**What this does not touch.** Images the *user* attaches, and image bodies the product itself holds as
per-session files, are governed where they already are and are unaffected — this rules on what Markdown
*syntax* may cause to be loaded, not on what the product may display.

### GD-2 — ESC-15's and SR-7's stated reasons are corrected in place; both rulings stand

**Decided: correct the reasoning, keep the conclusions.** Neither ruling is reopened. Both are corrected
where they are written, so that a later reader re-deriving from the stated reason reaches the stated
conclusion. The corrections are recorded in the ESC-15 and SR-7 sections above and summarised here.

**ESC-15.** The recorded reason was that write-ahead logging is unsupported on network filesystems, so the
store opens read-only, so the lock cannot be acquired, so no session starts. Spike 19 measured **both
clauses false**: WAL succeeded over a UNC path in 320 process-trials with zero errors, the pragma returned
`wal` and the prescribed read-back returned `wal`, the 32 KiB shared-memory segment was obtained over SMB,
and `db.readonly` was `false` in every network case. The ruling survives on three failures the measurement
found instead, all of them worse than the one it replaced: a store can report WAL enabled, read back as
WAL, own its shared-memory segment and still fail its next write, with that write silently absent from the
following read; and the failure is **path-spelling dependent**, so the same share behaves differently
addressed as a UNC path and as a mapped drive letter. The original claim at least fails loudly and in one
place. What the measurement disproved was an argument for the ruling that was weaker than the truth.

**SR-7.** The ruling's own evidence is untouched and stands unchanged — first paint at 13,287–19,580 ms
against a 5,000 ms budget at every bundle weight including a zero-payload build, against 664–1,561 ms for
the same payload as a directory tree. What was disproved is a subsidiary identification the ruling relies
on: the packaging tool's portable-executable environment variable was measured **null in 0 of 157**
launches through our own launcher, because the tool sets it only when the tool's own portable stub runs,
which ours is not. Our own declared variable carried the correct absolute artifact path in **149 of 149**.
The mechanism named changes; the conclusion does not.

**Why correcting matters when no conclusion moves.** A record whose conclusions are right for reasons that
are false is a record that cannot be re-derived. The next person to meet a workspace on a network share
will read ESC-15's reason, find it does not reproduce, and have to decide whether the ruling was wrong —
with no way to know that the truth is worse rather than better.

### GD-3 — the corrected restore is re-measured as a condition on its implementation, not on the gate

**Decided: not a gate condition; a condition on the first implementation of the restore, recorded in the
new `docs/architecture/implementation-conditions.md`.**

The three corrections to ADR-0058's restore are, as this is written, exactly the paper reasoning that
consequence 17 says is not evidence. They are also not on the startup path, and nothing else in the record
depends on them, so holding every unrelated decision for one mechanism's re-measurement buys nothing.

**The condition has a home, because otherwise this option is the do-nothing option.** No register of
conditions that bind at implementation time existed when this was ruled; the check was made rather than
assumed. `docs/architecture/implementation-conditions.md` is created by this ruling to hold it, and the
Architecture Gate verdict points at it. An unlanded condition is not a lighter version of a gate
condition, it is no condition at all, and this record has already lost two days to an amendment that was
ruled and never scoped.

**What the re-run must cover** is bounded to the two things the corrections changed and the measurement has
not yet seen: a run launched into the window between the refusal of new runs and the run host's
acknowledgement, confirming the second liveness evaluation refuses it and the run and its rows survive
intact; and an install rename forced to fail on an occupied name, confirming displace-then-rename leaves
the target store byte-identical.

### GD-4 — a restore under way is visible; a backup may be abandoned

Two questions the measurements made askable that were not askable before. Both are ruled into
`REQ-SESSION-201` as clauses rather than as new identifiers, because both are about the action that
requirement already owns.

**GD-4a — acknowledgement, not progress reporting.** The gesture is acknowledged on the shell's ordinary
terms and the user is told a restore is under way and that the store is unavailable while it runs. **No
percentage, no stage list, and no estimate.** This creates no duration budget and does not disturb the
deliberate silence on how long a restore takes; that silence is about not disturbing *runs*, and this is
about what a waiting user is shown, which is a separable question.

The measurement that made it askable: the whole restore took 2.67 s at 313 MB, and the store was
unavailable for 64 ms at 68 KB, 144 ms at 11.8 MB and **1.45 s at 313 MB**. No requirement states a budget
for any of it — the specification was searched. **This scales, and 1.45 s is a floor rather than a
ceiling**: ESC-9 leaves retention unbounded and ESC-19's survey records a comparable product's session data
reaching 700 MB to 2 GB.

**Why not staged progress.** Reporting stages requires the swap to report from inside a sequence whose
entire value is that it is atomic and uninterruptible. That is real complexity bought for a cosmetic gain,
and worse, it creates standing pressure to make the sequence interruptible so that it has something to
report. Saying nothing at all is defensible at today's sizes and wrong at the sizes the design permits.

**GD-4b — a backup may be abandoned, and abandoning it costs nothing.** A backup in progress may be
abandoned by the user. Abandoning it discards the partial artifact, leaves the store untouched, and never
leaves a partial or unreadable file at the destination the user chose.

The measurement that made it askable: `VACUUM INTO` under concurrent commits produced 8 valid snapshots in
8, integrity-clean and monotonic, at a median **1,077 ms per 41 MB**; the whole backup action measured
145.6 ms, 425.0 ms and 4,206.1 ms at 68 KB, 11.8 MB and 313 MB. A backup of a large store is a
multi-second action that runs while runs continue, since `REQ-SESSION-201` forbids it from disturbing them.

**Why this is nearly free, and why leaving it unspecified is not.** The mechanism already has the property:
the backup writes a staging snapshot and never mutates the store, so the requirement mostly writes down
something that is already true — the cheapest kind to satisfy and the easiest to test. Against that,
leaving it unspecified is precisely the shape that produced `REQ-SESSION-043`'s defect: a requirement that
enumerates cases and leaves the residue undefined. That shape has now cost this record twice, and it was
invisible to review of the words both times.

### GD-5 — the Linux and macOS build-host obligations are deferred to hardware, not waived

**Decided, 2026-09-02: the obligations that need a machine this record does not have are deferred until one
is available, and they remain owed.** They are recorded as **IC-3** in `implementation-conditions.md` rather
than as gate items, on the same principle as GD-3: an obligation that cannot be discharged here does not
become smaller by being called something else, so it is written where it binds the work rather than left in
a verdict category that will be read once and closed.

**What is deferred**, and none of it can be closed by reasoning on this machine:

- **Spike 12** — the Linux artifact's runtime on a host that has never had the legacy FUSE library
  installed. It decides which of ESC-11's two applied options the release takes, and the whole point of the
  measurement is a machine that has never had the library, which this one cannot become by uninstalling it.
- **Spike 17's macOS and Linux platform keys.** `REQ-STARTUP-155` binds all four artifacts and only the two
  Windows ones were built.
- **ADR-0056's build-time load proof on all three release runners.** This one **grew** rather than merely
  waiting: it was always the only check in the record that catches an unloadable store binding, and defect
  D10 then established that the rebuild it was meant to confirm reports success while compiling nothing and
  that the loader would ignore the result anyway. It is no longer one check among several. It must be shown
  constructible on each runner, not assumed.
- **The instance claim on macOS and Linux.** SR-1 made single-instance behaviour entirely ours on three
  platforms and it has been measured on one. `REQ-STARTUP-156`'s release gate does not require launching
  the entry point twice on one user account, which is the check that would catch a failure here.

**What deferral does not mean.** It does not mean these are lower risk than the measured items — the
opposite is the record's own experience. Three mechanisms in this record went from paper to first execution
and every one held a defect no reading had caught, and **all four of these obligations are in the class of
things that have never been executed at all**. Deferring them is a decision about when a machine is
available, not a judgement that they will pass. Any implementation that reaches a Linux or macOS artifact
before IC-3 is discharged is shipping on an untested platform and the record says so here so that nobody
has to infer it.

**What it does mean for the gate.** The Architecture Gate's category C is unchanged by this ruling: these
four remain open, and this ruling relocates them rather than closing them. Whether the gate closes with
category C outstanding is a separate decision and is the owner's.

---

## The Architecture Gate — CLOSED 2026-09-03

The gate itself is [`../clean-room/architecture-gate.md`](../clean-room/architecture-gate.md); it holds the
verdict, the options each decision chose between, and the record of decision. The five rulings are recorded
here as **GD-6 to GD-10** because this file is where a reader looks for what the owner decided, and a
decision that lives only in the document that asked for it is a decision the next reader has to go looking
for.

**The owner accepted this record's recommendation on all five items.** That is stated plainly rather than
elided: the recommendations were written by the same record the gate was judging, so a reader is entitled
to know that the alternatives were put and not taken, and each ruling below keeps what it chose between.

### GD-6 — implementation is authorized, bounded

**Ruled: approved, bounded.** Production code may be written against these records for **the mechanism** —
process topology, the store, the run flow, the event stream, settings, permissions, the backup and the
restore. **IC-2 and IC-3 are not advice**: no screen before the approved visual design reference exists, no
Linux or macOS artifact before the build hosts do.

> **Corrected 2026-09-03, hours after the ruling, and the ruling stands.** The sentence above says *no
> screen before the approved visual design reference exists*. **It exists**, and it has been in this
> repository since 2026-09-01 — `docs/design/`, commit `1ad8fee`. The owner said so; nothing in this record
> caught it. **What GD-6 authorises is unchanged**, because it authorises the mechanism and bounds it by
> whatever the conditions actually say; what changed is that IC-2 now says something much narrower —
> `nocturne` and `high-contrast` have no palette and the token set declares no theme metadata or
> native-surface mapping, so `REQ-SHELL-128`'s three-theme obligation is not yet meetable. **Screens are
> not blocked**, and the design material's own adoption rule governs how they are drawn: the **language**
> is adopted and authoritative, the **information architecture** is not, and structure comes from
> `docs/spec/` with `REQ-SHELL-023` canonical. The paragraph below says "one is material nobody has" and
> that clause is false; the refusal of the unbounded option does not rest on it.

*The alternatives were: approve unbounded, treating IC-2 and IC-3 as advice; approve a smaller first slice;
or decline and name what must change.* Unbounded was refused because both conditions exist for reasons that
do not weaken by being ignored — one is material nobody has, the other is hardware nobody has. A smaller
slice was refused for a reason worth keeping: **the record has no seam to cut it on.** The store, the
topology and the run flow are one decision spread across three files, and a slice drawn through them would
be drawn by the person doing the cutting rather than by the architecture.

**What this does not authorize.** It does not ratify any ADR, does not waive a condition, and does not make
the record verified. It is the first authorization of production code in this repository.

### GD-7 — the three closures resting on argument are bound as conditions

**Ruled: bind them.** Of the five defects that were in the build-wrong class, **two were measured against
the defect they close** (the close handshake's bound and lease; the displaced-store name's counter), **one
was exercised without being aimed at** (the artifact-layout conversion and `origin.txt`, which ran on every
successful IC-1 path and never failed), and **two rest on argument alone** (the foreign-host lock row's fix
at both ends; the build rule that replaced `electron-rebuild`'s exit status). The latter three become
**IC-4**, **IC-5** and **IC-6**.

*The alternatives were: accept them as closed, or hold the gate until they are measured.* Holding the gate
was refused because GD-3 declined to do exactly that for a stronger case — IC-1 was a whole mechanism with
three unrun corrections — and it worked: the condition was set and discharged the same day, and that
mechanism is the only one in this record to survive first execution, because it was not its first execution.
Accepting them without a condition was refused because it is **indistinguishable from doing nothing**, which
is the same reason GD-3 had to create the register before it could use it.

### GD-8 — a spike is taken as the first act of building the thing it prices

**Ruled: bound to the work.** No unstarted spike is a condition of anything by itself and none is a gate
condition. Each prices a decision already taken. A spike is taken when the build reaches the thing it
measures, and **its result goes into the record that made the decision whether or not it passes, and whether
or not it found anything**. Recorded at the end of `implementation-conditions.md`.

**Three are named** because a build reaches them first and cannot honestly proceed past them, and naming
them does not promote them to conditions: **spike 8** (store query latency against *declared* indexes, plus
store open, log recovery, the startup integrity check and `REQ-EVENTS-179`'s write probe), **spike 18** (two
run hosts on one store, which two requirements permit and no spike has measured), and **the power-loss
test**, which is now the sole stated ground for forcing the stronger durability setting on a terminal save.

*The alternatives were: take all eleven up front, or leave it to judgement.* Up front measures nothing that
is being built yet and delays every decision it prices. Judgement is how a measurement becomes a paragraph
nobody owns.

### GD-9 — a stated, non-build-wrong defect does not block implementing against a record

**Ruled: the first option.** An ADR that has been run and knows what is wrong with it is a better record
than one that has never been run and knows nothing, and it must not be the one that is blocked.

**The standard is worth nothing unless the statement exists**, and it did not. ADR-0058 was carrying three
open defects and naming none of them, so the ruling came with an editing pass rather than only a principle:

- **Consequence 18 is new** and states **D5**, **D8** and **D11** with what each costs, plus the two rules
  that are owed evidence rather than a fix — rule 6's canonical path spelling, which needs a conformance
  test because its violation is silent, and ADR-0055's stand-down rule, which has no measurement at all.
- **Consequence 5 was tracking three leftover shapes while the mechanism produced five.** It now tabulates
  all five with whether anything deletes each, which makes D5 visible as what it is: the two nobody keeps on
  purpose, each the size of a store.

*The alternatives were: require every defect closed before ratification, or drop ratification as a
precondition entirely.* The first blocks the records that have been run in favour of the ones that have not.
The second removes the reason to state a defect at all.

### GD-10 — the first-execution recording rule is standing policy

**Ruled: standing policy.** A mechanism's first execution reports back into the record that decided it, in
place, **including when it found nothing** — because "nobody recorded a problem" and "somebody ran it and
there was no problem" are different states and only one is evidence. A falsified reason is kept beside its
replacement rather than overwritten. A defect found this way is not repaired quietly in the code that meets
it: the code is the fix, the record is where the reason lives, and the reason is the only thing that stops
the fix being removed. Recorded as a discipline in [`README.md`](README.md) section 5.

*The alternatives were: case by case, or no policy on the ground that code becomes the record once code
exists.* This is what caught four of four. It costs a paragraph per mechanism, and its value arrives at the
moment the record stops being read — which is the moment implementation begins.

## Rulings after the gate — 2026-09-06

### ESC-32 — IC-7: the code-intelligence language servers are tools provisioned after installation

**Ruled: option 2 — amend the requirement.** Raised by Part T, ADR-0035's first execution (2026-09-06), as
implementation condition **IC-7**: the bundled runtime is self-contained — it answers `tools/list` and the
protocol with nothing else installed — but the language servers its symbol-level tools need are obtained by
the runtime itself at the first use of a language, into the per-user data directory (TypeScript through
`npm install typescript@5.9.3` and `typescript-language-server@5.1.3`; Python through `uvx --from
pyright==1.1.403`; every other language by its own download), which `REQ-STARTUP-159` as written did not
permit. The owner chose, from the three ways IC-7 offered to discharge itself, the second: read
`REQ-STARTUP-159`'s "the only things fetched after installation" to include those servers as **tools
provisioned after installation**, the way Git and ripgrep already are — declared in the setup manifest with
name, version, source and licence (`REQ-STARTUP-058`), listed in `THIRD-PARTY-LICENSES.txt`'s "Tools
provisioned after installation" section (`REQ-STARTUP-142`), and surfaced to the user before the first
fetch (`REQ-MCP-118`, minted for it).

**Why this one.** It is the treatment the product already gives Git and ripgrep, so it adds no second
regime; it costs no artifact size and no second interpreter to pin and licence; every language the runtime
supports keeps its symbol tools rather than the two a bundle would carry; and the user reads what will be
fetched, from where and to where, on the surface that holds the setup action, before a run can trigger it.

*The alternatives were:* **option 1**, bundle the servers for the languages the release claims — a Node
runtime and two npm packages beside the Python tree, an estimated 60–100 MB more, a second interpreter to
pin and licence under `REQ-STARTUP-142`, and only TypeScript and Python served offline; **option 3**, ship
without symbol-level tools for any language whose server is absent (today: all of them), the pattern-search
and memory tools still offered and the category saying so. The first buys offline symbol tools for two
languages at a size and licensing cost the owner did not want; the third ships the runtime's headline
capability switched off.

**Consequences to carry.**

- IC-7 stays on the release until **both** halves of its option-2 discharge are shown. The amendment, the
  manifest's declaration checked against the runtime, and the disclosure with its proof are the first half.
  The second — the notices generator listing the servers under `REQ-STARTUP-142` — waits on that generator,
  which is not built (`REQ-STARTUP-141/142/143`; ADR-0054). The entry in `implementation-conditions.md`
  says so; no condition is downgraded by the person doing the work. *2026-09-27: the second half is shown. The
  notices generator lists the servers, and IC-7 is recorded as discharged there. The release pipeline's evidence
  of the section is still owed (`first-release-plan.md` §4.3).*
- `REQ-STARTUP-064`'s reason for exempting the reserved token from cache warm-up — "what it resolves to
  ships inside the artifact" — was true of the runtime and false of its servers. The outcome (no warm-up
  step) stands; the reason is qualified in place and kept beside its qualification, under GD-10.
- Languages beyond TypeScript and Python are not declared, by the amendment's own terms: the disclosure says
  a further language's server is obtained the same way. Declaring more is a release decision, not a defect.

### ESC-33 — REQ-MCP-044's 8-second toast is a second copy of an owned figure

**Ruled: amend `REQ-MCP-044`; `REQ-NOTIFY-011` is untouched.** Raised by Part V, ADR-0049's execution in
full (2026-09-06): `REQ-MCP-044` gave its construction warning "a UI toast of severity 'warning' with an
8-second auto-dismiss", and `REQ-NOTIFY-011` fixes the acknowledgement lifetime at 4200 ms while declaring
itself the product's single definition of one and forbidding any surface from stating another. A build
could not satisfy both.

**Why this one.** The MCP text is the copy and the NOTIFY text is the definition, which is the same
relationship `REQ-NOTIFY-044` already has with `REQ-SHELL-023`'s views, `REQ-CONFIG-269`'s categories and
`REQ-LIBRARY-103`'s tabs — cite the owner, hold no copy that can drift. Nothing is lost by the shorter
span: `REQ-MCP-044` delivers through **two** channels and the durable one is the persisted `mcp_config`
session issue, readable in the session's issues file after the run; the acknowledgement was never the
record. And `REQ-NOTIFY-268`, built in the same part, now records every warning notice at publication.

*The alternatives were:* **grant `REQ-MCP-044` a lifetime of its own**, which reopens `REQ-NOTIFY-011`'s
single definition for every domain that wants two more seconds and turns one figure into a per-surface
negotiation; or **make this warning a persistent notice** under `REQ-NOTIFY-040`, which stays until
dismissed or superseded. The second is not rejected — it remains available to `REQ-MCP-044` as a severity
decision at no cost to `REQ-NOTIFY-011` — but it is a change to what the warning *is*, not to how long a
transient lasts, and the owner did not make it here.

**Consequences to carry.**

- The 8 s figure is not preserved anywhere, and the amendment says so in place: a warning that must
  outlive an acknowledgement is a persistent notice, not a longer transient. A later reader who wants the
  MCP warning to stay on screen has one lever and it is severity.
- The built product already matched this ruling before it was made: Part V routed the warning to the
  acknowledgement channel because `REQ-NOTIFY-040` forbids the timed clear, and raised the disagreement
  rather than choosing. No code changes under this ruling; two code comments citing it as an open question
  now cite the amendment.

### ESC-34 — the notice action vocabulary was closed against two actions the product owes

**Ruled: amend `REQ-NOTIFY-044`; add both members.** Raised by Part V alongside ESC-33.
`REQ-NOTIFY-224` obliges the unreviewed-hooks notice to offer "an action opening the review" — the modal
dialog of `REQ-HOOKS-106` — and `REQ-WORKSPACE-152` (3) obliges the first-launch notice to carry "an
action that starts the flow". `REQ-NOTIFY-044`'s eleven members reached neither, and that requirement's
own closure ("an action naming a value outside the owning domain's vocabulary is not dispatched") makes
the gap a refusal rather than a stretch.

**Why this one.** `REQ-NOTIFY-224` and `REQ-WORKSPACE-152` state behaviour; `REQ-NOTIFY-044` enumerates.
When the two last disagreed, **resolution 12 of this domain corrected the enumeration** — "the action
vocabulary was corrected to match rather than the other way round" — and the same reading applies. The
nearest existing member, opening settings at a category, reaches the surface *beside* each target rather
than the target, and `REQ-WORKSPACE-152` distinguishes those two outcomes deliberately between its clause
(2) and its clause (3). The vocabulary's closed property survives both additions: neither writes into the
user's project.

*The alternative was* to narrow the two behavioural requirements to `open-settings`, which costs the user
a surface in each case and erases a distinction one of them draws on purpose.

**Consequences to carry.**

- Both members carry their object, as `REQ-NOTIFY-044` requires of every other member: the review is
  parameterised by workspace (the notice is published per workspace and hook set), the setup by provider
  where the action names one. **This one does change code** — the two members shipped in Part V carried no
  parameter — and the change is made under this ruling rather than left as a divergence.
- Activating a hook-review action whose workspace is not the open one is not built. The product logs it
  and opens nothing; navigating between workspaces from a notice is owed, and is recorded in the map
  rather than silently ignored.
- The count is unchanged: no identifier was minted or withdrawn.

### ESC-35 — the intent-classification bound was set against a hosted provider's latency

**Ruled: amend `REQ-ORCH-008`; raise the default from 8.0 s to 12.0 s.** Raised by the live run's first
execution (2026-09-11, `AGENTS.md`): against the owner's self-hosted vLLM endpoint the classification call
did not answer inside 8.0 s, so `REQ-ORCH-007`'s fallback stood in — `moderate_feature`, flagged, reason
"the classification call timed out after 8 s" — on a prompt the model classifies correctly when it is
allowed to finish. Nothing failed; the ladder did exactly what it promises. The figure was simply chosen
against providers whose first token arrives sooner than a local one's.

**Why this one.** The bound exists so a slow classifier cannot delay the first iteration, and the cost of
being wrong is asymmetric: too long delays a run start by seconds, too short silently degrades every run
on that endpoint to the fallback intent, which then gates capabilities, playbook cells and the budget
clamp (`REQ-ORCH-005`) for the whole run. A default that a supported class of endpoint cannot meet is a
default set against the wrong population. 12.0 s clears the measured first-token latency with margin and
stays well inside what a person waits at run start.

*The alternatives were:* **a configuration key** — a `runtime:` field so this machine alone sets 12 s —
which is the better long-run shape but mints a `REQ-CONFIG` identifier and leaves the shipped default
still wrong for local endpoints, so it answers the owner's machine and not the defect; or **leave 8.0 s
and accept the fallback**, which is only tenable while nobody reads the intent, and `REQ-ORCH-005` makes
that false. The configuration key is **not rejected** — it remains available on top of this ruling, and
`ClassifyDeps.timeoutMs` already carries a per-call override for whoever mints it.

**Consequences to carry.**

- The old figure is not preserved anywhere and the amendment says so in place, quoting what the sentence
  read. A reader who wants the shorter bound back needs a measurement that says 12.0 s costs something.
- **This one changes code**: `CLASSIFICATION_TIMEOUT_MS` and the test that drives the clock past it, both
  citing this ruling. No other bound moves — `REQ-ORCH-113`'s completion classifier stays at 15 s and
  `runtime.loop_classification_timeout` (`REQ-CONFIG-467`) stays at 2.0 s; they bound different calls.
- The count is unchanged: no identifier was minted or withdrawn.

### ESC-36 — the provider row visibility: REQ-PROVIDER-140's union against REQ-CONFIG-389's authenticated-only list

**Raised 2026-09-14, not yet ruled.** Raised by R-016, the Settings Models overhaul, while planning which
rows the rebuilt providers card may draw. The two requirements state disjoint populations and no document
between them narrows either.

- **REQ-PROVIDER-140** (domain 04) fixes the listed set: "the union of the ids holding a stored credential,
  the built-in catalog ids, and the snapshot ids, each appearing exactly once, ordered by id." Every
  built-in provider therefore appears whether or not it is authenticated — the screenshot the request
  arrived with shows OpenAI Codex, GitHub Copilot, DeepSeek and OpenAI-compatible rows reading "Not
  authenticated", and `packages/providers/src/signin.ts` `list()` implements exactly this union.
- **REQ-CONFIG-389** (domain 15) fixes the same set differently: "The provider list shows **no** built-in or
  merely-referenced provider by default; a row appears only once a provider is authenticated. The one
  exception is the managed-cloud provider … A provider that is only referenced by a model slot — a deleted
  custom endpoint included — must **not** cause a row to reappear."

REQ-CONFIG-440's withdrawal routes the withdrawn text-mode provider list at "REQ-CONFIG-329 and
REQ-CONFIG-367 to REQ-CONFIG-389", and REQ-PROVIDER-103's withdrawal routes the command-line list at
REQ-PROVIDER-140 — so each withdrawal redirected the same capability at a requirement that now disagrees
with the other about who gets a row. Both were amended since (3e87bb2, b982f50) without either text
changing on this point. REQ-NOTIFY-200 governs the state vocabulary a row shows, not who gets a row, and
cites no side. `packages/contracts/src/providers.ts` (`ProviderRowSchema`) and the renderer card
(`packages/ui/src/settings/Providers.tsx`) follow REQ-PROVIDER-140 today.

**Why this is an escalation and not a defect found by building.** The specification is not silent and the
build is not wrong against one of its requirements; two live requirements cannot both hold. That is
`docs/product/README.md`'s table's third row: an amendment round decides, and until it does, the surface
stays on the side it was already built — REQ-PROVIDER-140's union — rather than an agent choosing a
winner by rebuilding.

**What the ruling decides.** Which of the two texts governs, or what third population both are amended to
state. The visual overhaul itself (row anatomy, actions, confirmations, empty state) does not wait on it:
every requirement it implements is common to both readings, and the ESC-36 row keeps today's visibility.

*The alternatives, for the ruling's convenience:* **REQ-PROVIDER-140 stands** — every provider is always
listed, which makes the settings the product's one place to *start* authentication for anything, matches
the mockup's fourth row (GitHub Copilot, "not authenticated", an Authenticate action) and is what is
built; or **REQ-CONFIG-389 stands** — rows appear on authentication, managed-cloud excepted, which makes
the list a shorter, state-first inventory but leaves unauthenticated built-ins reachable only through the
add-provider dialog's chooser. A third shape (unauthenticated built-ins grouped under a collapsed
section) would need minting in both domains and is named only to be complete.

### ESC-37 — what invoking a skill delivers: REQ-CHAT-034/162's attached payload against REQ-WORKSPACE-062/073's force-loaded block

**Raised 2026-09-14. RULED 2026-09-27: domain 13 stands** (see "Rulings after the gate — 2026-09-27" below). Raised while planning portable-skill discovery (ADR-0063), on
reading what happens after a user invokes a skill's command. Two live requirements describe two
different mechanisms, and the difference is observable to a user.

- **REQ-CHAT-034** (domain 03): the skill "MUST be **attached to the next prompt** the user submits …
  in the payload shape REQ-CHAT-162 fixes". **REQ-CHAT-162** fixes that payload — it "MUST identify
  itself as the body of a skill document, name the skill, name the absolute path it was read from, and
  carry the skill file's body verbatim" — and adds that "**attaching a skill MUST mark it as in
  context**", with the listing carrying a per-skill "whether it is already in context" column.
- **REQ-WORKSPACE-073** (domain 13): invoking the command makes the skill's **load mode `on` for the
  current session**, so "the agent constructed for the next prompt receives that skill's body as a
  **force-loaded context block** per REQ-WORKSPACE-062" — an always-active block introduced by an
  activation statement, present for every agent of the session and not attached to one prompt.
  **REQ-WORKSPACE-067** states the opposite of CHAT-162's indicator in as many words: the tab "SHALL
  show **no** per-agent in-context indicator and SHALL offer **no** composer chip".

The two differ in lifetime (one prompt against the session), in scope (the next prompt's agent against
every agent constructed afterwards), and in what the user is shown. Domain 13's resolution record
settled this deliberately — its OQ 5 rules the in-context indicator and the composer chip out of scope
with reasons, and its OQ 21 rules the session-only lifetime — and the shared toast both requirements
quote, "Skill loaded for the next prompt: {name}", reads naturally under either.

**Why this is an escalation and not a defect found by building.** Neither text is wrong against the
behavioural target; two live requirements state different mechanisms for one gesture, and domain 03's
own withdrawal note routes the withdrawn terminal payload at REQ-CHAT-162 while domain 13's routes the
same capability at REQ-WORKSPACE-073 and REQ-WORKSPACE-062. Each withdrawal redirected one capability
at a requirement that now disagrees with the other.

**What the build proceeds under, and why it is the conservative side.** Domain 13 owns portable skills
— the vocabulary, the discovery, the load modes and the settings surface are all its — so the
**force-loaded block** is built, with the body reaching the model carrying REQ-CHAT-162's three
identifying facts (it says it is a skill document, it names the skill, it names the absolute path) and
the body verbatim below the frontmatter. That satisfies everything REQ-CHAT-162 fixes about the
*payload* while delivering it as domain 13 fixes the *lifetime*. The in-context indicator and the
composer chip are **not** built, because REQ-WORKSPACE-067 forbids them by name and a ruling for
domain 03 can add a column far more cheaply than a ruling for domain 13 could remove one.

**What the ruling decides.** Whether a skill invocation is per-prompt or per-session, and whether the
Settings tab carries an in-context column. *The alternatives:* **domain 13 stands** — what is built;
one lifetime, readable from the Load column, and REQ-CHAT-162's in-context sentence is amended to cite
it. Or **domain 03 stands** — the body rides one prompt, which needs a per-prompt attachment path the
engine does not have (nothing today puts content in front of one turn and removes it after), a new
in-context column, and REQ-WORKSPACE-067's two prohibitions amended.

### ESC-38 — the Skills table's columns: REQ-CONFIG-343's five against REQ-WORKSPACE-067's amended seven

**Raised 2026-09-14. RULED 2026-09-27: seven columns** (see "Rulings after the gate — 2026-09-27" below). Raised by the same planning pass. Both requirements fix the
column set of one table and neither cites the other.

- **REQ-CONFIG-343** (domain 15): "The skill table has **five** columns: Skill, Source, Trigger, Load,
  Description."
- **REQ-WORKSPACE-067** (domain 13, amended by that domain's resolution round, OQ 4): "a table with
  columns **Skill, Source, Path, Trigger, Load, Description**", plus "a per-row **invocation** selector
  (accessible name 'Invocation policy for {name}')" and two header actions. The `Path` column is the
  amendment's own subject — its resolution table records REQ-WORKSPACE-074's withdrawal as rescued by
  "the Settings Skills tab table, **which now also shows each skill's `SKILL.md` path**".

Domain 15 was not amended alongside, so its count is stale rather than contradictory in intent. The
invocation selector is a further difference: REQ-WORKSPACE-067 requires one per row without saying
whether it is a column, and the approved mockup's Skills card draws Invocation as a column between
Skill and Load.

**What the build proceeds under.** **Seven columns** — Skill, Source, Path, Trigger, Invocation, Load,
Description — which is REQ-WORKSPACE-067's set with the selector it requires drawn as the mockup draws
it. Every column either requirement names is present; the disagreement is only about how many there
are. **What the ruling decides** is whether REQ-CONFIG-343's count is amended to match domain 13 (the
cheap reading, and what is built) or whether domain 13's Path column is dropped — which would undo an
amendment made three weeks earlier for a stated reason.

### ESC-39 — a skill whose command name is taken: REQ-CHAT-034 skips it, REQ-SHELL-056 renames it

**Raised 2026-09-14. RULED 2026-09-27: suffixed** (see "Rulings after the gate — 2026-09-27" below). Raised by the same planning pass, on the one rule that decides
whether a discovered skill can be silently unreachable.

- **REQ-CHAT-034** (domain 03): "Where such a name is already taken, the command already holding it
  keeps it and **the skill's registration for that name is skipped**."
- **REQ-SHELL-056** (domain 12): a generated entry whose name collides with a built-in "**SHALL be
  offered under the first free name formed by appending `-2`, `-3`, …**, and its description SHALL
  additionally name the skill it came from — so **a skill is never silently unreachable** from the
  composer and a built-in command never changes meaning because a skill was installed."
- **REQ-WORKSPACE-072** (domain 13) names domain 12's rule as the one that governs and forbids a
  parallel one: collision handling is "exactly those REQ-SHELL-056 fixes … and this domain SHALL NOT
  define a parallel normalization or a first-registration-wins rule of its own."

Two domains therefore point at each other's opposite: domain 13 routes the question to domain 12's
suffixing, and domain 03 states skipping. The same pair of texts also disagree about **normalisation**
— REQ-CHAT-034 and REQ-WORKSPACE-072 say "normalized name", which REQ-WORKSPACE-054 defines as
collapsing every run outside `[a-z0-9]`, while REQ-SHELL-056's catalogue normal form collapses
whitespace and underscores to `-` and *removes* every other character, so `c++/build` normalises to
`c-build` under one and `cbuild` under the other.

**What the build proceeds under.** REQ-SHELL-056's rule, for both halves: **catalogue normal form** for
the command name, and **`-2`, `-3` suffixing** on collision with the description naming the skill.
REQ-WORKSPACE-072 explicitly defers to it, REQ-SHELL-056 states its reason in the requirement text, and
the two readings are reconcilable in one direction only — under suffixing, the command holding the name
does keep it, which is REQ-CHAT-034's first clause; under skipping, REQ-SHELL-056's "never silently
unreachable" is simply false. The skill's **normalized name** (REQ-WORKSPACE-054) remains the identity
everywhere else: the policy map keys, the catalog block, the table, the shadowing rule. Only the
*command* takes catalogue normal form, which is what REQ-SHELL-056 says it contributes.

**What the ruling decides.** Whether REQ-CHAT-034's skipping clause is amended to cite REQ-SHELL-056,
and whether the two normal forms are one form or deliberately two. They can stay two — a skill's
identity and its typed command are different things — but nothing currently says so.

## Rulings and escalations after the gate — 2026-09-16

### ESC-41 — the exit-1 success conventions: REQ-TOOLS-112's test 4 against `git diff`, `diff` and `grep`

**Raised 2026-09-18, not yet ruled.** Found by the autopsy of run `cc6191a2` (logged as
[R-039](../product/requests.md#r-039)): the run's `git diff --no-index` with differences exits 1
carrying the payload the caller asked for, and the observation classified it `shell_failure` / error.
`REQ-TOOLS-112`'s test 4 reads "a non-zero exit code → `shell_failure` / error" with no carve-out, and
the conventions predate the corpus: `git diff` exits 1 when differences were found, `diff` exits 1 on
a difference, `grep` exits 1 on no match. Each is an answer, not a failure.

**What the build proceeds under.** The narrowed reading: exit 1 from a command whose leading tokens
name one of those conventions (`git … diff …`, `diff`, `grep`/`egrep`/`fgrep`/`rg`, head matched
case-insensitively per REQ-TOOLS-033) classifies `success` / info; every other non-zero exit still
classifies `shell_failure` / error, and a present `failure_kind` still outranks the map. The code is
`successExitOne` in `packages/agent-tools/src/terminal/classify.ts`, consulted before the generic
non-zero rule.

**What the ruling decides.** Whether `REQ-TOOLS-112`'s test 4 is amended with the named-convention
carve-out (what is built), or whether the blanket rule stands and the misclassification is recorded as
a known pitfall instead. The amendment would land in `REQ-TOOLS-112` alone; no other test of the
cascade moves.

### ESC-40 — `session_log_level`'s default and vocabulary: REQ-CLI-065's lowercase `info` against three requirements' uppercase `WARNING`

**Raised 2026-09-16. RULED 2026-09-18: domain 07 wins.** Found while reading the application log for R-026's sixth
finding: four live requirements fix the same configuration key, and one of them fixes it differently
in every part.

- **REQ-CONFIG-121** (domain 15): "`session_log_level` (string, default `WARNING`) … The documented
  vocabulary is `DEBUG`/`INFO`/`WARNING`/`ERROR`; the value is **not** validated against that list."
- **REQ-SESSION-142** (domain 07): "at the configured session log level (default WARNING; the strings
  DEBUG/INFO/WARNING/ERROR **and integer levels** accepted; an unknown string falls back to WARNING
  **and logs a warning**)".
- **REQ-MONITOR-238** (domain 02): "written at the configured session log level, **defaulting to
  warning**."
- **REQ-CLI-065** (domain 18): "`runtime.session_log_level`, whose value is one of `debug`, `info`,
  `warning`, and `error`, whose **default is `info`**, and whose **unrecognized values are treated as
  `info`**."

Three disagreements in one key, not one: the **default** (`WARNING` against `info`), the **vocabulary**
(uppercase with integers accepted against a lowercase closed set), and what an **unrecognised value**
does (fall back to `WARNING` with a warning against silently reading as `info`). The last is the one a
user would notice: under domain 18 a typo is quietly one level more verbose than intended; under domain
07 it is one level quieter and says so.

**What the build proceeds under.** Domain 07's reading, which is also domain 15's and domain 02's: the
default is `WARNING`, the parse is case-insensitive (`WARN` included), integer levels are accepted, and
an unknown string falls back to `WARNING` with a warning (`packages/engine/src/session-log.ts`,
`parseLogLevel`; `apps/desktop/src/run-host/configuration.ts`). Three requirements against one, and the
one is the CLI domain describing a key the desktop run host owns. **REQ-CLI-065's default of `info` is
not implemented and is not treated as a defect of the code** — it is treated as this escalation.

**What the ruling decides.** Whether the key's vocabulary is the uppercase set the other three name
(with domain 18 amended to cite it) or the lowercase closed set domain 18 states; and whether a
headless run is meant to default to a *more* verbose log than an attended one, which is the only
reading under which both defaults stand. If it is, the key needs two defaults and a requirement saying
which context selects which — nothing currently says so.

**RULED 2026-09-18: the uppercase set the other three name.** The default is `WARNING`, the parse
is case-insensitive (`WARN` included), integer levels are accepted, and an unknown string falls back
to `WARNING` with a warning — the behaviour `packages/engine/src/session-log.ts` already implements
under REQ-SESSION-142. REQ-CLI-065 is amended to cite that set instead of its own; no second default
is minted, headless or otherwise.

### OQ-62 — a provider-reported cost, ruled; the other two branches stated and left open

**Ruled 2026-09-16, one branch of three.** OQ-62 asked three separable questions and the owner's answer
to R-026 settles exactly one of them.

- **A provider-reported cost — RULED.** `REQ-MONITOR-166`'s qualifier set gains a fourth member for a
  figure the provider itself computed, and the adapter asks for and reads OpenRouter's `usage.cost`.
  The disposition is **`PD-MONITOR-001`** (`docs/product/directives.md`), not an amendment round,
  because it narrows a requirement the owner is choosing to govern rather than correcting one that is
  wrong. What makes this branch rulable ahead of the other two: carrying a figure the provider computed
  needs **exact decimal addition only and never a multiplication**, so `REQ-PROVIDER-121`'s one money
  rule is met without deciding what a *price* is — which is OQ-21's question and ADR-0031's spike. **Built
  the same day it was ruled** (`packages/model/src/reported-cost.ts`, `packages/engine/src/money.ts`); the
  first execution is reported into the directive and into ADR-0031 in place.
- **Discovery pricing — stated, not ruled.** `REQ-PROVIDER-072` admits pricing "only for
  `concrete-cloud`" and `discovery.ts` returns `pricing: {}` unconditionally, with a test pinning it.
  An amendment would land there. It stays blocked behind **OQ-21**, because carrying a per-token price
  is deciding what a price is.
- **Configured rates — unchanged, and deliberately unbuilt.** `effectivePricing()` has no call sites
  and keeps none until OQ-21 answers and ADR-0031 has had the spike it names. ADR-0031's first accepted
  consequence already rules the interim: if the float typing stands, the exactness is unattainable and
  that is "a specification defect to be recorded rather than a design to be built around".

**What this ruling does not do.** It does not make every run's cost non-zero. A provider that reports no
cost still yields `unknown`, which is what `REQ-MONITOR-166` provides for, and a configured rate still
produces nothing at all. The `0` the owner saw is closed for OpenRouter and open everywhere else.

## Rulings after the gate — 2026-09-23

### OQ-63 — the application log's threshold, ruled

**Ruled 2026-09-23 (R-048).** The owner accepted the proposal put to them for the open defect note
`the-application-log-keeps-every-level-because-nothing-reads-one.md`: the application log records `info`
and above by default, carries each line's level as a field, and restores `debug` only through the
environment variable `ROTARIS_APP_LOG_LEVEL`. No configuration key or settings control governs it, and
`session_log_level` keeps governing the per-session log alone (REQ-CONFIG-121, REQ-MONITOR-238).

The disposition is **`PD-MONITOR-002`**. It is a directive rather than an amendment round because the
specification is silent about this log's level and the owner is deciding new behaviour, which
`docs/product/README.md` routes to a `PD`. The answers to OQ-63's three questions: a threshold, yes; its
own switch, not `session_log_level`'s key; and an environment switch that restores `debug`, which is the
shape the question named.

**What this ruling does not do.** It builds nothing. Until the directive is built the log keeps every level,
and the directive owes its first execution into `first-executions.md` when it is.

### OQ-21 — per-token prices are decimal strings, ruled; OQ-62's configured-rate branch with it

**Ruled 2026-09-23 (R-049).** The owner approved the design recorded on
`docs/defects/configured-per-token-prices-take-no-effect.md`. Three records carry it:

- **OQ-21, answered as it recommended, by amendment.** `REQ-PROVIDER-072` and the snapshot formats typed
  prices as floats while `REQ-PROVIDER-121` forbids float money, so the corpus disagreed with itself and is
  corrected in place: `REQ-CONFIG-088` (decimal ≥ 0, a YAML number taken as the decimal its text states),
  `REQ-PROVIDER-072`, and the two `pricing` format blocks in domains 04 and 15. Each carries an inline
  amendment mark, and each domain's resolution record carries the amendment note.
- **ADR-0031, accepted in narrowed form.** The Decimal is `money.ts`'s scaled `bigint` with no scale fixed in
  advance. Pricing adds exact multiplication by a whole token count, which needs no library and no spike. The
  lint rule banning arithmetic on the branded type is built with it. The library question stays open only for
  the balance division of `REQ-PROVIDER-130`.
- **`PD-MONITOR-001` revision 2.** A request the provider did not price is priced from configured rates, and
  all four of `REQ-MONITOR-166`'s qualifiers get a producer and a fixed label. A revision rather than a new
  directive, because one requirement carries one narrowing directive.

**Deferred:** OQ-62's discovery-pricing branch. **Prerequisite for building:** the repair of
`docs/defects/a-delegated-childs-provider-requests-never-reach-the-runs-totals.md`.

**What this ruling does not do.** It builds nothing. Every configured run still reads `"0"` under `unknown`
until the revision is built, and its first execution reports into `first-executions.md`, ADR-0031 and the
directive.

## Rulings after the gate — 2026-09-27

*Ruled together from the first release plan's O-1 ([R-052](../product/requests.md#r-052)). The owner took
each recommendation as written in `first-release-plan.md` §2.1 and §3.1. Each recommendation was the reading
already built, so the rulings change requirement text and no behaviour.*

### ESC-37, ESC-38, ESC-39 — the three portable-skill escalations, ruled

- **ESC-37: domain 13 stands.** Invoking a skill's command loads it for the current session and delivers it
  as `REQ-WORKSPACE-062`'s force-loaded block, carrying `REQ-CHAT-162`'s three identifying facts and the
  verbatim body. No in-context indicator and no composer chip exist anywhere. Amended: `REQ-CHAT-034`
  (delivery) and `REQ-CHAT-162` (the listing's in-context column and the "mark it as in context" sentence).
- **ESC-38: seven columns.** Skill, Source, Path, Trigger, Invocation, Load, Description. Amended:
  `REQ-CONFIG-343`'s count.
- **ESC-39: suffixed.** A taken command name is offered under `REQ-SHELL-056`'s first free `-2`, `-3`, …,
  with the description naming the skill. The command takes the catalogue normal form, and the skill's
  identity stays `REQ-WORKSPACE-054`'s normalized name, deliberately two forms. Amended: `REQ-CHAT-034`'s
  collision clause.

Each amended requirement carries an inline amendment mark, and the resolution records of domains 03 and 15
carry the amendment notes. ADR-0063's rulings table now reads as ruled.

**What these rulings change for the first release.** The `/skills` listing (`first-release-plan.md` §2.2) is
built without an in-context column.

### OQ-64 — an instruction override suppresses its base only while it is switched on, ruled

**Ruled 2026-09-27 (R-052), as built.** Suppression is computed over the enabled set: switching an override
off returns its base to the merge, and the Instructions inventory gains no *suppressed* row state.
`PD-WORKSPACE-002`'s injection paragraph states the ruling in place, since that directive governs
`REQ-WORKSPACE-042`. The injection proof (`first-release-plan.md` §3.3) asserts this reading.

### The updater ships in the first release, ruled

**Ruled 2026-09-27 (R-052).** The first release carries the updater of `REQ-STARTUP-107..124`, built to
`REQ-STARTUP-122`'s strict sequence with the installer and portable apply strategies. This is scheduling
within live requirements, so nothing is amended. `first-release-plan.md` §4.6 schedules it.

