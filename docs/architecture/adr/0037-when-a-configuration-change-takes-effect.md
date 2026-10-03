# ADR-0037 — When a configuration change takes effect, and who commits it

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. **The escalation this record carried is ruled** — `owner-decisions.md` ESC-1,
  option 2 — so the Escalation section becomes a Decision with the alternatives preserved. The three
  tiers are unchanged. Two other things moved: why configuration stays in files is now stated in the
  specification on grounds that are **not** the ones SR-4 originally gave (`REQ-CONFIG-477`, ESC-14),
  and Tier B's record of what a run actually used is a row rather than a file (SR-4).
- **Origin:** DATA (constraints E1–E4, ESC-1)
- **Depends on:** ADR-0002, ADR-0036
- **Carries a ruled escalation whose requirement amendment has not been made** — see *ESC-1, ruled*.

## Context

**Configuration stays in files, and this record no longer has to assume it.** `REQ-CONFIG-477` states
the boundary in the specification — configuration "MUST be held as files, and MUST NOT be moved into a
store that only this application can read" — and calls it "a stated **boundary**, not an artifact of how
the product was first built", so that a later migration "is a change someone has to argue for against
these grounds". Its four independently sufficient grounds are: a file carries what this release does not
understand where a record with a fixed field set cannot (`REQ-CONFIG-040`, `REQ-CONFIG-233`,
`REQ-CONFIG-442`, `REQ-CONFIG-458`); the product shows the user **the file's own contents** rather than
a rendering of the merged result, which is what the advanced runtime card's raw per-scope `runtime:`
view exists to do (`REQ-CONFIG-471`, and `REQ-CONFIG-445` records that this capability was deliberately
re-sited rather than dropped once already); version control stays the user's choice
(`REQ-CONFIG-013`, `REQ-CONFIG-456`); and three of the five layers are not per workspace at all
(`REQ-CONFIG-031`), so a workspace-scoped store could hold at most the last of them.

**Two of those grounds are this record's business specifically.** Ground 2 is the reason Tier A's
reload has something raw to render afterwards, and ground 1 is the reason Tier C can be "the absence of
a mechanism" without a key going missing — an unrecognised top-level key is warned about, contributes
nothing, and **is still in the file afterwards**.

**Do not cite SR-4's original argument for this.** SR-4's "why in one paragraph" listed
`REQ-CONFIG-192`'s unmigrated-record rule as "an argument about *configuration*, which stays in files".
ESC-14 corrects that: `REQ-CONFIG-192` is a configuration *key* whose *subject* is the delivery store,
and its unsupported-record rule is about **delivery records, which move to rows**. `REQ-CONFIG-192` as
amended says so itself — "That store is not configuration and `REQ-CONFIG-477`'s boundary does not reach
it." The conclusion was right by a route that has since been replaced, and the replacement is
`REQ-CONFIG-477`.

`REQ-CONFIG-261` (**Tier A**): a desktop settings save re-runs the configuration load at the end, so a
saved change is reflected within the same action, with no restart.

`REQ-CONFIG-262` (**Tier B**) is an architectural requirement, not a UI convenience: "when a run starts,
the loaded configuration is copied and the settings store's **current** values are layered on top, so
what a run uses is what is on screen at that moment, not whatever was last committed to the file. The
dirty flag therefore governs the **file**, not the **next run**."

`REQ-CONFIG-263` fixes the overlay's contents, and one clause is load-bearing: the model slots are
overlaid "**synthesising slot-level reasoning variants on the fly exactly as the loader does**". The
loader's synthesis step must therefore be a **callable transform over a configuration value**, not a
phase buried inside a file-reading pipeline. The overlay also strips the delegate tool from every role
under one delegation strategy, and filters tool servers to those both enabled and available in the
interface. `REQ-CONFIG-264`: the permission-mode overlay sets the runtime field only; per-role
permission pins are never widened by it.

`REQ-CONFIG-265` (**Tier C**): everything else — verification, hooks, checkpoints, requirements,
transcript, project classification, model entries beyond the slots, tool-server definitions — takes
effect at the next workspace open or application start.

