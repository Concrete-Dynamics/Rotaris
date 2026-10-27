[Product directives](../directives.md) › PD-ORCH-002

<a id="pd-orch-002"></a>

### PD-ORCH-002 — the plan gate renders Markdown by default with inline editing and progressive revision feedback

*Revision 3 (2026-10-07, [R-072](../requests.md#r-072), ruling [OQ-204](../../architecture/open-questions.md)) — **when the gate
cannot hold every part**: one paragraph is added after revision 2's **Expanded** clause, and nothing is replaced.*

*Revision 2 (2026-09-17, [R-032](../requests.md#r-032)) — **the height the gate is given, and who decides it**,
below. Revision 1 (2026-09-16, [R-030](../requests.md#r-030)) is quoted where it is replaced, never deleted. A
changed directive takes a revision and never a new number ([`README.md`](../README.md)).*

**The rule.** `REQ-ORCH-153`'s presentation clause — *"The plan MUST be presented verbatim as the producing role wrote it — never summarized, truncated, or re-rendered into another form"* — is narrowed: the plan awaiting a decision SHALL be presented formatted as rendered Markdown by default, using the synchronous Markdown dialect of `REQ-CHAT-056`. The user SHALL be provided an immediate toggle or mode switch to edit the source directly in a monospace editing field, preserving the edit path of `REQ-ORCH-154`.

The plan gate surface SHALL deduplicate identical implied tasks produced by the run, presenting them with status indicators. The revision feedback field ("Changes to ask for") SHALL be disclosed progressively (expanding or focusing when revision is intended) rather than occupying prominent fixed vertical space by default. While the gate is held, the disabled message composer SHALL be visually de-emphasized to eliminate input ambiguity.

**The gate takes the reading area, and the reader chooses when it gives it back — revision 2.** While a
decision is pending, the gate SHALL be presented inside the primary view in exactly one of two states.

**Expanded**, which is the state a gate opens in and the state a further plan cycle returns it to: the gate
occupies the whole of the area the transcript otherwise reads in, **no transcript rows are drawn beneath
it**, and the plan's own text — rendered Markdown, or the source under `REQ-ORCH-154`'s edit — SHALL be the
**largest element of the surface and the only element that grows with it**: every other part of the gate is
sized by its own content, so every pixel the surface gains goes to the plan and a taller window is a longer
plan and nothing else.

**When the gate cannot hold every part — revision 3.** Every part of the expanded gate other than the plan SHALL have a
height bound below the plan's floor. The product's own text (the heading, the intent sentence, a refusal's reason and the
three answers) is bounded by that text. The implied todo and a later cycle's "You asked for" line are bounded by a cap:
each takes its content height up to the cap, scrolls inside itself past it, and wraps its text so the gate never scrolls
sideways. The revision field is bounded by its default height, which grows with nothing typed. The plan's floor SHALL
stand above every such bound in both presentations, so the plan is the largest part of the expanded gate at every window
size the shell supports. The one exception is a height the user gives the revision field by dragging it: the field keeps
that height while it stays on screen, and it may then stand taller than the plan. When the area is shorter than the
gate's parts with the plan at its floor, the gate SHALL scroll with its three answers pinned at its foot, and no part
yields below its content or its bound. *Why:* the plan is what is decided; the user's own earlier words stay in the
durable record and one scroll away; a drag is the user's own choice of layout, and the adopted `textarea.input` grants it.

**Collapsed**: the gate is a single bar at the top of that same area, and the transcript reads beneath it
exactly as it does when no gate is held, under `REQ-CHAT-010`'s floor and no other.

While the gate is **expanded**, the composer SHALL stand at its own minimum height rather than at the height the
divider was last left at: it accepts nothing while a decision is pending, and the height it is not using belongs
to the plan. `REQ-CHAT-010`'s composer minimum still governs the composer, the persisted divider position SHALL
NOT be modified, and it SHALL govern again the moment the gate is collapsed or answered.

One control on the gate SHALL move between the two states in one action, and **all three answers of
`REQ-ORCH-153` SHALL be offered in both states, under the labels `REQ-SHELL-048` fixes** — collapsing is a
way to read the conversation before deciding, never a way to mislay the decision.

> **Revision 1 said, and no longer governs:** "The workspace grid holding the plan gate SHALL preserve a
> readable floor for the transcript (`minmax(220px, 1fr)`) and cap the gate's maximum height, so
> conversation history remains visible and accessible while a decision is pending."
>
> **Why it was wrong, measured 2026-09-17 in the built product.** The floor and the cap are two constraints
> on one axis, and at the window size the owner works at they leave the gate less height than its own
> contents need: the screenshot of a gate at cycle 1 shows the Markdown preview reduced to **one clipped
> line** with the three answers overlapping the text above them, and the four rows of transcript the floor
> bought underneath. Guaranteeing the transcript a floor did not make the conversation readable — it made
> the plan unreadable and left the conversation a strip. Revision 2 stops splitting one screen between two
> readers and hands the choice to the person who has to make the decision.

**Why.** When reviewing a plan produced in tabular Markdown syntax, verbatim monospace presentation in a fixed-height textarea forces tedious horizontal and vertical scrolling across raw pipes, obscuring the plan's substance. Simultaneously, an empty revision feedback textarea and a locked main composer present three competing text-entry surfaces on screen, while the transcript is compressed into an unreadable strip. Rendering Markdown with a quick edit-source switch gives immediate readability while preserving `REQ-ORCH-154`'s full inline editing guarantee.

**Why, revision 2.** A plan is read once and answered once; the conversation behind it is read on demand.
Revision 1 treated them as two things to be shown at the same time and bought each of them too little. What
the reader loses is the transcript's presence while the gate is expanded — deliberately, since it is one
action away and the gate's whole purpose is that nothing proceeds until it is answered. What is **not**
given up is reachability: the three answers stand in both states, so no window size and no scroll position
can put the decision out of reach, which is the obligation `REQ-SHELL-048` states and `REQ-ORCH-153` repeats
for these three in particular.

> **First execution, 2026-09-17 — the revision's own sentence was measured and did not hold.** The clause above
> was drafted reading *"the plan is the majority of the surface at every window size the shell supports"*.
> `pnpm plan-gate-proof` measured it in the built product at an 835 px window: the composer's own content
> minimum is 252 px — the row was already at its floor — leaving the gate 397 px, of which the heading, the
> intent, the implied todo, the progressive revision field and the three answers take 240. The plan got **153 px,
> 41%** — the largest element by a factor of three, and not a majority. A directive stating a ratio the layout
> cannot hold at the window the product is used at is one that gets quietly disobeyed, so the clause was
> rewritten before it shipped to the two facts a proof can check, and the share is reported rather than
> required. The mechanism itself held: expanded drew no transcript, collapsing gave back 311 px and answered
> nothing. Recorded in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Supersedes:** REQ-ORCH-153
> **Narrows:** REQ-ORCH-154, REQ-SHELL-168, REQ-CHAT-010

*Raised by the owner, 2026-09-16; logged as [R-030](../requests.md#r-030). Revised 2026-09-17; logged as
[R-032](../requests.md#r-032). Revision 3 logged as [R-072](../requests.md#r-072) (OQ-204), ruled by the consortium under the
owner's delegation, both advocates' recommendation followed. `REQ-CHAT-010` joins the dispositions at revision 2: its 180 px transcript
minimum is a floor under an area this directive now takes in full while the gate is expanded, and a
requirement a mechanism contradicts is named by the directive or it is an ungoverned deviation from it.*

> **First execution of revision 3, 2026-10-07, built under [R-072](../requests.md#r-072):** the paragraph held as written.
> `.plan-gate__prior` takes the todo's cap (`max-height: var(--rt-space-16)`), `overflow: auto` and `overflow-wrap: anywhere`
> (`packages/ui/src/shell.css`). **What was measured.** `plan-gate.test.ts`'s cap case, red on the CSS before; and
> `pnpm plan-gate-proof`'s `revised-at-minimum` launch at 1000x680 beside REQ-NOTIFY-032's warning, at cycle 2 with a
> 1,029-character stated change holding a 120-character unbroken run. On the CSS before the change it went **red**: the
> "You asked for" line stood 143 px against the plan's 72 (the heading 24, the intent 19, the todo 56, the closed field 22,
> the answers 41). After it: the line 64 px, scrolling (143 of content in 64), the plan 72 and the tallest part, the only
> one that grows, nothing else yielding, the gate 858 px wide with nothing to scroll sideways, 99 px to scroll down, and the
> three answers hit. With the revision field opened and set to 240 px as a drag sets it, the field held 240 px (its part
> 262), the plan's floor read 112px, the plan was still the only part that grows, nothing else yielded, and the answers
> were hit; "largest" is not asserted there. Taken at a load average of about 9 on four CPUs, beside another plan's
> builders. **What was not measured.** A drag with the pointer (the proof sets the height a drag sets) and the keyboard
> scroll of the capped line. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **The two readings left unmeasured, measured 2026-10-13, plan fin42:** `pnpm plan-gate-proof`'s `revised-by-hand` launch, at
> cycle 2 with the 1,029-character stated change, at the product's default window. **The keyboard:** with focus on the part
> before the capped "You asked for" line (the edit toggle), a real Tab moved focus onto the line itself, whose content is
> 160 px in a 64 px box, and a real PageDown scrolled it by 42 px *(2026-10-14, fin43: that figure was read the moment
> `scrollTop` left 0, mid smooth-scroll — three fin42 runs read 25, 39 to 42 and 40; read once two frames agree, one run
> at a load average of about 2.7 gave 56 px of the 96 the line can scroll)*; the line takes focus as a scroll container, with no
> `tabindex` of its own. **The pointer:** a real drag of the revision field's resize grip 120 px down (`ROTARIS_CAPTURE_GRIP_DRAG`,
> a new verification seam pressing just inside the element's bottom-right corner) took the field from 80 to 200 px, the
> height held as its own inline `200px`; the plan, at its 112 px floor, was still the only part that grows, and the three
> answers were hit. The field then stood taller than the plan, the exception the paragraph grants. The paragraph held as
> written. Taken at a load average of about 2.7 on four CPUs. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
