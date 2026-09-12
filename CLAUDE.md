# Rotaris-crw — clean-room rewrite

This repository is the **clean side** of a clean-room reimplementation. Everything here must be
traceable to approved behavioral specifications, approved architecture decisions, public technical
documentation, or approved design material.

## Hard boundary — applies to every agent and session working in this repository

Do **not** read, clone, fetch, search, or quote from any of the following, for any reason:

- `https://github.com/Concrete-Dynamics/Rotaris` or any mirror, fork, or package of it
- `D:\Development\Apps\Rotaris` (a local checkout of that project)
- `D:\Development\Apps\Rotaris-cleanroom-sealed\` (the sealed reference clone and raw analysis)
- any transcript, scratchpad, or report produced by an agent that read the above

If a task seems to require one of those sources, it does not. Raise the gap as an open question
against the relevant requirement instead. Convenience, speed, and implementation difficulty are
never valid reasons to cross the boundary.

## Approved inputs

- `docs/product/` — product directives (`PD-<DOMAIN>-<NNN>`), which **govern over** the requirements they name
- `docs/spec/` — approved behavioral requirements (`REQ-<DOMAIN>-<NNN>`)
- `docs/architecture/` — architecture and Architecture Decision Records
- `docs/clean-room/` — process, reference record, zone policy, provenance
- public library and platform documentation
- the approved Claude Design UX reference for information architecture and visual design
- sanitized black-box conformance feedback (observable differences only)

## When the owner asks for something

A request that would change what the product does is **classified before any code is written**, and is
logged in `docs/product/requests.md` when it is made — before the classification, not after it. The
failure this prevents is silent: a request arrives in conversation, an agent builds it, and the behaviour
lands in the product with no identifier against it, invisible to traceability and to the clean-room
argument. Five outcomes, and `docs/product/README.md` holds the table that chooses between them:

- **Covered** by a live requirement — build it and cite the `REQ` ids. Nothing is minted.
- **The specification is silent or under-determined** — an `OQ-NN` in `docs/architecture/open-questions.md`.
- **The specification disagrees with itself**, or two requirements cannot both hold — an `ESC-NN` in
  `docs/architecture/owner-decisions.md`, then an amendment round.
- **Building or measuring found the specification wrong** — an amendment round, and a row in
  `docs/architecture/first-executions.md`.
- **The specification is right and the owner wants something else** — a **`PD-<DOMAIN>-<NNN>`** in
  `docs/product/directives.md`.

**A directive governs over every requirement it names**, per identifier and never wholesale. The
specification is **never edited in place** for one: the requirement keeps its text and gains a
back-pointer blockquote saying which directive superseded, narrowed or extended it, in the same commit.
That is what keeps `REQ-` meaning *derived from the behavioural target* and `PD-` meaning *someone chose
this* — the distinction the clean-room evidence rests on. `pnpm symbols` refuses a disposition naming an
identifier the specification does not define, and marks every superseded requirement `@deprecated`.

The boundary case that will be got wrong: a request contradicting a requirement is a **directive**, not an
escalation, whenever that requirement faithfully states the behavioural target. Escalations are for a
corpus that disagrees with itself. When in doubt, log the request and classify it in writing.

## Process state

**Both gates are closed and implementation is authorized, bounded.** The Specification Gate closed
2026-08-31 (`docs/clean-room/specification-gate.md`); the Architecture Gate closed 2026-09-03
(`docs/clean-room/architecture-gate.md`). What is authorized is **the mechanism** — process topology,
the store, the run flow, the event stream, settings, permissions, the backup and the restore.

**Design material, and how to use it.** `docs/design/` holds the **approved design language** — tokens,
colour, type, spacing, radii, elevation, motion, iconography, the motif, the copy voice and 27
components. It is **adopted and authoritative**: cite the token by name, never a literal colour or pixel
value. Its **information architecture is not adopted**. Which screens exist, what is on them, what they
are called, their order and their tabs come from `docs/spec/`, where `REQ-SHELL-023` is the single
definition of the seven primary views. `docs/design/mockup/` is read **for craft, never for structure**,
and where the two disagree the specification governs without exception. `docs/design/README.md` §2 is
the adoption rule and §3.2 is the list of views still to be drawn.

**Two bounds are not waived and no agent may treat them as advice:**

- **`REQ-SHELL-128`'s three built-in themes cannot yet be met** (**IC-2**): `nocturne` and
  `high-contrast` have no palette, and the token set declares no theme metadata or native-surface
  mapping. Screens are **not** blocked — build against `rotaris-dim` and the adopted language.
- **No Linux or macOS release artifact may be produced** until the build hosts exist (**IC-3**).

`docs/architecture/implementation-conditions.md` holds **IC-1 to IC-7**. A condition binds the work it
names: that work may not be reported complete until the condition is discharged, discharging means
recording the result in the record whether or not it passed, and **no condition may be downgraded by
the person doing the work**.

**A mechanism's first execution reports back into the record that decided it**, in place, including
when it found nothing — standing policy, ruled at the Architecture Gate — **and appends one row to
`docs/architecture/first-executions.md`**, which is where the ratio that justifies this policy is read.
Nearly every mechanism that has gone from paper to first execution has held a defect no reading had caught;
the count is the number of rows in that register, written down nowhere so that it cannot go stale.
Keep a falsified reason beside its replacement; never repair it quietly in the code that meets it.

**A spike is taken as the first act of building the thing it prices**, not before and not later.

## The codebase

`docs/architecture/codebase.md` is the map: packages follow **process boundaries**, arrows point
downward only, and `eslint-plugin-boundaries` fails `pnpm lint` on a violation. Composition roots are
`apps/desktop/src/{main,preload,renderer,run-host,workspace-service}` and are the only places
`electron` is imported. Engine code takes time from the clock ports, never from globals
(`rotaris/no-bare-timers`). `pnpm check` runs the symbol generator, typecheck, lint and tests; all four
must be green before a commit. `pnpm build` then `electron apps/desktop/out/main/index.js` runs the app.

`AGENTS.md` covers the one check `pnpm check` does not reach: **`pnpm live-run`** — the built product against a
real OpenRouter key in a throwaway workspace, bounded by the provider's own accounting. It spends the owner's
money, it is never automatic, and an agent asks before running it.

## Where the work happens — a temporary branch in a temporary worktree

**Every change is built on a temporary branch in its own temporary worktree, and lands on `main` by a merge
the agent performs itself.** The primary checkout at `D:\Development\Apps\Rotaris-crw` is not a place to
write: another agent may be working in it, `apps/desktop/out` is shared by every Electron proof so two builds
in one tree corrupt each other, and a half-finished edit there is indistinguishable from someone else's. Only
trivially reversible, single-file edits to documentation may be made in place, and only when `git status` is
clean.

**Take the worktree first, before the first edit:**

```
git log --oneline -1 main                     # the merge base, read before anything
git worktree add -b <topic> ../Rotaris-crw-wt-<short> main
cd ../Rotaris-crw-wt-<short>
pnpm install --prefer-offline
node node_modules/electron/install.js         # electron's dist/ is NOT installed into a worktree;
                                              # the first proof launch fails without it
