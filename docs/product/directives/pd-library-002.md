[Product directives](../directives.md) › PD-LIBRARY-002

<a id="pd-library-002"></a>

### PD-LIBRARY-002 — a retrospective pass reads the workspace's own session history and proposes what a user would otherwise have to teach the product by hand

*Revision 2 (2026-10-13, [R-072](../requests.md#r-072), rulings [OQ-235](../../archive/architecture/open-questions/51-spikes-and-later-questions-18.md#oq-235) and
[OQ-236](../../archive/architecture/open-questions/51-spikes-and-later-questions-18.md#oq-236)) — **which instruction files the retrospective reads** (OQ-235): the
rule paragraph's instruction-file clause is replaced, and revision 1's is quoted beneath it; the reach clause is unchanged
word for word. **Where the retrospective departs from the requirements it sits beside, and its start gesture** (OQ-236):
one paragraph added after "Reach, and the boundary it holds"; revision 1 said nothing on these points, so nothing is
replaced.*

*Revision 3 (2026-10-13, [R-072](../requests.md#r-072), ruling [OQ-271](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-271)) — **the
per-run history**: clause (h) is added to the revision-2 paragraph and REQ-LIBRARY-034 joins the Narrows line. Revision 2
said nothing on the per-run history, so nothing is replaced.*

*Revision 4 (2026-10-14, [R-072](../requests.md#r-072), ruling [OQ-285](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-285)) — **an empty
artifact whose collector failed, and a timed-out retrospective**: one sentence is added at the end of clause (c), which points
at [`PD-LIBRARY-005`](pd-library-005.md#pd-library-005). Revision 2's text of (c) stays otherwise word for word, so nothing is replaced.*

*Revision 5 (2026-10-14, [R-072](../requests.md#r-072), ruling [OQ-300](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-300)) — **the
retrospective's authentication refusal**: one sentence is added at the end of "The model", and REQ-WORKSPACE-137 and
REQ-WORKSPACE-152 join the Extends line. Revision 4 said nothing on a retrospective whose entry provider has no credential, so
nothing is replaced.*

*Revision 6 (2026-10-20, [R-072](../requests.md#r-072), ruling [OQ-363](../../archive/architecture/open-questions/65-spikes-and-later-questions-32.md#oq-363)) — **what a
configuration that loads may refuse a retrospective for**: one passage, with its reason and its cost, is added at the end of
"The model", and REQ-CONFIG-246 joins the Extends line. Revision 5 said nothing on a run's other refusals of a configuration
that loads, so nothing is replaced.*

**The rule.** Beside the per-run analyst of section 3, the improvement domain SHALL carry a second
kind of analysis pass, the **retrospective**. A retrospective SHALL read only material this product
already keeps for the workspace it runs in — session records, improvement artifacts and their
recorded versions, saved prompts, persona memory, and the instruction files `PD-WORKSPACE-002` discovers at the
workspace root, of those enabled under REQ-WORKSPACE-048's master switch and the per-file switches (revision 2, OQ-235)
— and SHALL author, per REQ-LIBRARY-003,
evidence-backed proposals of the closed vocabulary of REQ-LIBRARY-006 about **how the workspace is
worked in across runs**, not about how one run went. A retrospective proposal's evidence entries
MUST be attributable to material the workspace's own record holds, in the way REQ-LIBRARY-017
attributes a per-run proposal's evidence to its source run: each entry names the record that holds
what it cites, and a proposal whose evidence cannot be so attributed MUST NOT reach a review
surface.

> **Revision 1 said, and no longer governs** (OQ-235): "and the workspace's own `AGENTS.md` or `AGENTS.override.md` as
> REQ-WORKSPACE-041 fixes discovery". `PD-WORKSPACE-002` has since widened that discovery to four names at the root and
> two at each of five further bases, and OQ-65 (R-071) read the clause as pointing at the rule by name, so the read
> widened with it into the global, home-relative and machine-wide bases this directive's reach clause rules out. Revision
> 2 names the set: the root's files, with every switch injection honours. Files at the other bases still reach every
> agent through injection; the retrospective neither cites them nor proposes an edit to one, which would change every
> other workspace on one workspace's history and lie outside the rollback point REQ-LIBRARY-116's undo takes from the
> workspace's own tree.

**What the retrospective looks for is stated as the fields its proposals serve, not as a model
promise.** Its proposals are ordinary proposals in every mechanical respect — REQ-LIBRARY-006's
vocabulary, REQ-LIBRARY-008's fields, REQ-LIBRARY-009's validation, REQ-LIBRARY-046's duplicate
suppression, REQ-LIBRARY-116's undo, REQ-LIBRARY-162's versioned history — and the categories they
name are the ones whose effect is to teach the product rather than to change the workspace:
`agents_md_update`, `persona_or_prompt_adjustment`, `persona_memory_update`, `documentation_update`
and `config_change` among them. The product MUST NOT attempt to detect whether a retrospective
proposal is good, novel, or non-speculative; the answer to a poor one is the human gate, as
REQ-LIBRARY-016 already says, and no quality test replaces it here either.

**Reach, and the boundary it holds.** A retrospective reads **across** sessions but SHALL NOT read
outside the workspace: no other workspace's record, no user-global location, and — like every
analysis this domain runs — nothing on the network. Its output lands in the same store, is reviewed
on the same two surfaces, and is applied only through the same separately started improvement run.
The retrospective has no authority REQ-LIBRARY-001 does not already give the per-run analyst, and
no proposal of it is ever applied by anything but a human approval of that exact proposal.

**Where the retrospective departs from the requirements it sits beside — revision 2 (OQ-236).** Those requirements govern
the per-run pass unchanged. For a retrospective, and only for one, each of these cases holds instead:

- (a) **The artifact (REQ-LIBRARY-011).** Every artifact carries `source_kind`, either `post_run` or `retrospective`. A
  retrospective artifact stores `source_session_id` null and names the sessions it read in `considered_session_ids`.
- (b) **The parser (REQ-LIBRARY-020).** For a retrospective, the parser keeps an evidence entry's `source_session_id` only
  when the entry names a session in the job's `considered_session_ids`, and otherwise stores null. It never backfills one.
- (c) **The notices (REQ-LIBRARY-124).** A retrospective with proposals posts a persistent success notice titled
  "<N> retrospective proposal ready" or "<N> retrospective proposals ready", with "Review proposals" opening the Library on
  the proposals tab. With zero proposals it posts the info notice "The retrospective found nothing to propose", with no
  action. A failure posts the warning "The retrospective could not be completed", conveying that the workspace's own
  history was not reviewed and the reason; it names no run and offers no action. An empty artifact whose collector crashed or
  whose answer could not be parsed, and a timed-out retrospective, read as [`PD-LIBRARY-005`](pd-library-005.md#pd-library-005) states.
  *(Revision 4, OQ-285.)*
- (d) **The indicators (REQ-LIBRARY-125, REQ-NOTIFY-250).** While a retrospective runs, both indicators carry the label
  "Reviewing workspace history for improvements…". The title-bar indicator keeps the accessible name "Improvement analysis
  status" and has the description "Reviewing this workspace's own history for improvements in the background. You can
  continue working." The run-header indicator conveys the same three facts about the workspace's history. REQ-NOTIFY-250's
  indicator is also shown while a retrospective is in flight.
- (e) **The start gesture (REQ-LIBRARY-125's no-control-disabled clause).** The retrospective's start gesture stays
  available while a post-run analysis is queued or running, and a press queues behind it in REQ-LIBRARY-123's FIFO. While a
  retrospective is queued or running in the workspace, the gesture on the Library tab and the Overview card is unavailable,
  with the tooltip "A retrospective is already queued or running.". The palette entry stays listed; activating it in that
  state posts one info notice with that reason and queues nothing. Every other control stays enabled.
- (f) **The Overview card's hint (REQ-LIBRARY-130).** The empty hint reads "Run improvement analysis, or a retrospective
  over this workspace's history, to produce reviewable suggestions."
- (g) **The Library's proposals card (REQ-LIBRARY-109).** The card note reads "Evidence-backed suggestions from the
  improvement collector after each run, and from retrospectives over this workspace's history." The empty label reads "No
  proposals yet. They appear here after a run's improvement collector finds signals, or after a retrospective over this
  workspace's history."
- (h) **The per-run history (REQ-LIBRARY-034).** A later per-run pass's prior-artifact history excludes every artifact
  whose `source_kind` is `retrospective`. The exclusion is applied before the five-artifact bound, so every prior artifact
  supplied has a source session that REQ-LIBRARY-025 records, and REQ-LIBRARY-017's naming clause holds as written. The
  retrospective's own reading of prior proposals, post-run ones included, is unchanged. *(Revision 3, OQ-271.)*

The retrospective also shows the indicators of REQ-LIBRARY-126 when no session's analysis is in progress, and its gesture
sits in the header of REQ-LIBRARY-128's card beside the tag and "Open in Library →"; both requirements are untouched. The
palette entry, REQ-LIBRARY-127 and REQ-LIBRARY-174 take no disposition: the first follows REQ-SHELL-048's terms, and the
other two already read without a pass. *Why:* a fixed label, field or text that would be false of a retrospective is a
departure the directive states rather than one a reader infers; the texts of (f) and (g) sit above retrospective rows; and
a gesture greyed out behind a post-run review contradicted REQ-LIBRARY-125 and ADR-0065 consequence 2 while the palette
already queued, but a second retrospective over an unchanged workspace reads the same evidence and duplicate suppression
discards its proposals after the owner has paid for them, so that one press is refused.

**The trigger.** A retrospective SHALL be started by the user's explicit gesture on a desktop
surface, and from nowhere else. It MUST NOT be scheduled, chained from a run's completion, or
started by an agent. It is therefore never automatic, exactly as this product's live-run against a
real model is never automatic: the pass spends tokens the owner pays for, and the trigger that
costs money is theirs.

**The pass is bounded like its sibling.** A retrospective SHALL complete within a configurable
wall-clock timeout, defaulting to 120 seconds, and SHALL never extend anything the user is waiting
on: the timeout's expiry takes the empty-artifact outcome of REQ-LIBRARY-023, the same recovery
paths of REQ-LIBRARY-022 and REQ-LIBRARY-023 apply unchanged, and the pass MUST NOT raise into its
caller. While one runs, the application stays fully usable; its activity is signalled per the
pattern of REQ-LIBRARY-125 with its own label, and shutdown cancels it on the terms of
REQ-LIBRARY-127.

**The model.** A retrospective uses a dedicated model slot, `retrospective_model` (nullable string,
default null), with its own `retrospective_model_thinking` companion, persisted and round-tripped
like other slots and resolved on the same fallback rule REQ-LIBRARY-040 fixes for its sibling.
Configuration for the pass follows the shape of section 6: the configuration surface for the
retrospective is exactly the three keys its timeout, its slot and its companion need, and none of
its bounds is exposed beyond them. A workspace with no resolvable retrospective model captures no
pass, and the first time a retrospective gesture is made in that state the product MUST post one
informational notice conveying that no model is configured for the retrospective and offering an
action that opens Settings at the slot — the same refusal-shape REQ-LIBRARY-037 fixes for the
per-run analyst, with the notice per gesture rather than once per workspace, because nothing
happens here that a user did not just ask for by name. A retrospective whose lease leaves its entry provider unresolved is
refused with REQ-WORKSPACE-137's headline "Provider authentication required" and the detail "Authenticate at least one
configured provider before running a retrospective.": at its capture, that refusal is posted as one error notice per gesture,
titled with the headline, with the detail as its body and the action that opens Settings at Models, which REQ-WORKSPACE-152 (2)
gives that requirement's refusals; at its analysis, the same reason is carried inside clause (c)'s failure warning, which keeps
no action. *(Revision 5, OQ-300.)* Of a configuration that loads, nothing else refuses a retrospective, and none of a run's refusals does.
A `default_persona` naming no role this build knows, or an entry role with no usable model, leaves the pass's setup completed
on the retrospective's own model, since the pass sends nothing to the entry role. A confinement mode the host cannot deliver is
not checked, since the pass opens no shell and runs no tool. Referential errors (REQ-CONFIG-232) never refuse it, whether or
not a presenter is live at its capture or at its analysis: REQ-CONFIG-246 binds a run no person is watching, and a
retrospective is no run and is started only by a person's gesture. The configuration's load warnings and referential messages
are written to the application log when the pass is captured, one warning line each. A configuration that does not load
refuses the pass with the loader's own reason, and every run keeps each refusal this passage names. *(Revision 6, OQ-363.)*
*Why:* each of those refusals protects a run (its entry role, its shell, its start with no one watching), and the pass is none
of these. Refusing on them stopped a pass the person had just asked for by name, either over a field it never reads or, at a
queued analysis, over whether main had answered the presenter's poll within 3,000 ms (ADR-0019). The post-run pass queued
beside it is never refused that way. *What it costs:* a pass may run, and spend its tokens, over a configuration on which the
next run is refused; that refusal then states why. The messages reach the log and Settings › Models' "Unresolved references",
not a notice of the retrospective's own.

**Why, and what it costs.** The request drew the comparison deliberately: an insights report
(`sessions → patterns, friction, recommendations`) and a feedback loop
(`analysis → proposed instruction changes → future sessions`), and asked for the best of both. The
corpus already holds every primitive: the durable store REQ-SESSION-197 and REQ-SESSION-198 keep,
the export-level record REQ-SESSION-199 guarantees readable, the four-versioned stores the
improvement domain already owns, and a human-gated apply path REQ-LIBRARY-001..064 built. What no
requirement gives is the pass that **reads across sessions** — REQ-LIBRARY-017 forbids the per-run
analyst exactly that: "Data from another run, another session, or another workspace MUST NOT inform
it", which is the right fence for a run's own analysis and the exact reason the corpus cannot meet
this request without a new mechanism. That is the classification: nothing the owner wants is
covered, and nothing covered is wrong — REQ-LIBRARY-015's per-run analyst keeps its scope, its
skip-list and its bounds untouched. Where the owner's two influences part, this product takes the
loop, not the report: Claude Code's `/insights` produces a document a person then acts on, while
Chronicle's `improve` proposes changes to a live instruction file and the product's whole improvement
lifecycle exists to carry proposed changes through review to application with rollback. A report
surface would be a fifth thing this corpus has no home for; a proposal is already a first-class
record with evidence, review, undo, history, export and an executor behind it.

**What it costs.** Three things, stated rather than discovered.

- **Privacy of the record, spent deliberately.** Sessions hold everything a run did — commands,
  tool arguments, file contents. A cross-session pass therefore reads material whose per-run
  handling deliberately never lifts it out of the workspace; REQ-EVENTS-166's export discipline
  survives only because the analysis stays machine-local and writes nothing but proposals to the
  store. The cost is that the pass must be trusted with what the workspace record already holds —
  which is no more than any run of this workspace holds in memory — and nothing may leave the
  machine except what any provider call already carries.
- **A second analysis budget.** The per-run analyst's 60-second pass was sized against one run's
  transcript (REQ-LIBRARY-165's constants); a retrospective reads a workspace's whole record, and
  the same bound would read nothing. The 120-second default is the new spend; it is bounded and it
  is never on anything the user is waiting for.
- **A slot the owner must fill or refuse.** The pass is inert without a configured model — that is
  REQ-LIBRARY-037's shape and it is kept. The cost is one more empty-slot refusal a user can meet;
  it is paid once per gesture, names the exact field to set, and stops there.

> **Narrows:** REQ-LIBRARY-011, REQ-LIBRARY-020, REQ-LIBRARY-034, REQ-LIBRARY-109, REQ-LIBRARY-124, REQ-LIBRARY-125, REQ-LIBRARY-130, REQ-NOTIFY-250
> **Extends:** REQ-CONFIG-246, REQ-LIBRARY-003, REQ-LIBRARY-006, REQ-LIBRARY-015, REQ-LIBRARY-017, REQ-LIBRARY-126, REQ-LIBRARY-128, REQ-MONITOR-173, REQ-NOTIFY-251, REQ-WORKSPACE-041, REQ-WORKSPACE-137, REQ-WORKSPACE-152

*Until 2026-10-07 this block read `> **Extends:** REQ-LIBRARY-003, REQ-LIBRARY-006, REQ-LIBRARY-015` and beneath it
`> **New:** no live requirement covers a cross-session analysis pass; REQ-LIBRARY-017 forbids the per-run analyst exactly
this reach, faithfully to its own scope.` **New** is used alone and names no identifier (`README.md`, "The shape of an
entry"); the symbol generator dropped the line without a word, so REQ-LIBRARY-017 reached no register. The four
back-pointers at REQ-LIBRARY-017, REQ-MONITOR-173, REQ-NOTIFY-251 and REQ-WORKSPACE-041 have read "Extended by" since
2026-09-17, as [R-033](../requests.md#r-033) named them, while this line named three. REQ-LIBRARY-017 is recorded under
Extends because its clauses bind an analysis that a run triggered, and the rule above leaves them whole for the per-run
analyst. No rule text changed ([OQ-222](../../architecture/open-questions.md), ruled under [R-072](../requests.md#r-072);
[`six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement`](../../defects/fixed/six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md)).*

*Revision 2, 2026-10-13 ([OQ-236](../../archive/architecture/open-questions/51-spikes-and-later-questions-18.md#oq-236), ruled under [R-072](../requests.md#r-072)): the
Narrows line is added and REQ-LIBRARY-126 and REQ-LIBRARY-128 join the Extends line, each requirement with its back-pointer;
the cases are the revision-2 paragraph's (a) to (g)
([`pd-library-002-reaches-further-requirements-its-disposition-does-not-name`](../../defects/fixed/pd-library-002-reaches-further-requirements-its-disposition-does-not-name.md)).*

*Revision 3, 2026-10-13 ([OQ-271](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-271), ruled under [R-072](../requests.md#r-072)):
REQ-LIBRARY-034 joins the Narrows line with its back-pointer (clause (h)). REQ-LIBRARY-017 stays on the Extends line, and
REQ-LIBRARY-025 is untouched: with no retrospective artifact supplied as history, both read word for word for every run.*

*Revision 5, 2026-10-14 ([OQ-300](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-300), ruled under [R-072](../requests.md#r-072)):
REQ-WORKSPACE-137 and REQ-WORKSPACE-152 join the Extends line, each with its "Extended by" back-pointer. Both read word for word
for a run: the retrospective takes REQ-WORKSPACE-137's headline with a detail naming the retrospective, and REQ-WORKSPACE-152 (2)'s
action at its capture.*

*Revision 6, 2026-10-20 ([OQ-363](../../archive/architecture/open-questions/65-spikes-and-later-questions-32.md#oq-363), ruled under [R-072](../requests.md#r-072)):
REQ-CONFIG-246 joins the Extends line with its "Extended by" back-pointer. It reads word for word for every run, the
improvement run that applies a retrospective's proposal included. A retrospective, which is no run, decides what to do with the
referential list it is handed, as REQ-CONFIG-229 leaves to every caller. The entry-model stand-in and the confinement gate's
absence restate fin47's repairs (ADR-0065's report-back of 2026-10-15), which read the run start's requirements as a run's, so
no further requirement is named.*

*Raised by the owner, 2026-09-17; logged as [R-033](../requests.md#r-033).*
Revision 2 logged as [R-072](../requests.md#r-072) (OQ-235 and OQ-236), ruled by the consortium under the owner's
delegation: on OQ-235 the system-lens advocate's recommendation followed in substance and a revision taken in place of an
italic note; on OQ-236 both advocates' recommendations followed in part.
Revision 3 logged as [R-072](../requests.md#r-072) (OQ-271), ruled by the consortium under the owner's delegation on
2026-10-13: the per-run history holds post-run artifacts only, so REQ-LIBRARY-025 and REQ-LIBRARY-017 hold word for word for
every run.
Revision 4 logged as [R-072](../requests.md#r-072) (OQ-285), ruled by the consortium under the owner's delegation on
2026-10-14 and written the same day by fin44 (`fin44-improvement-failures`): clause (c) points at `PD-LIBRARY-005` for an empty
artifact whose collector failed and for a timed-out retrospective. The Narrows and Extends lines are unchanged; REQ-LIBRARY-124's
case is `PD-LIBRARY-005`'s, which names this directive.
Revision 5 logged as [R-072](../requests.md#r-072) (OQ-300), ruled by the consortium under the owner's delegation on
2026-10-14 and written the same day by fin45 (`fin45-retro-and-record`): the retrospective's authentication refusal names the
retrospective and opens Settings at Models.
Revisions 4 and 5 were dated as ruled 2026-10-13 (and revision 4's header 2026-10-13) until fin46 (`fin46-accept1-12`)
corrected them from the consortium's ruling record, which dates both sittings 2026-10-14.
Revision 6 logged as [R-072](../requests.md#r-072) (OQ-363), ruled by the consortium under the owner's delegation on 2026-10-20:
of a configuration that loads, a retrospective is refused only where no retrospective model resolves and by revision 5's lease
refusal. A `default_persona` naming no known role leaves its setup completed on its own model, and referential errors are
written to the log at its capture, whatever the presenter.

> **First execution of revision 2, 2026-10-13, ruled by [R-072](../requests.md#r-072) (OQ-235) and built in plan fin34:** the
> clause held as written. The run host's `SkillHost.retrospectiveInstructionFiles` keeps the `workspace:` entries of the
> enabled set and `dispatch`'s `retrospective.capture` passes it; injection is unchanged. **What was measured.** Four cases
> in `apps/desktop/src/run-host/skills.test.ts` (the root's files only while injection keeps all seven bases' files, a
> switched-off root file, the master switch, a root override and a root with no file), red before the change. And
> `pnpm retrospective-proof`'s pass launch, with an `AGENTS.md` under a scratch `~/.agents` and a scratch machine-wide
> base beside the workspace's own: the run host logged "3 of 3 instruction file(s) enabled (workspace:AGENTS.md,
> user-agents:AGENTS.md, machine-codex:AGENTS.md)" and "1 of 3 enabled instruction file(s) at the workspace root
> (workspace:AGENTS.md)"; 37 of 37 checks at a load average of about 3 on four CPUs. **What was not measured.** A live
> retrospective against a real model (a live run starts none by itself). Recorded in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 2's OQ-236 paragraph, 2026-10-13, built in plan fin34:** clauses (a) to (d) and (f) held as
> the build already stood (the paragraph ratifies them); (e) and (g) were built. **What was measured.** `pnpm symbols`
> registers seven more narrowed and two more extended requirements (195 and 62 as built) and `back-pointers.test.ts` reads
> every note both ways; the coordinator's three `retrospectivePending` cases, red before; the handler's three refusal cases;
> `retrospective-gesture.test.ts`'s gesture and text cases; and `pnpm retrospective-proof`, 42 of 42 at a load average of
> about 5 on four CPUs — the Overview hint (f) and the Library note (g) word for word, the Library gesture unavailable with
> "A retrospective is already queued or running." while the pass ran and available after it, and the palette's entry
> answered with one info notice while one artifact stayed in the store. **What was not measured.** A press made while a
> post-run analysis runs, in the built app (the proof drives no run; the unit cases carry it), and the Library's empty label
> (g), which shows only when artifacts exist and no proposal matches. Recorded in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **The two built-app gaps above closed, and the live steps written, 2026-10-13 (fin42, the survey's N58):** `pnpm
> retrospective-proof`, 54 of 54 at a load average of 2 to 7 on four CPUs. **(e) A press during a post-run analysis**
> (launch 7): a scripted run completes and its analysis is held 10 s; the Library's gesture reads available beside the
> `post_run` indicator, a press queues the retrospective and then rests the gesture with "A retrospective is already queued or
> running.", the indicator names the retrospective only after the post-run pass ends, and both artifacts are stored — the
> retrospective's empty, its proposals suppressed as duplicates of the post-run pass's (REQ-LIBRARY-046), its notes saying so.
> **(g) The empty label** (launch 5): beside the timed-out pass's empty artifact the proposals card reads "No proposals yet.
> They appear here after a run's improvement collector finds signals, or after a retrospective over this workspace's history."
> and the no-artifact state is gone. **Found by building:** once a retrospective artifact stood among a workspace's five newest,
> no later run's analysis was captured — its null source session reached the post-run job's `considered_session_ids` and the
> parse threw; repaired in `captureImprovementJob`, which records no session for it, and the reading raised as
> [OQ-271](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-271)
> ([`fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md`](../../defects/fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md)).
> **The live steps:** `live-run.mjs`'s `ask` now lets its run's analysis finish and its `ask-retrospective` presses the
> gesture (Ctrl+6, Proposals) and waits for the pass to end, asserting one retrospective artifact with no session that read the
> ask session, its notice, and the run host's "at the workspace root" line listing `workspace:` files alone; launch 8 of the
> proof runs those very capture steps against the scripted provider, green. **Not measured:** a live retrospective — the
> orchestrator's run. Recorded in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. No retrospective gesture was driven, and the post-run analyst was cut at the harness's exit in every
> session, as at every pack (REQ-LIBRARY-127). Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 3, 2026-10-14 (fin43, `fin43-analysis-and-artifacts`), ruled by [R-072](../requests.md#r-072)
> (OQ-271):** clause (h) held as written. `captureImprovementJob` (`packages/engine/src/improvements/capture.ts`) now keeps a
> prior artifact only when its `source_kind` is `post_run`, ahead of REQ-LIBRARY-034's bound of five; the null guard on
> `considered_session_ids` stays as a defensive no-op. **What was measured.** Two cases in `analyst.test.ts`, both red on the
> code before: a retrospective and a post-run artifact yield the post-run one alone and `considered_session_ids` `["session-1"]`;
> a newest retrospective ahead of five post-run artifacts yields exactly the five. `pnpm symbols` registers one more narrowed
> requirement (206) and `back-pointers.test.ts` reads REQ-LIBRARY-034's note both ways. `pnpm retrospective-proof`, 54 of 54 at
> a load average of 1.3 to 2.2 on four CPUs: launch 8's `live-shape-timeout`, a run after a retrospective in one workspace,
> still captured its analysis (the timed-out empty artifact and its notice), with no "capture failed" line in its log.
> **What was not measured.** That the later run's job carried no retrospective artifact, in the built app: the job's
> `prior_artifacts` are not stored or logged, and the stored artifact's `considered_session_ids` read the same before and after
> (the retrospective contributed no session either way); the unit cases carry it. A live run after a retrospective (no live
> scenario drives one yet). The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 5, 2026-10-14 (fin45, `fin45-retro-and-record`), ruled by [R-072](../requests.md#r-072)
> (OQ-300):** the sentence held as written; nothing in it met a build it could not describe. `leaseOver`
> (`apps/desktop/src/run-host/launch.ts`) takes its refusal's detail from its caller; `leasedSetup` passes the retrospective's
> sentence and `leaseForContinuation` keeps "before continuing this run". Main's `improvements.retrospective` posts
> `session.provider-auth` as one error notice per gesture, titled "Provider authentication required", the detail its body, with
> "Open Models settings" (`open-settings`, `models`), where it reached the generic "The retrospective could not be started"
> notice with no action before. **Found by building:** at analysis the warning read the reason's own period and then its own
> (`passFailureDetail`), so "… running a retrospective.." — repaired in the same change
> ([`fixed/a-retrospectives-failure-warning-ends-in-a-doubled-period-when-its-reason-ends-in-one.md`](../../defects/fixed/a-retrospectives-failure-warning-ends-in-a-doubled-period-when-its-reason-ends-in-one.md));
> and the lease checks the entry role's provider rather than the retrospective model's, recorded and not repaired
> ([`fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md`](../../defects/fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md))
> — *repaired 2026-10-14 by fin46 (`fin46-accept1-11`): "its entry provider" is read as the sign-in provider of the model the
> retrospective's request goes to (`retrospective_model`, then `medium_model`), which `leasedSetup` now requires
> (`PreparedRun.retrospectiveAuthProvider`); a continuation still requires the entry role's. The sentence is unchanged.*
> **What was measured.** Three unit cases, each red before the change: `launch.test.ts` (both sentences, the retrospective's
> and the continuation's), `commands/improvements.test.ts` (the notice's severity, title, body and action, twice for two
> presses, nothing queued) and `improvement-notice.test.ts` (a single period after a reason ending in `.`, `!` or `?`, one
> added after `)`); `pnpm symbols` registers two more extended requirements (69) and `back-pointers.test.ts` reads both notes
> both ways. **What was not measured.** The refusal in the built app: every proof drives the scripted provider, whose lease
> names no entry provider, so no proof reaches it; the live run with the entry provider's credential withheld (`live-run.mjs`'s
> new `ask-retrospective-unauth`) is the orchestrator's. `pnpm retrospective-proof`, 61 of 61 at a load average of 1.2 to 1.9
> on four CPUs, shows the other warnings `passFailureDetail` builds unchanged: a crashed collector's reason ending in ")" still
> gains its one period. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 6, 2026-10-20 (loc1, `loc1-confinement-retro`), ruled by [R-072](../requests.md#r-072)
> (OQ-363):** the passage held as written; nothing in it met a build it could not describe. `prepareRun`
> (`apps/desktop/src/run-host/configuration.ts`), preparing a retrospective, completes the setup on the pass's own model where
> `default_persona` names no role this build knows — the configured name kept, no role's system text, the log saying so — and
> refuses it as `no-model` only where no retrospective model resolves either; it reads no attendedness for the pass, so
> REQ-CONFIG-246's referential messages are its warnings; and `retrospective.capture` writes each warning of the setup to the log
> once, at `warn`, prefixed `retrospective: `, the analysis none. Every run start and continuation keeps both refusals word for
> word. **What was measured.** Four `launch.test.ts` cases and one `dispatch.test.ts` case, each red before the change, with the
> run start's two refusals pinned beside them (green before and after); and `pnpm retrospective-proof` launch 13
> (`unknown-persona`: `default_persona: a-role-this-build-does-not-know`, `medium_model: scripted`), red on its first five checks
> on the base — the gesture answered "The retrospective could not be started" with "The workspace configuration refused the
> retrospective: default_persona 'a-role-this-build-does-not-know' names no role this build knows.", nothing stored — and green on
> all six after: no refusal notice, the indicator seen then gone, one `retrospective` artifact with no source session, the
> stand-in line, one `warning` line "retrospective: configuration: default_persona 'a-role-this-build-does-not-know' names no
> existing role", and a prompt in the same launch refused "The run was refused before it started" with "names no role this build
> knows". The whole proof read 83 of 84 on Windows 11 ARM64 (8 CPUs, CPU load 68 to 100 % with another tree's Electron running);
> its one red, launch 1's machine-wide-base check, is Windows-only and recorded
> ([`../../defects/retrospective-proofs-instruction-file-check-requires-a-machine-wide-base-windows-never-reads.md`](../../defects/retrospective-proofs-instruction-file-check-requires-a-machine-wide-base-windows-never-reads.md)).
> **What was not measured.** The analysis reached with the presenter lapsed: the gesture is always attended in the built app, so
> `launch.test.ts` carries the unattended case; no live run was owed. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
