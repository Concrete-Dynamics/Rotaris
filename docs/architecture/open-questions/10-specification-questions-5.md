# Open questions — Specification questions (5 of 27)

Part 10 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-45 – OQ-52.

**OQ-45 — Decision closed, 2026-09-11: ADR-0061 owns the store.** This entry had stopped being a question for the
owner when ESC-30 was ruled and applied on 2026-09-02; what remained was a record nobody had written, and
**ADR-0061 — The improvement artifact store's write path** is now it. It takes the second of the two horns this
entry names: the version write stays **outside** the artifact write's all-or-nothing boundary, as `REQ-LIBRARY-047`
requires, and the store carries a count of versions *allocated* as against retained so the export can tell a
version that was never recorded from one retention pruned. The first horn — bringing the version write inside the
transaction — is refused for the reason this entry gives: it would let a failed version write undo the review
decision it was recording, which is worse for a user than an imprecise export. Constraint **W-26** is satisfied by
the same counter shape ADR-0041 already obliges for transitions, and **ESC-3's ruling has an architectural home**
again. ADR-0041's scope note is amended to point at it.

**Historical question.** *Its product half was ESC-30, which is now RULED AND
APPLIED (2026-09-02); the storage half stays here and is what remains open.*** *(ADR-0003, ADR-0004, ADR-0041; ESC-3, ESC-18,
ESC-30; constraint C-10.)*

***What moved.*** `REQ-LIBRARY-052` now obliges the store to state how many versions pruning dropped and
`REQ-LIBRARY-176` forbids the export implying that figure accounts for every absence — so the *falsehood*
this entry produced is fixed. **What is not fixed and is not this register's to fix** is whether the
export must distinguish a version absent because `REQ-LIBRARY-047`'s best-effort write never recorded it
from one retention pruned: that was **ESC-30**, raised rather than taken, because bringing version
recording inside the write's all-or-nothing boundary makes the audit trail complete at the cost of review
actions failing in a workspace whose version store is unwritable. ***ESC-30 has since been RULED — make them
distinguishable — and applied on 2026-09-02***, and the ruling took neither horn whole: `REQ-LIBRARY-047`
records **inside** its all-or-nothing operation that a version was *due*, so a version the best-effort write
then failed to record is afterwards known to be absent and countable, while version recording itself stays
best-effort and a version that cannot be recorded still does not undo the artifact write; `REQ-LIBRARY-176`
then carries **two separate figures** per artifact. **The part that stays open here is the one nobody owns
either way, and it is now narrower rather than gone**: the write path that would maintain a count of versions *allocated* as
against retained (constraint W-26). ADR-0041 takes the export and names the fix; no record owns the write.
`REQ-LIBRARY-042`'s read-modify-write semantics, `REQ-LIBRARY-043`'s atomic-replace-with-retry contract,
`REQ-LIBRARY-047`'s all-or-nothing artifact write with a best-effort history write, `REQ-LIBRARY-049`'s
full-copy version files and `REQ-LIBRARY-052`'s intermediate-version pruning are described **only** inside
ADR-0003 and ADR-0004 — and both of those are about the file/row line and the atomic primitive, not about
this store. SR-4 moves it to rows, which changes `REQ-LIBRARY-047`'s "best effort" into a deliberate
decision about whether the history write stays outside the transaction, and makes ESC-3's ruled defect
unreachable (ESC-18). **ESC-3's ruling therefore currently has no architectural home**, and the two ADRs
that mention it are exactly the two whose file-based framing has just been removed. This is a gap in the
decision record rather than in the specification, and it needs either an ADR or an explicit statement
that ADR-0041 adopts the store; ADR-0041 declines, correctly, because the rule is not the delivery
store's.

***Narrowed by the amendment rather than by any pass of this record.*** `REQ-LIBRARY-042` now requires
the read-modify-write to **take effect as one indivisible step** and records ESC-3's accepted defect as
withdrawn "as unreachable, not as unimportant"; `REQ-LIBRARY-043` states the atomicity observable and
withdraws the mechanism, and `REQ-LIBRARY-158` gives the reason no ladder is needed (constraints C-10,
D-25, and OQ-11 as rewritten). **What remains unowned is one write**: `REQ-LIBRARY-047`'s best-effort
artifact-history write, which is now a decision about whether that write stays outside the transaction —
and if it does, what a user is told when the artifact lands and its history entry does not.