`REQ-CONFIG-266` bounds observing an out-of-process change: the discovery snapshot is picked up on the
modification-time-or-size rule; a change to the published artifact set is reflected within **750 ms**,
and that figure is an **upper bound on how long the change may take to appear, not a polling
interval**; a change made inside this process appears without waiting for it; and the resolved per-user
configuration directory is fixed for the life of the process.

`REQ-CONFIG-417` and `REQ-CONFIG-418` fix **five persistence destinations, only one of which
participates in Save and Discard**: workspace and global configuration, committed by Save — with one
stated exception, a diagnostics toggle that writes its single key immediately through the scoped
per-field writer and is consequently **not undone by Discard**; desktop preferences, written the moment
the control moves; the external hook policy store, written immediately by its checkboxes; provider
credential storage and the provider catalogue, written asynchronously and entirely outside the dirty
flag; and theme and reduced motion, persisted by their own services. Tool-server enablement is **not** a
sixth destination: toggling a server records a session-scoped override that a run picks up under Tier B.

`REQ-CONFIG-279`: the settings screen's outward contract is "a set of intent notifications, not file
writes — the host commits; the screen never names a file".

## Alternatives considered

**A — One effect tier: everything takes effect at the next workspace open.** Simplest, and wrong:
`REQ-CONFIG-261` and `REQ-CONFIG-262` state two other behaviours in terms, and Tier B is observable —
a user who changes a model in the composer and starts a run gets the model on screen, not the one in
the file.

**B — Three tiers with the overlay computed at run start from the settings store.** Chosen, because it
is what the requirements describe.

**C — The renderer holds the effective configuration and hands it to the run.** Rejected: the renderer
is sandboxed and file-less (ADR-0002), and `REQ-CONFIG-279` makes the screen's contract intents rather
than values. It would also duplicate the loader in a process that cannot read files.

## Decision

- **Tier A** is a call: the settings save writes through ADR-0036's writers and then re-runs the load,
  in the workspace service, returning the reloaded value.
- **Tier B is a pure function applied at run start**, in the run host: take the loaded configuration,
  copy it, layer the settings store's current values on top, and run **the loader's own synthesis
  transform** over the result. Because ADR-0036 exports that transform, "exactly as the loader does" is
  true by construction rather than by two implementations agreeing.
- **Tier C is the absence of a mechanism**, and must be documented as such so nobody adds a watcher for
  a key the specification places in it.
- **The five destinations are five different write paths with five different lifetimes**, and the
  dirty flag governs exactly one of them. This must be visible in the settings-screen code, or the
  diagnostics-toggle exception and the credential asynchrony will be read as bugs.
- The 750 ms artifact-set bound is an **upper bound, not a poll**: the workspace service publishes the
  change when it makes it, and the bound is the deadline for a change made by another process to
  surface. `REQ-CONFIG-266` now says so in the requirement's own words and additionally names what the
  set is — the current workspace's artifact library, changed by any addition, removal or revision
  "whoever made it" — and adds that a change made inside this process appears without waiting. Under
  **SR-1** the "another process" that bound covers is another process **of this instance**, never a
  rival instance, which is consistent with **SR-3**'s withdrawal of every polling cadence: nothing times
  anything here, and the bound is a deadline on a publication.
- **The composer's permission-mode control writes its own key and nothing else** (ESC-1, ruled below).
  It is a Tier A write on destination 1 through `REQ-CONFIG-441`'s scoped per-field writer, not a Save.

## ESC-1, ruled — the shared save path between Settings and the composer's permission-mode control

`REQ-CONFIG-288` states the behaviour and then explicitly hands the decision over: "The same save path
is shared with the composer's permission-mode control, with the consequence that choosing a permission
mode there **also commits every other pending Settings edit**. A rewrite must decide about this
cross-surface coupling explicitly."