```

Branch names say what the work is (`part-<letter>-<topic>`, `fix-<topic>`). The worktree directory is
`../Rotaris-crw-wt-<short>` so it sits beside the checkout and never inside it.

**Then merge it back, and persevere.** Work is not done when the branch is green; it is done when `main` is
green with the branch in it. Abandoning a branch because the merge is hard is not an outcome an agent may
choose — the cost of an unmerged branch is paid later, by someone who cannot see what was meant.

- **Re-read `main` before merging.** It moves: the owner commits to it directly, and other lanes land. A merge
  base from an hour ago is a guess. A trailer-less commit on `main` authored by the owner is theirs — surface a
  collision with it, never reset it.
- **Resolve every conflict by reading both sides.** Conflicts here come in five shapes and only one of them is
  keep-both: disjoint blocks in one file (concatenate), a shared array or object literal both sides extended
  (merge the entries), a shared import line naming different symbols (the wider form wins, or a symbol binds
  twice), prose one side revised in place rather than added beside (splice the clause into the newer copy, or
  one side's content is silently dropped), and a real implementation against the other branch's placeholder
  (the implementation wins, or the stub shadows it). Guessing produces a silently dead branch.
- **Never `git add -A` or `git commit -a` during a merge, or in a shared checkout.** Stage the conflicted paths
  by name. Anything else picks up another agent's work or un-ignored evidence directories.
- **After a keep-both merge, run the compiler, not a sweep you wrote.** Command ids, preference keys, barrel
  re-exports, zod literal kinds, `case` labels, script names and ignore entries all duplicate silently, and
  `tsc` finds in seconds what a regex misses entirely.
- **Verify on merged `main`, never in the worktree.** `pnpm check` green in a worktree is not evidence that it
  is green anywhere: proofs that reach into per-workspace state have passed in the tree they were written in
  and failed in the primary checkout on a directory name alone. A merged product holds defect shapes neither
  half can see.
- **Remove the worktree once it is merged**: `git worktree remove ../Rotaris-crw-wt-<short>` and
  `git branch -d <topic>`, so the next session inherits a list of live work rather than a graveyard.

**Line endings are LF, everywhere, and no edit has to negotiate them.** `.gitattributes` sets
`* text=auto eol=lf`, so a checkout on Windows holds the same bytes as one on Linux whatever
`core.autocrlf` the machine carries, and `tools/check-line-endings.mjs` fails `pnpm lint` if a CRLF or
mixed blob is ever staged. Write LF and stop thinking about it.

A checkout made before that file landed still holds CRLF on disk — every worktree standing today does,
until it merges this. It is harmless while it lasts, because git normalises on the way in, and it heals in
two steps, in this order:

1. **Rewrite the files.** `git checkout-index -f` does *not* do this: it leaves an existing file alone
   whatever `-f` suggests, and only writes one it had to create. Convert them in place, or delete and
   re-check-out.
2. **`git add --renormalize .`** — which is what refreshes the index's stat cache. Skip it and `git status`
   reports several hundred unmodified files as modified while `git diff` shows nothing and
   `git update-index --really-refresh` cannot clear it: measured here, 519 files, index and disk hashes
   identical throughout.

The trap all of this replaces cost a 937-line diff for a seven-line edit. If a diff ever reports a whole
file again, `git diff --ignore-cr-at-eol --numstat` separates the endings from the content.

## The architecture views — consult before, maintain after

`docs/architecture/views/` holds the system as built from three perspectives: the **component view**
(packages and the allowed-edge matrix), the **process view** (the five processes, the message families,
the files on disk) and the **runtime view** (a run from start to teardown, the controls that reach in, the
store's tables, the configuration tiers). Two obligations bind every change to the code:

- **Consult before modifying code.** Read the view that covers the area first — the component view for a
  new dependency or package, the process view for anything that crosses a process boundary or adds a
  message, command or channel, the runtime view for the run loop, the controls, the store or configuration.
- **Maintain after modifying code.** A change that adds, removes or moves a package, an allowed edge, a
  process, a message kind, a channel, a command, a store table, a run-loop step or a control operation
  updates the affected view **in the same commit**, and updates the "last reconciled" date in
  `docs/architecture/views/README.md`. A view that disagrees with the code is a defect of the change that
  made it so, and a review may refuse the change on that ground alone.

## The design language — consult before, match after

The same pair binds every change that **draws, redraws or restyles a surface**. `docs/design/README.md` §7
states them; §2 states what is adopted and what is not, and nothing below moves that line.

- **Consult before drawing.** Run **`pnpm mockup`** and look at the surface at `http://localhost:8791` before
  writing the component. The mockup is a Claude Design export whose runtime is not in this repository; that
  command supplies the icon font, the two text faces and a picker that shows one screen at a time, so the
  design is readable instead of a stack of overlapping modals. §7's table says which section covers which
  screen. Read it for **craft** — density, composition, what is a card and what is a line, where the mono
  face carries meaning, how much air a thing gets. Never read it for **structure**: which views exist, what
  they are called, their order, their tabs and their fields come from `docs/spec/` (`REQ-SHELL-023` and the
  requirements §2 lists), and where the two disagree the specification governs, without exception.