***Narrowed again, and sharpened, 2026-09-02.*** *Narrowed:* ADR-0041 now takes the improvement store's
**export** and only the export, because `REQ-LIBRARY-176` and `REQ-TRACE-514` were minted by one ruling
over one guarantee and splitting them across two records would produce a second, divergent
implementation of it by accident. That is stated as a scope note in ADR-0041's header rather than as an
adoption of the store, and the **write path is still the orphan**. *Sharpened, and this is the part that
makes the entry more owed rather than less:* ESC-18 removed ESC-3's ruling, so this entry can read as
having decayed into nothing. It has not. `REQ-LIBRARY-047`'s best-effort version write was **untouched by
that amendment**, and it now interacts with a requirement that did not exist when this question was
filed. `REQ-LIBRARY-176` requires the export to state where retention "has dropped intermediate versions
… and how many". Under `REQ-LIBRARY-047` a version can be absent because it was **never recorded** —
"when the artifact is stored but its version cannot be, the save MUST still report success … and the
failure MUST appear only in the application log" — and nothing in the corpus requires the store to retain
enough to tell that apart from a `REQ-LIBRARY-052` prune. The two mean different things to a user: one is
the product working as specified, the other is data they were told about only in a log.

**The resolution is a choice between two things and both belong to whoever takes this store**: bring the
version write inside the transaction, which `REQ-LIBRARY-047` currently forbids and which would make a
failed version undo the review decision it recorded; or keep it outside and give the store a count of
versions **allocated** as well as retained, so the export can distinguish the two causes. The second
costs nothing if it is taken alongside ADR-0041's transitions-ever-recorded counter, which is the same
shape of obligation for the same reason (constraints C-10, W-26). **Someone should own this store before
it is discovered from a user's export.**

**OQ-46 — CLOSED as a policy decision, 2026-09-06; implemented 2026-09-13.** *(ADR-0002, ADR-0055;
constraint R-17.)*

The accepted review answers **one aggregate notice for the batch**: `REQ-SHELL-155` keeps its singular title
word for word for a single repaired session, and a batch raises exactly one warning naming how many were
repaired, naming them, and carrying a route to the surface the affected-session list is reached from.
`REQ-SESSION-062` keeps one timeline entry per repaired session — the record is unchanged by what is shown —
and continuation is offered only once the relevant batch has settled. **No escalation is needed**: this entry
said the answer becomes one *only if* it changes the notice vocabulary `REQ-NOTIFY-044` and `REQ-NOTIFY-048`
to `REQ-NOTIFY-050` close, and it does not — the route is `open-view` to Overview, an existing member of
`REQ-SHELL-115`'s closed list, whose own "List sessions" control opens the browser. A reader who thinks the
list deserves a member of its own should raise that as the escalation; nothing here presumes the answer.

***What building it found.*** `REQ-SESSION-062` fixes the repair's timeline entry exactly — type, severity,
actor, message and metadata keys — and the implementation had invented every one of them but the actor:
`session_marked_interrupted` for a type the requirement calls `session.interrupted_recovered`, the default
`info` for a severity it fixes as `warning`, a two-sentence message for one it fixes word for word, and
`previous_status` for `previous_execution_status`, with `execution_status` missing beside it. A reader of the
exported timeline (`REQ-SESSION-199`) could not have found the entry the specification promises. It was
reachable only by auditing the requirement this entry names, which is what this closure required and what a
sweep of the surrounding code would not have done.

**Historical question — the repair notice is specified in the singular and the failure it reports is plural.**
`REQ-SESSION-062` and `REQ-SHELL-155` specify a repair notice
written for **one** stale session. ADR-0002 now accepts as a consequence rather than disputing that a
run-host crash produces **one stale session per in-flight run**, possibly across several workspaces — and
`REQ-MONITOR-249` to `REQ-MONITOR-258` make concurrent runs a supported and encouraged shape, so the
realistic failure is three or five sessions needing repair at once. Whether that is one notice naming
several sessions or several notices is a user-visible behaviour no requirement states. The reap must
settle **all** of them before any is offered for continuation, which is an architecture obligation and is
recorded in ADR-0002; what the user is shown is not. **This was hypothetical while a run-host crash was
disputed and is reachable now that it is accepted.** It becomes an escalation only if the answer changes
the notice vocabulary `REQ-NOTIFY-044` and `REQ-NOTIFY-048` to `REQ-NOTIFY-050` close.