**Decided: option 2.** The product owner ruled ESC-1 on 2026-08-31: *"the composer control writes only
its own key, through the scoped per-field writer that already exists for this shape of write. Pending
Settings edits stay pending."* The stated grounds are that the coupling is preserved nowhere and that
"choosing a permission mode must not commit unrelated pending edits, because the surprise lands in a
security-relevant control". The writer is `REQ-CONFIG-441`'s scoped per-field write path, which
overlays only the keys it names, recursively through nested mappings as a section merge does, and writes
atomically with key order preserved and mode `0644` (`REQ-CONFIG-443`, `REQ-CONFIG-444`). The
`memory_diagnostics_enabled` toggle of `REQ-CONFIG-471` is the shipped precedent for exactly this shape
and is named as such by `REQ-CONFIG-441`.

**The requirement has not been amended, and this record must not pretend otherwise.**
`REQ-CONFIG-288` still states the coupling in the present tense, and the domain-15 resolution record's
own superseded-by-storage block says so in terms: ESC-1 "appears to be in the same position" as ESC-2,
"[n]either was in scope for the storage passes and neither is closed." **The decision is authorised and
the text is not yet aligned**, so an implementer reading `REQ-CONFIG-288` alone would build the
coupling. This is reported for amendment.

**A consequence of the ruling that nothing owns.** `REQ-CONFIG-423` fixes what the Settings screen's
permission-mode control shows: the pending settings state is "the single source the control reads", and
"a change to the same field made while Settings is open by another surface **that writes through the
shared save path (`REQ-CONFIG-288`)** lands in that pending state, and the control therefore shows it
after the next status refresh." Under option 2 the composer no longer writes through the shared save
path, so **`REQ-CONFIG-423`'s second sentence loses its antecedent**: a composer permission-mode change
now lands in the file and not in the pending state, leaving the open Settings screen showing a value the
file no longer holds. The owner's ruling requires explicitly that the decision "must not break
`REQ-CONFIG-423` or `REQ-CONFIG-418`". `REQ-CONFIG-418` is untouched — Discard still restores only
workspace configuration, and this write is outside the dirty flag exactly as the diagnostics toggle is.
`REQ-CONFIG-423` needs a rule, and there are two candidates: the composer's per-field write also updates
the pending settings state (preserving the requirement's observable at the cost of a second effect from
one action), or the requirement is amended to say the pending state tracks only the shared save path
(preserving the mechanism at the cost of a screen that can disagree with the file). **Neither is chosen
here**; the difference is visible to a user in the same security-relevant control the ruling was made to
protect.

The options as they stood, preserved because the ruling chose among them:

1. **Preserve the coupling.** Matches the stated behaviour exactly. A user with unsaved settings edits
   who changes the permission mode in the composer silently commits those edits. It is the only option
   with no conformance risk, and the only one where a user can be surprised — in a security-relevant
   control. *Refused by the ruling on that last ground.*
2. **The composer control writes only its own key**, through the scoped per-field writer that already
   exists for exactly this shape of write and leaves every other runtime key in that file untouched.
   Pending settings edits stay pending. This is the smallest change and the machinery is already
   specified. **Chosen.**
3. **The composer control becomes Tier B only** — it changes the live settings state, which the next run
   reads, and writes no file at all. `REQ-CONFIG-328` already notes the asymmetry that the composer's
   equivalent control writes and applies immediately, so this would change that. *Not taken. Worth
   noting that it is the option under which `REQ-CONFIG-423` would have held unchanged, since the
   pending state would have been the only thing written — the ruling bought a durable write and paid
   for it with the antecedent described above.*

Requirements the decision must not break: `REQ-CONFIG-423` (the Settings control shows the permission
mode held in the pending state, and a change made by any other surface writing through the shared save
path lands in that pending state) and `REQ-CONFIG-418` (Discard restores only workspace configuration).

## Consequences accepted

1. The synthesis transform is a public function of the configuration library, called from two places in
   two processes. Its purity is load-bearing.
