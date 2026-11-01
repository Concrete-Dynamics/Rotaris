# Archived open questions — Spikes, and the questions raised since (18 of 35)

The ruled, closed, resolved and withdrawn entries of [part 51](../../../architecture/open-questions/51-spikes-and-later-questions-18.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-235"></a>

**OQ-235 — Does the retrospective read user-global and machine-wide instruction files, or only the workspace's own?**
*(`PD-LIBRARY-002`, "Reach, and the boundary it holds": "SHALL NOT read outside the workspace: no other workspace's
record, no user-global location", and its rule's "the workspace's own `AGENTS.md` or `AGENTS.override.md` as
REQ-WORKSPACE-041 fixes discovery"; OQ-65's ruling under [R-071](../../../product/requests.md#r-071), "reads exactly the set
injection reads"; `PD-WORKSPACE-002`'s discovery bases; REQ-WORKSPACE-048. Raised 2026-10-13 from
[`pd-library-002-says-no-user-global-location-where-the-retrospective-reads-user-global-instruction-files.md`](../../../defects/fixed/pd-library-002-says-no-user-global-location-where-the-retrospective-reads-user-global-instruction-files.md),
the R-072 consortium's question LG1, and ruled the same day.)*

The run host served both readers of the instruction files from one computation (`SkillHost.instructionFiles`), and
since `PD-WORKSPACE-002` that computation discovers under the workspace root, the Rotaris global configuration directory,
`~/.agents`, `~/.config/opencode`, `~/.openhands` and `/etc/codex`. So the built retrospective read user-global and
machine-wide files the directive's reach clause rules out, while OQ-65's ruling said it reads exactly the set injection
reads. Two owner decisions (R-033's directive and R-071's ruling) disagreed on the record.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the two owner decisions are
reconciled by holding each to the question it answered. `PD-LIBRARY-002`'s reach clause (R-033) governs reach and
OQ-65's ruling (R-071) governs the switches. The retrospective reads the enabled instruction-file set injection computes,
restricted to the files discovered at the workspace root (the four root names, the per-file switches and
REQ-WORKSPACE-048's master switch all applied), and reads no file under the global, home-relative or machine-wide bases.
[`PD-LIBRARY-002`](../../../product/directives/pd-library-002.md#pd-library-002) takes revision 2, which states that set in the rule paragraph
and keeps the reach clause word for word. Injection is unchanged: agents are still given every enabled base.

The two recommendations weighed, and the ruling followed **B**:
- **Advocate A (the user's lens)** recommended keeping the wide read — the retrospective reads exactly the enabled set
  injection reads, user-global and machine-wide files included — with a revision 2 rewriting the reach clause to say so,
  and each instruction-file evidence entry labelled with its inventory source and absolute path so a global `AGENTS.md`
  cannot be mistaken for the workspace's own: the analysis would otherwise not know what agents were already told and
  would propose rules the user already keeps globally.
- **Advocate B (the system's lens)** recommended restricting the read to the workspace root with the reach clause left
  whole: OQ-65 said "The discovery half is not the question. The switch half is the question", so R-071 never weighed
  reach, and the wide read produces evidence attributed only by file name, an `agents_md_update` carried out in the
  workspace against a file elsewhere, and one workspace's history proposing edits that govern every other workspace.

The ruling took B's substance. The executor takes its rollback point from the workspace's Git tree, so an approved
proposal to change `~/.agents/AGENTS.md` would have no undo under REQ-LIBRARY-116 and would change every other workspace
on the strength of this one's history; A's labelling fixes how such a proposal is cited and does nothing for either. A's
cost to the user is real but small: the analysis may miss a rule kept globally and propose a duplicate, which the human
gate catches, and global files still reach every agent through injection, whose effects the analysis sees in the session
history. From A it kept the form: a directive revision rather than an italic note, so the directive itself names the set.

*Built 2026-10-13 (fin34, `fin34-library-and-intent`); its first execution is reported in `PD-LIBRARY-002`'s entry.*
`SkillHost.retrospectiveInstructionFiles` keeps the `workspace:` entries of the enabled set and logs "retrospective: N of
M enabled instruction file(s) at the workspace root (ids)"; `dispatch`'s `retrospective.capture` passes it. Pinned by
four cases in `apps/desktop/src/run-host/skills.test.ts`, red before the change.

<a id="oq-236"></a>

**OQ-236 — Which further requirements does `PD-LIBRARY-002` reach, under which verb, and what does its start gesture do
while an analysis runs?** *(`PD-LIBRARY-002`'s disposition block; REQ-LIBRARY-011, REQ-LIBRARY-020, REQ-LIBRARY-109,
REQ-LIBRARY-124, REQ-LIBRARY-125, REQ-LIBRARY-126, REQ-LIBRARY-128, REQ-LIBRARY-130, REQ-NOTIFY-250; REQ-LIBRARY-123's FIFO;
ADR-0065 consequence 2 and decision 7; `docs/product/README.md`'s three verbs. Raised 2026-10-13 from
[`pd-library-002-reaches-further-requirements-its-disposition-does-not-name.md`](../../../defects/fixed/pd-library-002-reaches-further-requirements-its-disposition-does-not-name.md),
the note OQ-222's ruling left for these reaches, as the R-072 consortium's question LR1, and ruled the same day.)*

OQ-222 entered the four reaches the back-pointers already marked into `PD-LIBRARY-002`'s Extends line and left the rest:
the artifact container's non-null `source_session_id`, the parser's backfill of the current session, the indicators' fixed
label and description, REQ-NOTIFY-250's "only while that [post-run] analysis is in flight", the card the gesture joins,
the Overview hint the build had already rewritten, the Library's two fixed texts, and the post-run notices' fixed titles.
Each carried neither a note nor a disposition. Both advocates also found the retrospective's two buttons disabled while
any analysis runs, against REQ-LIBRARY-125's "no control … may be disabled while analysis runs", while the palette entry
queued the same command.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):**
[`PD-LIBRARY-002`](../../../product/directives/pd-library-002.md#pd-library-002) gains a revision 2. It Narrows REQ-LIBRARY-011,
REQ-LIBRARY-020, REQ-LIBRARY-109, REQ-LIBRARY-124, REQ-LIBRARY-125, REQ-LIBRARY-130 and REQ-NOTIFY-250, and adds
REQ-LIBRARY-126 and REQ-LIBRARY-128 to its Extends line. The palette entry, REQ-LIBRARY-127 and REQ-LIBRARY-174 take no
disposition. The build changes in two places. The Library's two REQ-LIBRARY-109 texts name the retrospective as a second
source. The retrospective's start gesture stays available while a post-run analysis is queued or running, queues behind
it, and is refused on all three surfaces only while a retrospective is already queued or running in that workspace, with
the reason "A retrospective is already queued or running." The cases are the directive's clauses (a) to (g), each stated
exhaustively.

The two recommendations weighed, and the ruling followed **both**, each on the points below:
- **Advocate A (the user's lens)** recommended Narrows for REQ-LIBRARY-011, -020, -109, -124, -125 and -130 and Extends for
  REQ-LIBRARY-126, -128 and REQ-NOTIFY-250, the built hint ratified, the Library's two texts naming both sources, and the
  gesture disabled only while a retrospective is queued or running in the workspace, refused there with one info notice so
  the palette agrees.
- **Advocate B (the system's lens)** recommended one test for every verb — Narrows where a fixed text departs, Extends where
  the retrospective sits beside a requirement — giving Narrows for REQ-LIBRARY-020, -125 and REQ-NOTIFY-250 and Extends for
  REQ-LIBRARY-011, -109, -126 and -128, REQ-LIBRARY-130's hint restored word for word, and the two buttons never disabled.

The ruling applied B's test to every requirement. On REQ-LIBRARY-011 it followed A: that requirement marks
`collector_model` and `notes` nullable and leaves `source_session_id` non-null, and the same container stores
retrospective artifacts, so a null there departs. On REQ-NOTIFY-250 it followed B: its "only while that analysis is in
flight" is broken, so the verb is Narrows. B left REQ-LIBRARY-124 undisposed although the built notices depart from its
fixed titles; A covered it, and the notices are clear and honest, so they are ratified. On REQ-LIBRARY-130 it followed A
and ratified the built hint, which has the same shape as the two REQ-LIBRARY-109 texts A rightly found false of the
retrospective rows beneath them. On the gesture it followed A's narrower refusal: a second retrospective over an unchanged
workspace reads the same evidence and duplicate suppression discards its proposals, so B's "always enabled" spends the
owner's tokens for nothing. Revision 2 rests on the R-072 precedents B cited.

*Built 2026-10-13 (fin34, `fin34-library-and-intent`); its first execution is reported in `PD-LIBRARY-002`'s entry and in
ADR-0065.* The record half — the paragraph, the Narrows line, the two Extends entries and nine back-pointers — is pinned by
`back-pointers.test.ts`. The two behaviour repairs: `retrospective_pending` on `improvement:activity`, sent per main window
from the coordinator's `retrospectivePending`, one `RetrospectiveGesture` on both surfaces, the handler's refusal with one
info notice, and the Library's two texts. Notes moved to `docs/defects/fixed/`:
[`pd-library-002-reaches-further-requirements-its-disposition-does-not-name.md`](../../../defects/fixed/pd-library-002-reaches-further-requirements-its-disposition-does-not-name.md),
[`the-retrospective-start-gesture-is-disabled-while-any-analysis-runs.md`](../../../defects/fixed/the-retrospective-start-gesture-is-disabled-while-any-analysis-runs.md)
and [`the-library-proposals-texts-name-only-the-per-run-collector.md`](../../../defects/fixed/the-library-proposals-texts-name-only-the-per-run-collector.md).

<a id="oq-237"></a>

**OQ-237 — May two directives narrow, or extend, one requirement?** *(`docs/product/README.md`, "Identifiers", "The shape
of an entry" and "The back-pointer, in place": the meaning of Narrows and Extends, and the generator's refusal of a second
directive under one verb on one requirement, "precedence must be unambiguous"; `tools/symbol-artifact/generate.mjs`, the
per-verb maps that hold one directive per requirement; acceptance finding F15, the shape repaired for `PD-ORCH-014`.
Raised 2026-10-13 from
[`a-requirement-two-directives-narrow-can-name-only-one-so-the-second-is-recorded-under-another-verb.md`](../../../defects/fixed/a-requirement-two-directives-narrow-can-name-only-one-so-the-second-is-recorded-under-another-verb.md),
noticed 2026-10-07 by fin31's reviewer, and ruled the same day under the owner's delegation; the consortium's question GV1.)*

The generator keeps `SUPERSEDED_BY`, `NARROWED_BY` and `EXTENDED_BY` as one directive per requirement each and refuses a
second under any verb. Three builds met it and wrote a disposition under a verb its ruling did not name, or left it out:
`PD-TOOLS-013` lists REQ-TOOLS-112 and REQ-SESSION-136 under **Extends** though it adds a member to a closed set and removes
an issue (OQ-226); `PD-CONFIG-003` names REQ-CONFIG-256 and REQ-CONFIG-417 as narrowed where its ruling named them extended
(OQ-218); `PD-SHELL-009` carries its ruling's REQ-SHELL-021 through REQ-SHELL-122 (OQ-206). `PD-WORKSPACE-002` left
REQ-CONFIG-464 out altogether, its own text saying "no single revision could honestly hold" the two halves; revisions of
`PD-TOOLS-006` and `PD-ORCH-006` hold narrowings that "land here whatever [they are] about", and `PD-MONITOR-004` holds a
revision minted as a directive of its own and folded into it at a landing because "the symbol generator refuses two
directives narrowing one requirement". The generated
artifact answers "Extended by PD-TOOLS-013 … This still governs in full" for a requirement that no longer does.

**What a ruling decides.** Whether the register may hold several directives under Narrows or Extends on one requirement,
on what terms, and which dispositions the one-per-verb rule bent.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the symbol generator admits several
directives under **Narrows** and under **Extends** on one requirement, each verb's reach held as a list. **Supersedes** stays
one per requirement, and a superseded requirement may be neither narrowed nor extended. Two directives that narrow one
requirement state disjoint cases; at least one of the two names the other in its own entry, and the generator refuses the
pair otherwise; a case that overlaps an earlier narrowing is written as a revision of that directive. Extends carries no
citation rule, since nothing is displaced. Every disposition the one-per-verb rule bent is corrected to the verb its ruling
and the README's definitions give (`PD-TOOLS-013`, `PD-SHELL-009`, `PD-WORKSPACE-002`), and `docs/product/README.md` is
amended in place. No requirement's behaviour departs, so no directive is minted.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended lists for Narrows and Extends, a later directive naming every earlier one under
  the same verb, Supersedes single, and every bent disposition corrected so each requirement's label says what governs:
  REQ-SHELL-021's only note says the replacement route is governed "in full", and a builder trusting REQ-TOOLS-112's label
  could remove `interrupted` again. A bounded re-read of the requirements two directives already reach.
- **Advocate B (the system's lens)** recommended the same lists, with Supersedes beside Extends refused as Supersedes beside
  Narrows already is, the lists emitted sorted, the citation required of a second narrowing only, and the "lands here
  whatever it is about" sentences marked as no longer binding; REQ-CONFIG-256 and REQ-CONFIG-417 move to Narrows under
  `PD-WORKSPACE-002` by the F15 test.

The ruling agreed with both that "precedence must be unambiguous" holds for Supersedes alone: two replacements leave no
governing text, while two narrowings stating disjoint cases leave the requirement governing outside both, and two
extensions displace nothing. It took B on the four points they differed (no citation for Extends; Supersedes beside Extends
refused; sorted lists; the catch-all sentences marked) and A's bounded re-read, limited to the requirements two directives
reach, since only there could the rule have bent a verb. Its own change: the citation check is order-independent ("at
least one of the pair names the other"), because order in `directives.md` follows the domain, not the date.

*Built 2026-10-13 (fin34, `fin34-record-and-cancels`); the first execution is reported in `docs/product/README.md`.*
**The bounded re-read, what it found.** Of the fifteen requirements two directives reached, read under the README's
definitions and the exact-enumeration test: corrected to Narrows, the six the ruling named (REQ-TOOLS-112 and
REQ-SESSION-136 under `PD-TOOLS-013`; REQ-SHELL-021 under `PD-SHELL-009`; REQ-CONFIG-464, REQ-CONFIG-256 and REQ-CONFIG-417
under `PD-WORKSPACE-002`), and three it did not: **REQ-TOOLS-152 under `PD-ORCH-004`**, whose field list calls itself "the
whole of the `delegate` contract" and gains `continuation_of` (R-058 had recorded Extends because "the symbol artifact holds
one narrowing directive per requirement", the rule bending a verb the note did not list), and **REQ-LIBRARY-099 and
REQ-TOOLS-148 under `PD-LIBRARY-001`**, whose closed section sets gain `commands`. **Found nothing** at REQ-CHAT-057 and
REQ-CHAT-069 (`PD-CHAT-005`'s colour and indent leave every stated figure whole), REQ-ORCH-075 (`PD-ORCH-015` adds the held
answer to a payload the requirement does not close), REQ-SESSION-115 (`PD-LIBRARY-003` keeps the exact budgets and changes
only how an edited artifact is read), REQ-SHELL-119 (`PD-SHELL-003`'s title-bar control enters the same guards),
REQ-STARTUP-161 (`PD-SHELL-001`'s window is a window of the one instance, and the closed set there is the launch outcomes,
untouched) and REQ-WORKSPACE-041 (`PD-LIBRARY-002`'s retrospective reads what discovery finds). Every pair of narrowings the
register now holds names each other. The generator's one-per-verb reason is marked as no longer binding wherever the
register still gave it in the present tense: beside the "lands here" sentences of `PD-TOOLS-006` and `PD-ORCH-006`, at
`PD-MONITOR-004`'s folded revision, and at `PD-ORCH-003`'s "it would also be refused" (whose supersession half still holds).
**Checked again at the landing rebase** (2026-10-13), against every disposition `origin/main` then carried, those landed while
this was built included (`PD-CONFIG-003` revision 3, `PD-LIBRARY-002` revision 2's seven narrowings and two extensions,
`PD-ORCH-011` revision 2): none was bent by the one-per-verb rule, since each requirement they name under a verb carries no
other directive under it, so nothing more is corrected. Outside the bound and recorded, not corrected:
[`pd-library-001-extends-two-requirements-whose-closed-sets-it-changes.md`](../../../defects/fixed/pd-library-001-extends-two-requirements-whose-closed-sets-it-changes.md).
**Corrected the same day** (fin36, `fin36-last-notes-and-optionals`): on the same test `PD-LIBRARY-001` now narrows REQ-LIBRARY-088
(a closed field inventory gaining `commands[]`) and REQ-LIBRARY-090 (a fixed section order gaining **Commands**), the disposition
it replaces quoted beside it and the two back-pointers relabelled; no other directive reaches either, and no behaviour moves.
Whether another directive that alone reaches a requirement carries the same shape is still not swept.

<a id="oq-238"></a>

**OQ-238 — Does every call its run cancels read `interrupted`, or only the terminal's?** *(PD-ORCH-005 clause 3, a call the
rest cut off "is recorded as interrupted"; `PD-TOOLS-013`, the terminal's cancel; REQ-SESSION-136, the outcome-driven
issues; REQ-TOOLS-092 and REQ-SANDBOX-025, fetch's closed vocabulary; REQ-SESSION-139, the histogram's four derived
buckets; ADR-0023's reading of the run's abort mid-fetch as `network_error`; OQ-208, no `outcome_kind` on an MCP or fetch
record. Raised 2026-10-13 from
[`a-call-the-run-cancels-in-the-gate-or-in-fetch-files-a-tool-error-issue.md`](../../../defects/fixed/a-call-the-run-cancels-in-the-gate-or-in-fetch-files-a-tool-error-issue.md),
noticed by the consortium while ruling OQ-226 and recorded by fin31, and ruled the same day under the owner's delegation;
the consortium's question GC1.)*

`PD-TOOLS-013` made the terminal's cancelled call read `interrupted` and file no issue. Three sibling paths still read a cancel
as a failure. The gate's catch writes `cancelled` for an executor that throws once the signal is aborted
(`packages/agent-tools/src/gate.ts`), a kind no vocabulary holds; fetch writes `network_error`, the kind of a real transport
fault (`packages/agent-tools/src/tools/fetch.ts`, `transportFailure`); and the MCP executor's catch writes `execution_error`
(`apps/desktop/src/run-host/mcp.ts`), though its SDK call receives the run's signal (`packages/mcp/src/client.ts`). All three
fall through to the gate's `tool_error` warning, which `summary.md`'s Tool errors line counts, while the turn already answers
each call as interrupted (`callSignal.aborted`). A record with failure kind `interrupted` and no `outcome_kind` (those three,
and a released delegation wait) derives into the histogram's `tool_error` bucket.

**What a ruling decides.** Whether every call its run cancels reads `interrupted` and files no issue, which requirements that
departs from, and where such a call is counted in REQ-SESSION-139's histogram.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** [`PD-TOOLS-013`](../../../product/directives/pd-tools-013.md#pd-tools-013)
revision 2, retitled "a call its run cancels reads `interrupted`", governs every tool call cut off by its run's signal: the
gate's catch, fetch and the MCP executor as well as the terminal. Each such call is recorded with failure kind
`interrupted` and a detail saying the run cancelled it before it completed, and files no outcome-driven issue. When it
carries no `outcome_kind`, the tool-outcomes histogram counts it under `interrupted`. A deadline that expired first still
reads `timeout`, and a fetch keeps its eight other kinds unchanged. The revision narrows REQ-TOOLS-092 and REQ-SANDBOX-025
(fetch's vocabulary gains `interrupted`, `InterruptedError`) and REQ-SESSION-139 (a fifth derived bucket); OQ-208's
reading stands, since no record gains an `outcome_kind`.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended that a call the run cancels read `interrupted` and file no issue whatever its
  tool, the MCP executor included, with fetch's vocabulary widened by a revision of `PD-TOOLS-013` narrowing REQ-TOOLS-092,
  and the histogram counting such a call under `interrupted`, since under any other reading `summary.md` would still count
  a quit as a tool error.
- **Advocate B (the system's lens)** recommended the same three repairs as revision 2 of `PD-TOOLS-013`, retitled, narrowing
  REQ-SANDBOX-025 beside REQ-TOOLS-092 (it "mints no further kind" on its own), and the MCP catch testing the allowance
  timeout before the abort, as fetch tests its deadline first.

The ruling took B's record shape (REQ-SANDBOX-025 narrowed; the timeout tested first in MCP) and A's histogram (a
one-line derivation of REQ-SESSION-139). Leaving MCP out would reopen the same defect under a new name. The ruling named
REQ-SESSION-139 as extended and kept REQ-TOOLS-112 and REQ-SESSION-136 as extended; [OQ-237](#oq-237), ruled and built the
same day, reads a change to an exact enumeration as a narrowing, so the revision narrows all three (recorded in the
directive's disposition).

<a id="oq-239"></a>

**OQ-239 — Does the launch dialog owe the unattended advisory for `ask` and `restricted`?** *(REQ-TOOLS-072, "before the
application starts an unattended run"; REQ-TOOLS-192, "a run whose session will have no approval presenter"; REQ-SANDBOX-107,
"whenever the session being started would be unattended"; `PD-TOOLS-002`, which empties the advisory for `autonomous` and
says that for `ask` and `restricted` it "behaves as today"; REQ-TOOLS-053, REQ-TOOLS-069, REQ-SANDBOX-101 and ADR-0019, what
makes a run attended; REQ-SANDBOX-130, the disclosure shown "when that advisory is empty". Raised 2026-10-13 from
[`the-unattended-advisory-is-empty-for-every-mode-where-pd-tools-002-keeps-it-for-ask-and-restricted.md`](../../../defects/fixed/the-unattended-advisory-is-empty-for-every-mode-where-pd-tools-002-keeps-it-for-ask-and-restricted.md),
recorded 2026-10-07 at OQ-222's request, and ruled the same day under the owner's delegation; the consortium's question UA1.)*

`unattendedAdvisory` (`packages/ui/src/StartSessionDialog.tsx`) took the permission mode, whether confinement was active and
the permissive opt-in, discarded all three and returned `''`, so the "Start session" dialog never showed the advisory, and its
comment said the `ask`/`restricted` behaviour was kept. `apps/desktop/src/renderer/main.tsx` read the mode for it and passed
`allowUnsandboxedAutonomous: false`, "the side that produces the advisory". Whether `''` is right for `ask` and `restricted`
was not settled.

**What a ruling decides.** Whether a run the dialog starts can be unattended at launch, and so whether the three advisory
requirements owe it any text.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the Start session dialog's
unattended advisory is empty for every permission mode, **confirmed as built**. Every run that dialog starts is attended at
launch (REQ-TOOLS-053, REQ-TOOLS-069, REQ-SANDBOX-101, ADR-0019), so the unattended-launch condition that REQ-TOOLS-072,
REQ-TOOLS-192 and REQ-SANDBOX-107 (as `PD-TOOLS-002` narrows them) attach the advisory to never holds on that surface, and
those requirements are met as written. The misleading comment and the dead inputs are corrected and the reason is pinned by a
test. **Forward guard:** a future surface that can start a run with no registered presenter must have the advisory's text
re-ruled before it shows one, because under `PD-TOOLS-002` the settings the old text named
(`runtime.allow_unsandboxed_autonomous`, the downgrade to `ask`) are inert or insufficient. No directive, no specification
text and no back-pointer change.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended confirming the empty advisory as built for all three modes, since every
  dialog start is attended and a non-empty advisory would show a false sentence on every default launch; correct the code
  and the record to say why, pin it with a test that renders the dialog, and close the note.
- **Advocate B (the system's lens)** recommended the same reading as a record-only amendment: an OQ entry, the comment
  corrected, the behaviour pinned, the note moved; and a guard that a windowless launch surface re-rules the text first.

The ruling labelled it confirm-as-built, as A did: the code comment, the inputs and the test are more than a record-only
amendment. It took B's forward guard and A's render-level test, so REQ-SANDBOX-130's disclosure is shown to survive the empty
advisory. The evidence it checked: `PresenterRegistry.attended` is true while a window is registered and liveness has not
lapsed (`packages/agent-tools/src/approvals.ts`); each main window registers on creation (`main-windows.ts`,
`registerPresenter`; `index.ts`); the last window closing quits (`window-all-closed`); and `ed1c167` shows the function
already returned `''` for `ask` and `restricted` before `PD-TOOLS-002`, so "as today" never meant visible text. The
liveness-lapse edge is narrow: a start reaches the run host through main, the process whose reply clears the lapse, and the
run reports any refusal as REQ-SANDBOX-107 allows.

**As built (2026-10-13, fin34):** `unattendedAdvisory()` takes no input and returns `''`, its comment stating this ruling;
the renderer's launch state no longer carries `permissionMode` or `allowUnsandboxedAutonomous`, and the dialog is given
`unattendedAdvisory()`. The `advisory` prop and the `start-session-advisory` paragraph stay as REQ-TOOLS-192's presentation
seam. Pinned by `packages/ui/src/start-session-advisory.test.ts` (its first case red on the old form: the function took one
input). Nothing a user sees changes.