**OQ-47 — Two concurrently open workspaces presenting one identifier. *NOT closed by ESC-26, and ADR-0058
now says so explicitly (2026-09-02). Ruled 2026-10-06.*** *(ADR-0058, ADR-0002; constraints W-19, W-01, W-27.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** ADR-0058's behaviour is ratified: the identifier is claimed once per instance, and a second concurrently open workspace presenting one opens without a store, reporting it in REQ-SESSION-089's vocabulary and naming both paths; a sequential open is not detected. For the first release the remedy for a copied folder or a corrupt identifier file stays the user's hand edit of that file, and no product action is added.

***Read this before assuming ESC-26 covered it.*** ESC-26 granted `REQ-SESSION-197` one exception and the
amendment has landed — but it is **confined to `REQ-SESSION-201`'s restore action** and the requirement
names, one by one, the paths that do *not* gain it. **A user who copies a workspace folder and wants the
copy to have an identity of its own still has no product action**, so this entry's first two paragraphs —
the concurrent two-copies-one-identifier behaviour, and the absence of any remedy for a copied folder or a
corrupt identifier file — **stay open exactly as they were**. What ESC-26 removed is only the *other*
route to the same dead end, the clone-then-restore recovery, which this entry's own text cited as evidence
that reaching one dead end twice by two independent routes was significant. **One of the two routes is now
closed and the other is not, which is a narrowing rather than a resolution.** *Related but distinct:* the
**store**-side hazard of one identifier reached two ways is now constraint **W-27** and is a correctness
rule with a measured, silent failure mode; this entry remains about the *workspace* side, where the hazard
is a resume in one window starting an agent that writes into the folder the user does not have open. `REQ-SESSION-197` fixes that a **copied** folder carries the
identifier unchanged, and that the product **MUST NOT** mint a replacement over an identifier it can read
— so two folders on one machine necessarily resolve to one store. **No requirement says what happens when
both are open at once.**

**The unstated-and-unsafe reading is that both windows share the store**, which lists in each window
sessions whose resume starts an agent writing files into the folder the user does not have open
(`REQ-SESSION-014`'s `workspace_root`). The hazard is not corruption.

**ADR-0058 decides it rather than leaving it, and the decision is filed here rather than presented as
settled**, because leaving it open means the implementation picks and the appealing pick is the unsafe
one. Concurrently: the identifier is claimed once per instance, beside the instance claim main already
holds, and the second workspace opens **without a store**, reporting the condition in `REQ-SESSION-089`'s
own vocabulary — the workspace opens, there is no store, there are no sessions and no runs — naming both
paths. Sequentially — open one, close it, open the other — **nothing** may happen, because that case is
indistinguishable from a move and any detection there would break `REQ-SESSION-197`. The whole decision
is expressible in vocabulary the specification already has, which is why it is offered for ratification
rather than as an amendment.

**A second, smaller silence sits underneath it and the above does not resolve it.** `REQ-SESSION-197`
forbids re-minting over a readable identifier **absolutely**, with no user-confirmed exception. That is
right for the failure it prevents — silently orphaning a history — and it means the **only** remedy for a
copied folder, and for a corrupt identifier file, is the user editing or deleting a file by hand. There
is no product action for either. None was invented, because the requirement is absolute; a reader should
notice that the product's answer to a common user action is "go and edit this file".

***That dead end is now reached by a second, independent route, and the coincidence is evidence
(2026-09-02).*** `REQ-SESSION-201`'s restore hits it from the opposite direction: a user who clones their
repository on a new machine, opens it once — which mints an identifier — and *then* restores their
backup has an artifact naming one identifier and a workspace carrying another, and the product may not
touch either. That is the common shape of disaster recovery, and its only remedy is the same hand edit.
Two independent routes to one hand edit is a stronger case for a narrow, explicit, user-confirmed
exception than either route alone. **It is escalated as ESC-26 and is not decided here.**

***The third paragraph of this entry is DISCHARGED, 2026-09-02, and is preserved as the mistake it was.***
It read: "**And two records disagree about what identifies a workspace.** ADR-0002 keys the workspace
service by **resolved path**; ADR-0058 keys the store claim by **identifier**. That is the minimum
consistent arrangement and not a settled one." **The framing was wrong and must not be cited.** The two
records key two *different objects*, and the specification fixes both keys separately and in terms —
`REQ-STARTUP-041`(a), `REQ-STARTUP-163`, `REQ-STARTUP-047`/`048` and `REQ-STARTUP-166` all key the open
workspace by its **resolved directory**, while `REQ-SESSION-001`, `REQ-SESSION-197`, `REQ-SESSION-198`
and `REQ-LIBRARY-042` all key the durable store by the **identifier**, and `REQ-SESSION-001` composes
both in one sentence. Neither collapse is available: keying the service by identifier gives one service
two roots, and every job it does — configuration against one `.rotaris/`, Git in one checkout, worktrees
under one root, `REQ-TRACE-073`'s scan over one repository, the delivery store against one set of
requirement documents — is directory-scoped; keying the store by path is the field's filed, painful,
most-complained-of defect (ESC-19's survey: one report of 63 sessions lost across 10 projects after a
reorganisation, and even a change of a folder name's *case* orphaning everything). ADR-0002 holds the
argument and constraint W-19 carries it. **The first two paragraphs of this entry are untouched and stay
open.**

**OQ-48 — Reclaiming a machine-local store whose workspace no longer exists. *MORE owed after ESC-26, and
the surface changes purpose (2026-09-02).*** *(ADR-0058; constraints W-17, W-22, W-24.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

***ESC-26 adds a third producer and a third shape of leftover.*** A confirmed identifier establishment
leaves the **old** identifier's store intact and merely unreferenced — that is one of the five conditions
the exception is bound by, and it is what makes a one-way-looking operation safe to confirm. So there are
now three sources of a store nothing points at: the corruption ladder displaces a damaged store and keeps
it (W-17), a restore displaces the store it replaces and keeps it (W-24), and a confirmed establishment
orphans the workspace's previous one. **The surface's purpose changes with it.** It was the route to
*clearing* a store a user does not want; it is now also **the only route back to a store a user may well
want**, because after a confirmed establishment the previous history is reachable by nothing else in the
product. That makes "offer the exports first" a stronger obligation rather than a courtesy, and it makes
the absence of the surface a larger gap than it was. `REQ-SESSION-166` deletes one session. ESC-15 moved every session's
record out of the workspace. **Nothing addresses a whole store that nothing points at** after the user
deletes the project, re-identifies it, or clones it fresh — a hole the ruling opened and the amendment
pass did not close.

**ADR-0058 decides it in three parts and refuses the appealing one.** The pre-migration copy is reclaimed
by the product at the next clean open. A store nothing references is reclaimed **only** by an explicit,
user-confirmed action from a surface listing this machine's stores with last-seen paths, size, session
count and last-open time, **offering the exports first**. **Automatic reclamation is refused**, and the
reason is the whole of it: the only signal available is that a last-seen path no longer resolves, and a
path fails to resolve when a drive is unmounted, when a share is down, and above all **when the folder
has been moved** — precisely the case the identifier exists to survive. Reclaiming on that signal would
delete a user's history to punish them for the operation the design supports.

**The surface that decision assumes does not exist**, in the specification or in any other ADR, and
`origin.txt` — which records last-seen paths for diagnostics and for exactly this listing — **must not**
be consulted to resolve a store, so it cannot quietly become an identity mechanism. Ratify the behaviour,
or state that an orphaned store is never reclaimed and the disk cost is accepted.

***Unchanged in substance and MORE owed, 2026-09-02.*** The surface still does not exist, and ESC-19 has
added a second and a third source of stores nothing points at: **a restore displaces the store it
replaces** and keeps it under a UTC-timestamped name rather than deleting it (constraint W-24), and the
corruption ladder displaces a damaged one (W-17). Both are deliberate and both are right — the user is
mid-recovery in each case and a deleted store is history that existed nowhere else. But it means **the
two operations a user in trouble is most likely to reach for are the two that produce leftovers only this
surface can clear**, and it is the one surface the record assumes and nothing owns.

***MEASURED 2026-09-02, and the count of leftover kinds went from three to FIVE while the consequence
that tracks them was not updated.*** `spikes/backup-restore-mechanism.md` ran the restore and left two
kinds of leftover nobody has named. **(4) The staging directory.** In every measured failure — 30 of 30 on
the record's literal reading, 30 of 30 with a file manager holding the store's own directory, 30 of 30 at
second-granularity stamp collision, and the timeout case — a **full copy of the artifact's store** was left
at `<identifier>.restoring-<n>`. ADR-0058's layout block calls it "transient" and **no step deletes it**. It
is the size of the store. **(5) The obstruction aside-name.** The corrected reversal is displace-then-rename
and its displace step renames an occupying `<identifier>` aside to `<identifier>.obstruction-<stamp>`, which
is kept and never deleted on the same reclamation argument as everything else here. **Neither is enumerated
in ADR-0058 consequence 5, which is the consequence that tracks them**, and both are inside this question's
surface rather than beside it. *The register's observation, which is the reason this is written here rather
than left to the ADR:* every mechanism this record has added that displaces something has added a leftover
kind, none has added a way to reclaim one, and the surface that would clear all five still exists nowhere.
**Whoever owns ADR-0058 consequence 5 should be told, and this question is now owed five shapes rather than
three.**

**OQ-49 — What makes two directory strings the same directory. *RESOLVED 2026-09-02 by amendment.***
*(ADR-0002; constraint W-25, and now constraint W-27 for the store side.)* `REQ-STARTUP-163` **now owns
this**: what is resolved, what is deliberately not reconciled, and the bounded cost of not reconciling it,
plus two additions ADR-0002 did not state — a trailing separator carries no meaning, and abbreviated
alternate spellings the filesystem itself resolves are resolved. It states in terms that it is **not** the
definition of workspace identity, which is `REQ-SESSION-197`'s and is never derived from a path.
**ADR-0002 should now cite rather than decide, and W-25 moves from a ruling to a requirement citation.**
***One thing this closure does NOT cover, and a reader will assume it does.*** The requirement settles
which *window* a launch reaches. It says nothing about the **store**, where the same hazard is a
correctness failure rather than a usability one: two spellings of one store path were measured losing up
to 95 % of committed rows with both writers reporting success and a clean integrity check. That is
constraint **W-27** — one store, one canonical spelling, resolved once — and it is architecture's, not the
specification's. The original entry follows. `REQ-STARTUP-163` decides window reuse on whether "a main window of that instance already has
that directory open" and `REQ-STARTUP-041`(a) requires the directory "resolved and persisted as the
remembered workspace". **Neither fixes what makes two directory strings the same directory.** Symlinks,
junctions, filesystem case sensitivity and UNC against mapped-drive spellings all bear on it, and the
answer is user-visible: it decides whether a launch surfaces the window the user already has or builds a
second one on the same folder.

**ADR-0002 has decided it, because the workspace service needed a key**, and the decision is filed here
rather than presented as settled. Absolute and normalised; symlinks and junctions resolved to the real
path; compared case-insensitively where the filesystem is; and **not** reconciled across UNC against
mapped-drive spellings, because there is no reliable cross-platform way to do that and a wrong answer
merges two workspaces silently — which is a worse failure than declining to merge them.

**This is low-stakes and is filed anyway, and the reason is the shape rather than the size.** Where two
spellings fail to canonicalise the outcome is bounded: two workspace services, one identifier, and
ADR-0058's per-instance claim gives the store to the first, which is W-19's stated behaviour rather than
a new one. But it is user-observable behaviour invented on a specification silence, which is exactly the
class this register exists to keep visible, and a requirement would supersede it at no cost.

---

**OQ-50 — Validation by discovery proves nothing against a public catalog.** *(ADR-0030; raised by the slice's
first execution, 2026-09-05.)* `REQ-PROVIDER-133` holds that a key-based provider's credential is persisted only
after successful discovery, "so a bad key is never stored silently", and `REQ-PROVIDER-052/054/108` make discovery
the validation. OpenRouter's `/models` answers **without** any key, so a value of another vendor's shape was
discovered against, stored as authenticated, and refused at the first model call. The requirement's guarantee
rests on a property of the endpoint it does not state. The build now repeats the catalog request without the key
after a successful discovery and, where that also succeeds, completes the sign-in but says the key could not be
validated and leaves the provider's health unchecked. What the specification should decide: whether an
OpenAI-compatible instance's validation may issue a minimal paid request (the only authenticated call every such
endpoint has), whether a public catalog is a warning or a refusal, and where the statement lives.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the built warning stands: after a successful discovery the catalog is asked again without the key, and where that also succeeds the sign-in completes saying the key could not be validated and leaves the provider's health unchecked. No paid validation request is made, and a public catalog is a warning, not a refusal.

**OQ-51 — Does an UNSCOPED queued prompt still exist?** *(No ADR; raised against `REQ-CHAT-039` by the composer's
first execution, Part AB, 2026-09-07.)* `REQ-CHAT-038` gives a queued prompt "a session ownership field (empty =
unscoped)" and `REQ-CHAT-039` gives an unscoped prompt a behaviour of its own: it "MUST be consumable by any run
but invisible to session-scoped listings". **Two things in the record now disagree with that sentence.**

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the unscoped queued prompt is withdrawn: every queued prompt belongs to a session, as the store has required since v6. [`PD-CHAT-007`](../../product/directives/pd-chat-007.md#pd-chat-007) narrows REQ-CHAT-038 and REQ-CHAT-039. The code's comments that call this question open (`packages/engine/src/sessions.ts`, `packages/store/src/schema.ts`) are not changed by this ruling. *(2026-10-06, fin22: `sessions.ts`'s are now worded to `PD-CHAT-007`; `schema.ts`'s sits in the shipped v13 migration and keeps its words.)*

1. **The store cannot represent one, and has not been able to since v6.** `queued_prompts.session_id` is
   `TEXT NOT NULL REFERENCES sessions(session_id)` (`store/src/schema.ts`, the v6 migration), so every queued
   prompt is scoped by construction. Nothing has ever written an unscoped one and no route offers to.
2. **`REQ-CHAT-041` was amended on 2026-09-07 and 039 was not amended with it.** The amendment
   (`docs/spec/resolutions/2026-09-06-accepted-review.md`, OQ-1/7/9/16/35) replaced "every window and every run
   sharing the same process" with "eligible windows and runs for the **same session ID** across its processes",
   and added "one authoritative service owns the queue and atomic queued-to-triggered transitions". Its own
   summary line reads "REQ-CHAT-041 assigns **one session-scoped queue** to the application instance." A queue
   that is session-scoped per instance has no place to put a prompt belonging to no session; but 039 still says
   one exists, and a requirement is not amended by another requirement's summary.

**What the owner should decide.** Either (a) an unscoped prompt is withdrawn — 039's second sentence goes, 038's
"empty = unscoped" becomes "always scoped", and the schema is already right; or (b) it survives, in which case
`REQ-CHAT-041`'s "same session ID" needs a carve-out saying which runs may consume a prompt belonging to no
session, `REQ-CHAT-036`'s panel needs a rule for a prompt it must not show but a run may consume, and the store
needs a nullable owner and a second visibility path.

**What Part AB built, and what it did not.** The **scoped** half is built and measured — ownership comes from the
session the prompt was submitted to (the control channel's addressing IS the explicit session id) or from a
`session_id` key in the context snapshot, which v13 now stores; a snapshot naming another session is refused
rather than silently re-scoped; ownership is the primary key's first column, so edit and trigger cannot move it;
and `pnpm composer-proof` measures REQ-CHAT-038's exactly-once transition under two callers on two connections.
The **unscoped** half is not implemented in either reading. `resolveQueueOwnership` returns an explicit
`unscoped` verdict that every route refuses, naming this question, so a future route meets a stated refusal
rather than a foreign-key error.

**OQ-52 — May a delegated child ask the user a structured question?** *(No ADR; raised against `REQ-TOOLS-002` by
structured questions' first execution, Part AC, 2026-09-07, and entered here by the manager — Part AC recorded it
in `children/personas.ts` and ADR-0016's note but not in this register, which is where a question has to be to be
answered.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** `ask_questions` stays on the orchestrator alone; a delegated child may not ask the user a structured question, and REQ-CHAT-051's single question trailer is unchanged.

The mechanism supports it: the wait registry is per tool port, and a port is one conversation, so a child could
hold its own pending prompt without disturbing the run's. Two things stop it being a decision the implementation
may take. **No requirement says which personas may ask** — `ask_questions` is declared by the orchestrator alone
in this build, and that was chosen to satisfy REQ-CHAT-094's one-pending-prompt-per-conversation rule rather than
because a requirement named the orchestrator. And **REQ-CHAT-051 defines ONE question trailer**: "a single question
row" attributed to the agent that asked. Two children asking at once has no defined presentation, and inventing a
second trailer would extend a vocabulary REQ-CHAT-046 closes.

Until it is answered the tool stays on the orchestrator, which is the narrow reading and refuses nothing a
requirement grants.
