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
