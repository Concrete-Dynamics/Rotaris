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

- `docs/spec/` — approved behavioral requirements (`REQ-<DOMAIN>-<NNN>`)
- `docs/architecture/` — architecture and Architecture Decision Records
- `docs/clean-room/` — process, reference record, zone policy, provenance
- public library and platform documentation
- the approved Claude Design UX reference for information architecture and visual design
- sanitized black-box conformance feedback (observable differences only)

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
when it found nothing — standing policy, ruled at the Architecture Gate. Every mechanism in this
record that has gone from paper to first execution has held a defect no reading had caught (fifty-three by
the count in ADR-0058 consequence 17, plus the build toolchain's four and the relay's one).
Keep a falsified reason beside its replacement; never repair it quietly in the code that meets it.

**A spike is taken as the first act of building the thing it prices**, not before and not later.

## The codebase

`docs/architecture/codebase.md` is the map: packages follow **process boundaries**, arrows point
downward only, and `eslint-plugin-boundaries` fails `pnpm lint` on a violation. Composition roots are
`apps/desktop/src/{main,preload,renderer,run-host,workspace-service}` and are the only places
`electron` is imported. Engine code takes time from the clock ports, never from globals
(`rotaris/no-bare-timers`). `pnpm check` runs the symbol generator, typecheck, lint and tests; all four
must be green before a commit. `pnpm build` then `electron apps/desktop/out/main/index.js` runs the app.

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
reference those IDs so requirement, decision, code, and test remain linked.
