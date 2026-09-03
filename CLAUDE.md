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

**Two bounds are not waived and no agent may treat them as advice:**

- **No screen, view, benchmark card or diagnostics surface may be built** until the approved visual
  design reference exists (**IC-2**). Mechanism that a screen will later use is not a screen.
- **No Linux or macOS release artifact may be produced** until the build hosts exist (**IC-3**).

`docs/architecture/implementation-conditions.md` holds **IC-1 to IC-6**. A condition binds the work it
names: that work may not be reported complete until the condition is discharged, discharging means
recording the result in the record whether or not it passed, and **no condition may be downgraded by
the person doing the work**.

**A mechanism's first execution reports back into the record that decided it**, in place, including
when it found nothing — standing policy, ruled at the Architecture Gate. Four mechanisms in this
record have gone from paper to first execution and every one held a defect no reading had caught.
Keep a falsified reason beside its replacement; never repair it quietly in the code that meets it.

**A spike is taken as the first act of building the thing it prices**, not before and not later.

## Traceability

Implementation work cites the requirement IDs it satisfies. Commits that implement behavior
reference those IDs so requirement, decision, code, and test remain linked.
