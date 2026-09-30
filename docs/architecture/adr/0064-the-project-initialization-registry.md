# ADR-0064 — Project initialization: a task registry in `config`, one marker writer in main, and the work delegated to whoever can do it

- **Status:** accepted, with its first execution recorded below
- **Date:** 2026-09-15
- **Origin:** `REQ-WORKSPACE-078` to `REQ-WORKSPACE-115`, not one of which was cited anywhere in this
  tree before this record. The `initialization:` and `project_init:` keys have been section-class in
  `packages/config/src/keys.ts` since Part I with **no reader behind either**;
  `packages/ui/src/WorkspaceView.tsx` has carried a `projectSetupPending` parameter no caller ever
  supplied, with `packages/ui/src/composer.ts` recording in a comment that nothing could pass `true`;
  and `packages/ui/src/settings/McpSettings.tsx` states in the product's own words that the machine-setup
  half of its action *"belongs with the onboarding task registry, which does not exist yet"*.
- **Depends on:** ADR-0002 (process topology — which process may do what), ADR-0035 (the bundled
  code-intelligence runtime and the three setup subcommands this registry's one task drives), ADR-0036
  and ADR-0037 (configuration loading, the section readers, and Tier A's single write path), ADR-0044
  (the IPC contract — channel 12 and the five commands), ADR-0049 (notices, for the background banner),
  ADR-0055 (startup sequencing — the slot `REQ-WORKSPACE-141` puts the resolution in).
- **Requirements:** `REQ-WORKSPACE-078`..`115`, `141`, `142`, `144`, `147`, `153`; `REQ-MCP-036`, `037`,
  `099`, `112`, `116`; `REQ-CONFIG-050`, `390`; `REQ-CHAT-007`; `REQ-SHELL-149`; `REQ-NOTIFY-008`.

## Context

**Project initialization** is one-time work a workspace owes when it is first opened: the product asks
whether anything applies, does what does not need asking, asks about what does, records each outcome
once, and never asks twice. Today the product ships exactly one such task — indexing the workspace for
the bundled code-intelligence runtime — but the specification is emphatic that the *framework* is the
thing and the task is a member: `REQ-WORKSPACE-080` closes with "a setup task added after the fact SHALL
participate in the prompt and in the setup UI under exactly the rules stated here, **with no additional
behavior of its own**", and `REQ-WORKSPACE-104` states what the current set therefore produces — a fresh
workspace that prompts for nothing and gates nothing.

What existed before this record was the task without the framework. `REQ-MCP-099`'s three stages ran, in
order, under their budgets, with cancellation and a tree kill — all of it built by Part T and proved on
this host. But it was reachable **only** from a button in Settings › MCP Servers. Nothing resolved
anything on workspace open, nothing was recorded anywhere, and the composer gate the specification asks
for could not engage because no value could reach it.

## The decision

Three obligations decide the placement between them, and once they are stated there is no free choice
left:

1. **`REQ-WORKSPACE-085` — the marker has exactly one writer**, and a task never records its own
   outcome. The file is `<workspace>/.rotaris/agents.yaml`, which the **workspace service** owns
   (ADR-0037 Tier A: `config.setField`, write then load again).
2. **`REQ-WORKSPACE-090` — applicability is REQ-MCP-037's rule and this domain declares no second one.**
   That resolution lives in the **run host**, the only process holding `LoadedConfiguration.mcp`.
3. **The boundary matrix forbids the shortcut.** `eslint.config.js` gives the run host no edge to
   `workspace` and main no edge to `mcp` or `store`. Neither of the two processes that can *act* can
   reach the other, and main already brokers between them.

So:

| Where | What |
| --- | --- |
| `packages/config/src/init/` | the **pure core** — the persisted state and its outcome patch, the task registry, the five set derivations, the nine-value view and its set-wise equality, one execution, and workspace classification |
| `apps/desktop/src/main/initialization.ts` | the **coordinator**: one resolution per workspace open, the single marker write routed through `config.setField`, the `code-intelligence-setup` runner, and the publication |
| `apps/desktop/src/run-host/mcp.ts` | unchanged in what it does — it gains `applicable` on its status and the corrected classification |
| channel 12, `initialization:state` | the nine values, their labels and descriptions, and the live run report |

### Why the core is in `config` and not in `workspace`

`packages/workspace` would be the obvious home by name, and it is the wrong one: the run host may not
import it. `config` is the one package all three composition roots may read, it already owns the YAML
document model this state is a section of, and it already owns the code-intelligence binding
(`deriveSetupInvocation`, `CODE_INTELLIGENCE_SETUP_STEPS`) the one task is built from. Nothing about
initialization is *workspace-service* work; what is workspace-service work is the write, and that goes
through the path that already exists.

### Why the task delegates rather than reimplements

`code-intelligence-setup`'s runner issues the existing `mcp.setup` request and maps `McpSetupStatus`
onto `REQ-WORKSPACE-087`'s task result. It states none of `REQ-MCP-099`'s budgets, step ids or statuses
a second time. What it *does* state, because this domain owns them and the MCP category's do not match,
are `REQ-WORKSPACE-093`'s per-stage failure reasons, `REQ-WORKSPACE-094`'s non-retryable refusal and
`REQ-WORKSPACE-095`'s two success summaries.

### Pushed, not polled

The run host publishes `mcp.setupStatus` on every change and the coordinator follows a live setup
through it; main then pushes the whole state to every window on channel 12. `REQ-WORKSPACE-109` requires
a step to become visible "at the moment that step finishes", and **SR-3** withdrew polling wherever two
processes can talk — these can. The MCP settings category's own 500 ms poll is untouched; it is
`REQ-MCP-112`'s and not this part's to change.

## Consequences

1. **A second reader of the `initialization:` section is a defect, not a feature.** The state is read
   from the workspace file directly and never through the layered loader, because `REQ-WORKSPACE-078`
   names that one file: read through the merge, a *global* `agents.yaml` could declare one machine's
   marker for every workspace on it.
2. **Classification moved, and the old answer was wrong.** See the first execution below.
3. **The gitignore grammar has one home.** `packages/config/src/init/gitignore.ts`; `agent-tools`'
   `tools/search.ts` re-exports it and no longer keeps a subset.
4. **`McpSetupStatus` gained `applicable`.** The MCP category may use it; this domain must, because
   `REQ-WORKSPACE-090` forbids a second availability rule.
5. **The consent dialog and the composer gate are unreachable from the shipped task set**, by design
   (`REQ-WORKSPACE-104`). They are exercised by `ROTARIS_INIT_TEST_TASK`, a verification-only seam that
   registers an ordinary task through the ordinary registry and adds no code path.

## First execution — 2026-09-15 (`pnpm init-proof`, five scenarios, all passed)

**Four defects. Two of them are in the surface this part drew, and the screenshot found both while every
DOM assertion beside them read green on the same frame.** Everything else
this record expected to check held first time: the five set derivations including the both-lists-at-once
rule, `REQ-WORKSPACE-082`'s prompt condition, the silent marking of a workspace with nothing applicable,
`REQ-WORKSPACE-084`'s "no task cuts the run short", `REQ-WORKSPACE-085`'s marker-write downgrade,
`REQ-WORKSPACE-086`'s stamp on an empty skip, `REQ-WORKSPACE-105`'s set-wise equality,
`REQ-WORKSPACE-114`'s six-state precedence, and the full gitignore grammar.

**(1) Classification was decided by the runtime's own extension list, not by this domain's.** The
contains-code test that gates a 1800 s indexing stage matched against
`CODE_INTELLIGENCE_MANIFEST.extensions` — **152 suffixes** generated from serena-agent 1.7.0's language
coverage. `REQ-WORKSPACE-099` fixes the set at **exactly 23**, overridable per workspace through
`project_init.source_extensions`, and says "the same set SHALL apply everywhere classification is
decided"; `REQ-WORKSPACE-091` then binds the two skipped stages to "a workspace classified `non-code`
(REQ-WORKSPACE-098)". The two sets disagree in both directions on real trees — a workspace of `main.tf`
and `deploy.sh` is `code` under the manifest and `non-code` under the specification. **The falsified
reason is kept beside its replacement** in `run-host/mcp.ts`. Found while building, not by the proof;
recorded as `docs/defects/classification-decided-by-the-runtimes-extension-list.md`, which also carries
the narrower half — the subset gitignore reader honoured `!` and `**` and last-match-wins, the three
things `REQ-WORKSPACE-100` names, and not character classes or escapes.

**(2) The built app found a write race no unit test could have staged: a skip answered while the
background task ran was erased by that task's own outcome.** `REQ-WORKSPACE-083` starts background work
at open *and* raises the prompt in the same resolution when a consent task is pending, and
`REQ-WORKSPACE-083`'s prompt "lists the runnable tasks" — which includes the task that has just started
itself. Two separate things were wrong once the user answered:

- A run computes each outcome patch from the state it began with, and the patch replaces both lists
  wholesale (`REQ-CONFIG-050`). So the skip written seconds earlier was gone the moment the task
  finished. The repair is a `reread` port on the execution: the persisted state is read again
  immediately before each recording, so the one writer writes over what is actually there. *(Superseded 2026-09-29,
  "Fourth round": a read taken before the write, outside the order the writes land in, still missed a skip whose write
  was in flight; the recording is now built inside its turn of one marker-write queue, `ExecuteDeps.commit`.)*
- A task the live run is **attempting** is not the user's to skip at all: `REQ-WORKSPACE-084` owes every
  attempted task exactly one outcome, and a skip is not that outcome. The coordinator now drops such ids
  from a skip and says so in the log.

It needed a task that takes real seconds, a prompt raised in the same breath as the run that started,
and a user answering in between. Both halves are now pinned by direct regressions
(`packages/config/src/init/init.test.ts`, `apps/desktop/src/main/initialization.test.ts`).

**(3) The dialog was in the DOM and not on screen.** `REQ-WORKSPACE-106` asks for a **non-modal**,
window-level dialog, and every other dialog in this application is positioned by its `.dialog-backdrop`
(`position: fixed; inset: 0`) — which is exactly what a non-modal surface may not have, since it would
swallow the clicks that must keep working. Drawn as `.dialog` alone the panel joined normal flow at the
end of the body, below the shell's own full-height grid. `pnpm init-proof` read its headline, its intro
and its task card's status word and passed on all three; the **screenshot** is what showed a user with a
disabled Send control, a tooltip explaining why, and no window anywhere. This is UIR-014's class — a box
that exists and cannot be seen — and no unit test in 1,870 could have caught it. The proof now asserts
the dialog's rectangle is on screen *and* that hit-testing its own centre lands inside it.

**(4) "Project setup finished" over a card reading "Pending".** The dialog's four states were derived
from the run report alone, and **a run that reported every task it attempted is not the same as
everything the dialog offered being resolved**. On a fresh workspace `REQ-WORKSPACE-083` starts the
background task *and* raises the consent prompt in the same resolution, so the background run finishes
while the consent task is still unanswered: the dialog headlined the done state, showed the card as
Pending beside it, and offered only **Close** — which would have closed an owed decision with no
decision, against `REQ-WORKSPACE-107`. The state now takes the count of listed tasks still pending, and
a reported run with something still owed stays in the prompt state, which is what it is.

**Two things the harness taught.** A `>>selector@~ms` reading is only as good as its selector: probing
on `.workspace` returned `null` for a control that had not mounted yet, and the assertion `!== true`
passed on that `null` — a reading that proved nothing while reading green. Both were repaired by naming
the element the assertion is about (`[data-testid="composer-send"]`, `[data-init-state="completed"]`)
and by asserting the value, not its negation. And the bundled runtime is a per-checkout artifact
(`apps/desktop/resources/code-intelligence/`, 193 MB, gitignored): a worktree without it runs the task,
fails the first stage with exit 127, and reports it correctly — which is the specified behaviour, and is
not a proof of the happy path.

**Nothing is deferred to another host.** Every behaviour in this record is demonstrable on `win32` and
was demonstrated there; no implementation condition is raised and none is discharged. **IC-7 is
untouched**: running `project create` for real is the first time the product's own flow provokes the
language-server question that condition describes, and the observation is recorded without changing it.

## On Linux as root — 2026-09-28 (`pnpm init-proof`, R-062): a third order of the same race

**The race of finding (2) has a third order, and on Linux the product lost it.** Finding (2) covered a skip answered
**while** the background task ran. On Linux under Xvfb the window mounts fast enough that a skip can land **before** the
task has started. The window reads the state as it mounts, which shows a consent task pending and no run in progress,
so it opens the dialog. The automatic resolution comes 800 ms after the workspace is acknowledged (REQ-WORKSPACE-141's
slot). `init-proof`'s Escape, pressed as soon as the dialog exists, landed about 100 ms before the resolution in every
run measured, the sweep's and this reproduction's. The skip recorded both listed ids, the resolution found nothing
pending, and `code-intelligence-setup` never started: against REQ-WORKSPACE-083's "an immediate-start list regardless
of whether a prompt is also due" and REQ-WORKSPACE-088's "starts by itself when the workspace opens". Scenario 3b caught
it at the sidebar hint (`../../defects/fixed/a-skip-answered-before-the-open-resolves-swallows-the-background-task.md`).

**A first repair, withdrawn before it merged, read the specification against its text.** It kept the open's pending
background task out of the skip until the resolution had started it. That is not finding (2)'s reading moved one step
earlier. Finding (2) rests on REQ-WORKSPACE-084, which owes an **attempted** task one outcome, and a task that has not
started is not attempted. REQ-WORKSPACE-086 ("Skipping SHALL record every given pending task id as skipped") and
REQ-WORKSPACE-111 ("SHALL persist the listed task ids as skipped") both name that id, which the prompt of
REQ-WORKSPACE-083 lists and REQ-WORKSPACE-106 draws a card for. The earlier text here also said a dialog raised before
the resolution "is not itself against a requirement". That was a reading, not a finding: REQ-WORKSPACE-083 makes the
prompt request a product of the resolution, and REQ-WORKSPACE-141 puts the resolution in the interactive slot.
**OQ-122** now carries the question.

**The repair built follows the specification's order (revised 2026-09-29).** The prompt a skip answers is a product
of the open's resolution. So a skip that arrives before the open's one automatic resolution performs that resolution
first, or waits for the one already under way. That resolution starts the background task as REQ-WORKSPACE-083
requires. The task is then attempted, and finding (2)'s REQ-WORKSPACE-084 reading leaves it out of the skip. Every
other given id is recorded as REQ-WORKSPACE-086 says, including the background task when the resolution started
nothing. The 800 ms slot then finds the open's one automatic resolution made and makes no second one
(REQ-WORKSPACE-102). A skip is the window's own answer, so the window is accepting input when it arrives. The mount
read and the dialog are unchanged. `initialization.test.ts` pins three cases: a skip before the slot, a skip while
the slot's resolution is checking applicability, and a skip whose resolution starts nothing. The first two fail on
both earlier coordinators, and the third fails on the withdrawn one. `init-proof` asserts that the background task
started beside the consent prompt and was recorded completed. It passed three runs in a row as root under Xvfb
(170 s each). In each run the Escape again came before the slot, the log shows the resolution run first and the
skip leaving the running task out, and no second resolution followed. The withdrawn repair had passed the same
proof three times, so the proof alone could not tell the two readings apart; the unit cases can.

**Not shown:** the Windows order after the change. No proof run landed a skip while the resolution awaits the
applicability check; only the unit case covers that interval. *(Corrected 2026-09-29: the "three runs in a row"
above did not reproduce. The resolution-first order was not merely unmeasured on Windows. It went red on Linux, as the
next section records.)*

**Second round (2026-09-29): the dialog drew the background run as its own.** The fix round's verifier ran the proof six
times at `0551f33`, with another agent's proofs on the host. It went red twice, once in each order. In both, the dialog
read the one run report the coordinator publishes and so took the **background** run as its running state. When the
skip performed the open's resolution first, the dialog switched to "Running" beneath the user's own Escape, before the
skip answered. When the resolution came first, the dialog was already running when Escape arrived, ignored it, and
recorded no decision. That is against REQ-WORKSPACE-103 ("nothing renders their progress live") and REQ-WORKSPACE-107
(Escape "SHALL resolve as a skip"). The window also lifted the composer gate for any run in progress
(`../../defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md`). Main cannot order a push behind a
command's reply, so the repair is in what the window draws, not in holding main's publishes. The state carries
`backgroundRun` beside the report, and REQ-WORKSPACE-105's nine values are unchanged. The dialog draws that run only
once Initialize is pressed (REQ-WORKSPACE-110's flip). A background run neither withdraws the setup prompt nor lifts the
gate (`setupPromptDue`, **OQ-123**). `init-proof` now reads the dialog before its Escape, and no assertion changed.
**Measured** as root under Xvfb on Linux, Node 24, on 2026-09-29, after one `pnpm build` at `19aef49`:
`init-proof --skip-build` passed six runs in a row (175, 175, 172, 172, 173 and 173 s), all five scenarios. At the end
of the runs, another agent's Electron processes on the host numbered 0, 6, 9, 9, 16 and 16. The runs took three orders.
In run 1 the resolution came first and the background run was live 74 ms before the dialog was read: the verifier's
red order. In run 2 the dialog was read first, and the resolution and background start landed before the Escape. In
runs 3 to 6 the Escape came first, and the skip performed the resolution. Every reading gave "Set up this project?",
the two-task intro, the card word Pending, the dialog visible and Send disabled. Every Escape was recorded as `skipped
verification-consent`, and `code-intelligence-setup → success` followed 1.7 to 2.5 s later. Every reopen read "Not run
yet: Verification consent task." **Not shown:** the Windows orders; a live background run
flipped by Initialize in the built app (REQ-WORKSPACE-110 is pinned by unit cases only); and a skip naming a task
completed a moment earlier. That last one was first recorded, not repaired, and is repaired in the next section
(`../../defects/fixed/a-skip-can-move-a-completed-task-into-skipped.md`).

**Third round (2026-09-29): the second round made a completed task skippable.** The fix round's verifier found that
the second round opened the path its own note had called a few milliseconds wide. The dialog now stays in its prompt
state, with Skip and Escape live, for the whole background run. And `skip` awaited `resolve(true)` before filtering,
which on a resolved open is a view recomputed through the run host's `setup.status()`. A background run that ended
inside that read was recorded completed, and the skip then **moved** it into `skipped` (`recordPatch` moves an id
between the lists). The verifier reproduced it with the coordinator's harness. That is against REQ-WORKSPACE-086 ("every
given **pending** task id") and REQ-WORKSPACE-084 (a success "is recorded as completed"). **The repair:** a skip after
the open's resolution awaits that resolution and reads nothing more. A skip before it still performs it (OQ-122). After
the last await, in one turn, the skip leaves out an id the live run is attempting and an id already recorded
completed. A run clears `attempting` only after its outcome is in the state, so the two cannot disagree. *(Falsified
2026-09-29 by the fourth verifier: they cannot disagree in memory, but the state reaches the run's outcome only when its
write returns, and the skip wrote from that state, so its patch could land after the run's and empty `completed`; see
"Fourth round".)* An id no longer
applicable is not dropped: that would need the read the repair removes, and the view shows no inapplicable id either
way. Two cases in `initialization.test.ts` fail on the code before the repair. The second also fails with the first
change alone, so it pins the completed filter. REQ-WORKSPACE-105's "any run" reading in `packages/config/src/init/sets.ts`
(`promptDue`, reached only by its own test) was retired, so `setupPromptDue` is the one reading (OQ-123). **Measured** as
root under Xvfb on Linux, Node 24, after one `pnpm build`: `init-proof --skip-build` passed three runs in a row (173 s,
173 s and 172 s), all five scenarios. At the end of run 3, another agent's Electron processes numbered 11; there were
none before that. In run 1 the dialog was read first. The resolution and the background start followed, and then
Escape: the skip after the resolution, the path this round repaired. In runs 2 and 3 the Escape came first, and the skip
performed the resolution. Every reading gave "Set up this project?", the card word Pending, the dialog visible and Send
disabled. Every Escape recorded `skipped verification-consent` and left the running task to its run, and
`code-intelligence-setup → success` followed 1.8 to 2.0 s later and stayed completed on disk. Every reopen read "Not run
yet: Verification consent task." **Not shown:** a built-app run in which the background run ends inside a skip; only
the unit cases hold that interval. Also not shown: the Windows orders, and REQ-WORKSPACE-110's flip in the built app.

**Fourth round (2026-09-29): the third round's reason held in memory and not in the file.** The fix round's fourth
verifier found that a skip and the background run's recording could still erase each other. Both write a patch that
replaces the two lists whole (REQ-CONFIG-050). The skip built its patch from the coordinator's `state`, which reaches the
run's outcome only once the run's write has returned. The run built its patch from a `reread` taken before its write, and
that read could miss a skip whose write was still in flight. With a harness whose marker writes land in the order sent,
the verifier showed both orders. (A) A skip while the run's completion write was in flight left the file with
`completed: []`, against REQ-WORKSPACE-084. (B) A skip whose write was in flight when the task finished left it with
`skipped: []`, so the prompt would return on the next open, against REQ-WORKSPACE-111 and REQ-WORKSPACE-086. The second
round had made both reachable by keeping Skip and Escape live for the whole background run. The third round's sentence
above is kept with its falsification beside it. **The repair:** the coordinator makes every marker write through one
queue (`InitializationCoordinator.marker`), one at a time in the order asked, and hands each turn the file as the
previous write left it. The skip decides what it leaves out and builds its patch inside its turn. Each of a run's
recordings is built inside its own turn (`ExecuteDeps.commit`, which replaces the first execution's `reread`), and so is
the silent stamp. REQ-WORKSPACE-085's one writer is unchanged: it is still main's coordinator. The coordinator's harness
now applies marker writes in the order sent and can hold them. Two new cases pin the two orders, and both fail on the
code before the queue. Under the ordered harness, the third round's first case also fails on that code, by order (B).
**Measured** as root under Xvfb on Linux, Node 24, after `pnpm symbols` and one `pnpm build`, after `origin/main` was
merged in: `init-proof --skip-build` passed two runs in a row (171 s and 172 s), all five scenarios. Another agent's
Electron processes were on the host for parts of both runs (none at the start of run 1, 14 at its end, 11 at the end of run 2). Run 2 took the
Escape-first path. The skip performed the resolution, and the background task started 7 ms after the skip arrived. The
skip left that task to its run, recorded `skipped verification-consent` 46 ms after arriving, and
`code-intelligence-setup → success` followed 2.0 s later. The workspace file then held `completed:
[code-intelligence-setup]` and `skipped: [verification-consent]`. Run 1's app log was overwritten by run 2, so its path is
not recorded. `code-intel-proof --skip-build` passed twice (526 s and 525 s). **Not shown:** a built-app run in which the
run's completion write and a skip's write are in flight together. Only the unit cases hold those orders. Also not shown:
the Windows orders.

**Fifth round (2026-09-29): one queue per workspace root.** The fourth round's queue was one for the whole
coordinator. Each root's marker is its own file, written by that root's own workspace service (`config.setField`), so
nothing orders one root's writes against another's; but one coordinator-wide queue did. After a workspace switch, whose
resolution "SHALL NOT wait on the cancellation to finish" (REQ-WORKSPACE-013), the new workspace's silent stamp or skip
could queue behind the outgoing workspace's last recording, which can take the whole 30 s write timeout. The queue is
now one per root (`InitializationCoordinator.markerQueues`, keyed by the workspace root and dropped once its last turn
settles); within a root every guarantee the fourth round stated holds unchanged. The fourth round's "one queue" is kept
as written above. The coordinator's harness now orders marker writes per root, as the real per-workspace services do,
and a new case, "lets a newly opened workspace record while the previous workspace's marker write is still in flight",
fails on the coordinator-wide queue and passes on the per-root one. The same round corrected the runtime view's
`initialization:` bullet, which still gave the first execution's re-read and its falsified reason; the old sentence is
kept there, marked superseded. **Measured** as root under Xvfb on Linux, Node 24, `--skip-build` after `pnpm symbols`,
a green `pnpm check` and one `pnpm build` of the per-root queue, with `origin/main` already merged: `init-proof` passed
two runs in a row (171 s and 172 s), all five scenarios, each ending with the skip's workspace file holding
`completed: [code-intelligence-setup]` and a reopen reading "Not run yet: Verification consent task."; `code-intel-proof`
passed twice (523 s and 525 s). Another agent's Electron processes (8 to 11) were on the host through all four runs.
**Not shown:** a built-app run with two workspaces' marker writes in flight together; only the unit case holds it.

**Sixth round (2026-09-29, R-067): the switch-time cancellation, executed for the first time.** REQ-WORKSPACE-013
cancels a background run still under way in a switch's outgoing window, on REQ-WORKSPACE-109's terms, and records
nothing for it. The coordinator had `close` for it from the start, and nothing called it: main's workspace-open path
called only `open` and `resolve(true)`, so a switch left the outgoing run going, its outcome was still recorded, and a
return to the same root found that entry's automatic resolution spent, against REQ-WORKSPACE-102
(`../../defects/fixed/a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`). `MainWindows` now reports a
workspace once no live main window holds it (`workspaceClosed`), and main calls `close`. `close` marks the entry closed
before it aborts the run: the run's recordings are refused inside their turn of the marker queue, so a task under way
that ends in success after the switch records nothing either — REQ-WORKSPACE-013's "nothing SHALL be recorded for the
cancelled run" is the stronger clause for a switch, where REQ-WORKSPACE-109 alone would record it. Nothing of the
closed entry is published on channel 12, which reaches every window, and no banner is raised for it. **Measured** in
the built app by `workspace-proof`'s scenario 8b, as root under Xvfb on Linux, Node 24, `--skip-build` after one
`pnpm build`: two projects whose `code_intelligence` entry is a stand-in runtime holding `project create` for 90 s. On
the build without the change, four of the scenario's five checks failed: no cancellation was asked, the step's process
was still running 5 s after the switch, the replacement's setup was refused as already running — and reported as "not
a local launch" — and a return to the first project started nothing. With the change all five passed, the step's
process gone 201 ms after the switch answered, and the proof's 39 checks passed. **Found by the execution:** the
replacement's refused start. The run host holds one setup at a time, and a replacement opened while the outgoing setup
is still ending can be refused; the next round serialises the coordinator's setups
(`../../defects/fixed/a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md`). **A reading, not a
clause:** `workspaceClosed` fires whenever no live main window holds a workspace any more, which also covers a plain
close of one of several windows (PD-SHELL-001), a replacement closed after a veto, and a run the user started;
REQ-WORKSPACE-013 names none of the three, and the build applies its rule to all of them. That reading is raised as
[OQ-141](../open-questions.md), not taken as settled. **Also corrected in verification:** main's setup port had
dropped a cancellation it could not deliver — with no window holding a workspace it sent nothing, and a refusal from the
run host was taken as delivered. The port now rejects in both cases (`deliverSetupCancel`), so the coordinator logs it.
**Found by the second verification, and repaired in it:** a close — or a Cancel — that lands while the setup's start
request is still in flight to the run host aborts the run before the follow listens for the abort, and an aborted signal
fires no more: no cancellation was sent, the outgoing setup ran to the end of its stages (300 / 1800 / 120 s budgets)
against REQ-WORKSPACE-092, and the seventh round's one-at-a-time order held the replacement's setup behind it for all of
that time. The follow now sends the cancellation at once when it finds its signal already aborted and its setup not yet
finished; two cases in `initialization.test.ts` ("cancels the setup of a workspace closed while its start request is in
flight, …", and of a run the user cancels in the same interval) fail without it, each with no cancellation sent.
**Not shown:** the Windows orders; a plain close of one of two windows with a run under way, which only the unit cases
hold; a close landing while the start request is in flight, which only the unit cases hold.

**Seventh round (2026-09-29, R-067): one setup at a time.** "Pushed, not polled" above holds, with a condition it left
unstated: the run host holds **one** setup and pushes `mcp.setupStatus` with no workspace on it, and the coordinator held
one step sink for all its runs, which a run's `finally` cleared unconditionally. Once `close` was called, two of the
coordinator's runs could overlap across a switch: the replacement's start was refused while the outgoing setup was still
ending, or its follow took the outgoing setup's cancelled finish as its own; and the outgoing run's end cleared the
replacement's sink, so its steps were never reported and its run never ended (REQ-WORKSPACE-109, REQ-WORKSPACE-084;
`../../defects/fixed/a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md`). The coordinator's
setups are now one at a time (`setupTurn`): a run's `code-intelligence-setup` starts once the setup before it has ended,
and a sink is cleared only by the follow that set it. The wait is the task's, inside the run, so the replacement's
resolution still returns at once (REQ-WORKSPACE-013); a run cancelled while it waits starts nothing and fails
retryably (REQ-WORKSPACE-093). **Measured** by `workspace-proof`'s scenario 8b, its stand-in now taking 2 s to end once
asked to terminate: on the build with only the sixth round, the replacement's start was refused and its check failed;
with this round the replacement logged that it waited, its setup started 2 ms after the outgoing one was cancelled, its
outcome was recorded, and all 39 checks passed (as root under Xvfb on Linux, Node 24, `--skip-build` after one
`pnpm build`). **Found by the round's verification, and repaired in it:** the one-at-a-time order lets the next run's
setup start as soon as the setup before it has ended, while the run that owned that setup is still recording its outcome
(a marker write can take up to its 30 s timeout). The follow's abort listener outlived the follow, and the run host's
cancel is not a workspace's but its one setup's, so a `close` — or a Cancel — landing on the earlier run in that interval
cancelled the **next** workspace's setup, against REQ-WORKSPACE-013's "independently of the outgoing one" and
REQ-WORKSPACE-084/109. Reachable by PD-SHELL-001's two windows, or by a switch whose outgoing close lands after the
replacement's 800 ms resolution. The follow now removes its abort listener when its setup finishes, so a run's abort
reaches the run host only while that run's own setup is live; two cases in `initialization.test.ts` ("leaves the next
workspace's setup running when …", on a close and on a Cancel) fail without it. **Not shown:** a setup the MCP settings category starts beside a background run, which is not one of the
coordinator's and is still refused (`../../defects/a-refused-setup-start-is-reported-as-not-a-local-launch.md`); the
Windows orders.
