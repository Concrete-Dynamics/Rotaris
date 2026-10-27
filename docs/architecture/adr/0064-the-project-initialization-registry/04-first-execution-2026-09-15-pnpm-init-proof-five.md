# ADR-0064 — Project initialization: a task registry in `config`, one marker writer in main, and the work delegated to whoever can do it — First execution — 2026-09-15 (`pnpm init-proof`, five scenarios, all passed)

Part 4 of 6 of [ADR-0064](../0064-the-project-initialization-registry.md), which indexes every part.

## First execution — 2026-09-15 (`pnpm init-proof`, five scenarios, all passed)

**Four defects. Two of them are in the surface this part drew, and the screenshot found both while every
DOM assertion beside them read green on the same frame.** Everything else
this record expected to check held first time: the five set derivations including the both-lists-at-once
rule, `REQ-WORKSPACE-082`'s prompt condition, the silent marking of a workspace with nothing applicable,
`REQ-WORKSPACE-084`'s "no task cuts the run short", `REQ-WORKSPACE-085`'s marker-write downgrade,
`REQ-WORKSPACE-086`'s stamp on an empty skip, `REQ-WORKSPACE-105`'s set-wise equality,
`REQ-WORKSPACE-114`'s six-state precedence, and the full gitignore grammar.

> **Corrected 2026-10-07 (fin30), the falsified claim kept above:** "the full gitignore grammar" held for the patterns
> this proof wrote, not for re-inclusion beneath an ignored glob. Every rule carried a descendant suffix and a
> directory-only rule was never asked about a file, so `gen/*` then `!gen/keep/` dropped `gen/keep/f.ts`, which git keeps,
> from the contains-code walk and the search tools alike, and `a**b` matched across a slash. The reader now answers in
> git's order, ancestors first
> ([note](../../../defects/fixed/a-re-included-directory-under-an-ignored-glob-keeps-its-files-ignored.md)).

**(1) Classification was decided by the runtime's own extension list, not by this domain's.** The
contains-code test that gates a 1800 s indexing stage matched against
`CODE_INTELLIGENCE_MANIFEST.extensions` — **152 suffixes** generated from serena-agent 1.7.0's language
coverage. `REQ-WORKSPACE-099` fixes the set at **exactly 23**, overridable per workspace through
`project_init.source_extensions`, and says "the same set SHALL apply everywhere classification is
decided"; `REQ-WORKSPACE-091` then binds the two skipped stages to "a workspace classified `non-code`
(REQ-WORKSPACE-098)". The two sets disagree in both directions on real trees — a workspace of `main.tf`
and `deploy.sh` is `code` under the manifest and `non-code` under the specification. **The falsified
reason is kept beside its replacement** in `run-host/mcp.ts`. Found while building, not by the proof;
recorded as `docs/defects/fixed/classification-decided-by-the-runtimes-extension-list.md`, which also carries
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
