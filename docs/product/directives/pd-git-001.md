[Product directives](../directives.md) › PD-GIT-001

<a id="pd-git-001"></a>

### PD-GIT-001 — isolation counts the runs that could share the launch's working tree

In REQ-GIT-119, REQ-GIT-120 and REQ-MONITOR-251, a run SHALL count as active for a launch or a continue in a workspace when
it is active (REQ-SHELL-122's test) and either **belongs to that workspace**, whatever tree it runs in, or **writes in a tree
that is that workspace's folder, lies inside it or contains it**. Paths are compared whole component by component under the
canonical rule, so `/repo2` lies neither inside `/repo` nor around it. A run of an unrelated project never counts. Concretely:

- **One count, asked of the run host by main.** Main asks it with the window's workspace; the launch path and the dialog
  read the same answer, and nothing else decides either.
- **The launch dialog shows main's answer when it opens.** Above zero, or a count that cannot be read: the isolation
  checkbox is pre-checked and disabled with REQ-GIT-119's tooltip and hint. Otherwise it is unchecked and enabled, with
  REQ-GIT-118's normal hint.
- **`session.start` forces the default tree on the same answer** for a launch without an explicit tree, a count that cannot
  be read forcing it too; and every time it forces the placement it raises an informational notice scoped to the new session
  whose message is REQ-GIT-119's hint and whose detail names the branch actually made — so a run that became active after
  the dialog opened never places a session where the person did not see it go.
- **REQ-GIT-120's refusal to continue a base-tree session** (one with no worktree binding, its Branch `—`) is built on the
  same count with that session excluded, at every path that starts a further run of it — a message to it at rest, Continue,
  the retry, the plan gate's relaunch — with REQ-GIT-120's text. Loading or focusing a session stays allowed (PD-SHELL-002).

REQ-GIT-124 (the integration's own per-workspace count), REQ-MONITOR-256 (already narrowed by PD-ORCH-005) and
REQ-MONITOR-258 (whose launch clause cites REQ-MONITOR-251) are cited as support and left as they are.

**Why, and what it costs.** OQ-224 (the consortium's GI1). The dialog and main disagreed: the dialog locked for a busy
session of its own workspace, main forced a worktree for a run in any project, so an idle project's launch shown on the base
tree landed in `.rotaris/worktrees/<id>` on a branch nobody chose, its edits missing from the checkout the person looks at
until an integration (REQ-GIT-124/125) merged them; and in a plain folder, a repository with no commit, a detached HEAD or a
subfolder workspace the forced launch failed (REQ-GIT-006), about a run in another window. The requirements were written when
one instance held one workspace, so every run then could share the tree; PD-SHELL-002 already locks the dialog "while any
run is active in the workspace" and leaves "a window of another project … untouched". What it costs: REQ-GIT-120's literal
"any" and REQ-MONITOR-251's "second concurrent launch" no longer hold across projects; a workspace opened inside another open
workspace is locked whenever the outer one runs on its base tree, and since isolation needs a Git root (REQ-GIT-006) a launch
there can then only fail or attach, as a non-Git workspace's launch already does while its own run is active; a run started
after the dialog opened still places the launch in a worktree, which the notice now says; and continuing an old base-tree
session while another base-tree run of the same project executes is refused, which no user has met before.

> **Narrows:** REQ-GIT-119, REQ-GIT-120, REQ-MONITOR-251

*Raised under the owner's delegation, 2026-10-07, ruling OQ-224 (the consortium's question GI1, both advocates followed);
logged as [R-072](../requests.md#r-072).*

> **First execution, 2026-10-07, built under [R-072](../requests.md#r-072) (fin29):** the directive held as written, and two
> claims the record carried were false. **Found:** `session.start`'s forced isolation asked the instance's count, a reading
> fin28's repair round 1 made deliberate (`32ac0c0`), now kept falsified beside its replacement in PD-SHELL-009's first
> execution, ADR-0013's sixth execution and the process view; and REQ-GIT-120's refusal to continue a base-tree session was
> not built at all
> ([`a-base-tree-session-continues-beside-another-run-in-its-workspace.md`](../../defects/fixed/a-base-tree-session-continues-beside-another-run-in-its-workspace.md)).
> **As built.** `Sessions.activeRunsSharing` and `treesOverlap`, and `baseTreeBusy` with `BASE_TREE_BUSY_REFUSAL` at the four
> paths that start a further run of a session (`packages/engine/src/sessions.ts`); `runs.active`'s `scope: 'sharing'`
> (`packages/contracts/src/process-protocol.ts`, `apps/desktop/src/run-host/dispatch.ts`); `session.newId`'s
> `isolationRequired` and `session.start`'s force and notice (`apps/desktop/src/main/commands/session.ts`), the hint one text
> in `ISOLATION_REQUIRED_HINT` (`packages/contracts/src/commands.ts`); `isolationRequiredOf` (`packages/ui/src/StartSessionDialog.tsx`)
> read by the renderer's launch dialog. **What was measured.** `commands/session.test.ts` (an idle project's launch shares its
> own base tree while another project runs; a sharing run forces the worktree and raises the notice; an unreadable count
> forces; `session.newId`'s three answers), four cases red on the source before; `run.test.ts`'s PD-GIT-001 cases (the overlap
> rule by component and case, the count over same, inner, outer and unrelated roots with the outer isolated run not counting
> for an inner folder, and the refusal: refused for the prompt, the retry and Continue beside a base-tree run of the same
> workspace with nothing written, allowed beside an unrelated project's run, after that run ended, and for an isolated session,
> the load allowed throughout), red with the refusal removed; `dispatch.test.ts`'s `sharing` hop; `start-session-isolation.test.ts`
> (the dialog locked, unlocked, and locked on an answer that does not say). Driven: `pnpm part-j-proof`'s two-window launch,
> where with A's project running, B's dialog read unchecked and enabled with REQ-GIT-118's hint, and B's unchecked launch ended
> `completed` on B's base tree with no worktree binding (B is no Git repository, so under the instance-wide force it could not
> have started). **What was not measured.** The running window's dialog locked in the built app (A's run is held at its approval
> dialog there, which is modal; the lock is pinned by the dialog and command cases), the forced-placement notice in the built
> app (no proof starts a run between a dialog's opening and its acceptance), and the refusal driven through the UI. The row is
> in [`../architecture/first-executions.md`](../../architecture/first-executions.md). *Found by the landing gate (fin29's
> review):* the refusal met two cases the build had not run, `children.test.ts`'s PD-ORCH-005 clause 4 and clause 6, which
> continued a paused base-tree session in `C:/ws` beside a second base-tree run of `C:/ws` — exactly what REQ-GIT-120 now
> refuses. What they pin is REQ-CONFIG-094's per-model cap across the process, so their second session is now another
> project's (`C:/other`), and both pass; the refusal itself stays pinned by `run.test.ts`.
