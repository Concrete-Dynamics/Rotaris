[Product directives](../directives.md) › PD-WORKSPACE-005

<a id="pd-workspace-005"></a>

### PD-WORKSPACE-005 — a project-setup banner names the project it is about

*Revision 3 (2026-10-14, [R-072](../requests.md#r-072), ruling [OQ-294](../../architecture/open-questions/59-spikes-and-later-questions-26.md#oq-294)) — **the banners'
action reaches a project no window holds**, below: revision 2's no-holder sentence replaced, and quoted beside the new text.*
*Revision 2 (2026-10-13, [R-072](../requests.md#r-072), ruling [OQ-262](../../architecture/open-questions/56-spikes-and-later-questions-23.md#oq-262)) — **the
banners' action**, below: a clause added, the revision-1 sentence it falsifies and the "every other surface" clause it
amends quoted beside it.*

**The banner.** The two initialization banners — a failed background run's "Project setup did not finish"
(REQ-WORKSPACE-103) and a failed resolution's "Project setup could not be checked" (REQ-WORKSPACE-102) — SHALL stay
application notices, raised once and shown in every open main window as every other notice is, and SHALL name the project
they concern. Their title SHALL read the requirement's headline, a colon and a space, and the project's name:
`Project setup did not finish: atlas-billing`. The project's name is the last path segment of the project's folder, and
the folder's full path where it has no last segment (a drive or filesystem root). The message SHALL be the sentence the
requirement fixes, unchanged — the task's own summary or its fallback, and for a run that broke down entirely "Runs are not
blocked; you can try again."; for a failed resolution "Rotaris could not work out whether this workspace still needs setting
up. Runs are not blocked; you can check again." The banner's detail area (REQ-NOTIFY-005) SHALL begin with the line
`Project folder: <the folder's full path>`, followed by a blank line and the technical text the requirement's surface
already carried, so two projects whose folders share a name are told apart there.

**The banners' action — revision 3.** Both banners SHALL carry REQ-NOTIFY-044's `open-project-init` action naming the
project's folder. The failed background run's banner labels it **"Try again"**, the label REQ-WORKSPACE-103 fixes; the failed
resolution's banner labels it **"Open Project settings"** (REQ-WORKSPACE-102). From any window, activating either banner SHALL
reach the named workspace by [`PD-SHELL-001`](pd-shell-001.md#pd-shell-001) revision 2's reach. Where a main window holds the workspace, that
window is surfaced on REQ-SHELL-161's terms. Where none does, a main window is added for it on PD-SHELL-001's add terms: no
REQ-SHELL-021 gate is evaluated, no window is closed, nothing is asked, the workspace is persisted as the last-opened one, and a
failure is reported under REQ-SHELL-019. Settings › Project, where REQ-WORKSPACE-103 puts the recorded outcome and its retry,
SHALL then open in the reached window, and the window SHALL hold the request until its renderer can take it, so a press
during an added window's load still lands.

> **Revision 2 said, and no longer governs:** "When no window holds the workspace, the activating window SHALL show the info
> notice **"Project <name> is not open in any window."**, `<name>` the project's name as above, and nothing else happens: no
> window is added, replaced or asked about." — the falsified reading (OQ-262's ruling of the case, answered differently the
> same day by OQ-267's reach; OQ-294).

> **Revision 1 said, and no longer governs:** "the retry itself is made in that project's Settings › Project, since the
> banner's own 'Try again' action has no target in this build" (in "Why, and what it costs" below), and "**What is
> unchanged.** … its severity and every other surface of the two requirements", which this clause amends: the action is now
> one of the banner's surfaces this directive states.

**What is unchanged.** Which window shows the banner (every one, ADR-0049's one notice store), when it is raised, its
severity and every other surface of the two requirements but the action above. The in-window error surface of a failed resolution — the Project
section's "Project setup could not be checked" and its "Check again" (REQ-WORKSPACE-102) — is the window's own and reads
the requirement's headline as it stands. A banner for a workspace no window holds any more is still not raised (OQ-141).

**Why, and what it costs.** With two main windows open (PD-SHELL-001) a project's failed setup raised "Project setup did not
finish" in the other project's window too, carrying a summary that says "this project" and nothing saying which; the user
could not tell which project to try again. Showing the banner only in the windows holding the project would make the
application's single notice store work per window, which is a larger change than the confusion is worth; naming the
project is a text change that removes it. The name says which project; the retry itself is made in that project's Settings ›
Project, ~~since the banner's own "Try again" action has no target in this build (ADR-0049, "Not built, said so")~~ which
the banner's action opens since revision 2 (OQ-262: REQ-WORKSPACE-103's "Try again" had no target, and the surface that
holds the retry is the project's own Settings › Project). What it costs: the title is no longer the requirement's fixed string, so a
reader or a test matching the headline whole must match its start; and a long folder name lengthens the title.

> **Narrows:** REQ-WORKSPACE-102, REQ-WORKSPACE-103

*Raised by the owner, 2026-10-06, ruling OQ-171 as recommended; logged as [R-071](../requests.md#r-071). Minted on its branch as PD-WORKSPACE-003 and renumbered PD-WORKSPACE-005 before the merge, `origin/main` having taken PD-WORKSPACE-003 and PD-WORKSPACE-004 meanwhile.*

**Why revision 2, and what it costs.** REQ-WORKSPACE-103 gives the banner a "Try again" action and REQ-NOTIFY-044 has the
member that names a workspace's initialization surface, yet the banner carried none: a user who read it had to find the
project's window and its Settings › Project themselves. Opening the surface rather than re-running the setup from the
banner keeps REQ-NOTIFY-047 (an action writes nothing into the project) and shows the recorded outcome before the retry.
What it costs: "Try again" opens a surface rather than retrying in one press; the resolution banner's label departs from
REQ-WORKSPACE-102's in-window "Check again", which stays the window's own; and ~~a banner for a project whose window was
closed answers with a notice and opens nothing~~ *(struck by revision 3)*. Revision 3's three costs in its place: the press
reopens a project the user closed, and that project becomes the remembered workspace; the reopened project runs its automatic
resolution (REQ-WORKSPACE-102), and its pending setup may start again before the user reaches the retry; and, until the
defect "a main window added after a notice was published does not show it" is repaired, the added window does not show the
banner. *(That third cost lapsed the same day: the defect was repaired by fin44, a window asking main for the current notice
when it boots, [`a-main-window-added-after-a-notice-was-published-does-not-show-it.md`](../../defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md).)*

*Revised by [R-072](../requests.md#r-072), 2026-10-13, ruling [OQ-262](../../architecture/open-questions/56-spikes-and-later-questions-23.md#oq-262) (revision 2).*
*Revised by [R-072](../requests.md#r-072), 2026-10-14, ruling [OQ-294](../../architecture/open-questions/59-spikes-and-later-questions-26.md#oq-294) (revision 3): the
disposition "Narrows REQ-WORKSPACE-102, REQ-WORKSPACE-103" stands, and their back-pointers name revision 3.*

> **First execution of revision 3, 2026-10-14 (fin44, `fin44-notice-reach`).** Built the day it was ruled: `projectInit.open`
> (`apps/desktop/src/main/commands/initialization.ts`) awaits `MainWindows.reach` in place of revision 2's `surfaceHolding`,
> answers a failed reach with its outcome (the add route reported it under REQ-SHELL-019) and raises no transient, and asks the
> reached window for Settings › Project through `MainWindows.openProjectInit`: sent on channel 15 to a renderer listening,
> held on the window's record for one still loading until its renderer, having registered for channel 15, sends
> `projectInit.ready` and is answered `{owed: true}` once (`apps/desktop/src/renderer/main.tsx`). `PROJECT_NOT_OPEN` and
> `surfaceHolding` are gone. **What was measured.** `commands/initialization.test.ts` (a holder reached and opened; a project no
> window holds reached by an added window, the open held, no transient; a failed reach answered with its outcome;
> `projectInit.ready`), each red on the code before; `main-windows.test.ts` (an added window not yet listening holds the
> request and its ready call returns it once; a listening holder is sent channel 15 directly; a second press during a deferred
> open sets the request once and is not refused); `recovery-wiring.test.ts` (the ready call right after registering);
> `notice-proof` section 6c: the banner for `closed-project`, a project no window held, pressed in the first window, added a
> third main window on it (`added window 3 and opened Settings › Project there`), which showed Settings › Project with
> "Retry initialization" (its owed task failed again, the second cost above), and no "not open in any window" acknowledgement
> appeared (load average 7.4 on four CPUs). The added window's renderer had registered before the open was asked, so the
> built app took the `sent` branch; the held branch is measured by the unit cases and, for channel 16's identical hand-off, by
> `notice-proof` 6d. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 2, 2026-10-14 (fin43, `fin43-notices-and-config`).** Built the day after it was ruled:
> `InitializationCoordinator.banner` passes `{ label, action: { kind: 'open-project-init', workspace } }` from all three sites;
> main forwards it to the notice store; the renderer's arm sends `projectInit.open`; main's handler
> (`projectInitCommands`, `apps/desktop/src/main/commands/initialization.ts`) surfaces the holder through
> `MainWindows.surfaceHolding` and sends it channel 15 (`project-init:open`), whose listener opens Settings › Project, or
> raises the info acknowledgement in the asking window. **What was measured.** `initialization.test.ts`'s three cases (the
> two background sites and the resolution site), `main-windows.test.ts`'s `surfaceHolding` case, the handler's two cases in
> `commands/initialization.test.ts` and `recovery-wiring.test.ts`'s two source cases, each red on the code before;
> `init-proof` scenario 4 requires the banner's logged action; `notice-proof` section 6c, two main windows, presses "Try
> again" in the window that does not hold the project: the holder came to the front showing Settings › Project with
> "Retry initialization", an unsaved Instructions edit in it still pending; a banner naming a folder no window holds gave
> "Project closed-project is not open in any window." and no window was added. **Found:** a main window added after a
> notice was published does not show it
> ([`a-main-window-added-after-a-notice-was-published-does-not-show-it.md`](../../defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md)),
> not repaired there; repaired 2026-10-14 by fin44 (`notice.current`). The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution, 2026-10-06.** Built the day it was written: `InitializationCoordinator.banner`, `namedBanner` and
> `projectNameOf` in `apps/desktop/src/main/initialization.ts`. **What was measured.** Three cases in
> `initialization.test.ts`'s "a banner names its project" block and the seven earlier banner assertions, each red on the code
> before the change; `init-proof` scenario 4 requires the background banner's title to name the scenario's folder and its
> detail to open on the folder. **What was not measured.** No built-app run with two main windows open photographed the
> banner in the window that does not hold the project. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md). **Repaired on verification, 2026-10-06.**
> As first built, `projectNameOf` took a Windows drive root's designator for its last segment and named `C:\` and `C:/`
> as the bare `C:`, against the clause above that a root with no last segment is named by its full path; the unit test had
> pinned only `/`. A drive designator (`^[A-Za-z]:$`) now counts as no segment, so a drive root reads `C:\`; the case
> "names a Windows drive root by its full path" in `initialization.test.ts` pins it and was red on the first build.
