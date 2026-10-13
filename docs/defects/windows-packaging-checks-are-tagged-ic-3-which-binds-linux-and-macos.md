## Windows packaging checks are tagged IC-3, which binds Linux and macOS artifacts

Several active records tag a check owed to the next Windows package "(IC-3)": the setup manifest's `afterPack` rule and the
prerelease naming (`first-release-plan.md` §4), the packaged spellchecker and restart (§4's first-execution notes,
`open-questions.md`'s spell-checking entry), the "assets" rule and the updater's real-artifact checks (ADR-0054) and
the update sequence (`views/06-sequences.md`). IC-3 binds "any release artifact for Linux or macOS, and the store
binding's acceptance on any platform" (`implementation-conditions.md`); what holds these checks back is that this host
cannot build or run a Windows x64 package, and that R-071 deferred the release pipeline. `first-release-plan.md` §5 already
says IC-3 and IC-8 bind only artifacts this release does not publish. The tag is loose shorthand, and it reads as if a
Windows check were waiting on Linux or macOS hosts. No condition is missing: the checks stay owed where they are
recorded and are held by REQ-STARTUP-156's release gate.

Found by the 2026-10-13 survey at `6de2a67` (item N27, the record half; the Windows package itself is deferred under
R-071 and out of this plan).

## Specs

- None contradicted. `docs/architecture/implementation-conditions.md` IC-3's Binds line; `docs/product/requests.md` R-071.

## Relevant files

- `docs/architecture/first-release-plan.md` — §4's manifest and naming paragraphs, the spellchecker and restart notes,
  §7's version-guard line.
- `docs/architecture/adr/0054-packaging-artifacts-and-self-update.md` — the "assets" rule, the prerelease naming
  repair's "Not shown here", the updater's "Not executed here".
- `docs/architecture/views/06-sequences.md` — the update sequence.
- `docs/architecture/open-questions.md` — the spell-checking entry.
