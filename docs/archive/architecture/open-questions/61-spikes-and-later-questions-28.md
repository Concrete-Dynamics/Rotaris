# Archived open questions — Spikes, and the questions raised since (28 of 35)

The ruled, closed, resolved and withdrawn entries of [part 61](../../../architecture/open-questions/61-spikes-and-later-questions-28.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-298"></a>

**OQ-298 — Does a quit from outside any window wait without bound on a person's answer to the unsaved-settings guard?**
*(REQ-SHELL-119 guard (1), "a **user-initiated** close raises the save/discard/cancel dialog"; REQ-SHELL-124; REQ-SHELL-121, "Shutdown
is clean and complete"; [`PD-SHELL-009`](../../../product/directives/pd-shell-009.md#pd-shell-009)'s last case, "it asks only the renderer's
unsaved-settings guard"; [`PD-SHELL-010`](../../../product/directives/pd-shell-010.md#pd-shell-010); PD-ORCH-005 clause 9. Raised 2026-10-14 by fin44
(`fin44-hang-and-seams`) as [OQ-297](60-spikes-and-later-questions-27.md#oq-297)'s ruling asked: the residual it does not decide. The plan's range OQ-296 to OQ-310,
the next free number on this branch — renumbered at landing if a sibling took it first. Ruled 2026-10-14 under R-072, below.)*

**What is open.** A quit that starts outside any window — SIGTERM, the desktop's logout where Electron emits `before-quit`, the
driver's or the capture's quit — is turned into every main window's guarded close (`closeThroughGuards`), and asks the renderer's
unsaved-settings guard. With settings unsaved, that guard raises REQ-SHELL-124's Save/Discard/Cancel dialog in the window and
waits for a person. `PD-SHELL-010` releases the wait only when the renderer cannot answer; a renderer that answers its liveness
probe is waited for without bound, so a SIGTERM sent to an unattended application with unsaved settings holds the quit, and the
run host is never asked to `shutdown`, until someone answers the dialog or the process is killed. REQ-SHELL-119's guard (1) is
written for a **user-initiated** close; a signal is not one, but the quit's guarded close (PD-ORCH-005 clause 9) asks it all the
same, and PD-SHELL-009's last case states it does.

**What the build proceeds under.** As built and as `PD-SHELL-009` states: the quit asks the guard and waits on the person's
answer, with no bound, while the renderer answers its probe.

**What a ruling decides.** Whether a quit that no person started asks the unsaved-settings guard at all (the settings then
discarded, or saved, unasked), asks it with a bound past which the quit proceeds (and which answer the bound stands for), or
keeps waiting as built. **The costs:** not asking loses or silently writes a person's unsaved edits at a signal they may not have
sent themselves; a bound answers for a person who may be at the screen; waiting keeps an unattended application, and its runs,
alive past a shutdown the desktop asked for.

**What a live run then shows.** Nothing: the live run does not leave settings unsaved, and no scenario quits by a signal.

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a quit that starts outside any window
asks no close guard. Such a quit — a signal, a desktop logout where Electron emits `before-quit`, the driver's or the capture's
quit — is no **user-initiated** close, so REQ-CONFIG-287 ("on a user-initiated window close only — a programmatic close does not
prompt") and REQ-SHELL-119 guard (1) govern as written: no guard is asked, unsaved Settings edits stay unsaved and nothing is
written, so the workspace configuration keeps its last saved values. The main windows close in PD-ORCH-005 clause 9's
all-or-none order and the run host's shutdown follows at once. The ruling carries both of its recommendations into the record:
[`PD-SHELL-009`](../../../product/directives/pd-shell-009.md#pd-shell-009)'s last case is revised (revision 2), and
[`PD-SHELL-010`](../../../product/directives/pd-shell-010.md#pd-shell-010)'s quit bullet, its As-built sentence about `closeThroughGuards` and its
"What it costs" sentence naming this question are amended. No new directive and no back-pointer: the behaviour now follows the
requirements as written. A quit a person starts outside a window that a later change adds — a tray or menu Quit, or macOS Dock
Quit once IC-3 allows a macOS release — reopens this ruling. *The as-built reading kept above, the quit waiting on a person's
answer without bound while the renderer answers its probe, is the falsified one.* Built 2026-10-14 by fin45
(`fin45-supervision-and-quit`): `quitGuardsOutsideAnyWindow` (`apps/desktop/src/main/exit.ts`) in `before-quit`
(`apps/desktop/src/main/index.ts`), pinned by `exit.test.ts` and `pnpm exit-trace-proof`'s `hang`, `unsaved-quit` and
`unsaved-sigterm` launches.
*Ruled 2026-10-14, as the consortium's ruling record dates its sitting (10:00 to 10:14 UTC); fin45's brief and
[R-072](../../../product/requests.md#r-072)'s row said 2026-10-13, the row recorded apart in
[`../../../defects/fixed/the-r-072-row-dates-ten-rulings-of-2026-10-14-to-2026-10-13.md`](../../../defects/fixed/the-r-072-row-dates-ten-rulings-of-2026-10-14-to-2026-10-13.md)
(fin46, `fin46-accept1-12`).*

**The recommendations it weighed** (both followed; both kinds change-behaviour). **Advocate A** (the user's lens) recommended that
such a quit ask no close guard at all: the renderer's unsaved-settings guard skipped, the unsaved settings discarded so the file
keeps its last saved values (what REQ-SHELL-124's Discard restores), main logging the discard, and the orderly shutdown going
ahead at once, with `PD-SHELL-009`'s last case revised to say so. A argued from who is at the screen: the application menu is
removed on Linux and Windows, so no person can start this quit there, and waiting on a dialog nobody watches loses the edits to
the supervisor's kill anyway, cuts the runs off as a crash does and holds the logout for nothing; REQ-CONFIG-287 already says a
programmatic close does not prompt. A named its cost — a person who sends SIGTERM themselves loses unsaved edits with only the log
to say so — and asked that the macOS reopening `PD-SHELL-009` already notes carry this guard too. **Advocate B** (the system's
lens) recommended the same outcome in other words: no close guard asked, the edits left unsaved and nothing written, the windows
closed in PD-ORCH-005 clause 9's all-or-none order and the run host's shutdown at once, with `PD-SHELL-009` revised and
`PD-SHELL-010`'s bullet brought into line. B argued from the letter: `PD-SHELL-009`'s Narrows line does not name REQ-CONFIG-287,
so the as-built wait departs from a requirement no directive displaces, and it breaks REQ-MONITOR-131/283's 30 s backstop from the
quit request; B asked for the rule as a pure function with a unit case, `exit-trace-proof`'s `hang` launch rewritten, and the
record to say that a later quit a person starts outside a window reopens the ruling. Both rejected keeping the wait, a time bound
(it answers a person's Save/Discard/Cancel, which `PD-SHELL-010` rules out) and a save unasked (it writes a configuration nobody
confirmed). The ruling took from B the wording "left unsaved, nothing written", the pure function with its unit case and the
`hang` rewrite, and from A the log line, the SIGTERM launch and the macOS reopening note; it accepted the cost both named. *Until
2026-10-14 this paragraph's place read: "The two advocates' recommendations themselves were not handed to the building bundle; the
orchestrator's ruling record holds them." Written by fin46 (`fin46-accept1-12`) from that record (acceptance finding C2).*

<a id="oq-299"></a>

**OQ-299 — When a rename's warm-up search fails with its allowance spent and the run cancelled at once, is the rename a timeout
or interrupted?** *([`PD-MCP-004`](../../../product/directives/pd-mcp-004.md#pd-mcp-004) clause 4; REQ-MCP-003; [`PD-TOOLS-013`](../../../product/directives/pd-tools-013.md#pd-tools-013)
revision 2 (c). Raised 2026-10-14 by fin44 (`fin44-optional-findings`) from fin43's review of `fin43-rename-and-match`; the plan's
range OQ-296 to OQ-310, the next number free of its siblings, which held OQ-297 and OQ-298 — renumbered at landing if a sibling
took it first. This read "its first free number on this branch" until 2026-10-14, when fin44's review noted that OQ-297 and
OQ-298 were a sibling's, not this branch's; corrected by fin45, `fin45-optional-findings`.)*

**What is open.** Clause 4 gives the search two exits that stop the rename unsent: a search that exhausts the rename's allowance
ends it as REQ-MCP-003's failed call (`failure_kind: timeout`), and a cancel by the run during the search stops it
(`interrupted`). It does not say which governs when both hold at once — the search's failure arrives after the whole allowance
and after the run's cancel. ~~[OQ-273](58-spikes-and-later-questions-25.md#oq-273)'s ruling paragraph names the cancel's exit before the allowance's.~~ *Corrected
2026-10-14 by fin45 (`fin45-retro-and-record`), with the ruling below: OQ-273's ruling paragraph names no cancel at all; it says
only that both requests are held within the rename's one allowance. The order in which clause 4 lists its exits (the allowance's,
then the cancel's) was the only text near one, and it states no precedence.*

**What the build proceeds under.** The allowance first, then the abort (`apps/desktop/src/run-host/mcp.ts`, the warm-up's catch),
the order the rename's own catch already has under PD-TOOLS-013 revision 2, which reads a deadline before the abort as `fetch`
does. The two readings differ only in that coincidence: one row's `failure_kind` and observation text.

**What a ruling decides.** Which exit names the call when both hold, so clause 4 states the order: the allowance first (one
order for the search and the rename it precedes), or the cancel first (the run's intent over a deadline that also passed).

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)), written 2026-10-14 by fin45
(`fin45-retro-and-record`).** When the rename's warm-up search ends, whether it fails or answers, after the rename's whole
REQ-MCP-003 allowance is spent and while the run's cancel also holds, **the allowance governs**: the rename ends as REQ-MCP-003's
failed call (`failure_kind: timeout`, `terminal_timeout` filed) and is not sent — the order `PD-TOOLS-013` revision 2 (c) gives the
rename's own catch. Recorded as a ruling note under [`PD-MCP-004`](../../../product/directives/pd-mcp-004.md#pd-mcp-004) clause 4, with no new
directive and no change to its Extends line. **The two advocates' recommendations were weighed** over the two readings this
entry states, the allowance first or the cancel first; the ruling took the allowance first, so that every exit of the search and
of the rename reads in one order, the one the rename's own catch already had. (The advocates' texts are the consortium's; this
entry records the outcome as the brief that carried the ruling states it.) **What the build proceeds under** above
is the confirmed reading for a search that fails. **Changed by the ruling:** a search that **answers** read the cancel first
(`if (tctx.signal.aborted)` before the allowance test, `apps/desktop/src/run-host/mcp.ts`); the executor now tests the remaining
allowance (`<= 0`, timeout) before the cancel. Pinned by two cases under "PD-MCP-004" in `apps/desktop/src/run-host/mcp.test.ts`,
each with the clock past the allowance and the run's signal aborted during the search — a search that rejects ("This operation was
aborted") and one that resolves both settle `failure_kind: timeout` with no rename sent, the second red before the reorder — while
"a cancel during the search reads interrupted" stays green. **Kept on record as intended:** the two catches test a spent allowance
differently — the search's catch reads the clock alone (`elapsed >= timeoutMs`) or a timeout text at 90 % of the allowance, the
rename's own catch a timeout text at 90 % alone — so a failure arriving within the same tick as the allowance's end can read
differently in the two; the ruling does not align them. No proof re-run: `code-intel-proof` launch 11 does not reach the
coincidence. **What a live run then shows.** Nothing.
*Dated 2026-10-13, a day before the question was raised, until fin46 (`fin46-accept1-12`) corrected it on 2026-10-14 from the
consortium's ruling record, whose sitting ruled it 2026-10-14 by 10:14 UTC.*

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, confirm-as-built): "Confirm the build's reading … the rename's row reads REQ-MCP-003's timeout. PD-MCP-004 clause 4 gains
one sentence stating that order." **Advocate B** (the system's lens, confirm-as-built): "Confirm the build's reading … the
allowance governs … The one place in the warm-up path that tests the cancel first … should be brought into the same order." Both
followed.

<a id="oq-300"></a>

**OQ-300 — What does a retrospective's refusal say when its entry provider has no credential?** *(REQ-WORKSPACE-137, "Provider
authentication required" / "Authenticate at least one configured provider before starting a run."; [`PD-LIBRARY-002`](../../../product/directives/pd-library-002.md#pd-library-002)
with ADR-0030, a retrospective authenticates as a run does. Raised 2026-10-14 by fin44 (`fin44-optional-findings`) from fin43's
review of `fin43-live-findings`; the plan's range, its next free number on this branch.)*

**What is open.** A retrospective takes its lease through `leasedSetup` (`apps/desktop/src/run-host/launch.ts`), which shares
`leaseOver` with a continuation. An entry provider main cannot resolve is refused there with the continuation's wording,
"Authenticate at least one configured provider before continuing this run." A retrospective continues no run (it analyses a
session at rest), so the sentence names something that is not there. REQ-WORKSPACE-137 words the refusal for submitting a prompt
("before starting a run"), the continuation's "before continuing this run" is the build's adaptation of it, and nothing in the
specification words the retrospective's.

**What the build proceeded under, and no longer does (falsified by the ruling below).** The continuation's sentence, unchanged
since before fin43. At capture the refusal reached main's generic branch, an error notice "The retrospective could not be
started" with "Provider authentication required: Authenticate at least one configured provider before continuing this run." as
its body and no action; at analysis it reached clause (c)'s warning as "… the analyst could not start — Provider authentication
required: Authenticate at least one configured provider before continuing this run..", the reason's own period doubled by the
warning's.

**What a ruling decides.** The detail a retrospective's lease refusal carries: REQ-WORKSPACE-137's sentence as written, a sentence
that names the analysis ("… before the session can be analysed", or the like), or the continuation's as it stands.

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)), written 2026-10-14 by fin45
(`fin45-retro-and-record`).** A retrospective whose lease leaves its entry provider unresolved is refused with REQ-WORKSPACE-137's
headline "Provider authentication required" and the detail "Authenticate at least one configured provider before running a
retrospective.". At capture, main posts that refusal as one error notice per gesture, titled with the headline, with the detail as
its body and the "Open Models settings" action that REQ-WORKSPACE-152 (2) gives that requirement's refusals. At analysis, the
same reason appears inside `PD-LIBRARY-002` clause (c)'s failure warning, which offers no action and ends in a single period.
Recorded as [`PD-LIBRARY-002`](../../../product/directives/pd-library-002.md#pd-library-002) revision 5, which adds REQ-WORKSPACE-137 and
REQ-WORKSPACE-152 to its Extends line with their back-pointers; nothing is replaced. Built in the same plan: `leaseOver`
(`apps/desktop/src/run-host/launch.ts`) takes the refusal's detail from its caller, the `improvements.retrospective` handler
(`apps/desktop/src/main/commands/improvements.ts`) posts the refusal with its action beside `retrospective.no-model`, and
`passFailureDetail` (`apps/desktop/src/main/improvement-notice.ts`) adds its closing period only to a reason that does not end in
terminal punctuation. **What the ruling leaves open.** Nothing new; the lease checks the entry role's provider while the
retrospective analyses on its own slot's, recorded apart as
[`../../../defects/fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md`](../../../defects/fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md),
which this ruling does not repair (*repaired 2026-10-14 by fin46, `fin46-accept1-11`: the retrospective's lease requires the
sign-in provider of its own model, `retrospective_model` then `medium_model`, and a continuation still the entry role's*).
*Dated 2026-10-13, a day before the question was raised, until fin46 (`fin46-accept1-12`) corrected it on 2026-10-14 from the
consortium's ruling record, whose sitting ruled it 2026-10-14 by 10:14 UTC.*

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "the refusal should keep REQ-WORKSPACE-137's headline 'Provider authentication required', say
'Authenticate at least one configured provider before running a retrospective.', and carry the same 'Open Models settings' action
… Record this as a one-sentence revision to PD-LIBRARY-002." **Advocate B** (the system's lens, change-behaviour): "A
retrospective's lease refusal keeps REQ-WORKSPACE-137's headline … At capture it also carries the Models settings action … Record
this as PD-LIBRARY-002 revision 5." Both followed: A's notice shape (the headline as title, error severity); from B the analysis
path's lease, the back-pointers on both requirements and the provider mismatch recorded apart.

<a id="oq-301"></a>

**OQ-301 — Is typing, into a clamped number field, the digits it already shows a change of the field?** *(REQ-CONFIG-446 and
[`PD-CONFIG-003`](../../../product/directives/pd-config-003.md#pd-config-003), "never rewritten until the field is changed" and "a user's entry".
Raised 2026-10-14 by fin44 (`fin44-optional-findings`) from fin43's review of `fin43-transcript-and-prefs`, so the reading the
repair took is on record; the plan's range, its next free number on this branch.)*

**What is open.** A Runtime field that cannot show its stored value draws it clamped and states the stored value beneath
(`ClampedNumberField`). Whether a person who selects the text and types the very digits shown has changed the field — and so
replaces the stored value with the shown one — is not said by either text.
[`../../../defects/fixed/a-runtime-number-field-ignores-a-value-typed-over-the-same-clamped-digits.md`](../../../defects/fixed/a-runtime-number-field-ignores-a-value-typed-over-the-same-clamped-digits.md)
says so in its Specs section.

**What the build proceeds under.** Since fin43: yes. The field commits from the native input event, so an overtype of the same
digits is "a user's entry" and is stored (`packages/ui/src/settings/number-field-retype.test.ts`); no open question was raised
then.

**What a ruling decides.** Whether that reading stands (an entry is an entry), or a value equal to the one shown leaves the stored
value as it was (the field never changed what it reads).

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)), both advocates followed:** confirmed as
built. A whole number a person types or steps into a clamped Settings number field is "a user's entry" and a change of the field,
whatever its digits: it replaces the pending value, marks the form dirty when it differs from the saved value, and Save writes it.
Opening, repopulating, focusing or leaving the field without typing commits nothing, and the stored value survives all of them
(REQ-CONFIG-446, REQ-CONFIG-419, [`PD-CONFIG-003`](../../../product/directives/pd-config-003.md#pd-config-003), whose normative text stands unchanged;
an italic ruling note there points here, with no revision number). Its pins: the three cases of
`packages/ui/src/settings/number-field-retype.test.ts`, and `pnpm continuation-proof --only=later-run`, whose shared Runtime-field
helper types over the selection as a person does. Written 2026-10-14 by fin45 (`fin45-retro-and-record`).

<a id="oq-302"></a>

**OQ-302 — Does REQ-CONFIG-405's list of desktop preference keys omit `display/showReasoning` by intent?** *(REQ-CONFIG-405,
"Desktop preference keys and their defaults when absent", which lists `display/autoCollapseTools` and `display/groupToolCalls`
and not `display/showReasoning`; REQ-SHELL-006, whose key table registers all three; REQ-CHAT-167, which stores
`display/showReasoning` "under the registered key … written user-wide like every desktop preference (REQ-CONFIG-405)". Raised
2026-10-14 by fin44 (`fin44-hooks-and-config`) while repairing
[`the-tool-grouping-preference-is-stored-under-a-key-the-specification-does-not-register.md`](../../../defects/fixed/the-tool-grouping-preference-is-stored-under-a-key-the-specification-does-not-register.md),
which noticed it; the plan's range OQ-296 to OQ-310, raised as OQ-297 and renumbered OQ-302 at landing, where fin44's sibling bundles had taken OQ-297
to OQ-301 first.)*

**What is open.** The two requirements that enumerate the desktop preference store's keys disagree: REQ-SHELL-006's table, which
REQ-CONFIG-405 names as the owner of the store, and REQ-CHAT-167 register `display/showReasoning` (default false); REQ-CONFIG-405's
own list of "desktop preference keys and their defaults when absent" does not name it, while REQ-CHAT-167 cites REQ-CONFIG-405 for
how it is written.

**What the build proceeds under.** REQ-SHELL-006's table and REQ-CHAT-167: `display/showReasoning` is a registered key, default
off, written user-wide (`packages/platform/src/preferences.ts`). Nothing changed.

**What a ruling decides.** Whether REQ-CONFIG-405's list is meant to be complete — in which case the omission is a defect of the
specification for the amendment round, and the key stands as REQ-SHELL-006 registers it — or names only the keys REQ-CONFIG-405
itself owns, in which case nothing is owed.

**What a live run then shows.** Nothing: a live run reads no Display preference.

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)), both recommendations followed:**
confirmed as built, with no directive, no amendment and no code change. REQ-CONFIG-405's list names the desktop preference keys
whose meaning and default REQ-CONFIG-405 itself owns; REQ-SHELL-006's per-user preference store table is the store's one
complete registry (its ownership clause, `docs/spec/12-desktop-shell-windows.md` line 27, and the table that clause makes closed,
from line 400: "every key the product may store is listed here, whatever document owns the behavior behind it"; *corrected
2026-10-14: this read "from line 402", the table's header row, two lines below the sentence it quotes —
[the note](../../../defects/fixed/oq-302-cites-the-preference-tables-closing-sentence-at-line-402-where-it-stands-at-line-400.md)*).
`display/showReasoning` stands as that table registers it (line 413) and REQ-CHAT-167 owns it: default off, written user-wide under
REQ-CONFIG-405's write policy. REQ-CONFIG-405's list equals the set the table leaves to it — the three `requirements/` elevation
keys its row assigns to REQ-CONFIG-405 by name (line 415), and the `interface/` and `display/` rows that name no other owner;
`display/showReasoning`'s row names REQ-CHAT-167 — so the specification has no defect here. `packages/platform/src/preferences.ts`
is confirmed as built (`display/showReasoning`, boolean, default `false`, owner REQ-CHAT-167). **The two recommendations
weighed:** advocate A's and advocate B's, both confirm-as-built; the ruling follows both. The open note
[`../../../defects/fixed/the-agent-pop-out-terminal-auto-open-and-pane-layout-preferences-are-stored-under-unregistered-keys.md`](../../../defects/fixed/the-agent-pop-out-terminal-auto-open-and-pane-layout-preferences-are-stored-under-unregistered-keys.md)
was not decided by this ruling; it was repaired apart, in the same plan, by moving each preference to the key the table
registers. Written 2026-10-14 by fin45 (`fin45-retro-and-record`).

<a id="oq-311"></a>

**OQ-311 — Is the update's `Restart now` a user-initiated close for the unsaved-settings guard?** *(REQ-SHELL-119 guard (1),
"with unsaved settings present, a **user-initiated** close raises the save/discard/cancel dialog of REQ-SHELL-124";
REQ-CONFIG-287, "on a user-initiated window close only — a programmatic close does not prompt"; REQ-STARTUP-119's installer
auto-close and REQ-STARTUP-121's `Restart now`; OQ-86, which ruled that REQ-STARTUP-046's active-run confirmation
governs the update's closes and said nothing of guard (1); [OQ-298](#oq-298), whose ruling reopens on a quit a person starts
outside a window. Raised 2026-10-14 by fin45 (`fin45-supervision-and-quit`) as the brief for OQ-298's build asked; the plan's range
OQ-311 to OQ-330, its first free number on this branch — renumbered at landing if a sibling took it first. Ruled 2026-10-14 under
R-072, below, and built the same day by fin46.)*

**What is open.** The update closes every main window through `mainWindows.dispose()` (`closeWindows` in
`apps/desktop/src/main/index.ts`): the installer flavour 1,200 ms after its hand-off (REQ-STARTUP-119), and `Restart now` once the
successor has taken the record (REQ-STARTUP-121). `dispose` destroys the windows, so neither close asks the renderer's
unsaved-settings guard. The installer's auto-close is plainly programmatic. `Restart now` is a person's click on a notice action
inside a window, whose consequence is that every window closes: REQ-CONFIG-287 does not say whether a close a person asked for
through another control is "user-initiated".

**What the build proceeds under.** Neither close asks guard (1): unsaved Settings edits are lost at the update's restart, as at any
programmatic close. The active-run confirmation is asked at the click and again before the hand-off, as OQ-86 ruled.

**What a ruling decides.** Whether `Restart now` (and `Update now` on the installer flavour) asks REQ-SHELL-124's Save/Discard/Cancel
before the successor or installer starts — then at the click, beside OQ-86's confirmation, since after the hand-off declining could
not keep the window — or leaves unsaved settings unsaved as a programmatic close. **The costs:** asking adds one more box to the
update's click; not asking loses a person's edits at a restart they asked for, with no word.

**What a live run then shows.** Nothing: no live scenario installs an update.

**Ruled 2026-10-14 by the consortium under the owner's delegation ([R-072](../../../product/requests.md#r-072)), with no directive:**
`Restart now`, and `Update now` / `Try again` on the installer flavour, are user-initiated closes. Each asks REQ-SHELL-124's
Save/Discard/Cancel of every open main window, one window at a time. It asks at the click, ahead of [OQ-86](15-specification-questions-10.md#oq-86)'s active-run
confirmation (REQ-SHELL-119's order: guard (1) before guard (3)), and again immediately before the installer or the successor
starts. A Cancel, or a Save that fails, starts nothing and leaves the notice as it was. The portable's in-place apply and the
installer's 1,200 ms auto-close are programmatic and ask nothing (REQ-CONFIG-287). No requirement's text is departed from —
REQ-SHELL-119 guard (1) and REQ-CONFIG-287 govern as written once these clicks are read as user-initiated — so the ruling alone
settles it. *The as-built reading kept above, neither close asking guard (1) and unsaved Settings edits lost at the update's
restart, is the falsified one.* **The two recommendations weighed:** quoted in the paragraph after this one (fin47, 2026-10-15;
*until then this clause read: "the advocates' recommendations themselves were not handed to the building bundle, and the
orchestrator's ruling record holds them"*); advocate B's report that no code implements
REQ-SHELL-119 guard (2), "Integration in progress", anywhere in `apps/` or `packages/` was, and the builder confirmed it
([`the-integration-in-progress-close-guard-has-no-code.md`](../../../defects/fixed/the-integration-in-progress-close-guard-has-no-code.md),
outside this ruling's repair: worktree integration is deferred from the first release, so the guard is vacuous until it is built).
**Built 2026-10-14 by fin46 (`fin46-accept1-9`):** `UpdaterDeps.confirmUnsaved` and the `UPDATE_DECLINED_UNSAVED` outcome
(`apps/desktop/src/main/updater/updater.ts`), asked first in `restart()` and in the installer flavour's `install()`, and first in
`confirmAtHandOff` (so `doRestart`'s pre-start check and `runInstall`'s `beforeApply`), a thrown guard declining with a `warn`
line; `askUnsavedInTurn` (`apps/desktop/src/main/main-windows.ts`: the active window first, then `MainWindows.ordered()`, a
destroyed window skipped, a window whose renderer installed no guard neither surfaced nor asked, each other window surfaced then
asked, the first `false` stopping it, a renderer that cannot answer allowing under PD-SHELL-010), wired in `index.ts` over
`askRendererGuard` with one log line per asking; and the renderer's guard joining a question already open
(`apps/desktop/src/renderer/guard-question.ts`). Pinned by `updater.test.ts` (the OQ-311 block), `main-windows.test.ts`
(`askUnsavedInTurn`) and `guard-question.test.ts`. A development host's built app is classified not updatable, so no launch
reaches `update.restart`'s guards there: the built-app run is owed to the Windows package (a Windows x64 host, deferred with the release pipeline under R-071; IC-3 binds Linux and macOS artifacts), as
[`docs/proofs/updater-proof.md`](../../../proofs/updater-proof.md) records
([`../../../defects/fixed/an-update-restart-discards-a-windows-unsaved-settings-unasked.md`](../../../defects/fixed/an-update-restart-discards-a-windows-unsaved-settings-unasked.md)).

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "`Restart now`, and `Update now`/`Try again` on the installer flavour, are user-initiated closes. Each
one asks REQ-SHELL-124's existing Save/Discard/Cancel in every main window that has unsaved Settings edits." **Advocate B** (the
system's lens, change-behaviour): "Each asks REQ-SHELL-124's Save/Discard/Cancel of every open main window whose settings are
unsaved … This needs no directive." Both followed.
