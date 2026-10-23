# `portable-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/portable-proof.mjs`](../../apps/desktop/scripts/portable-proof.mjs).

The portable's launcher stub (`apps/desktop/launcher`) and its assembly (`apps/desktop/scripts/lib/portable.mjs`) —
ADR-0054 alternative P4, first-release-plan.md §4.5 — built by Cargo for the host that runs the proof and executed
there, against two payloads (REQ-STARTUP-013, REQ-STARTUP-031, REQ-STARTUP-150, REQ-STARTUP-165 (a)–(e)):

- **A. The mechanism**, a payload whose entry point is a shell script that writes down what it was started with. The
  preparing run and the reusing run from a read-only directory that comes out byte for byte unchanged (clause (a));
  nine damage classes — the marker deleted, naming another token, of another launcher format, unreadable; the entry
  point deleted; a listed file deleted, truncated or grown; a subtree removed — each redone silently with nothing left
  stale (clause (c), ADR-0054 Defects A and B); a second artifact preparing afresh and the superseded preparation
  reclaimed (clause (b)); two launches racing; a root that accepts no write, so the payload runs from a run-scoped
  placement in the transient-files storage that is removed afterwards, its marker naming the root it could not prepare
  into (clause (c)'s second half — ADR-0054 consequence 14's unmeasured branch); and an unassembled stub refusing.
- **B. The application**, this host's Electron runtime with the built desktop app as the payload, launched twice
  through the stub to a painted window — preparing, then from the preparation — with `ROTARIS_PORTABLE_ARTIFACT`
  reaching main (clause (e)), no process the product starts from its own image inheriting it (REQ-STARTUP-147,
  `PD-STARTUP-004`), and the running image inside the preparation.

**Not measured here:** the Windows artifact. `pnpm package` assembles it from `win-unpacked`, reads the owner's icon back
out of it, and launches it twice on the Windows runner (step 3′ in `release/load-proof.json`), including the rename
aside of the artifact while the application runs (REQ-STARTUP-125). The application's notice for a run that could
make no preparation (REQ-STARTUP-165 (c)) is not built; this proof shows only that the marker it would read carries the
outcome and the root.
