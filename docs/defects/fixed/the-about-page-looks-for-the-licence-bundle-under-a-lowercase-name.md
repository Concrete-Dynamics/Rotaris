## The About page looks for the licence bundle under a lowercase name

`apps/desktop/src/main/about.ts` declares `THIRD_PARTY_LICENSES_ASSET = 'third-party-licenses.txt'`, and the About
page's reader resolves its candidates from that name. The requirement names the file `THIRD-PARTY-LICENSES.txt`.
No build emits the file yet, so every platform takes the absent branch today and nothing visible differs. Once the
notices generator (ADR-0054) emits the file under its required name, Windows and a default macOS volume will find it
by case-insensitive lookup and a Linux artifact will not — the About page there would show REQ-SHELL-142's
absent caption beside a bundle that is present. Noticed 2026-09-25 while surveying what a first release owes.

## Specs

`REQ-STARTUP-141` fixes the filename `THIRD-PARTY-LICENSES.txt` inside every standalone artifact and requires the
About & Legal surface to open the same bundled file offline. `REQ-SHELL-142` is the surface that would take its
absent branch wrongly on a case-sensitive filesystem.

## Relevant files

- `apps/desktop/src/main/about.ts`: `THIRD_PARTY_LICENSES_ASSET`, the lowercase name the reader looks for.
- `docs/spec/11-startup-distribution-updates.md`: `REQ-STARTUP-141`, the required name.

## Repaired — 2026-09-27, with the notices generator (first-release-plan.md §4.3)

`THIRD_PARTY_LICENSES_ASSET` is now `THIRD-PARTY-LICENSES.txt`, the name `REQ-STARTUP-141` fixes, and the literal the
notices generator writes (`tools/notices/notices.mjs`, `NOTICES_FILE`). The two were repaired in one change so the
first build that carries the file cannot carry it under a name the About page misses.

**What would have caught it, now in place.** `apps/desktop/src/main/about.test.ts` holds the reader's name equal to
REQ-STARTUP-141's literal and to the generator's, and writes the bundle under a temporary `process.resourcesPath` by
the generator's spelling and asks the reader for it. Against the old name both cases fail on every platform: on Linux
the reader finds nothing, and on a case-insensitive filesystem it answers a path spelled differently from the file.
Measured before committing: with the lowercase name restored, 2 of 3 cases fail; with the repair, 3 of 3 pass.

**In the built app, on Linux, both ways.** A file named `THIRD-PARTY-LICENSES.txt` was put under
`apps/desktop/resources/` and `pnpm settings-proof` was run over two builds. With the repair the About page took the
present branch — no caption — so the proof's absent-branch assertion stopped at "the licensing caption was """, which
is the expected refusal while that proof still asserts the absent branch. With the lowercase name rebuilt, the same
file present, the page showed "This build does not carry a third-party license bundle." — the defect as this note
described it, reproduced. The file was removed and the repaired build's proof passed as before. Giving
`settings-proof` a present branch of its own belongs to the bundled-assets step (§4.4), with the packaging wiring.

## Relevant files after the repair

- `apps/desktop/src/main/about.ts`: `THIRD_PARTY_LICENSES_ASSET = 'THIRD-PARTY-LICENSES.txt'`.
- `apps/desktop/src/main/about.test.ts`: the regression, beside the reader.
- `tools/notices/notices.mjs`: `NOTICES_FILE`, the name the generator writes.
