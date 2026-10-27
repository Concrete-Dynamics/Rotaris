# The first release — Windows only, skills and workspace-context injection — 4. The Windows release pipeline (continued)

Part 5 of 8 of [the first-release plan](../first-release-plan.md), which indexes every part.

It shows no override anywhere (REQ-STARTUP-167). If the owner defers it, the release still compiles the key in,
so that the next release can add the updater without stranding anyone.

> **First execution, 2026-09-28 — built on Linux; the steps that need a Windows artifact are owed to the next Windows
> package.** Reported in ADR-0054 ("The updater") and in `first-executions.md`; built under
> [R-062](../../product/requests.md#r-062).
>
> **What landed.** `apps/desktop/src/main/updater/`: the flavour classified once from the artifact the launch started
> from (REQ-STARTUP-106; a source-tree or development launch performs no check and issues no request), the one endpoint
> with the 10.0 s timeout and the Accept header (105), the offer rule with exact-name matching through
> `tools/release-naming` and the strict order (107/108/109), every check failure one `info` line (110), the summary
> (112), the manifest parser as the writer's exact inverse with a round-trip test (113, the format now in the naming
> authority), the six steps of 122 in order with the signature verified before the manifest is parsed, 123's exact
> sentences, the 1 MiB streaming into a `rotaris-update-` directory (118/124), the portable and installer strategies
> (115/125/126), the offer notice updated in place with the action disabled during the download (116, REQ-SHELL-114/118),
> the `updates/dismissedVersion` key written only by that notice's dismissal (116/117/146), the applied, hand-off and
> failure notices with `Restart now` and `Try again` (119/120/121), the 1200 ms single auto-close, the restart as
> ADR-0055's hand-over of the record to a successor (121, 161–164), and a quit that waits at most 5000 ms (046).
>
> **The key set is empty.** `RELEASE_SIGNING_KEYS` in `apps/desktop/src/main/updater/keys.ts` ships with no member
> because O-2 is owed. On this tree every install refuses at the signature step with one sentence saying the build
> carries no verification key, and nothing is downloaded — the mechanism whole, its trust anchor absent. **O-2 writes
> the public half there, as an SPKI PEM block** (§6). *Written 2026-10-23 ([R-082](../../product/requests.md#r-082)): the set
> carries one key, `sha256:e0f3d7e80e046a5d3aad59ecbc6feda255fc65e841be21237f500e0d117d1d07`; an injected empty set is still refused `no-key`, as a withdrawal
> of every key would leave it (`keys.test.ts`, `install.test.ts`).* The signature is Ed25519, raw, over the manifest's exact bytes;
> §4.7's pipeline signs with `openssl pkeyutl -sign -rawin` or its equivalent, and OQ-83 asks whether the record
> should fix that form.
>
> **What was executed.** 145 unit cases over fakes (`pnpm vitest run apps/desktop/src/main/updater/ …`), and one
> driven launch of the built application under Xvfb (`pnpm updater-proof`, 7 checks): the development launch writes
> exactly one `update check:` line at `info` saying the build is not updatable and that no request is made, and a proxy
> sink standing in for the network saw no connection for `github.com`. **What was not, and is not faked (IC-3):** a
> check reaching the endpoint, an offer, a download, the installer and portable apply against a real artifact, and the
> restart between two processes — all owed to the next `pnpm package` on Windows.
>
> **Found beside it:** the built application's runtime opens `CONNECT redirector.gvt1.com:443` on its own — Chromium's
> component updater — which REQ-STARTUP-160's disclosure cannot name
> ([note](../../defects/fixed/the-built-app-opens-a-connection-to-chromiums-component-updater.md)). *Repaired 2026-09-28
> (R-062), and the cause corrected:* it was Electron's spellchecker fetching a Hunspell dictionary, not the component
> updater; each session now has no dictionary and no spellchecker (`main/runtime-requests.ts`), and `pnpm updater-proof`
> asserts zero connections from launch to first paint and quit (9 checks). OQ-93 raised (spell-checking a text field; OQ-91 on its branch, renumbered at the merge).
> The packaged Windows build behind the same sink is owed to the next `pnpm package` (IC-3 — *corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*). **Raised:** OQ-83 (the
> signature's form), OQ-84 (a packaged Windows build with neither a registry match nor the launcher's variable —
> ADR-0054 says not updatable, REQ-STARTUP-106's copied-tree sentence says portable), OQ-85 (REQ-STARTUP-118 against
> REQ-SHELL-118 on the download notice's title, persistence and the pause before the apply). **Two obligations the
> portable stub (§4.5) inherits:** publish `ROTARIS_PORTABLE_ARTIFACT` with the artifact's absolute path, and forward
> its arguments to the payload, which the successor launch's token depends on.
>
> **Repaired at verification, the same day.** The independent verification found three defects and the repair's tests
> a fourth, each now pinned beside its unit (ADR-0054 "The updater", *Repaired at verification*): an inherited
> `APPIMAGE` made a source-tree launch updatable and contacted the feed (the released-artifact test now runs first, the
> AppImage test on a packaged Linux build alone; `pnpm updater-proof` now launches with both artifact variables set, 8
> checks); the instance record passed to any announced successor, not only one a waiting restart started (a second
> instance — `acceptSuccessor`); a later window's check re-offered an installed update and dropped `Restart now`; and
> the `<name>.old` cleanup ran per window rather than per launch, deleting the backup the same process had just made.
> 152 unit cases. **Raised by it:** OQ-86 (whether the installer's auto-close and the restart's close ask
> REQ-STARTUP-046's active-run confirmation) — *ruled 2026-10-06 by the owner (R-071) and built (plan fin21): both ask at
> the click and again immediately before the installer or the successor starts*; OQ-84 now cites REQ-STARTUP-147's sentence too.
>
> **Repaired at the second verification, the same day.** A successor that started and was accepted, but that the
> record could not be passed to (the record no longer this instance's, or the atomic replacement failed), left the
> restart waiting for ever and every later update action `update.busy`; the claim now reports the refusal
> (`onRecordPassFailed`), main's wait (`updater/successor.ts`) rejects, and `Update not installed` surfaces with the
> reason (REQ-STARTUP-121). 162 unit cases in 15 files. A successor whose 5 s bound expired while the predecessor was
> blocked can still be passed the record after it has gone — filed in `../defects/`, not repaired. *Repaired
> 2026-09-28 (R-062):* the pass is two steps, offer then acknowledgement within the hand-over interval, and only then
> the rewrite. A successor that stopped waiting leaves the record intact and fails the restart
> (ADR-0055's *Amended 2026-09-28*;
> [note](../../defects/fixed/the-record-can-pass-to-a-successor-that-stopped-waiting.md)). The restart between two real
> processes on Windows is still owed to the next package (IC-3 — *corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*).
>
> **Repaired the same day: the artifact variables stay with their launch.** `APPIMAGE` and `ROTARIS_PORTABLE_ARTIFACT`
> stayed in main's environment and reached every child — observed in the built app, a scripted terminal call's shell
> carried both — so a Rotaris started from inside a portable's terminal would have classified itself from the other
> artifact's file. Main's first statement now takes both out of its own environment and hands them to the
> classification alone (`takeArtifactVariables`, `packages/platform`; ADR-0054 "The updater" item 6). `pnpm updater-proof`
> gains a second launch that reads a tool shell's environment, 11 checks. **Raised:** OQ-90 (REQ-STARTUP-147 names no
> variable removed from a child; REQ-HOOKS-032's "exactly the environment the application itself was started with").

**4.7 The manifest, the signature and the key record.** The pipeline writes and signs these:

- `SHA256SUMS.txt`, sorted, with two-space separators, covering every asset except itself and the signature;
- `SHA256SUMS.txt.sig`, a detached signature, made with the pipeline secret;
- the key record, meaning which verification keys each shipped build carries, committed to the repository with
  each release so that REQ-STARTUP-168 (b) can be decided before publishing.

*Built 2026-10-22 under [R-080](../../product/requests.md#r-080) (§4.2's first-execution note; ADR-0054).*
`tools/release-pipeline` — `pnpm release:pipeline manifest | sign | verify`:

- **The manifest** is written over the release directory through the naming authority's `formatChecksumManifest`, the
  text the updater parses: never itself, never the signature, any earlier signature removed. `verify` refuses a missing
  asset of the published set, an asset left out, a listed file not published, a digest that does not match, and any byte
  of the manifest that is not the writer's own rendering.
- **The signature** is raw Ed25519 over the manifest's bytes, from the PKCS#8 PEM in `ROTARIS_RELEASE_SIGNING_KEY`, held
  in memory and never written to disk. Ed25519 is deterministic, so it is byte for byte what `openssl pkeyutl -sign -rawin`
  makes (tested where `openssl` exists). OQ-83 is not ruled by this: the form is still the updater's reading, and it is now
  tied to the pipeline by the next point rather than by a second reading of it.
- **The verification hook.** `verify` runs the updater's own `verifyDetachedSignature` against the updater's own
  `RELEASE_SIGNING_KEYS`, imported by path from `apps/desktop/src/main/updater/keys.ts`, so §5's "the signature verifies"
  is decided by the code an installed build runs. `updater-agreement.test.ts` closes the loop: a release the pipeline
  wrote and signed is installed by `runInstall`; one signed with a key the build does not carry fails `verify` and is
  refused by `runInstall` at the signature with nothing downloaded.
- **The key record** is `tools/release-pipeline/key-record.json`, schema version 1: one row per release, its version and
  the `sha256:` fingerprints (of the SPKI DER) of the keys its build carries. Empty, because no build has carried a key.
  *Since 2026-10-23 ([R-082](../../product/requests.md#r-082)) it holds one row, `0.1.0rc1` carrying `sha256:e0f3d7e80e046a5d3aad59ecbc6feda255fc65e841be21237f500e0d117d1d07`,
  printed by `pnpm release:pipeline keys`; `pnpm release:pipeline preflight v0.1.0rc1` passes against it.*
  `preflight` holds the release's own row equal to what its build carries; `verify` holds the signing key in every
  **older** recorded row, every one of which REQ-STARTUP-107 may offer this release to (the reading: older in
  REQ-STARTUP-109's order, prereleases included, so a row for a tag never published can only make it stricter).
  `pnpm release:pipeline keys` prints the row to commit.

**4.8 The release body.** A generator writes REQ-STARTUP-035's seven elements, narrowed by `PD-STARTUP-001`, and
REQ-STARTUP-033's changelog. The first release reads "First release — no previous tag to compare against." The
release is named "Rotaris &lt;version&gt;" (REQ-STARTUP-034). The generator is unit-tested per element.

*Built 2026-10-22 under [R-080](../../product/requests.md#r-080).* `pnpm release:pipeline body <dir> <tag> <out>` writes
`release-body.md` and `release.json` (`name`, `prerelease`) from the verified directory's manifest, so each table digest is
the manifest's. The changelog compares against the newest tag of REQ-STARTUP-027's grammar sorting before this one in
REQ-STARTUP-109's order (`v0.2.0` after `v0.2.0rc2`), merge commits excluded. `PD-STARTUP-001`'s line, "This release
publishes Windows builds only.", stands between elements (3) and (5). `body.test.ts` reads each of the seven elements
on its own and the three changelog forms against a fixture repository.

**4.9 The icon.** The owner supplies it (§6). `apps/desktop/resources/` is created for it, and
`electron-builder.yml` names it.

*Built 2026-10-23: the owner supplied `icon.ico` (seven images, 16–256 px, 32-bit), committed as
`apps/desktop/resources/icon.ico` and named by `win.icon`; the stub links it too. `pnpm package` reads every image back out
of the installer, the packaged executable and the portable, byte for byte, and fails otherwise (ADR-0054, "The portable,
the assisted installer and the icon"). O-4 is discharged.*
