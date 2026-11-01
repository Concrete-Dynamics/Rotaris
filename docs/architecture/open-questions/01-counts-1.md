# Open questions — Counts, and how they moved (1 of 2)

Part 1 of 68 of the [open-questions record](../open-questions.md), which indexes every part.

**Counts, as of the restore-measurement round of 2026-09-02.** **Thirty-one escalations. TWENTY-NINE are
ruled** (`owner-decisions.md`, ESC-1 to ESC-22, ESC-24 and ESC-26 to ESC-31), **two are closed by the
specification itself with no ruling needed** (ESC-23, ESC-25), and ***NONE IS OPEN***. **Forty-seven
specification questions**, **eight resolved** and closed with their reasons below — OQ-3, OQ-11, OQ-14,
OQ-26, OQ-27, OQ-28, OQ-44 and OQ-49 — leaving **thirty-nine open**, **none of which blocks a named ADR**.
Two design-reference dependencies. **Twenty-two numbered spikes**, one withdrawn, **eight discharged** and
one discharged for Windows only, leaving **twelve outstanding** — and see the spike section, which
separates them into the three groups the gate actually turns on.

**The specification-question count has moved since, and implementation is what moves it.** Four questions
were raised by building the thing that met the requirement: **OQ-50** (Part K, the public model catalogue),
**OQ-51** (Part AB, the unscoped queued prompt), **OQ-52** (Part AC, whether a delegated child may ask) and
**OQ-53** (Part AH, which event reports a compression), **OQ-54** (Part AL, the user-terminal audit entry outside the closed permission vocabularies) and **OQ-55** (Part AL, `shell_max_background_sessions` without a maximum). That is **fifty-three specification questions**. **Twelve are now resolved, leaving forty-one open**, and none
blocks a named ADR.