2. Tier B means a run's effective configuration can differ from the file on disk, so **the launch-audit
   record** (ADR-0008) is the only record of what a run actually used. Under SR-4 that is a **row rather
   than `state/run_config.json`**, written exactly once per session by run start-up after the worktree
   bind and the sandbox verdict; a resume must not rewrite it, and its **absence** is what
   `REQ-SESSION-036` reads as an empty configuration snapshot (`REQ-SESSION-138`, `REQ-SESSION-132`,
   `REQ-SESSION-085`, `REQ-SESSION-087`). **The asymmetry this consequence describes is the point and it
   survives the move intact:** the thing a user edits is a file, and the thing that records what a run
   did with it is a row, because only the application reads the second. That is `REQ-CONFIG-477`'s
   boundary and SR-4's principle agreeing rather than colliding.
3. Five destinations means five failure stories. Only one of them is undone by Discard, and the
   diagnostics-toggle exception must be tested, not assumed. `REQ-CONFIG-418` now additionally requires
   the Discard control's explanation **and** the unsaved-changes guard's text to state that Discard does
   not undo desktop preferences, hook policy, provider changes, or theme and reduced motion — so the
   five-destination split is not only an implementation shape, it is text a user reads.
4. **The composer's permission-mode write becomes a sixth write occasion on destination 1** that is not
   Save, alongside the diagnostics toggle. Both use `REQ-CONFIG-441`'s writer and both escape Discard.
   Two exceptions to "destination 1 is committed by Save" is one more than `REQ-CONFIG-417` currently
   enumerates, and the second one has no text obligation attached to it the way the diagnostics card's
   does.

## Revisit if

`REQ-CONFIG-423`'s antecedent is settled either way, which decides whether the composer's write also
touches the pending settings state; or `REQ-CONFIG-288` is amended and says something other than what
ESC-1 ruled; or a requirement moves a key between tiers, which changes what a user must restart for; or
`REQ-CONFIG-266`'s 750 ms bound acquires a foreign writer to bound — under SR-1 there is no second
instance, so the only change it now covers is one made by another process **of this instance**, which
the publishing path already serves without waiting.

## First execution — 2026-09-05, the three tiers in the built app

*Recorded under GD-10.*

**Tier A** is the workspace service's `config.read`, `config.save` and `config.setField`, each followed by the
load again inside the same request; the reply is the reloaded snapshot, main broadcasts it to every window, and
the screen repopulates from it clean (REQ-CONFIG-261, REQ-CONFIG-419/425). *Amended 2026-10-03 (fin10): "broadcasts it
to every window" no longer holds. With two main windows on two workspaces (REQ-SHELL-020) every window taking the written
workspace's snapshot rewrote the other window's status strip and Settings to the first workspace's values, so main now
announces the reloaded snapshot to the family of each main window holding the written workspace — the main window, its
persona windows and its terminal window (`configFamily`) — and each other main window's family its own workspace's
snapshot, read again from its service (`announceConfig`, `apps/desktop/src/main/config-broadcast.ts`). The first form of
that repair (5df1943) announced to the main windows alone, and a persona window, which reads the snapshot for its model,
declared tools and compression threshold, kept a stale one until it was reopened.* **Tier B** is `overlayLiveState`
(`packages/config/src/tiers.ts`): the loaded configuration's merged document copied, the screen's current
values laid on it — the five slots with their companions, the repointing of roles that followed a slot's
previous value, the entry role, the session model and reasoning override, the eight runtime keys, the breaker
flag, the compression threshold — and `resolveMerged`, the loader's own passes, run over the result; the run
host receives the live state on every pending change (`config.liveState`) and applies it at the next run start,
and the loaded configuration is untouched (a pure function, pinned by test). **Tier C** is documented as the
absence of a mechanism in the loader's own header. Consequence 1 (purity load-bearing) held: the same function
resolves a file load and a live overlay.

