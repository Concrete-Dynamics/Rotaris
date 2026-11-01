# Archived open questions — Spikes, and the questions raised since (23 of 35)

The ruled, closed, resolved and withdrawn entries of [part 56](../../../architecture/open-questions/56-spikes-and-later-questions-23.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-260"></a>

**OQ-260 — Is a window edit whose carried replacement leaves the file unchanged refused, or applied as a success?**
*(REQ-TOOLS-135, `edit`'s "identical strings rejected"; `PD-TOOLS-016`, which carries a window match's line endings and, at
level 2, the bytes of every line `new_string` repeats; `PD-TOOLS-017` clause 3, which refuses an exact or replace-all edit left
with the file's own bytes. Raised 2026-10-13 by fin38 from the probe the R-072 consortium's ruling of [OQ-254](54-spikes-and-later-questions-21.md#oq-254) asked
for. **Ruled 2026-10-13.**)*

A window edit can land on the window's own bytes once `PD-TOOLS-016` has carried it: `one\r\ntwo\r\nthree\r\n` edited `one
\ntwo` → `one\ntwo` matches at level 2, pairs `two` with the file's `two\r` and gives `one` the window's `\r`, so the file is
rewritten unchanged beside `Edited n.txt: 2 lines replaced by 2 at line 1 (+0 -0). Match level: 2. new_string was written with
the file's CRLF line endings.`, with an undo entry that restores the same content. Recorded as
[`a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success`](../../../defects/fixed/a-window-edit-that-lands-on-the-files-own-bytes-is-applied-as-a-success.md).
The strings differ, so REQ-TOOLS-135's rejection of identical strings does not reach it, and `PD-TOOLS-016` does not decide it.

**What the build proceeds under.** Applied as a success, as built.

**What a ruling decides.** Whether a window edit whose result equals the file is refused before writing, with no undo entry and a
reply saying the file already holds that text (extending `PD-TOOLS-016` as `PD-TOOLS-017` clause 3 extends the exact edit), or
stands as built.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a `write_file` edit that matches one
window at REQ-TOOLS-136 level 2, 3 or 4, and whose carried result equals the file's bytes, fails before writing: no undo entry is
pushed, the read record does not change, and the reply is `old_string matches <p> only at match level <N> (lines <a>-<b>), and
those lines already hold new_string as this edit would write it; nothing to change. Use write_file's 'overwrite' to write a file
exactly as given.` (`(line <a>)` for a one-line window). Published as [`PD-TOOLS-016`](../../../product/directives/pd-tools-016.md#pd-tools-016)
revision 3, clause 4 "No-op, at levels 2, 3 and 4", which mirrors `PD-TOOLS-017` clause 3 for the window path; the PD-TOOLS-016
back-pointer under REQ-TOOLS-135 is amended in place. The reply differs from `PD-TOOLS-017`'s "differ only in line endings",
since at levels 2 to 4 the difference may be trailing whitespace, indentation or a fuzzy near miss. `haet_edit` is unchanged: its
levels 2 and 3 already refuse (`PD-TOOLS-014`), a level-4 match replies as a miss, and level 1 is `PD-TOOLS-017`'s.

The two recommendations weighed, and the ruling followed **both** — they agreed on the outcome, the vehicle and the cost:
- **Advocate A (the user's lens)** recommended refusing the no-op as revision 3 of `PD-TOOLS-016`, showing the success false three
  times over (nothing replaced, no CRLF written, the caller's intended fix never needed) and the live-run precedent in which a
  model said a no-op "should have errored but didn't", and an undo entry that pushes a real one out of REQ-TOOLS-132's ten. The
  ruling took A's argument from the user's view and its LF level-2 case.
- **Advocate B (the system's lens)** recommended the same refusal as a clause within `PD-TOOLS-016`'s own case, since every other
  edit path refuses its no-op and `docs/product/README.md` makes a change to a directive's own case a revision. The ruling took
  B's reply text ("already hold new_string as this edit would write it"), which stays true at levels 3 and 4, and B's level-4
  retry case; the overwrite hint is made general.

**Costs kept on record:** a refusal is one more failed tool call, so its text says plainly there is nothing to change; a caller
that relied on a no-op success to touch a file loses it (`overwrite` remains); an implementation built from the specification
alone applies the no-op.

**What a live run then shows.** Nothing: the live-run fixtures are LF files on Linux, and none of the six autopsies records a
window edit that lands on the file's own bytes. If one occurs, the transcript shows a refused `write_file` call naming the match
level and lines in place of a "+0 -0" write row.

*Built 2026-10-13 (fin39, `fin39-insert-noop-optionals`); its first execution is reported in `PD-TOOLS-016` revision 3, in
place.* `windowNoOpMessage` and the edit branch's comparison before `commit` (`packages/agent-tools/src/tools/files.ts`); pinned by
the "PD-TOOLS-016 revision 3" cases in `tools.test.ts`, red on the code before. The note is repaired.

<a id="oq-261"></a>

**OQ-261 — Which moments does REQ-STARTUP-160's setup statement name, when the build fetches at a tool's first start
rather than at machine setup or cache warm-up?** *(REQ-STARTUP-160 with REQ-STARTUP-058, REQ-STARTUP-064 and
REQ-STARTUP-084; `PD-STARTUP-005`; OQ-73, deferred, which records that machine setup is not built. Raised
2026-10-13 by fin41, building the disclosure the note
[`the-about-page-carries-no-network-activity-disclosure`](../../../defects/fixed/the-about-page-carries-no-network-activity-disclosure.md)
records. Ruled 2026-10-13 under R-072, below.)*

REQ-STARTUP-160 has About & Legal state "that first-launch machine setup and cache warm-up may contact the pinned
tool-archive hosts and the package registries the configured package runners use, and only for work the machine does not
already satisfy". It also requires the disclosure to name "no host, endpoint, or request this document does not require",
and calls a build "whose disclosure and behavior disagree" non-conformant on the disclosure. This build meets the clause
from the other side:

- **Neither moment exists in this build.** Machine setup (REQ-STARTUP-058's first list, REQ-STARTUP-060 onward, the tool
  archives of REQ-STARTUP-084) and the MCP cache warm-up of REQ-STARTUP-064 are not built (OQ-73, deferred by R-071). The
  build downloads no Git and no ripgrep archive, and it warms no cache.
- **The same kind of request happens at another moment.** The package runner fetches a pinned tool-server package
  (`@playwright/mcp` 0.0.80) from its registry the first time that tool server starts (`PD-STARTUP-005` says so of the
  notices file). The bundled code-intelligence runtime provisions a language server from the npm registry or PyPI at the
  first use of a language (REQ-STARTUP-058's second list, ESC-32). Both are requests this document requires, and both are
  made only for work the machine has not already done.

**What the build proceeds under.** The disclosure states the clause as the requirement words it, "may contact", and
names the third moment beside the two: "Setting up this machine's tools, on first launch, while warming caches, or the
first time a tool is needed, may contact …". It names no host. Without the third moment the disclosure would be silent
on the only requests of this kind the build makes; with the first two the text keeps the requirement's statement, which
a build that ships machine setup makes true without a change.

**What a ruling decides.** Whether "the first time a tool is needed" may stand beside the requirement's two moments
(extending REQ-STARTUP-160), whether a build that does not carry machine setup or warm-up must leave those two moments out
of its disclosure, or whether both stand as built.

**Ruled 2026-10-13 by the consortium under the owner's delegation ([R-072](../../../product/requests.md#r-072)), both advocates'
recommendations weighed:** REQ-STARTUP-160's setup statement names the moment at which this build reaches the network — the
first time a tool is needed, when a tool server's package or a language's server is downloaded from the package registry
that serves it, only when this machine does not already have it. It names first-launch machine setup, cache warm-up and the
tool-archive hosts only in a build that carries machine setup (REQ-STARTUP-060 onward) or the warm-up of REQ-STARTUP-064,
and whichever change builds either one restores the matching words. Recorded as
[`PD-STARTUP-006`](../../../product/directives/pd-startup-006.md#pd-startup-006), which narrows REQ-STARTUP-160's first content statement only;
the update-check and exposure statements, the surface, the offline readability and the no-host clause are unchanged. **Built
2026-10-14 (fin43, `fin43-notices-and-config`):** `NETWORK_DISCLOSURE.setup` (`packages/ui/src/settings/About.tsx`) reads
"The first time a tool is needed, such as a tool server or a language's code intelligence, it may be downloaded from the
package registry that serves it, and only when this machine does not already have it."; the first execution is reported
under the directive. OQ-73 carries the restoring rule beside its own deferral.

<a id="oq-271"></a>

**OQ-271 — Is a retrospective's artifact part of a later run's analysis history?** *(REQ-LIBRARY-034, the analyst's prior
artifacts — `task_run` artifacts other than the session's own, the five newest; REQ-LIBRARY-025, `considered_session_ids`
records the source session of each; REQ-LIBRARY-017, "Data from another run, another session, or another workspace MUST NOT
inform it", beside "the bounded prior-artifact history of REQ-LIBRARY-034"; [`PD-LIBRARY-002`](../../../product/directives/pd-library-002.md#pd-library-002)
revision 2 (a), a retrospective artifact stores `source_session_id` null and names the sessions it read. Raised 2026-10-13 by
fin42 from [`a-post-run-analysis-after-a-retrospective-is-never-captured.md`](../../../defects/fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md).
Ruled 2026-10-13 under R-072, below.)*

A retrospective's artifact carries `source_run_type` `task_run` and no source session, so REQ-LIBRARY-034's filter, read by its
letter, keeps it among a later run's five prior artifacts, and REQ-LIBRARY-025 has no session of it to record. Until fin42 the
null reached the job and its parse threw, so no run's analysis was captured while a retrospective artifact stood among the five
newest. The specification was written before the retrospective existed, and PD-LIBRARY-002 revision 2 names REQ-LIBRARY-011,
-020, -109, -124, -125 and -130 and REQ-NOTIFY-250, not REQ-LIBRARY-025 or -034.

**What the build proceeds under.** The letter of REQ-LIBRARY-034: a retrospective's artifact stays in a later run's history,
bounded like any prior artifact, and contributes no session to `considered_session_ids`, since it has none
(`captureImprovementJob`, `packages/engine/src/improvements/capture.ts`). Its proposals then reach the per-run analyst as history,
and REQ-LIBRARY-046's duplicate suppression already reads them.

**What a ruling decides.** Whether a retrospective's artifact belongs to the per-run analyst's history — as built, by the letter of
REQ-LIBRARY-034, or excluded, since its content is drawn from other sessions and REQ-LIBRARY-017 keeps another session's data
from informing a run's analysis — and, if it stays, whether `considered_session_ids` should carry the sessions the retrospective
itself read. **The costs either way:** kept, a run's analyst reads proposals written over sessions it was never shown, and only
their summaries; excluded, a run's analyst may propose again what a retrospective already proposed, which REQ-LIBRARY-046's
suppression at store time still catches.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)): retrospective artifacts stay out of a
later run's analysis history.** The per-run analyst's prior-artifact history holds only `post_run` artifacts: the capture drops
every artifact whose `source_kind` is `retrospective` before it applies REQ-LIBRARY-034's five-artifact bound, so each artifact
supplied has a source session, and REQ-LIBRARY-025 and REQ-LIBRARY-017 hold word for word for every run. Recorded as
[`PD-LIBRARY-002`](../../../product/directives/pd-library-002.md#pd-library-002) revision 3, clause (h), which narrows REQ-LIBRARY-034 (back-pointer
written in the same commit); REQ-LIBRARY-017 stays on the directive's Extends line and REQ-LIBRARY-025 is untouched. The
retrospective's own reading of every prior proposal stays as it is. **The build's earlier reading, kept beside the ruling:** the
paragraph "What the build proceeds under" above (the letter of REQ-LIBRARY-034, the retrospective's artifact kept with no
session recorded for it) governed from fin42 until this ruling and no longer does. **Built in fin43** (`fin43-analysis-and-artifacts`):
`captureImprovementJob` filters on `source_kind === "post_run"` ahead of the bound; a legacy artifact with no `source_kind` parses
as `post_run` and stays in history. **The cost kept on record:** a run's analyst may propose again what a retrospective already
proposed, and REQ-LIBRARY-046's suppression at store time catches it.

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, confirm-as-built): "Confirm the build as it stands. A retrospective's artifact stays in a later run's prior-artifact history
under REQ-LIBRARY-034's letter and bound … Write the departure down as PD-LIBRARY-002 revision 3." **Advocate B** (the system's
lens, change-behaviour): "Exclude a retrospective's artifact from the per-run analyst's history. The capture filters on
`source_kind === 'post_run'` before the five-artifact bound." Advocate B's followed; A's confirmation not taken, since closing the
gap it admits would widen REQ-LIBRARY-017, which `PD-LIBRARY-002` and ADR-0065 keep whole.

<a id="oq-262"></a>

**OQ-262 — Which notice offers REQ-NOTIFY-044's project-initialization action, and what does the action open for a
workspace this window does not hold?** *(REQ-NOTIFY-044, the action vocabulary; REQ-NOTIFY-047, actions write nothing into
the project; REQ-SHELL-115, "start project initialization; resolve project initialization"; REQ-CONFIG-404; ADR-0064, the
initialization registry and its surface. Raised 2026-10-13 by fin41 while correcting the stale comment on the renderer's
notice-action switch, recorded in
[`code-comments-call-built-mechanisms-unbuilt-or-owed`](../../../defects/fixed/code-comments-call-built-mechanisms-unbuilt-or-owed.md).
Ruled 2026-10-13 under R-072, below.)*

REQ-NOTIFY-044 lists "open the project-initialization surface for a named workspace" among the actions a notice may carry,
and the contract carries it (`open-project-init`, with a `workspace`, `packages/contracts/src/notices.ts`). The renderer's
arm (`apps/desktop/src/renderer/main.tsx`, `dispatchNoticeAction`) dispatches nothing and logs that the action "has no target in
this build". Its comment gave the reason as "no project-initialization surface". That reason is false since ADR-0064:
Settings › Project draws the initialization tasks and their outcomes (`packages/ui/src/settings/ProjectSettings.tsx`,
`project-init.ts`). Nothing in the build raises the action either: no notice offers it, so the arm cannot be reached.

The specification leaves two things open:

- **Which notice carries it.** REQ-NOTIFY-044 fixes the vocabulary, not which notice offers which member. The
  initialization banners (PD-WORKSPACE-005) offer no action today. REQ-WORKSPACE-103 puts the recorded outcome in
  Settings › Project, which a banner could lead to with this action or with the existing "open settings at a named
  category". Nothing says whether a banner should offer it at all.
- **What it opens for another workspace.** The action names a workspace. Settings › Project shows the window's own
  workspace. A notice is an application notice shown in every open window (ADR-0049, PD-WORKSPACE-005), so another window
  may hold a different workspace. The specification does not say whether the action focuses the window that holds the
  named workspace, opens Settings › Project in the window it was activated in only when the workspace matches, or is not
  dispatched otherwise (REQ-NOTIFY-044's "an action naming a value outside the owning domain's vocabulary is not
  dispatched" covers vocabularies, not windows).

**What the build proceeds under.** Unchanged: the arm logs and dispatches nothing, and no notice raises the action. Only
the comment changed, to say that the surface exists and that nothing raises the action.

**What a ruling decides.** Whether any notice offers the action, and, if one does, which surface it opens in which
window.

**What a live run then shows.** Nothing until a ruling adds a notice that carries the action: no live scenario raises one.

**Ruled 2026-10-13 by the consortium under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** both
project-setup banners carry `open-project-init` naming their workspace. "Project setup did not finish: <name>" labels it
"Try again", the label REQ-WORKSPACE-103 fixes, and "Project setup could not be checked: <name>" labels it "Open Project
settings". From any window, activating either one surfaces the main window holding that workspace on REQ-SHELL-161's terms
and opens Settings › Project there. When no window holds the workspace, the activating window shows the info notice
"Project <name> is not open in any window.", and nothing else happens. Recorded as
[`PD-WORKSPACE-005`](../../../product/directives/pd-workspace-005.md#pd-workspace-005) revision 2 (disposition still Narrows REQ-WORKSPACE-102 and
REQ-WORKSPACE-103, whose back-pointers are amended in place). **Built 2026-10-14 (fin43, `fin43-notices-and-config`):** the
coordinator's banners carry the action (`InitializationCoordinator.banner`), the renderer's arm sends `projectInit.open`, main
surfaces the holder (`MainWindows.surfaceHolding`) and sends channel 15 (`project-init:open`), or raises the info
acknowledgement in the asking window; `pnpm notice-proof` section 6c presses it from the window that does not hold the
project. **Not repaired by this ruling, and not owed:** the ruling's brief asked for a note that `open-hook-review` "still does
nothing outside its own window"; on this branch it does — `MainWindows.reach` surfaces or adds the holding window since
2026-10-13 (fin41, N86; [`a-hook-review-notice-for-another-workspace-opens-nothing.md`](../../../defects/fixed/a-hook-review-notice-for-another-workspace-opens-nothing.md),
`notice-proof` sections 6 and 6b), so no note was written.

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "the two project-setup banners each carry `open-project-init` naming their workspace … Activating either
opens Settings › Project in the window that holds the named workspace … If no window holds the workspace any more, the activating
window says so in a short notice and nothing else happens." **Advocate B** (the system's lens, change-behaviour): "The
failed-background-run banner 'Project setup did not finish: <name>' … carries REQ-WORKSPACE-103's own 'Try again' action …
surfaces the one main window holding that workspace and opens Settings › Project there … The failed-resolution banner stays
without an action." Both followed: B's single path through main to the holding window, and A's action on the resolution banner,
A's notice for the no-holder case (since revised by [OQ-294](59-spikes-and-later-questions-26.md#oq-294)) and A's vehicle, `PD-WORKSPACE-005` revision 2.

*Added 2026-10-14 ([OQ-267](57-spikes-and-later-questions-24.md#oq-267), ruled 2026-10-13 under R-072):* OQ-267's ruling, as written, answers this question's
second half — what the action opens for a workspace another window holds, or no window holds — by
[`PD-SHELL-001`](../../../product/directives/pd-shell-001.md#pd-shell-001) revision 2's reach, and leaves its first half, which notice offers the
action, to this entry. This entry's own ruling, above, answered both halves the same day; the two agree where a window holds
the workspace (it is surfaced and the surface opens there) and disagree where none does (this ruling: a notice and nothing
else; OQ-267's: a window added). The build follows this entry's ruling for the project-setup action; the disagreement is
[OQ-294](59-spikes-and-later-questions-26.md#oq-294).

*Added 2026-10-14 ([OQ-294](59-spikes-and-later-questions-26.md#oq-294), ruled 2026-10-14 under R-072):* this entry's no-holder clause — "the activating window
shows the info notice 'Project <name> is not open in any window.', and nothing else happens" — is revised by OQ-294: a window
is added for the project on PD-SHELL-001 revision 2's add terms and Settings › Project opens there
([`PD-WORKSPACE-005`](../../../product/directives/pd-workspace-005.md#pd-workspace-005) revision 3, built by fin44). The rest of this ruling — which
notices carry the action, their labels, the holder surfaced — stands.

<a id="oq-263"></a>

**OQ-263 — Is a `worktree_storage_subpath` that contains the requirement checkout directory rejected at load?**
*(REQ-GIT-138, whose first sentence keeps the worktree directories of the three namespaces disjoint, "no worktree directory of one
namespace SHALL lie inside the directory of another", and whose directory-side rejection names only a value that "resolves to the
fixed requirement checkout directory of REQ-GIT-137 or to any directory inside it"; REQ-GIT-005, REQ-GIT-073, REQ-CONFIG-068.
Raised 2026-10-13 by fin41 while building the load-time half of REQ-GIT-138, task N72, as OQ-261; renumbered OQ-263 at
landing, because origin/main had given OQ-261 to REQ-STARTUP-160's question and OQ-262 to REQ-NOTIFY-044's first.)*

**What is open.** A session worktree lies at `<workspace>/.rotaris/<subpath>/<session-id>`. A `worktree_storage_subpath` of
`requirements` or `.` names a session directory (`.rotaris/requirements/`, `.rotaris/`) that CONTAINS the requirement checkout
directory `.rotaris/requirements/worktrees/`. No session tree ever lands in that directory, since a session id is never
`worktrees`, but the requirement directory then lies inside the session one, which the first sentence of REQ-GIT-138 forbids. The
rejection the requirement states names only the two cases the other way round: the fixed directory itself, and a directory inside
it. The two sentences read differently over `requirements` and `.`, and the specification does not say which governs.

**What the build proceeds under.** The rejection as stated: only a value that resolves to `.rotaris/requirements/worktrees` or
inside it fails the load (`worktreeStorageCollision`, `packages/config/src/sections/requirements.ts`); `requirements` and `.`
load, and a session tree is placed at `.rotaris/requirements/<sid>` or `.rotaris/<sid>`. The cases are pinned as loading in
`load.test.ts` and `requirements-section.test.ts`, so a ruling the other way turns them red.

**What a ruling decides.** Whether a value whose session directory contains the requirement checkout directory is rejected at load
too, on REQ-GIT-071's terms, with the same report (key, value, the namespace it collided with), or loads as built.

**What a live run then shows.** Nothing: the live-run workspaces keep the default `worktrees`.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)): confirmed as built.** A
`worktree_storage_subpath` is rejected at load only when it resolves to `.rotaris/requirements/worktrees` or to a directory
inside it; a value whose session directory contains that directory, such as `requirements` or `.`, loads. In REQ-GIT-138's first
sentence, "the directory of another" means a worktree directory of another namespace, or the fixed container REQ-GIT-137 names;
it does not mean every directory that encloses that container. A dated note under REQ-GIT-138
([`06-git-worktrees-checkpoints.md`](../../../spec/06-git-worktrees-checkpoints.md)) records this reading, the requirement's text
kept, and the domain's resolution record logs it. No directive is needed and no behaviour changes.

**The two recommendations weighed.** *Advocate A (the user's lens)*: confirm as built and record only — no session tree can
land in the requirement container, since a session id is never `worktrees`, so a user who chose `requirements` or `.` loses
nothing and a rejection would refuse a configuration that works. *Advocate B (the system's lens)*: confirm as built and add a
clarifying note under REQ-GIT-138, so the first sentence no longer reads against the stated rejection. **The ruling follows
both**: confirmed as built, with B's note. **The reason**: REQ-GIT-130's integration layout,
`<workspace>/.rotaris/<storage-subpath>/integrations/<id>`, already puts one namespace's container inside the session storage
directory, so namespace containers may nest by design; what the requirement keeps disjoint is the worktree directories
themselves. **The caveat**: the disjointness depends on session ids being UUIDs, which never equal `worktrees` or
`integrations`. A future requirement that names session ids differently, adds a fixed directory under `.rotaris/` or
`.rotaris/requirements/`, or enumerates the session storage directory must reopen this ruling.

<a id="oq-264"></a>
**OQ-264 — Where in Settings does REQ-CHAT-167's reasoning-visibility switch live, when REQ-CONFIG-403 says the
Display category "holds two transcript toggles"?** *(REQ-CHAT-167 with REQ-CONFIG-403 and REQ-CONFIG-472. Raised
2026-10-13 by fin41, building the repair the note
[`search-transcript-and-the-reasoning-toggle-are-withheld-for-reasons-no-longer-true`](../../../defects/fixed/search-transcript-and-the-reasoning-toggle-are-withheld-for-reasons-no-longer-true.md)
records, as OQ-263; renumbered OQ-264 at landing, because origin/main had given OQ-263 to
REQ-GIT-138's question. Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):
confirmed as built and carried by [`PD-CONFIG-004`](../../../product/directives/pd-config-004.md#pd-config-004).)*

REQ-CHAT-167 requires `display/showReasoning` to be "reachable both from the settings surface and from the command
palette". It names no category. REQ-CONFIG-403 says "The Display category holds two transcript toggles", names them —
auto-collapse older tool outputs and group consecutive tool calls — and fixes their order; REQ-CONFIG-472 says the
category "additionally holds" REQ-CHAT-166's four tool-row controls. No settings requirement names the reasoning switch,
so read together the two documents either count the Display category short by one or leave the switch with no
category at all.

**What the build proceeds under.** The switch, "Show reasoning bodies", is the third control under Display's
Transcript heading, after REQ-CONFIG-403's two in their order, with the same commit policy (a desktop preference written
the moment it moves, not undone by Discard). The heading's sentence now says "These three". That is where a reader
looking for a transcript display preference looks, and it keeps REQ-CONFIG-403's two in their stated order.

**What a ruling decides.** Whether REQ-CONFIG-403's "two" is an enumeration a third preference may join (extending it
by a directive), or whether the switch belongs in another category (Interface holds the other desktop-preference
toggles), or whether it stands as built.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)): confirmed as built and carried by
[`PD-CONFIG-004`](../../../product/directives/pd-config-004.md#pd-config-004).** "Show reasoning bodies" (`display/showReasoning`, REQ-CHAT-167)
is the third control under Settings › Display › Transcript, after REQ-CONFIG-403's two in their stated order, and it commits as
they do: a desktop preference written the moment it moves, wired to the stored preference and the live re-render notification,
and not undone by Discard. The directive extends REQ-CONFIG-403 and REQ-CHAT-167; both keep their text and gain a back-pointer.
REQ-CONFIG-472's four tool-row controls and their Save policy are unchanged. No code changes.

**The two recommendations weighed.** *Advocate A (the user's lens)*: confirm as built with a directive — a reader looking for
a transcript display preference looks under Display's Transcript heading, beside the two switches that already shape the same
rows, and the heading's sentence already says all three are the user's and take effect at once. *Advocate B (the system's
lens)*: confirm as built with a directive — REQ-CHAT-167 names no category, the key lives in the `display/` namespace and
commits under the same policy as REQ-CONFIG-403's two, so Display is where its namespace, its commit policy and the rows it
governs already are; REQ-CONFIG-403's "two" is an enumeration a directive may extend. **The ruling followed both.** What it
costs: REQ-CONFIG-403's count of two now reads as three on screen.