- **Match after drawing.** A surface that could have followed the design material and did not is a defect of
  the change that drew it, on the same terms as a stale view. Tokens alone are not compliance: citing
  `--rt-surface` while inventing a container the design does not draw still fails this. Where the
  specification fixes the geometry, build the specification and say so in the code; where it fixes nothing,
  the design material decides, and a plausible invention is not a third option.

## Traceability

Implementation work cites the requirement IDs it satisfies. Commits that implement behavior
reference those IDs so requirement, decision, code, and test remain linked. Work that implements a
**product directive** cites its `PD-<DOMAIN>-<NNN>` on the same terms, and where a directive governs,
the code cites the `PD` rather than the requirement it displaced.

[`CONTEXT-MAP.md`](CONTEXT-MAP.md) is the **domain glossary**: one `CONTEXT.md` per context, each at the
package that owns that language, with the contexts drawn from the spec domains rather than from the process
split. Consult it before naming anything, and keep it current when a name changes. Three rules hold it to
this repository's terms — every term is **derived from `docs/spec/` and none is coined**, a term is defined
in exactly one context and cited from the others (the specification's own "holds no copy of it" discipline),
and every entry cites its owning `REQ-<DOMAIN>-<NNN>`, which is what makes the first rule checkable rather
than taken on trust. A word the specification does not have is an open question against a requirement, not a
licence to invent one; and an entry that disagrees with the requirement it cites is a defect of the change
that wrote it, on the same terms as a stale view.
