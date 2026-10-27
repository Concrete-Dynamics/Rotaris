[Product directives](../directives.md) › PD-ORCH-003

<a id="pd-orch-003"></a>

### PD-ORCH-003 — an approval releases the plan gate for the session, not only for the run

*Revision 3 (2026-10-06, [R-071](../requests.md#r-071)) — **the readings OQ-104 and OQ-137 recorded, ratified as built**: two
paragraphs added after revision 2's. Nothing is replaced.*

*Revision 2 (2026-09-28, [R-064](../requests.md#r-064)) — **a resumed iteration and the gate**, a paragraph added after
the rule; the owner's ruling on OQ-97's third question. Nothing is replaced.*

**The rule.** An approval taken under `REQ-ORCH-153` SHALL release execution for the remainder of the run
that received it **and for every later run of the same session**, until the gate is re-armed. A run started
in a session that holds an approved release SHALL NOT be held at the gate, whatever the run-start mode says.

The gate SHALL be re-armed by exactly two things, and by nothing else:

- **a new session**, which never holds a release and is therefore held exactly as `REQ-ORCH-152` and
  `REQ-ORCH-153` require; and
- **the user choosing `plan` on the run-start control** while the session holds a release, which re-arms
  that session in the same gesture that writes the setting.

Neither **revise** nor **cancel** releases anything. An approval SHALL NOT change the run-start mode: the
setting keeps its value and its persistence under `REQ-ORCH-152`, and no answer at the gate writes it.

A surface that offers the run-start mode for a session holding a release SHALL state that the session is
released, so the control never reads as promising a gate that will not open.

**A resumed iteration and the gate (revision 2).** A continue that resumes an iteration a rest left open (`PD-ORCH-005`
clause 4) SHALL run that iteration without holding it at the gate, whatever the run-start mode and whether or not the
session holds a release, since it is work already under way. When the gate would hold that run, because the session
holds no release and the mode is `plan` or the release was re-armed, it SHALL hold before the first new iteration the
run begins. The build of PD-ORCH-005 held neither the resumed iteration nor the new ones after it (OQ-97). The owner
ruled that re-arming asks for a plan before new work, and the resumed iteration is not new work.

**A resumed iteration and the gate, at its edges (revision 3).** Revision 2's unheld resume SHALL reach an iteration a crash
left open, once `PD-ORCH-005` clause 18 has recorded the crash, as it reaches one a rest left open. The hold SHALL fall where
a new iteration would begin: after the resumed iteration closes, the run checks the stop, the pause, the queued prompts
and the stop conditions as before every iteration, and holds only when work is left. The message-limit pause reached as
the resumed iteration closes, and a pause or a stop accepted during it, win over the hold. Any iteration after the resumed
one is new and is held, a requeued resumed task included. A run whose intent is in REQ-ORCH-021's answer group is not
held. The plan cycle held there is told the plan request, that the resumed iteration has closed, the tasks still pending
in the order the run takes them up (the first twenty, each to 500 characters) and what became of the continue's messages,
then the launch content, whose handoff the continue built before that iteration ran and which is not rebuilt. A plan
decision's relaunch appends no task, and a revise after this hold is launched as any revise is.

**The run-start control (revision 3).** "The run-start control" is the composer's run-start chip alone. Choosing `plan` in
the Settings Runtime category, which only changes the pending value until Save, re-arms no session; when the followed
session holds a release, its hint states that the session is released and that choosing Plan first on the composer's
control plans its next run again. No surface offers the re-arm on a paused session, where REQ-CHAT-006 disables the chip.

**Why, and what it costs.** The unit a person plans is the **piece of work**, and a session is this
product's name for that. Approval already installs the run's execution grants, so the transition from
planning to implementing inside one run costs one keystroke and no setting; the ceremony is entirely at the
next prompt. A follow-up to a plan that was just approved — *"you missed the error case, add it"* — opened a
fresh gate and asked the user to read and approve a plan for a two-line change, and the only escape was a
control in the composer that a user has no reason to visit and every reason to forget. A gate people route
around is worse than no gate, because it trains the reflex of approving without reading.

What it costs is stated plainly, because it is real: a long-lived session plans **once**, and work that
drifts into new territory inside that session runs ungated until someone re-arms it. That is accepted for
two reasons — the release is **visible on the very control that sets the mode**, so the state is never a
surprise, and **one gesture undoes it**, the same gesture that asked for planning in the first place.

**Why not switching the mode instead.** The first shape asked for was an approval that switches
`runtime.run_start_mode` away from `plan` ([R-034](../requests.md#r-034), declined). It buys the approved run
nothing, since the grants are already installed; all it does is pre-decide the **next** run at the moment
the user is reading **this** plan. It also makes a one-shot answer write a persistent setting behind the
user's back, which is the failure `REQ-ORCH-152` was written to avoid. This directive changes the reach of
the release and leaves the setting alone.

**Why not by intent.** `REQ-ORCH-153`'s carve-out could instead be widened from `REQ-ORCH-021`'s answer
group to answer ∪ micro, so a small follow-up never gates. It needs no new state at all, and it was
rejected: it makes the gate's appearance **probabilistic**, with a classifier deciding whether the user is
shown the plan before files are written. A gate that exists to stop unread writes has to be predictable, and
a user must be able to answer "will the next run be held?" without knowing how their sentence was
classified. Recorded here so the cheaper-looking option is not re-proposed as new.

**Why it names one requirement and not three.** The mechanism touches the plan gate, and two of the three
requirements that govern it are deliberately **not** in the disposition:

- `REQ-ORCH-154` is untouched and every clause of it still holds as written. It states what approval
  guarantees *for the run that received it* — that the run may not return to the gate, that a later plan in
  that run may not block, that a mode change mid-run lands on the next run. This directive adds a second,
  wider scope; it contradicts none of those sentences.
- `REQ-ORCH-153`'s block is already conditioned on the release in the built product (ADR-0062 reads
  `plan_released` at every launch), and that condition was grounded in `REQ-ORCH-154`'s one-way clause when
  it was built. What changes here is not *whether* a released run is held but **for how long the release
  lasts**, and the sentence that fixes that is `REQ-ORCH-152`'s — the mode "governs the next run started in
  the same workspace until the user changes it".

So `REQ-ORCH-152` is the identifier this displaces, and naming the other two would claim a precedence this
directive does not need. It would also be refused: `PD-ORCH-002` already supersedes `REQ-ORCH-153` and
narrows `REQ-ORCH-154`, and the symbol generator rejects two directives over one requirement so that
precedence stays unambiguous. *(Since 2026-10-13 ([OQ-237](../../architecture/open-questions.md)) only the supersession half of this
still holds: `REQ-ORCH-153`, superseded, may be neither narrowed nor extended, but a second narrowing of `REQ-ORCH-154` in a
disjoint case that names `PD-ORCH-002` would build. The first reason, the precedence this directive does not need, stands.)*

> **Narrows:** REQ-ORCH-152

*Raised by the owner, 2026-09-17; logged as [R-035](../requests.md#r-035). Revision 2 logged as [R-064](../requests.md#r-064),
revision 3 as [R-071](../requests.md#r-071).*

**First execution, 2026-09-17 — the mechanism held, and the proof that measured it did not.**
`pnpm plan-gate-proof` gained two launches the day the directive was written and ran them against the built
product: a follow-up prompt typed into an approved session through the real input path, and the run-start
chip's own popover driven open and answered. Both behaved as the rule states on the first run. The follow-up
came to rest `completed` with no cycle pending, `plan_released` still `1` and the session's cycle count
unmoved at the two already decided — the launch that would have failed before the directive, since the mode
was still `plan` and the follow-up's intent sits outside `REQ-ORCH-021`'s answer group. Choosing `Plan first`
again cleared the release, and the next prompt was held at a third cycle.

**What did hold a defect was the harness.** The first run failed reading its own evidence: the app logs an
evaluated expression as `eval-at <ms> <the expression> → "<the value>"`, and the expression **contains every
token the answer does**, so a pattern matching the answer anywhere in the line matched the question instead.
It is the shape of mistake that reports a pass as easily as a failure — here it refused a launch that had in
fact succeeded, which is the safe direction, and the same pattern read one character differently would have
green-lit a chip that was never clicked. The answer is now read from the arrow at the end of the line. Not
minted as a numbered defect: it was written and found inside the same hour and never governed anything, and
`first-executions.md` excludes proof defects by its own terms.

**One defect was found beside it, in code this change only passed through**: a `PopoverMenu` option's
accessible name fuses its label and its hint with no separator — `Auto` + `start at once` announces as
*"Autostart at once"* — which reaches every chip built on the component and predates this directive. Recorded
as [`a-chip-option-announces-its-label-and-hint-as-one-word.md`](../../defects/fixed/a-chip-option-announces-its-label-and-hint-as-one-word.md)
and deliberately not repaired here. The row is in
[`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 2, 2026-09-28, ruled by [R-064](../requests.md#r-064) and built with `PD-ORCH-005` revision 4
> under [R-065](../requests.md#r-065):** the rule was built as written. A run that resumes an open iteration runs it unheld;
> when the gate would hold the run, it parks before the first new iteration, and its plan cycle is told the pending
> tasks and what became of the continue's message. Building it found every approved prompt worked twice, because a
> plan decision's relaunch appended the gated prompt as a second task
> ([`a-plan-decision-appends-the-gated-prompt-as-a-second-task.md`](../../defects/fixed/a-plan-decision-appends-the-gated-prompt-as-a-second-task.md),
> repaired: the relaunch appends none). The text met the code in these places, each recorded in [OQ-104](../../architecture/open-questions.md):
> - an iteration a crash left open runs unheld once the crash is recorded, as a rest's does;
> - the message limit, checked as the resumed iteration closes, wins over the hold;
> - the held plan cycle is sent the handoff the continue built;
> - no surface re-arms the gate on a paused session, since the run-start control is disabled there (REQ-CHAT-006).
>
> **What was measured.** `plan-gate-resume.test.ts` and `plan-text.test.ts`, each limb red when reverted. In the built
> app, a plan-mode session paused mid-iteration, re-armed by command and continued: the resumed iteration ran unheld,
> and the gate held before the next one.
>
> **What was not measured.** No live run was made. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> *2026-10-13, plan fin42:* the live run's new `plan-gate` scenario (`apps/desktop/scripts/lib/approval-scenarios.mjs`) is
> the first to meet the gate with a real model: held at `run_start_mode: plan` with the plan drawn as Markdown, nothing
> written and no `loop_supervisor_activation` while held (PD-ORCH-001, PD-ORCH-002), approved through the gate's own button,
> and a second prompt in the released session not held (this directive). It is written and not yet run; the run is the
> orchestrator's, and its result reports here.
