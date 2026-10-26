[Product directives](../directives.md) › PD-CONFIG-003

<a id="pd-config-003"></a>

### PD-CONFIG-003 — the Runtime category's two timeouts: the per-agent timeout as a third delegation limit, in minutes, and the improvement analysis timeout, in seconds

*Revision 2 (2026-10-07, R-072, the ruling of OQ-223) — the heading widens to name both of the Runtime category's timeouts,
and the clause marked "— revision 2" below is added; revision 1's text stands unchanged beside it. Revision 1's heading
was: "PD-CONFIG-003 — the Runtime category offers the per-agent timeout as a third delegation limit, in minutes", and its
disposition: "Narrows: REQ-CONFIG-322, REQ-CONFIG-256, REQ-CONFIG-417 / Extends: REQ-CONFIG-263".*

*Revision 3 (2026-10-07, R-072, the ruling of OQ-234) — a delegated agent cut off at its per-agent timeout names this control
where its failure shows. The clause marked "— revision 3" below is added; the heading stays as revision 2 left it, and the
text of revisions 1 and 2 stands unchanged beside it.*

*Revision 4 (2026-10-13, [R-072](../requests.md#r-072), the ruling of [OQ-253](../../architecture/open-questions/54-spikes-and-later-questions-21.md#oq-253)) — the
`<limit>` bullet of revision 3 states both singular forms; revision 3's bullet is quoted beneath it, and every other clause
stands unchanged.*

Settings › Runtime › **Delegation limits** SHALL show a third numeric control, "Per-agent timeout", after the depth cap and
the fan-out limit: whole minutes with a "minutes" suffix (REQ-CONFIG-325's pattern), clamped at the widget to **1–240**. It
is REQ-MONITOR-286's per-agent timeout, initialised from the effective `runtime.child_timeout` (REQ-CONFIG-113, in seconds)
divided by 60, so a default install reads **20**. A user's entry is stored as the minutes times 60 seconds, committed by Save
into the workspace file (REQ-CONFIG-256), and laid on the next run start by Tier B whether or not it is saved (REQ-CONFIG-262,
REQ-CONFIG-263). A stored value the control cannot express — one that is not a whole minute, or lies outside 60–14,400
seconds — is shown rounded and clamped for display only, a line beneath it states the stored seconds, and the value is
never rewritten until the user changes the field (REQ-CONFIG-446, REQ-CONFIG-419). The control's hint says the limit bounds
each **delegated** agent, that the step in flight gets up to 30 s more (PD-ORCH-004 revision 5), that an agent still making
progress hands its work back to its parent, and that the value applies to runs started from now. The Overview caps line is
unchanged (REQ-MONITOR-169). PD-ORCH-004 is not revised: its default and its limit stay as they are; this directive only
lets the user move the limit.

**The improvement analysis timeout — revision 2.** Settings › Runtime › **Runtime policy** SHALL show "Improvement analysis
timeout" directly after the "Improvement loop" toggle: whole seconds with a "seconds" suffix (REQ-CONFIG-325's pattern),
clamped at the widget to **10–600**, initialised from the effective `runtime.improvement_collector_timeout` (REQ-CONFIG-118,
REQ-LIBRARY-039), so a default install reads **60**. It is committed by Save into the workspace file (REQ-CONFIG-256) and laid
on the next run start by Tier B whether saved or not (REQ-CONFIG-262, REQ-CONFIG-263). A stored value outside 10–600 is shown
clamped, a line beneath states the stored seconds, and it is never rewritten until the field changes (REQ-CONFIG-446,
REQ-CONFIG-419). The hint says, in plain words, how long the background review of a finished run may take, that a longer
review ends with no proposals, that it never holds up the person's work, that it is used while the improvement loop is on,
and that it applies to runs started from now. A post-run analysis that reaches the limit SHALL say so in REQ-LIBRARY-124's
zero-proposal notice's detail, giving the limit in seconds and naming this control; that notice's title and its absence of an
action stay as they are (REQ-NOTIFY-100, REQ-LIBRARY-023). The desktop save's runtime keys SHALL be a closed list —
REQ-CONFIG-256's eight, `child_timeout`, `improvement_collector_timeout` and the six confinement and egress fields — that the
screen's runtime keys equal, and a save naming any other runtime key is refused.

**Where a cut-off agent shows — revision 3.** A delegated agent whose stored report carries REQ-ORCH-088's `timeout` error
("Child timed out after <N>s") SHALL show:

- **On the rows.** On its delegation-tree row (REQ-MONITOR-040) and its Mission-table row, a "timed out" tag after its state.
- **The line.** In the inspector, directly under the meta line (REQ-MONITOR-052), and in its persona-window instance tab,
  directly under its state (REQ-MONITOR-069), one line: "Cut off at its per-agent timeout of <limit>[ while making progress].
  Settings › Runtime › Per-agent timeout sets this limit for runs started from now."
- **`<limit>`.** N, the limit the agent ran under, written "1 minute" or "<m> minutes" when N is a whole number of minutes,
  and "1 second" or "<N> seconds" otherwise *(— revision 4)*.

  > Revision 3 said, and no longer governs: "N, the limit the agent ran under, written '1 minute' or '<m> minutes' when N is a
  > whole number of minutes, and '<N> seconds' otherwise." — which wrote a one-second limit "1 seconds".
- **"while making progress".** It appears exactly when the report carries PD-ORCH-004's cut-off statement.
- **One wording.** The line is worded once, and its path segments are the labels the Settings screen renders.

The agent as presented carries the fact (REQ-MONITOR-044). Unchanged: the meta line's form and REQ-MONITOR-041's row tooltip;
REQ-ORCH-088's error and issue; PD-ORCH-004's statement and offer; OQ-217's Outcome line, the timeline, the report artifact and
the parent's tool results; no notice is raised; the default, the hard bound, the 30 s landing and the continuation rule
(PD-ORCH-004, R-048, R-071, OQ-214).

**As built.** `child_timeout` in `RuntimeViewSchema` (`packages/contracts/src/config.ts`) and the snapshot
(`packages/config/src/snapshot.ts`), `TIER_B_RUNTIME_KEYS` (`packages/config/src/tiers.ts`), `DesktopSave.runtime`
(`packages/config/src/writers.ts`, whose validation on assignment already refuses a value below 1, REQ-CONFIG-111);
`PendingSettings.runtime.child_timeout`, `timeoutMinutesForDisplay`, `timeoutSecondsFromInput` and `storedTimeoutNote`
(`packages/ui/src/settings/config-state.ts`); the `child-timeout` control in `packages/ui/src/settings/ConfigSettings.tsx`.

**Why, and what it costs.** OQ-218, ruled 2026-10-07 under the owner's delegation (R-072, advocate A followed). REQ-MONITOR-286
names three interface-level delegation controls and the build drew two: no surface showed the per-agent timeout, and the only
route to the limit both duress live runs met ("Child timed out after 1200s"; 66 % of the run behind it at `c2fdd6a`, 61.5 % at
`c2a9444`) was a YAML key in seconds — while the ruling that kept the 1200 s ceiling counts on that user being able to raise
it. REQ-CONFIG-322's "two numeric controls" faithfully describes the reference, so a third is a directive. What it costs: a
user can raise the limit so far (up to 4 h at the widget) that a looping child spends that long before it is stopped, and the
same limit bounds a parent's resume attempt and a wait; a user who lowers it to minutes sees most delegated work fail. The
240-minute ceiling is a chosen figure, twelve times the default, with no derivation behind it; a file may still state a
longer value, which the control shows clamped and keeps.

*Revision 2's why, and what it costs.* OQ-223, ruled 2026-10-07 under the owner's delegation (R-072, advocate A followed).
OQ-114's F4 timed six analyst calls on the owner's endpoint at 22 to 134 s, three past the 60 s default R-071 kept, and a
timed-out review read like an empty one; the bound that decides whether the analyst's chosen model finishes belongs beside
the toggle it qualifies, and two timeouts on one screen follow one rule (OQ-218). The control had been built with no record
tracing it, and it reached the file only because the save took any runtime key; the closed list is what would have caught
it. What it costs: a longer bound spends tokens, and it delays later analyses, which run one at a time (REQ-LIBRARY-123);
quitting still cancels an analysis in flight (REQ-LIBRARY-127), so a live run that quits within seconds is not helped; 10
and 600 are chosen figures (600 is ten times the default, about 4.5 times the slowest measured call); `retrospective_timeout`
and REQ-NOTIFY-100's other five bounds stay file-only; and the runtime policy card carries one field beyond REQ-CONFIG-323's
four toggles, which black-box conformance may note. R-071's 60 s default is not revised.

*Revision 3's why, and what it costs.* OQ-234, ruled 2026-10-07 under the owner's delegation (R-072, both advocates followed).
Finding D2 of the duress live run at `a68f121` (session `e6747bd0`): two testers, `bg_dcecf655` and its continuation
`bg_98fa54d7`, were cut off at 1200 s while making progress, and each row read `failed` with nothing else — the error went to
the parent, the issue record and the timeline, which no screen shows, and nothing named the control the ceiling rulings
(OQ-218, OQ-214) count on. Revision 2 set the rule for the other timeout a user can set: the surface reporting the timed-out
operation states the limit and names its control. What it costs: one field on the presented agent across the process boundary
(read from the stored report, so a resumed session shows it too), one tag and one line. A person may raise the limit for a
child that was looping; the line names the control without urging that, and says "while making progress" only where the
child was. The limit is read back from REQ-ORCH-088's error text, so one formatter writes it and one parser reads it, pinned
by a round trip. Black-box conformance will see a tag and a line the reference lacks.

*Revision 4's why, and what it costs.* OQ-253, ruled 2026-10-13 under the owner's delegation (R-072, TS1, both advocates
followed on substance). A one-second limit is reachable: the workspace file takes any integer of at least 1 second
(REQ-CONFIG-113; the widget offers 60 to 14,400). The minutes clause already spells "1 minute", so the template was meant to
agree in number, as R-071 read REQ-GIT-122's form; the build wrote "1 second" from revision 3's first execution on. REQ-ORCH-088's
"Child timed out after <N>s" is a different text, the one the limit is parsed back from, and is unchanged. What it costs:
nothing in code; a revision rather than a correction note, because the bullet is the directive's own normative text.

> **Narrows:** REQ-CONFIG-322, REQ-CONFIG-256, REQ-CONFIG-417, REQ-CONFIG-325
> **Extends:** REQ-CONFIG-263, REQ-CONFIG-323, REQ-LIBRARY-041, REQ-MONITOR-040, REQ-MONITOR-044, REQ-MONITOR-052, REQ-MONITOR-069

*Raised by the consortium under the owner's delegation, 2026-10-07; logged as [R-072](../requests.md#r-072), the ruling of
[OQ-218](../../architecture/open-questions.md) (T1). Cites, without changing them: REQ-MONITOR-286, REQ-CONFIG-113,
REQ-ORCH-088, REQ-CONFIG-446, REQ-NOTIFY-100 and PD-ORCH-004 revision 5. The ruling named REQ-CONFIG-256 and REQ-CONFIG-417
as extended, and this directive names them as narrowed: it changes their exact enumerations, which is what narrowing records
(acceptance finding F15).*

*Corrected 2026-10-13 under [OQ-237](../../architecture/open-questions.md): the verb follows that change and was never forced;
`PD-WORKSPACE-002` now narrows both as well, in the disjoint case of the instruction files. The reason first given here no
longer is one:* "both are already extended by PD-WORKSPACE-002 and the symbol generator admits one directive per verb, so
this directive names them as narrowed … (found while building)."


*Revision 2 raised by the consortium under the owner's delegation, 2026-10-07; logged as [R-072](../requests.md#r-072), the
ruling of [OQ-223](../../architecture/open-questions.md) (IT1). Cites, without changing them: REQ-CONFIG-118, REQ-LIBRARY-039,
REQ-LIBRARY-023, REQ-LIBRARY-124, REQ-NOTIFY-100, REQ-CONFIG-446, REQ-CONFIG-419 and OQ-114's kept 60 s.*

*Revision 3 raised by the consortium under the owner's delegation, 2026-10-07; logged as [R-072](../requests.md#r-072), the
ruling of [OQ-234](../../architecture/open-questions.md) (CN1), the question the D2 ruling raised. Cites, without changing them:
REQ-ORCH-088, PD-ORCH-004 revisions 1 to 5, REQ-CONFIG-113, REQ-MONITOR-041, REQ-MONITOR-285, REQ-MONITOR-286, REQ-NOTIFY-092,
REQ-NOTIFY-100, REQ-NOTIFY-261, OQ-217 and revision 2's notice detail.*

*Revision 4 raised by the consortium under the owner's delegation, 2026-10-13; logged as [R-072](../requests.md#r-072), the
ruling of [OQ-253](../../architecture/open-questions/54-spikes-and-later-questions-21.md#oq-253) (TS1), from revision 3's first execution. Cites, without changing
them: REQ-ORCH-088, REQ-CONFIG-113 and REQ-MONITOR-286.*

*Ruled 2026-10-14 under [OQ-301](../../architecture/open-questions/61-spikes-and-later-questions-28.md#oq-301) ([R-072](../requests.md#r-072)), with no revision:
"until the user changes the field" and "until the field changes" mean until the person types or steps a value into the field,
an entry equal to the value shown included — that entry is "a user's entry", replaces the pending value, marks the form dirty
when it differs from the saved value, and is written by Save. Opening, repopulating, focusing or leaving the field without
typing changes nothing, and the stored value survives all of them. Revisions 1 to 4 keep their text.*

> **First execution, 2026-10-07, built under [R-072](../requests.md#r-072):** the directive held as written. **What was
> measured.** `settings/child-timeout.test.ts` (the minutes and seconds both ways, the stored-value line, a stored 1250 s and
> 36000 s kept and unsaved, no change on a repopulation, the save carrying `child_timeout` only after an edit, the live state
> carrying it, and the third control drawn at 20 and at 21 with the stored line), `writers.test.ts` (the save writes 2700 and
> refuses 0 before touching the file; a live 2700 s reaches the resolved runtime) and `snapshot.test.ts` (a stated 1250 reaches
> the view; 1200 by default), each red on the source before. Driven in the built app (`pnpm app:drive`): a default install's
> Runtime category read "Per-agent timeout 20 minutes", the field 66 px wide like the depth cap's; 45 typed and saved wrote
> `child_timeout: 2700` into the workspace file, and the next run start logged `child_timeout=2700 s`; a workspace stating 1250
> read 21 with "Stored as 1250 seconds; kept until you change this field." and the save bar clean. **What was not measured.**
> A run started with an unsaved value (the unsaved-settings guard holds the person in Settings; the Tier B overlay and the
> live state are pinned by unit cases), and a delegated child running past 20 minutes (the orchestrator's live run; since
> OQ-214's second ruling, 2026-10-07, the duress live harness sets this control to 45 minutes for its launch, so the next
> duress live run is its measurement — `child_timeout=2700 s` in its `app.log`). The row
> is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Revision 2's first execution, 2026-10-07, built under [R-072](../requests.md#r-072) (fin29):** the revision held as
> written, and its widget clamp needed one more rule. **Found:** the control as first built took every keystroke through
> the clamp, so `120` typed into a cleared field became `10`, then `102`, then `600`; it now holds the text as a draft until it
> is a whole number within 10–600 or the field loses focus (`improvementTimeoutEdit`). The same fault in the category's other
> number fields was recorded, not repaired, then; since fin34 (2026-10-13) every Runtime number field, the per-agent timeout
> included, holds the same draft (`ClampedNumberField`, `clampedNumberEdit`)
> ([`a-settings-number-field-clamps-every-keystroke-so-some-values-cannot-be-typed.md`](../../defects/fixed/a-settings-number-field-clamps-every-keystroke-so-some-values-cannot-be-typed.md)).
> **As built.** `DESKTOP_SAVE_RUNTIME_KEYS` and the closed `DesktopSaveSchema.runtime` (`packages/contracts/src/config.ts`),
> `DesktopSave.runtime` typed from it (`packages/config/src/writers.ts`), `improvement_collector_timeout` in
> `TIER_B_RUNTIME_KEYS` (`packages/config/src/tiers.ts`), the helpers in `packages/ui/src/settings/config-state.ts`, the
> `improvement-timeout` control in `packages/ui/src/settings/ConfigSettings.tsx`, `zeroProposalDetail`
> (`apps/desktop/src/main/improvement-notice.ts`), and the run start's configuration line now naming the resolved
> `improvement_collector_timeout` (`apps/desktop/src/run-host/configuration.ts`). **What was measured.**
> `settings/improvement-timeout.test.ts`, `writers.test.ts`'s three revision-2 cases, `contracts.test.ts`'s closed-list case
> and `improvement-notice.test.ts`, red on the source before except the save's write; driven (`pnpm app:drive`): 60 by
> default after the toggle, 120 typed and saved into the workspace file and resolved at the next run start, a stated 900 read
> 600 with its stored line and the save bar clean. **What was not measured.** A run started on an unsaved value (the
> unsaved-settings guard holds the person in Settings, as for the per-agent timeout), a timed-out analysis's notice in the
> built app, and the `ui-review` pack (skipped: the control repeats the per-agent timeout's measured geometry, 66 px). The
> row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **First live execution, the default case, 2026-10-07** (the final duress live run at `a68f121`, pack
> `2026-10-07T07-09-30-708Z` of the live worktree, session `e6747bd0`, the self-hosted endpoint, read by its autopsy): the
> directive held as written where its default governs. The run host's configuration line read `child_timeout=1200 s`
> (`duress/app.log` lines 13 and 24), and the two children that worked past twenty minutes were cut off at 1,200 s and landed
> inside the 30 s allowance: wave3 (`wave3-verify-all`) at the ceiling +4.25 s and its continuation wave3b at +0.44 s, each with
> its timeout issue at `error` and its report's cut-off statement. **NOT REACHED:** the control itself — the live harness never
> sets it and no launch captured Settings — so a person raising the limit, the relief the directive offers, has not run
> against a real model. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Revision 3's first execution, 2026-10-07, built under [R-072](../requests.md#r-072) (fin33):** the revision held as written,
> and the drawing needed one rule the clause leaves to the design. **Found:** "after its state" read as beside it squeezed the
> rows — in the built app (1440 × 900, load about 15 on 4 CPUs) the tag beside `failed · 1m 7s` cut the Workspace sidebar
> row's persona column from 112 px to 35 px, breaking "coding-agent" over two lines (row 44 → 61 px), and widened the Mission
> table's state cell by 70 px, so the card scrolled 14 px sideways; and the inspector broke "Per-agent" from "timeout" at the
> hyphen. The tag now takes a line of its own under the state (row 50 px, the persona 112 px and one line; the state cell
> 78 px, the card 910 of 910 px) and the control's path is kept on one line (213 px). The same squeeze under the stalled badge,
> which shares the slot, is recorded, not repaired
> ([`the-stalled-tag-beside-a-tree-rows-state-can-squeeze-the-persona-onto-two-lines.md`](../../defects/fixed/the-stalled-tag-beside-a-tree-rows-state-can-squeeze-the-persona-onto-two-lines.md));
> repaired 2026-10-13 (fin35) the same way, the stalled tag on a line of its own.
> The limit is written "<N> seconds" except that one second reads "1 second", the way "1 minute" does — since revision 4
> (2026-10-13, [OQ-253](../../architecture/open-questions/54-spikes-and-later-questions-21.md#oq-253)) the directive's own text. **As built.**
> `childTimedOutMessage` and `timedOutOf` (`packages/engine/src/children/cut-off.ts`), `AgentRecord.timedOut`
> (`packages/contracts/src/children.ts`) filled by `toAgentRecord` (`packages/engine/src/sessions.ts`), `TIMED_OUT_TAG`,
> `timeoutLimitText`, `perAgentTimeoutPath` and `timeoutLine` (`packages/ui/src/agents.ts`) over `RUNTIME_CATEGORY_LABEL` and
> `PER_AGENT_TIMEOUT_LABEL` (`packages/ui/src/settings/config-state.ts`, which Settings renders), `TimeoutLine.tsx`, and the
> four surfaces (`AgentTree.tsx`, `AgentTable.tsx`, `Inspector.tsx`, `PersonaWindow.tsx`). **What was measured.**
> `cut-off.test.ts`, `activity.test.ts`, `children.test.ts`'s two cut-off cases and `agent-timeout.test.ts`, red on the source
> before; `pnpm mission-proof` item 1d (a 3 s limit, so the seconds form): a child making progress read "Cut off at its
> per-agent timeout of 3 seconds while making progress. …" in the inspector under `failed · 10s · 1 tool call`, in its persona
> window under `failed`, and as the title of both Mission tags; a child that made no call read it without "while making
> progress"; driven (`pnpm app:drive`) at a 60 s limit, "1 minute while making progress", and at the 1000 px floor the sidebar
> row (295 px) and the inspector drawer (289 px) with no sideways scroll. **What was not measured.** A cut-off in a live run
> (the orchestrator's: D2's 45-minute duress run, where any child cut off should read "45 minutes"), and the `ui-review`
> pack (skipped: it renders no cut-off agent; the geometry above was read from the built app instead). The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Revision 4's first execution, 2026-10-13 (fin36):** the revision held as already built — nothing changed in code, test or
> proof. `timeoutLimitText` (`packages/ui/src/agents.ts`) writes the limit through `countNoun`, and
> `packages/ui/src/agent-timeout.test.ts` pins `timeoutLimitText(1)` as "1 second" beside "1 minute" and the plural forms; that
> file was run again on this branch, green. **What was not measured.** A cut-off at a one-second limit in the built app
> (`pnpm mission-proof` item 1d drives a 3 s limit). Repairs
> [`pd-config-003-writes-a-one-second-limit-as-1-seconds`](../../defects/fixed/pd-config-003-writes-a-one-second-limit-as-1-seconds.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **The control set through Settings before a run, in the built app, and the live scenario written, 2026-10-13 (fin42, the
> survey's N50):** the first live execution's NOT REACHED above — the control itself, which no harness had driven before a
> run, every launch writing `agents.yaml` itself (`withRuntimeKey`) — is reached in the built app. `pnpm continuation-proof`'s
> later-run scenario opens Settings › Runtime, selects and deletes the Per-agent timeout's text, types `1`, leaves the field
> and presses Save (`apps/desktop/scripts/lib/settings-runtime-field.mjs`): the bar read `Unsaved changes`, then `All changes
> saved`; the workspace file read `child_timeout: 60`; the next run start logged `child_timeout=60 s`. The same proof reads the
> Workspace sidebar's tag as it appears ("Cut off at its per-agent timeout of 3 seconds while making progress. …"), the reading
> the live scenario takes. **Found:** a value typed over a selection that already shows the same digits is no change to the
> field, so a stored 3 s shown clamped as `1` and overtyped `1` stayed 3 s with the bar clean; recorded, not repaired
> ([`a-runtime-number-field-ignores-a-value-typed-over-the-same-clamped-digits.md`](../../defects/fixed/a-runtime-number-field-ignores-a-value-typed-over-the-same-clamped-digits.md)).
> *Repaired 2026-10-14 (fin43), reported here in place:* every clamped Runtime field now commits a typed value from the
> native input event rather than React's change event, which skips a value equal to the one the input holds, so the
> overtyped `1` is "a user's entry" stored as 60 seconds like any other (this directive's own words; the field's text was
> changed, and nothing outside an entry rewrites a value the control cannot express). The proof's helper no longer
> deletes the text before typing (`lib/settings-runtime-field.mjs`): the later-run scenario now types `1` over the stored
> 3 s shown as `1` and reads `Unsaved changes`, `All changes saved` and `child_timeout: 60`; against a build without the
> repair the same steps read `All changes saved` straight after the edit and failed.
> **Written, not run (the orchestrator's):** `live-run.mjs`'s opt-in `cutoff` scenario sets the control to
> `LIVE_RUN_CUTOFF_MIN` (default 1) minute(s) the same way and gives one child more work than that; it should show the
> control's Save storing `child_timeout: 60`, the run reading it, a child ended `failed` with "Child timed out after 60s" and
> the offer, and the sidebar's tag titled "Cut off at its per-agent timeout of 1 minute while making progress. Settings ›
> Runtime › Per-agent timeout sets this limit for runs started from now." (`=2` measures the plural form). **Not measured:**
> that live run. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Revision 2's control driven before a run, and its timed-out notice, in the built app, 2026-10-13 (fin42, the survey's
> N58):** revision 2's first execution left "a timed-out analysis's notice in the built app" unmeasured. `pnpm
> retrospective-proof`'s launch 8 sets Settings › Runtime › Improvement analysis timeout to 300 and saves (the run start then
> logs `improvement_collector_timeout=300 s` and its analysis ends with proposals), then to 10 with an analyst that never
> answers: the run's empty artifact notes "collector timed out after 10 seconds" and the notice reads "Improvement analysis
> complete — no proposals" with "The review of this run reached its 10-second limit before it proposed anything. Settings ›
> Runtime › Improvement analysis timeout allows it longer." That launch found
> [`a-post-run-analysis-after-a-retrospective-is-never-captured.md`](../../defects/fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md)
> (repaired; PD-LIBRARY-002's record above). The live `ask` scenario sets the control to `LIVE_RUN_ANALYST_TIMEOUT_S` (default
> 300) the same way before its run. **Not measured:** that live run, the orchestrator's.

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**.
>
> - **The raised limit (OQ-214's second ruling, the harness's 2,700 s): measured once, and it mattered.** The duress pack's
>   `app.log` read `child_timeout=2700 s` (lines 13 and 31), `results.json` `childTimeoutS: 2700`, and the pack holds
>   `duress/agents.yaml`. No child was cut off. The verifier f1 lived **1,253.2 s**, 53.2 s past the 1,200 s default, and
>   succeeded; under the default its last step would have landed 21.5 s after the ceiling and the child would have ended
>   `failed`. The limit was set by the harness's file edit; the Settings control was not driven.
> - **Revision 3's tag (CN1) and revision 4's "1 second": NOT REACHED.** No child timed out in any of the three packs; the
>   longest default children lived 176.2 s (`552d346`) and 268.5 s (`0bc3eee`).
>
> Evidence:
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
