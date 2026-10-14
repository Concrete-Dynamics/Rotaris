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

## Repaired — 2026-10-13 (fin41)

Each "(IC-3)" on a Windows-owed check keeps its words and gains the correction beside it ("a Windows x64 host, deferred
with the pipeline under R-071; IC-3 binds Linux and macOS artifacts"): `first-release-plan.md` (the manifest rule, the
prerelease naming, the packaged sink, the restart between two processes, §7's version-guard line), ADR-0054 (the "assets"
rule, the naming repair's "Not shown here", the updater's "Not executed here"), `open-questions.md`'s spell-checking entry,
and the two views (`02-process-view.md`'s portable update row, `06-sequences.md`'s update sequence; entry at the top of
`views/reconciliation-log.md`). No new condition: the checks stay owed where they are recorded and held by
REQ-STARTUP-156's release gate.

Left as written: "(IC-3)" where it is correct (a Linux or macOS artifact, `codebase.md`'s "Windows only (IC-3)" for the
package step, ADR-0054's "IC-3 bars a Linux artifact"), and the fixed defect notes, which record what their authors
wrote on their day; this note is the correction they point back to. The Windows package itself — the ~14 checks owed to
it and the missing `afterPack` setup-manifest rule — is deferred under R-071 with the pipeline and is not this repair.

## Completed at review — 2026-10-13 (fin41's reviewer)

The repair above missed nine tags of the same kind, so "each" did not hold when the note moved: `first-executions.md`'s
rows for the bundled assets, the prerelease naming, the setup manifest, `code-intel-proof`'s setup launches and the
bounded proof launches (`mcp-console-spike` and the packaged launches); ADR-0035's "the packaged branch and section 7
(IC-3)"; `first-release-plan.md`'s updater row in §1 and §4.4's "No package was run here (IC-3)"; and `codebase.md`'s
OQ-80 line ("the Windows package that shows it still owed, IC-3"). Each now carries the same correction beside its tag.
`tools/windows-ic3-citations.test.ts` reads `docs/architecture/` and `docs/product/directives.md` for an IC-3 written
right after a Windows package, a packaged branch or `win-unpacked` with no correction beside it, and passes a tag on a
Linux or macOS artifact, which IC-3 does bind; it was red on the nine before. Windows checks that are not packaging
checks but carry the same shorthand ("anything on Windows (IC-3)") are outside this repair and recorded in
`docs/defects/fixed/windows-checks-outside-packaging-still-name-ic-3-as-their-reason.md` (repaired 2026-10-14).