**Two more were raised on 2026-09-14 by planning portable-skill discovery (ADR-0063), before any code:
OQ-58** (whose session a skill's session-scoped state belongs to, once `PD-WORKSPACE-001` made a second
session on one workspace ordinary) **and OQ-59** (a chooser restricted to a file *or* a directory, which
no platform dialog offers). **Three escalations were raised in the same pass** — **ESC-37** (per-prompt
attachment against a session-long force-loaded block), **ESC-38** (the Skills table's five columns
against its seven) and **ESC-39** (a taken command name skipped against suffixed) — each stating the
reading the build proceeds under, all three in `owner-decisions.md`. **Two more were raised on 2026-09-16
by repairing what one plan-mode run hit: OQ-60** (what summary a session carries when the run that owned
it died without a teardown, which REQ-ORCH-082's five stop-reason arms cannot select) **and OQ-61**
(whether an isolated run may read the repository metadata of the worktree it works in, which neither of
the fence's two designators covers), **and OQ-62** (whether a price may come from a provider's discovery
payload, and whether a provider-reported cost has a qualifier — the reason every run's cost reads zero), of
which **one branch was ruled on 2026-09-16** by `PD-MONITOR-001` and two stay open. **One more was raised on
2026-09-16 by reading a launch log: OQ-63** (what level threshold, if any, governs the **application** log —
every level requirement in the corpus governs the per-session log instead), **ruled on 2026-09-23 by
`PD-MONITOR-002`** and built on 2026-09-27. **OQ-21**, open since the gate, was **ruled on 2026-09-23** as it recommended and applied by
amendment (R-049), and OQ-62's configured-rate branch with it; OQ-62's discovery branch stays open. **One more was raised on
2026-09-21 by building `PD-WORKSPACE-002`'s per-file switches: OQ-64** (whether an instruction override
suppresses its base when the override is itself switched off — a third state REQ-WORKSPACE-042's "given
both exist" has no word for). **OQ-64 was ruled on 2026-09-27** as built (R-052), together with ESC-37,
ESC-38 and ESC-39. **One more was raised on 2026-09-22 by repairing the retrospective's reads: OQ-65** (whether the
instruction-file switches reach the retrospective as well as the agents). **One more was raised on 2026-09-27 by building `PD-ORCH-004`: OQ-66** (how `delegate` names the
child a continuation continues, which REQ-TOOLS-152's fields do not provide and the directive does not name), **ruled
on 2026-09-27** as recommended by `PD-ORCH-004` revision 2 ([R-058](../../product/requests.md#r-058)). **One more was raised on 2026-09-27 by building the `/skills` listing: OQ-67**
(where the listing goes when there is no transcript to write it into — from the Settings Skills tab, whose
header actions REQ-WORKSPACE-067 fixes at two, and from a window following no session; raised as OQ-66, and
every question from OQ-67 to OQ-75 moved up by one when the first-release work reached `main`, where OQ-66 was already taken), **and one the same day by building
REQ-WORKSPACE-049's fixture: OQ-68** (what "up to 20 context files" measures when discovery can reach fourteen; raised as
OQ-66 on its own branch and renumbered when it reached `main` after the `/skills` listing's). **Two more were raised on 2026-09-27 by building the version guard** (first-release plan §4.1):
**OQ-69** (whether a default entry shipped switched off counts as one the default configuration launches, which
REQ-STARTUP-059 and REQ-MCP-095 read one way and REQ-STARTUP-064 the other) **and OQ-70** (whether a release tag's
numbers are canonical decimals), each with the reading the guard is built under, **and OQ-71** (whether the running
desktop with no version metadata reports `dev` or `0+unknown`, which REQ-STARTUP-007 and REQ-STARTUP-004 fix
differently), raised by the gate round that reviewed it; the three were raised as OQ-66 to OQ-68 on their own branch and renumbered when they reached `main` after the
`/skills` listing's and the injection proof's. **Three more were raised on 2026-09-27 by building the notices generator
(`first-release-plan.md` §4.3): OQ-72** (whether an entry of `THIRD-PARTY-LICENSES.txt` is a package or everything
compiled into one — Electron's 779 credited components carry no version and no identifier), **OQ-73** (REQ-STARTUP-142
names Manrope and a machine-tool manifest, neither of which the first release carries) **and OQ-74** (whether the
reviewed-exceptions table may supply an identifier a dependency does not declare — `dotenv` 0.9.9 in the bundled
runtime). **One more was raised the same day by that generator's gate review: OQ-75** (when a component carries "its
full license text": a licence file that only pointed elsewhere, or only carried a licence's per-file notice, had
counted as the text, and 4 components without text became 12); the four were raised as OQ-66 to OQ-69 on their own branch and renumbered when they reached `main`
after the `/skills` listing, the injection proof and the version guard had taken OQ-67 to OQ-71. **Two more were raised on 2026-09-28 by building `PD-TOOLS-005` (R-062): OQ-76** (which timeline word records a run's user going away and returning — REQ-ORCH-139 closes the vocabulary and it has none, so the build writes both transitions to the session log) **and OQ-77** (whether the away state resolves the approval an `ask_questions` call itself needs under the `ask` preset, which keeps every question from an away user under the default preset), **and one by its verification: OQ-78** (whether an approval already outstanding when the first wait expires keeps its own full wait, as built, or is ended with the directive's reason). **And one more the same day by repairing REQ-WORKSPACE-045's decoding half: OQ-79** (whether a `SKILL.md` that cannot be decoded as UTF-8 is an "unreadable file"
under REQ-WORKSPACE-053, which names the reason without saying what encoding a skill file has; built as one, skipped with the
decoder's error — raised as OQ-76 on its branch and renumbered at the merge, OQ-76 to OQ-78 having been taken on `main`). **And one more the same day by repairing the prerelease naming defect (R-062): OQ-80** (whether REQ-STARTUP-158 reaches the Windows
installer's own version metadata — `DisplayVersion`, `ProductVersion` and the uninstall display name, which electron-builder
writes from its normalised `0.1.0-rc1` while the artifact's name carries the declared `0.1.0rc1` — raised as OQ-76 on its branch
and renumbered at the merge, OQ-76 to OQ-79 having been taken on `main`). **And one more the same day by repairing `inherited_context`'s path to the child (R-062): OQ-81** (what an `inherited_context` id naming another parent's, or an earlier
iteration's, completed task is — refused for ownership, as built, on REQ-TOOLS-155's scoping — and whether the caller is told
which ids were ignored — raised as OQ-76 on its branch and renumbered at the merge, OQ-76 to OQ-80 having been taken on `main`). **Three more were raised on 2026-09-28 by building
the updater (`first-release-plan.md` §4.6, R-062): OQ-83** (whether the record fixes the manifest signature's algorithm and the forms of the key and
the signature — built as Ed25519, raw, over the manifest's exact bytes, SPKI PEM keys), **OQ-84** (a packaged Windows build with neither a
registry match nor the launcher's variable: ADR-0054 says not updatable, REQ-STARTUP-106's copied-tree sentence says portable) **and OQ-85**
(REQ-STARTUP-118 against REQ-SHELL-118 on the download notice's title, persistence and the pause before the apply); **one more by that
item's verification the same day: OQ-86** (whether the installer's auto-close and the restart's close ask REQ-STARTUP-046's active-run
confirmation) — the four raised as OQ-76 to OQ-79 on their branch and renumbered at the merge, OQ-76 to OQ-82 having been taken on `main`. **One more was raised on 2026-09-28 by building the setup manifest (`first-release-plan.md` §4.1): OQ-87** (what a machine tool's "archive layout" comprises, and what path its expected executables are relative to — MinGit's entries sit at the archive root and ripgrep's under one directory). **And OQ-88**, raised by the same item's independent verification (whether a manifest may key an archive under REQ-STARTUP-060's raw `<os>-<machine>` fallback); the two were raised as OQ-76 and OQ-77 on their branch and renumbered at the merge, OQ-76 to OQ-86 having been taken on `main`. **And one more the same day by REQ-CHAT-055's measurement round (R-048's order under R-062): OQ-89** (how the append comparison is read when updates arrive faster than frames — each one's shown-update time then holds the
queue in front of it — and what "an empty transcript" is compared against once the appended rows are on it — raised as OQ-76 on its branch and renumbered at the merge, OQ-76 to OQ-88 having been taken on `main`). **And one more the same day by repairing the artifact variables' reach into the product's children (R-062): OQ-90** (whether the variables naming a launch's artifact are removed from what its children inherit — built so — and which of REQ-STARTUP-147 and REQ-HOOKS-032 says so). **And OQ-91**, raised the same day by repairing REQ-CHAT-048's duplicate-reasoning hygiene under R-062 (whether "per agent" scopes the comparison — each agent's own previous thinking row, the reading built — or only the row dropped), raised as OQ-90 on its branch and renumbered at the merge, OQ-90 having been taken on `main`. **And OQ-92**, raised the same day by repairing the notices file's tools section under R-062 (where the file reports the tool-server package versions REQ-STARTUP-152 asks of it, which REQ-STARTUP-142's section names no place for — built as a third sub-heading after the language servers), raised as OQ-90 on its branch and renumbered at the merge, OQ-90 and OQ-91 having been taken on `main`. **And OQ-93** (whether a text field is spell-checked — the runtime's spellchecker fetched a dictionary no requirement names; built as none), raised 2026-09-28 by the repair of the updater proof's runtime connection, raised as OQ-91 on its branch and renumbered at the merge, OQ-90 to OQ-92 having been taken on `main`. **More were raised on
2026-09-27 by building `PD-ORCH-005` revisions 2 and 3: OQ-94** (how a `paused` agent presents, and whether it is settled
for display with a session at rest, which four requirements the directive does not name would do), **OQ-95** (whether
the transcript is drawn from the conversation record, and what of a model exchange the record holds), **OQ-96** (which
control is a stop and which the final cancel, and what a rest does at the edges the directive does not reach), **OQ-97**
(how a resumed iteration carries on where the directive gives the what and not the how), **OQ-98** (what the
Continue action counts, where it says so, and which continues offer the decline) **and OQ-99** (which artifact
REQ-SESSION-115's handoff carries, and who takes up an earlier offer), each stating the
reading the build proceeds under. **All six were ruled on 2026-09-28** as recommended ([R-064](../../product/requests.md#r-064)):
by `PD-ORCH-005` revision 4, with `PD-ORCH-004` revision 4, `PD-ORCH-003` revision 2, `PD-CHAT-001` revision 4 and
`PD-CHAT-002` revision 2, and those revisions were built on 2026-09-28 ([R-065](../../product/requests.md#r-065)). **Building them raised nine
more: OQ-100** (how clause 13's `paused` reads on the counters and on the run-level agent, and how the agents a crash left
present before it is recorded), **OQ-101** (what cancelling one paused child at rest reaches, says and leaves, and what it
does with a child a crash left), **OQ-102** (how a continue's message closes with the resumed iteration, and which
continues append a task), **OQ-103** (which sessions a crash left, and what the Continue action offers on one with nothing
to resume), **OQ-104** (where the plan gate holds a run that resumed an iteration, and what that plan cycle plans),
**OQ-105** (what an agent's fingerprint is taken of, when it is compared and where the warning is stated), **OQ-106** (whose
root the handoff's artifact is taken from), **OQ-107** (which offers a later iteration's root is told, and where) **and
OQ-108** (what the audit of clause 15, clause 19, `PD-CHAT-001` revision 4 and `PD-CHAT-002` revision 2 leaves
undecided), each stating the reading the build proceeds under. The fifteen were raised as OQ-67 to OQ-81 on their branch and renumbered at the merge, OQ-67 to OQ-93 having been taken on `main`. **And OQ-109** (whether a `code_intelligence` entry configured `enabled: false` still makes `code-intelligence-setup` applicable. It is built as applicable, availability alone), raised 2026-09-28 by the repair of `plan-gate-proof`'s fixture under R-062 — raised as OQ-94 on its branch and renumbered at the merge, OQ-94 to OQ-108 having been taken on `main`. **On 2026-09-29 the owner ruled eight decisions as recommended ([R-067](../../product/requests.md#r-067))**: OQ-96's
stop status, OQ-103's last question and OQ-66's open part among the questions already here, and ESC-42 in
`owner-decisions.md`; and four were **raised and ruled in the same entry — OQ-110** (the dispatch layer's retries come
before the ladder's), **OQ-111** (what the report summariser reads), **OQ-112** (a `write_scope` for a persona that cannot
write is refused) **and OQ-113** (REQ-LIBRARY-092's fallback, answered by amendment). **Three more were raised the same day
from the live runs and left open: OQ-114** (the specification's fixed figures on a reasoning model's critical path, and a
continuation that starts from nothing), **OQ-115** (the code-intelligence server's imperative tool description, rendered
verbatim) **and OQ-116** (the displayed tool-call total during a long execution pass). The seven were raised as OQ-109 to OQ-115 on their branch and renumbered at the merge, OQ-109 having been taken on `main`. **OQ-117** (what an iteration is told of a task it takes up that is not the run's own) was raised the same day by the repair of `every-iteration-is-sent-the-prompt-the-run-was-launched-with.md` and left open. **OQ-119** (whether the task the report summariser keeps as its start may pass REQ-ORCH-110's 2,000 per event) **and OQ-120** (the size of the facts given to the report summariser) were raised the same day by the repair of D1 and left open, as OQ-118 and OQ-119 on their branch, renumbered at the merge, OQ-117 and OQ-118 having been taken on `main`. **And OQ-122** (whether the window may open the setup dialog before the open's resolution, and what a skip answered in that interval records — built as: the dialog opens on the values, and such a skip performs the open's one automatic resolution first), raised 2026-09-29 by repairing `init-proof`'s red on Linux under R-062. **And OQ-123** (which run REQ-WORKSPACE-105's "no run is in progress" means — built as a run the user started, so a background run neither withdraws the setup prompt nor is drawn in its dialog), raised the same day by the same repair's second round. The two were raised as OQ-109 and OQ-110 on their branch, renumbered there to OQ-118 and OQ-119 when OQ-109 to OQ-117 had been taken on `main`, and renumbered again at the merge, OQ-118 to OQ-121 having been taken on `main` meanwhile. **One more was raised on 2026-09-29 by building REQ-ORCH-089's stall watchdog and REQ-NOTIFY-111/112's corrective message under R-067: OQ-127** (what counts as "an outcome that produced no output within `child_stall_timeout`" when the watchdog never cancels, and what the watchdog counts, writes and calls — including the three records REQ-ORCH-139's timeline vocabulary has no word for, written to the session log instead, and whether REQ-MONITOR-119's issue at every evaluation may evict REQ-SESSION-133's ring), raised as OQ-109 on its branch, renumbered there to OQ-126 when OQ-109 to OQ-125 had been taken on `main`, and renumbered again at the merge, OQ-126 having been taken on `main` meanwhile. **And OQ-129** (what REQ-MONITOR-128's optimistic cancel of one agent shows, where, and until when — built as the agents' activity text, in the window that sent the cancel, until the engine's next record), raised 2026-09-29 by the repair of `cancelling-one-agent-is-not-shown-cancelled-until-the-engine-answers.md` under R-067, raised as OQ-128 on its branch and renumbered at the merge, OQ-128 having been taken on `main` meanwhile. **And OQ-130** (whether the iteration the record of an accepted explicit cancel closes takes REQ-GIT-051's capture — built as: none is captured), raised the same day by the repair of `a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md` under OQ-103's ruling, raised as OQ-129 on its branch and renumbered at the merge, OQ-129 having been taken on `main` meanwhile. **And OQ-131** (what a follow-up by `delegate`'s `session_id` does beyond what `PD-ORCH-005` clause 22 states — built as: the child resumes into `queued` and starts as any queued child does, only the call's `task` is read, a child that never started is given its payload first, and a follow-up waits for an execution still winding down; a child the user cancelled may be followed up), raised 2026-09-29 by building clause 22 under R-067, raised as OQ-130 on its branch and renumbered at the merge, OQ-130 having been taken on `main` meanwhile. **And OQ-132** (what is asked of a person in the quit's gap, after the last window closes and before the shutdown — built as: held unshown for the quit to withdraw, no budget expiring meanwhile, never denied), raised 2026-09-29 by the repair of `an-approval-asked-after-the-last-window-closes-is-denied.md` under R-067. **Four more were raised on 2026-10-01 from the live-run autopsy at `71ad8e8`: OQ-161** (whether a configuration load may append the code-intelligence runtime's marker directory to the user's `.gitignore` beside `.rotaris/` — built as: it appended both until 2026-10-01, and since then `.rotaris/` alone, the marker's directory going to the repository's own `info/exclude`), **OQ-162** (whether continuing a paused iteration classifies the intent again, and may change the resumed root's grant — built as: every continue classifies, the Continue action its last user prompt, and the new grant reaches the resumed root), **OQ-163** (what REQ-TOOLS-145's refusal names when a `replace`'s own list marks two tasks in progress and none is active — built as: the first of them, under an id the rejected list minted) **and OQ-164** (what a foreground call made while an earlier command is soft-paused does and reports — built as: it waits behind that command and reports only its own, the paused command's end kept for a poll), each stating the reading the build proceeds under. The four were raised as OQ-160 to OQ-163 on their branch and renumbered before they reached `main`, OQ-160 having been taken there meanwhile. Four closed together on **2026-09-11** on the owner's ruling — **OQ-5** and **OQ-38** (the two
terminal readings, ratified into `REQ-TOOLS-127` and `REQ-CONFIG-117`, the second narrowed in the ratifying),
**OQ-55** (the background-session key gains a maximum) and **OQ-45** (ADR-0061 takes the improvement store's write
path) — which is the first time a ruling closed more than one at once, and it happened because three of the four
had been priced by measurement before they were put. Each of the four is stated where it
was found, with what the build shipped meanwhile, so a ruling replaces an interim rather than filling a gap.

**On 2026-10-06 the owner ruled every decision still waiting ([R-071](../../product/requests.md#r-071)).** The rulings confirmed as built are written into each entry, dated and citing R-071: OQ-2, OQ-4, OQ-6, OQ-10, OQ-17, OQ-18, OQ-22, OQ-25, OQ-29, OQ-32 to OQ-34, OQ-39, OQ-40, OQ-43, OQ-47, OQ-50 to OQ-52, OQ-58, OQ-59, OQ-65, OQ-67 to OQ-71, OQ-79 to OQ-82, OQ-84, OQ-85, OQ-87 to OQ-93, OQ-100 to OQ-104, OQ-106 to OQ-109, OQ-117, OQ-118, OQ-120 to OQ-126, OQ-128 to OQ-138, OQ-141 to OQ-153, and in `owner-decisions.md` ESC-36 and ESC-41. Where a ruling departs from a requirement's text it is carried by a directive with its back-pointer: `PD-PROVIDER-001`, `PD-CONFIG-002`, `PD-TOOLS-009`, `PD-TOOLS-010`, `PD-SHELL-004` to `PD-SHELL-006`, `PD-CHAT-007`, `PD-WORKSPACE-003`, `PD-WORKSPACE-004`, `PD-STARTUP-002` to `PD-STARTUP-005`, `PD-ORCH-005` revision 6 and `PD-ORCH-003` revision 3. Two rulings meet a build that does something else, and each entry says so with a defect note: OQ-6 (the quota cap lives in configuration, not on the catalogue entry) and OQ-33 (the preference root honours the configuration-home variable on every platform). One entry described its build wrongly and its ruling states the build as it is, with no defect: OQ-59, whose chooser is filtered to Markdown files (`.md`), not to `SKILL.md`, the name check being the loader's. OQ-39's amendment was already in REQ-SANDBOX-101's text. **Deferred by the same ruling, and the work counts as finished without them:** OQ-72 to OQ-75 and OQ-83 (the release pipeline's notices and signing), OQ-140 (Linux confinement), and OQ-48, OQ-62, OQ-183 and OQ-195 (after the first release); each entry carries the deferral. The questions ruled as a change to build are ruled in their own entries by the plans that build them. **The rest of the confirm-as-built rulings, written the same day (plan fin20):** OQ-154 to OQ-156, OQ-158 to OQ-161, OQ-164, OQ-166, OQ-167, OQ-169, OQ-173 to OQ-176, OQ-178, OQ-179, OQ-181, OQ-184, OQ-186, OQ-187, OQ-190 to OQ-193, OQ-197 and OQ-198, and OQ-200, OQ-201 and OQ-203, raised that day after the overview the owner answered and confirmed under the same instruction at the readings their entries say the build proceeds under. Where one departs from a requirement's text it is carried by a directive with its back-pointer: `PD-HOOKS-001`, `PD-ORCH-010` to `PD-ORCH-012`, `PD-ORCH-006` revision 2, `PD-MONITOR-003` to `PD-MONITOR-005`, `PD-WORKSPACE-006` to `PD-WORKSPACE-008`, `PD-SHELL-007`, `PD-SHELL-008`, `PD-SESSION-001`, `PD-CHAT-008` and `PD-CHAT-003` revision 2. The defect notes that waited on them close with them, in `docs/defects/fixed/`.

**On 2026-10-07 the open questions were ruled under the owner's delegation ([R-072](../../product/requests.md#r-072)) by a consortium of two advocates and a ruling agent:** advocate A argued from the user's lens and advocate B from the system's, and a ruling agent weighed both and ruled; each entry carries its ruling, dated and citing R-072, with the two recommendations it weighed and which it followed. OQ-204 to OQ-212 were open; OQ-213 to OQ-219 were raised that day by the final live runs and by the rulings themselves, each opened and ruled in its own entry. OQ-204, changed; OQ-205, confirmed as built; OQ-206, changed; OQ-207, changed; OQ-208, changed; OQ-209, confirmed as built; OQ-210, changed; OQ-211, confirmed as built; OQ-212, confirmed as built; OQ-213, changed; OQ-214, confirmed as built; OQ-215, changed; OQ-216, changed; OQ-217, changed; OQ-218, changed; OQ-219, changed. Where a ruling departs from a requirement's text it is carried by a directive with its back-pointer, written by the plan that builds it.

**On 2026-10-13 the consortium ruled a further round under the same delegation ([R-072](../../product/requests.md#r-072)),** each
entry carrying its ruling, dated and citing R-072, with the recommendations it weighed. This paragraph was started on 2026-10-14
(fin44), as [OQ-264](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-264)'s ruling asks that its outcome be named where the round's rulings are summarised; it names the
rulings fin43 built, and the round's others are in their own entries: [OQ-263](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-263), confirmed as built (a dated note under
REQ-GIT-138, no directive); [OQ-264](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-264), confirmed as built and carried by `PD-CONFIG-004`; [OQ-265](../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-265), changed (the
restore deletes its own staging copy on a failure that leaves the store as it was; no directive); [OQ-266](../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-266), changed (a
restore cut between its renames is reversed at the next open; no directive); [OQ-273](../../archive/architecture/open-questions/58-spikes-and-later-questions-25.md#oq-273), changed (`PD-MCP-004`);
[OQ-278](../../archive/architecture/open-questions/58-spikes-and-later-questions-25.md#oq-278), changed (a note closes unreproduced only under a guard, `docs/defects/README.md`); [OQ-280](../../archive/architecture/open-questions/58-spikes-and-later-questions-25.md#oq-280), changed
(`PD-TOOLS-019`). Written 2026-10-14 by fin45 (`fin45-retro-and-record`): [OQ-299](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-299), the search's failure confirmed as
built and the answered search's check reordered to match (a ruling note under `PD-MCP-004` clause 4, no directive);
[OQ-300](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-300), changed (`PD-LIBRARY-002` revision 5); [OQ-301](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-301), confirmed as built (a ruling note under
`PD-CONFIG-003`, no directive); [OQ-302](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-302), confirmed as built, no directive.

***Three of those counts changed on 2026-09-02 and the direction is not the usual one, so a reader should
not skim them.*** The seven escalations this register carried as open were **all ruled on that date** and
all seven have landed in requirements; OQ-14 and OQ-44 were **closed by amendment** and their entries below
say by which clause; and **spike 22 has been run**. Two entries were corrected rather than deleted because
they asserted a fact that is now false: OQ-44 said `REQ-TRACE-061` "states no ladder" and it now states
one, and OQ-14 said `REQ-CONFIG-216` "says nothing about mode" and it now fixes `0600` explicitly on every
write.

**Five spikes have now landed on 2026-09-02.** The first four closed nothing here, which was the point:
every owner ruling survived and what the measurements changed was the *reasons* — three platform facts this
record asserted were disproved, one ADR's own stated gate trigger fired, and one question a spike raised
was answered in the specification rather than filed here. **The fifth is different in kind.** Spike 22 ran
`REQ-SESSION-201`'s restore and **the mechanism did not work — 0 of 30** — so it closed a spike, found
three defects the record had decided on paper, produced a new requirement (`REQ-SESSION-202`), amended
another (`REQ-SESSION-201`), added two shapes to OQ-48, and left **eight further defects it found
uncorrected**. Those eight are in the gate verdict in [`README.md`](../README.md) §6 and are not filed here as
questions, because they are defects with owners rather than silences with none.

**Sub-cases that went unmeasured inside spikes that otherwise passed are listed rather than absorbed**,
because a sub-case folded into a discharged spike is a gap nobody can see afterwards:
`REQ-STARTUP-165`(c)'s "no usable preparation at all" branch (spike 20), ESC-21's second premise
(spike 19), and — new — **the kill-in-the-gap case and the re-run of the corrected restore** (spike 22).

**Nothing here is closed because a ruling said it would be, and nothing is closed because a measurement
was taken nearby.** Two closures in the previous pass were **rewritten rather than deleted**, because
they were right about the outcome and wrong about the reason: OQ-11 is closed, but not by dissolution,
and OQ-44's statement of fact was false. Two questions the ADRs decided against the specification's
silence were filed as **new** questions (OQ-47, OQ-48) rather than being presented as settled, and both
are still open.

**What the second pass changed, stated so a reader can audit it.** Five escalations are closed
individually and each says which requirement closed it and what it left behind; **none of them is closed
because a ruling exists, and two are closed against the entry's own conclusion** (ESC-25 argued a
detached signature was unavailable and the specification amended the two requirements that forbade it;
ESC-23 argued the antecedent was lost and the specification restored it). One question is closed because
the specification moved under it (**OQ-28**). One is new because ADR-0002 had to decide a silence
(**OQ-49**). Three escalations remain open and one of them is new. **Nothing is closed that an agent did
not actually settle**: where a pass reported a conclusion this register could not verify against the
requirement text, the conclusion is recorded and the entry stays open.
