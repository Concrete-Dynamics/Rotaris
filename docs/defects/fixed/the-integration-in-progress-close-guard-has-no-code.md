## The "Integration in progress" close guard has no code

REQ-SHELL-119 orders three window-close guards: (1) unsaved settings, (2) "while a worktree integration is running, the close
is refused unconditionally by an informational dialog titled "Integration in progress"", and (3) active runs. REQ-SHELL-021
and REQ-STARTUP-053 put the same second gate in the workspace chip's and the chooser's flow ("Finish the worktree integration
before opening another project."). Nothing in `apps/` or `packages/` implements guard (2): on `fin46-accept1-9` (base
`907415e`, 2026-10-14) a search for `Integration in progress`, `Finish the worktree integration`, `worktree.integrate` and
`integrating` finds only `MERGE_STATUSES`'s unread `'integrating'` member (`packages/contracts/src/repository.ts`). No close
path, no chip path and no update path (OQ-311's sequence, built the same day) reads an integration state, because the product
has none to read: worktree integration and "Merge selected" (REQ-GIT-083, REQ-GIT-125..135) are deferred from the first
release ([`first-release-plan.md`](../../architecture/first-release-plan.md), "Deferred by "thats it"": "Git integration and
merge"). The guard is therefore vacuous until integration is built, and its absence changes no behaviour today.

The record also says more than the code holds: [`codebase.md`](../../architecture/codebase.md) states that REQ-SHELL-021's
second gate "is written in its place in the fixed order as an explicit no-op that names the state it would read"; no such
no-op exists in `apps/desktop/src/main/` (`close-confirmation.ts`, `main-windows.ts`, `index.ts`), so the gate's place in the
order is held by nothing a later builder would find.

Confirmed 2026-10-14 by fin46 (`fin46-accept1-9`) at OQ-311's ruling's request (its advocate B reported no code for guard (2)),
outside that ruling's repair: recorded, not repaired.

## Specs

- `REQ-SHELL-119` guard (2) — a close is refused while a worktree integration runs; no code implements it.
- `REQ-SHELL-021` gate (2), `REQ-STARTUP-053` gate (2) — the chip's and the chooser's same gate; no code implements it.
- `REQ-GIT-083`, `REQ-GIT-125` to `REQ-GIT-135` — worktree integration itself, deferred from the first release; the guard
  becomes reachable only when they are built, and must be built with them.

## Relevant files

- `apps/desktop/src/main/close-confirmation.ts`, `apps/desktop/src/main/main-windows.ts` (`guardClose`, `askUnsavedInTurn`),
  `apps/desktop/src/main/index.ts` (the chip's gates and the updater's `confirmUnsaved`) — where guard (2) would sit, between
  guard (1) and guard (3).
- `packages/contracts/src/repository.ts` — `MERGE_STATUSES`, whose `'integrating'` member nothing reads.
- `docs/architecture/codebase.md` — the "explicit no-op" sentence the code does not bear out.

## Outcome — repaired 2026-10-15 (fin47, `fin47-guard-and-support`)

The guard is built in its place in both fixed orders, and refuses nothing in this build because nothing can integrate a worktree.
`apps/desktop/src/main/integration-guard.ts` holds the requirement's texts and the guard: `integrationInProgressBox()` (an
informational box titled `Integration in progress`, its body `Keep Rotaris open until the isolated worktree integration finishes.`,
acknowledgement its only answer), `integrationAllowsClose` (while an integration runs the box is shown and the close refused,
whatever the answer and even when the box cannot be shown), `integrationDeclinesWorkspaceOpen` (`Finish the worktree integration
before opening another project.`), and `noWorktreeIntegration`, the product's reader, which answers none running and names the state
it stands for: a worktree binding whose `merge_status` is `'integrating'` (`MERGE_STATUSES`), a status nothing writes while
REQ-GIT-083 and REQ-GIT-125 to REQ-GIT-135 are deferred. The builder of integration replaces that one reader.

- **The close** (REQ-SHELL-119 guard (2)): `guardClose` (`apps/desktop/src/main/main-windows.ts`) takes `integrationAllows` and asks
  it after the renderer's unsaved-settings guard and before the active-run confirmation; the Electron adapter's
  `integrationAllowsClose` dependency is wired in `apps/desktop/src/main/index.ts` over `askBox` and the closing window. The
  application's quit asks none of the three (OQ-298).
- **The chip and the chooser** (REQ-SHELL-021 gate (2), REQ-STARTUP-053 gate (2)): `MainWindows`'s workspace-open gates ask the
  required `integrationRunning` dependency between gates 1 and 3, declining with the transient error notification and the
  requirement's sentence. PD-SHELL-001's add route evaluates no gate, this one included.

What the requirement leaves open beyond a person's close of one window — the update's closes, one of several windows, and a state
that cannot be read — is raised as [OQ-361](../../archive/architecture/open-questions/63-spikes-and-later-questions-30.md#oq-361), with the reading the build proceeds under.

**Pinned** by `apps/desktop/src/main/integration-guard.test.ts` (the box, the refusal, a box that cannot be shown, an unreadable
state, the decline's sentence, the product's reader) and two blocks of `apps/desktop/src/main/main-windows.test.ts`: "REQ-SHELL-021's
gate 2 …" (declined after gate 1 and before gate 3 with no chooser, no switch and nothing persisted; gate 1 first; none running goes
on to gate 3; a window holding no workspace declined too; the add route asks no gate) and "a person's close asks REQ-SHELL-119's
three guards in their fixed order …" (refused by guard 2 with guard 3 unasked; allowed, guard 3 decides; guard 1 first; guard 2
without guard 3; a throwing guard 2 keeps the window; the quit's `ask` is the renderer's alone). Against the unrepaired
`main-windows.ts` seven of those cases fail (the chip goes on to gate 3 and the chooser; the close skips guard 2).

**Shown** by `pnpm workspace-proof`, whose gate 3 check now passes through gate 2 on the built app (a `workspace.choose` with a run
active is declined with gate 3's sentence, so gate 2 answered none running); its stated skip for gate 2 says the gate is built and
why it cannot decline in this build. No proof can drive the refusal itself until integration exists.

The record's sentence in `docs/architecture/codebase.md` that said the gate was "written in its place … as an explicit no-op" when
nothing was is corrected in place, the old sentence kept beside it; `02-process-view.md` names guard 2 in the close's order.
