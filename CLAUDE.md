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

A request that would change what the product does is **classified before any code is written** and
logged in `docs/product/requests.md` when it is made. The table in `docs/product/README.md` chooses
between the five outcomes: **covered** (cite the `REQ` ids), **OQ-NN** (`docs/architecture/open-questions.md`),
**ESC-NN** (`docs/architecture/owner-decisions.md`, then an amendment round), **defect found by building**
(amendment round + a row in `docs/architecture/first-executions.md`), or **`PD-<DOMAIN>-<NNN>`**
(`docs/product/directives.md`).

A directive governs over every requirement it names, per identifier and never wholesale. The
specification is **never edited in place** for one — the requirement keeps its text and gains a
back-pointer to the directive in the same commit (`pnpm symbols` enforces the identifiers).
A request contradicting a faithful requirement is a **directive**, not an escalation. When in doubt,
log the request and classify it in writing.

**An open question does not wait on the owner** since 2026-10-07 ([R-072](docs/product/requests.md#r-072)): the
orchestrator's consortium rules it under the owner's standing delegation — two independent advocates argue and
recommend, a ruling agent rules, and the ruling is written into the entry and minted as a directive where it departs
from a requirement. An escalation, and a clause the owner ruled personally, stay the owner's. An agent that is not the
orchestrator raises a question and never rules it. Plans running in parallel raise open questions from the ranges
their briefs assign; one that lands on a number `main` already holds takes the next free one, says so in its entry and
renumbers its citations (`.agents/skills/orchestrated-build/references/repository.md`, "Merge conflicts").

## Defects noticed along the way

A defect an agent notices **while doing other work** is written to `docs/defects/` **without asking the
owner first** — recording it is never gated on permission, so nothing is lost when the session that saw
it ends. Follow the schema in `docs/defects/README.md`: name, concise description, the specification it
contradicts (or none), and the relevant files. Record it whether or not it is in scope to fix.

Recording is not repairing and not classifying. Writing the note does not authorize the fix, and it does
not substitute for the paths above: a **defect found by building** still owes its amendment round and its
row in `docs/architecture/first-executions.md`, and a change the owner asks for is still classified in
`docs/product/requests.md` before code. When a noted defect is repaired, move its note to `docs/defects/fixed/`
rather than deleting it.

## Process state

**Both gates are closed and implementation is authorized, bounded.** The Specification Gate closed
2026-08-31 (`docs/clean-room/specification-gate.md`); the Architecture Gate closed 2026-09-03
(`docs/clean-room/architecture-gate.md`). What is authorized is **the mechanism** — process topology,
the store, the run flow, the event stream, settings, permissions, the backup and the restore.
**On 2026-10-06 the owner counted the work as finished** without the release pipeline and its inputs (signing,
the licence inputs, the icon), continuous integration, the Linux and macOS builds and the owner's hardware checks
([R-071](docs/product/requests.md#r-071)): each stays owed where it is recorded, and none is an agent's to start.

**Design material, and how to use it.** `docs/design/` holds the **approved design language** —
adopted and authoritative: cite the token by name, never a literal colour or pixel value. Its
**information architecture is not adopted**: screens, order and tabs come from `docs/spec/`
(`REQ-SHELL-023` is canonical). `docs/design/mockup/` is read **for craft, never for structure**;
where the two disagree the specification governs. `docs/design/README.md` §2 is the adoption rule.

**One bound is not waived and no agent may treat it as advice:**

- **No Linux or macOS release artifact may be produced** until the build hosts exist (**IC-3**).

*Corrected 2026-10-13: this read "Two bounds", the other being "`REQ-SHELL-128`'s three built-in themes cannot
yet be met (IC-2): `nocturne` and `high-contrast` have no palette, and the token set declares no theme metadata or
native-surface mapping". IC-2 was discharged on 2026-09-04 by `pnpm theme-proof` and OQ-30 closed with it: all
three themes carry a palette, a label, a description and a dark flag (`packages/contracts/src/theme/themes.ts`);
only the different-scale multi-monitor drag remains, the owner's measurement.*

`docs/architecture/implementation-conditions.md` holds **IC-1 to IC-8** *(this read "IC-1 to IC-7")*. A condition binds the work it
names: that work may not be reported complete until the condition is discharged, discharging means
recording the result in the record whether or not it passed, and **no condition may be downgraded by
the person doing the work**.

**A mechanism's first execution reports back into the record that decided it**, in place, including
when it found nothing — standing policy, ruled at the Architecture Gate — **and appends one row to
`docs/architecture/first-executions.md`**. Keep a falsified reason beside its replacement; never
repair it quietly in the code that meets it.

**A spike is taken as the first act of building the thing it prices**, not before and not later.

## The codebase

Rotaris is **one Electron desktop application**: a pnpm workspace of TypeScript packages (Node ≥ 24,
React in the renderer, SQLite for the session record, electron-vite for the build, Vitest for the tests)
over five composition roots in `apps/desktop/src/`.

Two routers answer the two questions worth asking before an edit, and neither costs more than a page:

- **Where does a thing live, and what do I open first?** → [`docs/module-map.md`](docs/module-map.md) —
  packages, roots, entry files, test globs, and the placements that are not where you would guess.
- **Where does *this edit* land, in what order?** → the router at the top of
  `docs/architecture/views/README.md`, then the view it names (`04-seams.md` for the eight additions
  this product makes most often).

`docs/architecture/codebase.md` is the deeper map — what landed, what stands in, what is owed. Packages
follow **process boundaries**, arrows point downward only, and `eslint-plugin-boundaries` fails
`pnpm lint` on a violation. `apps/desktop/src/{main,preload,renderer,run-host,workspace-service}` are
the only places `electron` is imported. Engine code takes time from the clock ports, never from globals
(`rotaris/no-bare-timers`). A design-equivalent control exists only in `packages/ui/src/design-system/`
(`tools/check-ui-language.mjs` fails `pnpm lint` on one written elsewhere). A store migration is
**appended**, never edited once shipped. Nothing in `packages/kernel/src/generated/` is written by hand
— `pnpm symbols` writes it.

### Commands

```
pnpm install --prefer-offline                 # a fresh worktree also needs: node node_modules/electron/install.js
pnpm check                                    # symbols + typecheck + lint + tests — all four green before a commit (an orchestrated build: on each head it lands)
pnpm vitest run <path>                        # the narrowest verification; tests sit beside the unit they cover
pnpm typecheck | pnpm lint | pnpm symbols     # the pieces, when the whole gate is too slow
pnpm build && electron apps/desktop/out/main/index.js
pnpm dev                                      # electron-vite, against the workspace source
pnpm <area>-proof                             # the built app measuring one mechanism — AGENTS.md indexes all of them
pnpm app:drive start|shot|inspect|stop        # drive the built app, free, no provider
pnpm mockup                                   # the design material, before drawing a surface
```

`AGENTS.md` covers the two checks `pnpm check` does not reach: **`pnpm app:drive`** (free) and
**`pnpm live-run`** — the built product against a real key in a throwaway workspace, bounded by the
endpoint's own accounting. It spends the owner's money, it is never automatic, and an agent asks before
running it.

`docs/module-map.md` is maintained on the same terms as the views, on the narrower trigger it states: a
package that appears, moves or changes what it owns, or an entry point named there that moves. An
ordinary fix, or a refactor that moves nothing another agent would navigate by, changes nothing in it.

`.claude/rules/` holds the invariants that bind **one subtree** — surfaces, the store, what crosses a
boundary, inside a run, tests and proofs. Each carries `paths:` frontmatter, so it reaches context only
when a file it names is read, which is why they are not in this file. They are repository content for the
same reason `.claude/skills/` is; `.claude/rules/README.md` states what may be written there. A rule that
outlives its convention is deleted, not annotated.

## Where the work happens — a temporary branch in a temporary worktree

**Every change is built on a temporary branch in its own temporary worktree, and lands on `main` by a rebase
and a fast-forward push the agent performs itself; `main`'s history is linear, with no merge commit** (the owner,
2026-10-04: "please always use rebase instead of a merge commit for main."). The primary checkout is not a place
to write. Only trivially reversible, single-file documentation edits may be made in place, and only when
`git status` is clean.

Steps, the conflict shapes a rebase replays, and the LF line-ending rule live in
`docs/clean-room/agent-workflow.md` — read it before the first edit, not here.

## The architecture views — consult before, maintain after

`docs/architecture/views/` holds the system as built: **component** (packages, allowed edges),
**process** (processes, messages, files on disk), **runtime** (run flow, controls, store,
configuration), **seams** (the ordered edit path for a command, a channel, a store column, a tool,
a configuration key, a notice, a preference, a surface), **state ownership** (which process owns a
fact and who may write it) and **sequences** (launch, an approval, the board). Two obligations bind
every change:

- **Consult before modifying code** — read the view that covers the area; the router at the top of
  `views/README.md` chooses it, and each view carries its own section index.
- **Maintain after modifying code** — update the affected view **in the same commit**, plus the
  "last reconciled" date in `docs/architecture/views/README.md`. A view that disagrees with the
  code is a defect of the change that made it so.

## The design language — consult before, match after

The same pair binds every change that **draws, redraws or restyles a surface**
(`docs/design/README.md` §7; §2 states what is adopted). Before writing the component, run
**`pnpm mockup`** and read the surface for **craft, never structure** — structure comes from
`docs/spec/` (`REQ-SHELL-023` governs). After drawing, match it: tokens alone are not compliance,
and a plausible invention is not a third option where the design material decides.

The repository operationalizes this pair through `.agents/skills/build-ui`, `.agents/skills/debug-ui`, and
`.agents/skills/review-ui`. The first two join implementation to built-app evidence; the third is a report-only
critic over screenshots, geometry, computed styles and deterministic findings, capped at three iterations.

## Traceability

Implementation work cites the requirement IDs it satisfies. Commits that implement behavior
reference those IDs so requirement, decision, code, and test remain linked. Work that implements a
**product directive** cites its `PD-<DOMAIN>-<NNN>` on the same terms, and where a directive governs,
the code cites the `PD` rather than the requirement it displaced.

[`CONTEXT-MAP.md`](CONTEXT-MAP.md) is the **domain glossary**: one `CONTEXT.md` per context,
each derived from `docs/spec/` and citing its owning `REQ-<DOMAIN>-<NNN>`. Consult it before naming
anything; a word the specification does not have is an open question, not a licence to invent one.