**`REQ-CONFIG-423` under ESC-1 — the reading chosen.** Of the two candidates "Revisit if" left, this build takes
the first: **the composer's per-field write also updates the pending settings state.** Main broadcasts the
reloaded snapshot after the write and an open Settings screen repopulates the permission-mode field alone,
equality-guarded, leaving the dirty flag and every other pending edit as they were. The observable the
requirement fixes is preserved in the security-relevant control; the cost is one action with two effects
(the file and the pending state). The requirement's text is not amended by this work and the gap ESC-1 opened
is still reported. Consequence 4's sixth write occasion executed in the proof: the composer's control writes
`runtime.permission_mode` and nothing else, with no run active — the control is enabled without a run now,
where the tools part had disabled it, because the write is its own effect (REQ-CONFIG-328).

**Found: nothing in this record.**

## Second execution — 2026-09-05, a reload the user did not cause (Part K)

*The fourteenth defect of ADR-0058 consequence 17's pattern, in the reading this record took for REQ-CONFIG-423.*

The first execution's reading — "the composer's per-field write also updates the pending Settings state" — was
implemented as *keep the pending state on any reload from elsewhere and take only the composer's key from the
file*. The slice's first sign-in reloaded the configuration from a source that was neither Save nor the composer
(the snapshot's new slot picks, ADR-0030 → `config.bootstrap` → `config:changed`), and the Models grid went on
showing the shipped defaults over the discovered ones, dirty against a file it had never seen. The rule the
reading needs is REQ-CONFIG-419's: repopulate every field the user has NOT changed and keep every field they have
— field by field against the previous saved values (`rebasePending`, `ui/src/settings/config-state.ts`, tested).
The composer's case is the special case of that rule, not the rule. Kept beside the reading, not repaired quietly.

**A second reading, on REQ-CONFIG-041 and the starter file:** REQ-CONFIG-025's starter `agents.yaml` states the
twelve slot keys as explicit nulls, and the editor read a written null as "the workspace states this slot" with no
value. A written null overrides nothing, so the editor now reads it as unstated and shows the value the lower layer
supplies with that layer's origin — `discovered` for the snapshot's (REQ-CONFIG-341's vocabulary, added to the
contract's origins; ADR-0036's loader now records which slots the snapshot supplied).

## Second execution — 2026-09-08, a field that commits by Save and applies before it (Part AG)

REQ-CONFIG-472's four tool-row fields are the first members of destination 1 that a user is meant to see take effect
**before** Save: they are workspace configuration committed by Save (Tier A), and the requirement also says a change
reaches the rows already on screen the moment the control moves. Both halves are built — the four join the pending
state with the equality guard REQ-CONFIG-419 needs, and the renderer publishes its pending values to the transcript,
which prefers them over the saved snapshot. They are deliberately **not** in Tier B's live state: they change what is
drawn, never what a run does, so handing them to a run start would say something untrue about them.

**What the mechanism cannot be shown to do, stated rather than implied.** In this shell Settings *replaces* the
Workspace among REQ-SHELL-023's seven views, and REQ-CONFIG-286's guard refuses to let a dirty form be left without
Save, Discard or Cancel. A state in which the pending value and the file disagree **while a transcript is visible** is
therefore unreachable in the main window, and the proof's fifth launch exercises what does reach: the guard stands up,
its Save writes the file, and the row already drawn takes the new value. The other window that draws a transcript (the
persona pop-out, ADR-0048) is a separate renderer instance and does not see this window's pending state; making it do
so would be a Tier-B-shaped broadcast, which no requirement asks for. The publication is kept because it is what makes
Discard show immediately, and because a second surface in this window would read it.

**A second defect, in this part's own new code, found by the same proof.** The Display controls first read the
pending values field by field with a nullish fallback — `pending?.tool_input_lines ?? 2`. The view spells "unlimited"
`null`, so a saved unlimited came back on the control as **2 lines** while the file said `0`: the fallback meant for
"no configuration service yet" swallowed a real value. The controls now read the whole pending value or a whole
default, telling absent configuration and a cap of unlimited apart. Two of this part's defects, then, are the same
mistake in two places — a value whose meaning is carried by a null, read by code that treats null as absence.

**The falsified spelling behind it is ADR-0036's third execution** — REQ-CONFIG-172's key names and `0` for unlimited.
It is recorded there, beside the reader it belongs to, rather than repeated here.
