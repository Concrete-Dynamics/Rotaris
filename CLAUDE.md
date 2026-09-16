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

**Design material, and how to use it.** `docs/design/` holds the **approved design language** —
adopted and authoritative: cite the token by name, never a literal colour or pixel value. Its
**information architecture is not adopted**: screens, order and tabs come from `docs/spec/`
(`REQ-SHELL-023` is canonical). `docs/design/mockup/` is read **for craft, never for structure**;
where the two disagree the specification governs. `docs/design/README.md` §2 is the adoption rule.

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
`docs/architecture/first-executions.md`**. Keep a falsified reason beside its replacement; never
repair it quietly in the code that meets it.

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
the agent performs itself.** The primary checkout is not a place to write. Only trivially reversible,
single-file documentation edits may be made in place, and only when `git status` is clean.

Steps, merge-conflict shapes, and the LF line-ending rule live in
`docs/clean-room/agent-workflow.md` — read it before the first edit, not here.

## The architecture views — consult before, maintain after

`docs/architecture/views/` holds the system as built: **component** (packages, allowed edges),
**process** (processes, messages, files on disk), **runtime** (run flow, controls, store,
configuration). Two obligations bind every change:

- **Consult before modifying code** — read the view that covers the area.
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
