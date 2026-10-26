# Background updates — installable from a release, downloaded by itself, applied at the next start

*Drafted 2026-10-22 from [R-084](../product/requests.md#r-084). A plan, not a decision: it schedules work the record
decides in [`PD-STARTUP-008`](../product/directives/pd-startup-008.md#pd-startup-008), [`PD-SHELL-005`](../product/directives/pd-shell-005.md#pd-shell-005)
revision 2 and REQ-STARTUP-169 to REQ-STARTUP-181 ([`../spec/11-startup-distribution-updates.md`](../spec/11-startup-distribution-updates.md)),
and every product decision it needs is named as the owner's (§6) rather than taken here. **Recorded, not built.** No
mechanism below has run; nothing here is a first execution, and no row is owed to [`first-executions.md`](first-executions.md)
until a stage builds one. Implementation is scheduled after the dependency remediation running beside this plan.*

**The owner's goal**, relayed by Augustus: Rotaris installable **from a release**, with an updater that behaves like current
desktop assistants. A newer build downloads by itself in the background, with no click; its progress is visible and can be
cancelled; the verified download is applied automatically **at the next start**, or at once by **Restart now**. A restart
is never forced in the middle of work and never arrives as a modal; the guards a clicked restart asks today stay. A broken
or cancelled download, or a failed apply, never leaves an installation that cannot start, and REQ-STARTUP-126's rollback
stays. The signature is verified before the manifest is parsed and before any asset byte is fetched (REQ-STARTUP-122, 123,
167), and the 1 MiB bounded reads and the chunked digest stay. ADR-0054's bespoke updater (Alternative B) is **retained**;
`electron-updater` stays rejected (§8). Windows x64 only (`PD-STARTUP-001`); IC-3 and IC-8 still bind.

| | Section |
|---|---|
| What the code does today, read on `b0d1b3ff` | §1 |
| The requirement map — what is kept, narrowed and new | §2 |
| The design the stages build | §3 |
| Crash, cancel and failure — what each interruption leaves | §4 |
| The stages, one pull request each | §5 |
| What the owner must decide (UD-1 to UD-12), and what is only an implementation choice | §6 |
| What blocks an installable release, and whose it is | §7 |
| Prior art, and why it is not the contract | §8 |

---

## 1. What the code does today

Read, not run, on `main` at `b0d1b3ff` (2026-10-22). Paths are under `apps/desktop/src/main/updater/` unless named.

| Fact | Where |
|---|---|
| The check runs from every window's post-show activation, once per window; one operation (check or install) in flight | `index.ts:1550`; `updater.ts:504` (`activate`), `:286` (`guard`) |
| **The download starts only on a click.** `install()` refuses unless an offer is held, and is reached only through the notice's `Update now` / `Try again` (`update.install`) | `updater.ts:520`; `commands/update.ts:13` |
| The download notice keeps the offer's identity, `Downloading Rotaris {v}`, not persistent, **its one action `Update now` disabled** — there is no cancel | `updater.ts:249` (`downloadingFace`) |
| The install sequence is REQ-STARTUP-122's: manifest and signature fetched (each read whole, at most 1 MiB), signature verified, then parsed, then the asset streamed in 1 MiB chunks and hashed as written | `install.ts:114`, `:68` (`SMALL_RESPONSE_LIMIT`); `download.ts:30` |
| **The asset stream is not bounded** by the size the feed states: a body of any length is written to disk before the digest can refuse it | `download.ts:30` (`streamInChunks`) — [note](../defects/the-update-download-writes-whatever-length-the-server-sends.md) |
| **Staging is the platform's temporary directory** (`<os temp>/rotaris-update-*`), created fresh per attempt; **nothing is persisted** — no pending record, no download survives the process | `electron.ts:105`; `install.ts:134` |
| The apply follows the verified download at once. **Portable:** the artifact is swapped while the application runs — copy to `<name>.update`, delete the old backup, rename the target to `<name>.old`, rename the new file in; `Update installed` + `Restart now` | `strategies.ts:67`; `updater.ts:395` |
| **Between those two renames the artifact's path names nothing.** A process ended there leaves only `<name>.old` and `<name>.update`, and no launch can repair it, since the file a user starts is gone | `strategies.ts:92`, `:98` — [note](../defects/the-portable-swap-leaves-the-artifact-path-empty-between-its-two-renames.md) |
| **Installer:** the verified setup is started with no arguments (its own pages, if any), `Finish the update`, and every window closes 1200 ms later; the setup's staging directory is left in the temporary directory and nothing ever removes it | `strategies.ts:113`; `updater.ts:404`; `install.ts:197` — [note](../defects/the-installer-hand-offs-staging-directory-is-never-removed.md) |
| `Restart now` exists for the in-place flavour only; it is REQ-STARTUP-121's hand-over through the instance record to a successor started with `builtin:update-successor` | `updater.ts:547`, `:412`; `successor.ts`; `index.ts:537` |
| The guards a clicked close asks — unsaved settings (OQ-311), worktree integration (OQ-361), the active-run box (OQ-86) — are asked at the click and again immediately before the hand-off, for `Restart now` and for the installer's `Update now` / `Try again` | `updater.ts:492` (`confirmAtHandOff`), `:156` (`mustAskAtHandOff`) |
| A quit waits at most 5000 ms for update work, then aborts a download and discards its partial file | `index.ts:2011`; `updater.ts:583` |
| The classification reads the artifact (never the running image); a packaged Windows build is **installed** only if `HKCU\Software\Rotaris\InstallDir` exists and contains the artifact | `classify.ts:121` |
| **The installer was one-click** and, on `b0d1b3ff`, was not measured to write `InstallDir`. electron-builder's one-click NSIS installs under `%LOCALAPPDATA%\Programs\…`; a build it installs then classifies itself **not updatable** and never checks. Repaired on `main` on 2026-10-23 (`nsis.oneClick: false`, `apps/desktop/resources/installer.nsh` writing `HKCU\Software\Rotaris\InstallDir`) and not yet measured on a real artifact | `electron-builder.yml:79` — [fixed note](../defects/fixed/the-windows-installer-is-one-click-with-no-pages-and-no-directory-choice.md) |
| The compiled-in key set is **empty** (O-2): every install refuses at the signature, nothing downloaded | `keys.ts:36` |
| The portable artifact **does not exist**: its launcher stub (first-release plan §4.5) is unbuilt, so only the installer can be released | [`first-release-plan.md`](first-release-plan.md) §4.5 |
| Never executed against a real artifact: a check reaching the endpoint, an offer, a download, either apply, the restart between two processes | ADR-0054 "The updater", *What was executed, and what was not* |

A development launch and every proof are classified not updatable and issue no request (`pnpm updater-proof`). Development
launches resolve the same per-user directories an installed build does (`packages/platform/src/dirs.ts`), which is why
REQ-STARTUP-173 requires a not-updatable build to leave a pending update untouched.

---

## 2. The requirement map

REQ-STARTUP-169 to REQ-STARTUP-181 are **new**, minted at the owner's explicit ask and marked *decided, not derived* at
their heading. `PD-STARTUP-008` narrows twelve derived requirements; `PD-SHELL-005` revision 2 narrows two more. Every
narrowed requirement carries its back-pointer.

| Existing | What it says | Under R-084 | By |
|---|---|---|---|
| REQ-STARTUP-105, 107–113 | one endpoint, the offer rule, exact names, order, silent check failure, the summary, the manifest parser | **kept** | — |
| REQ-STARTUP-106 (+ `PD-STARTUP-004`) | flavour from the artifact | **kept**; it decides who may download and apply (173) | — |
| REQ-STARTUP-114 | one operation in flight, a second refused | **narrowed**: a cancel is not a second operation | PD-STARTUP-008 (1) |
| REQ-STARTUP-115 | `<name>.old` removed at launch | **kept**; 176 delays the removal until the replaced artifact has painted | — |
| REQ-STARTUP-116 | offer notice with `Update now` | **narrowed**: the notice that appears is the download's | PD-STARTUP-008 (2); new 169 |
| REQ-STARTUP-117 | dismissing records the version | **kept until UD-3** | — |
| REQ-STARTUP-118 | non-persistent `Downloading …` notice, measured label | **kept**; 170 adds the cancel | new 170; PD-SHELL-005 r2 |
| REQ-STARTUP-119 | `Update installed` / `Finish the update` + 1200 ms auto-close | **narrowed**: the installed flavour shows the ready notice; nothing closes on its own | PD-STARTUP-008 (3); new 174, 175 |
| REQ-STARTUP-120 | `Update not installed` | **kept**; 179 decides when a background failure reaches it (UD-4) | — |
| REQ-STARTUP-121 | `Restart now` on `Update installed` only; successor hand-over | **narrowed**: offered on both flavours' ready notice; installed flavour restarts through its installer | PD-STARTUP-008 (4); new 174 |
| REQ-STARTUP-122 | fetch → verify signature → parse → stream to fresh temporary staging → verify → apply | **narrowed**: pauses after the digest; per-user pending storage; verified again before the apply | PD-STARTUP-008 (5); new 171, 172 |
| REQ-STARTUP-123 | refusal sentences, no override | **kept** | — |
| REQ-STARTUP-124 | 1 MiB chunks, write failure deletes the partial | **kept**; 169 adds the size bound | new 169 |
| REQ-STARTUP-125 | strategies by flavour | **narrowed**: installer started without pages at next start / `Restart now`, app restarted after; portable path never empty | PD-STARTUP-008 (6); new 173, 176 |
| REQ-STARTUP-126 | nothing moved before verified; failure leaves the install byte-for-byte | **kept**, and strengthened by 176 | new 176 |
| REQ-STARTUP-127 | a hand-off never tells the user to restart | **narrowed** | PD-STARTUP-008 (7) |
| REQ-STARTUP-128 | one version, one artifact | **kept** | — |
| REQ-STARTUP-017 | a silent install never auto-launches | **narrowed**: the updater's silent install relaunches | PD-STARTUP-008 (9) |
| REQ-STARTUP-043, 151 | update check post-show; download → verify → apply monotone | **kept**; the download is post-show (169) and the order stays monotone with the revalidation inside it | — |
| REQ-STARTUP-046 (+ `PD-SHELL-009`) | close waits ≤ 5000 ms for update work; active-run confirmation | **kept**; 174 asks it as today | — |
| REQ-STARTUP-150 | failed check invisible, failed install visible | **kept**; 179 | — |
| REQ-STARTUP-155 | first paint ≤ 5 s, one exemption | **narrowed**: the installed flavour's applying launch is exempt for the apply alone | PD-STARTUP-008 (8); new 173 |
| REQ-STARTUP-160 (+ `PD-STARTUP-006`) | network disclosure | **kept**; 180 adds the download statement beside it | new 180 |
| REQ-STARTUP-161–164 (+ `PD-STARTUP-002`) | one instance, the claim, the hand-over, the successor token | **kept**; 177 makes a launch during an apply wait, which 161 already admits ("a launch may be made to wait") | new 177 |
| REQ-STARTUP-165 | the portable's preparation | **kept**; the target stays the artifact | — |
| REQ-STARTUP-167, 168 | signature, keys fixed at build | **kept**; 172 verifies again against the **running** build's keys | new 172 |
| REQ-SHELL-114 | dismissing the offer records the version | **kept until UD-3** | — |
| REQ-SHELL-115 | closed list of banner actions | **narrowed**: cancel an update download | PD-SHELL-005 r2 |
| REQ-SHELL-118 (+ `PD-SHELL-005` r1) | download notice: disabled action, apply follows in one sequence | **narrowed again**: cancel action enabled; no apply after the download | PD-SHELL-005 r2 |
| REQ-SHELL-119, 121, 124 | the guards; clean shutdown | **kept**; 174 and 175 rely on them | — |
| REQ-NOTIFY-044, 215, 222 | action vocabulary; offer with an install action; installer auto-close | **narrowed** | PD-STARTUP-008 (10–12) |
| REQ-NOTIFY-219, 212 | "no signature is verified"; "once per launch" | **contradict domain 11** today, independent of R-084 | raised as [ESC-43](owner-decisions/15-escalations-after-the-gate-2026-10-22.md#esc-43) |

New, in one line each: **169** the download starts on its own, bounded by the stated size; **170** progress and cancel;
**171** the pending update and its one record; **172** verified again before any apply; **173** it takes effect at the
next start, without a click; **174** `Restart now` behind the existing guards; **175** nothing restarts or installs on its
own, and nothing installs at quit; **176** never an installation that cannot start; **177** one apply at a time, a launch
during an apply waits; **178** what stays on disk; **179** failures of the background path; **180** the disclosure;
**181** acceptance on the built artifact.

---

## 3. The design the stages build

**State owner.** Main, alone — the updater module that owns the offer and the one operation today
(`05-state-ownership.md`'s rows). Download, pending update, apply lock and notice are **instance-wide**: several windows
share them (177). No renderer, child, configuration value or environment variable reads or writes any of it (171,
REQ-STARTUP-111, 147). The preference store gains no key (REQ-STARTUP-146).

**Where it lives** — under the per-user **data** directory of REQ-STARTUP-145 (machine-local, never roaming), beside the
instance record; `dataLayout` gains `updates`:

```text
<data>/updates/
  pending.json                    the one record (171), written atomically (same-directory temp, flush, rename)
  apply.lock                      exclusive-create while an apply runs: {pid, created, version, installerPid} (177)
  <version>/SHA256SUMS.txt        the exact manifest bytes that authorised the asset
  <version>/SHA256SUMS.txt.sig    the exact signature bytes
  <version>/<asset>.partial       while downloading; renamed to <asset> only after the digest matched
  <version>/<asset>               the verified asset (the installer runs from here)
```

`pending.json`, schema 1 (proposed): `version`, `flavour`, `platformKey`, `asset {name, size, sha256}`, `state`
(`downloading` → `verified` → [`swapped`] → `applying`), `downloadedBy` (running version), `verifiedAt`, `applyAttempts`.
A record that is missing, unreadable, of another schema, or naming absent files reads as **no pending update** and its files
are removed (REQ-STARTUP-071's discipline, 171).

**The state machine (main).** `idle` → *(check finds an offer; not waved off, not cancelled, no pending ≥ it)* →
`downloading` (manifest + signature fetched; signature verified; manifest parsed; asset streamed into `.partial`, bounded by
the feed's size; digest compared) → `verified` (record written; files moved into place) → **portable:** `swapped` (atomic
replace, below) → `ready` notice; **installer:** `ready` notice → *(next start, or `Restart now`)* → revalidate (172) →
`applying` (apply lock, installer started silently with relaunch) → the updated build's first paint removes the pending
files, the lock and (portable) `<name>.old` (176, 178).

**Revalidation (172)** is a pure function over the retained bytes and the running build's `RELEASE_SIGNING_KEYS`:
`verifyDetachedSignature` (unchanged) → `parseChecksumManifest` → exact name → SHA-256 of the retained asset (about a second
for a 150–200 MB installer, paid only by the applying launch) → `isStrictlyNewer(pending, running)` → flavour and platform
key equal to `classifyThisInstallation`. It never touches the network.

**Apply, per flavour.**
- **Portable** (needs the launcher stub, §5 PR-1b). Recommended (UD-8): swap immediately after verification, so the next
  start of the artifact runs the new version — but **atomically**: make the backup as a hard link (same volume) or copy to
  `<name>.old`, then `rename(<name>.update → <name>)`, which on Windows replaces an existing file in one step
  (`MoveFileEx` with replace-existing), so the path always names a complete executable (176; the defect note). `Restart
  now` stays REQ-STARTUP-121's successor hand-over, unchanged.
- **Installed tree.** The running tree cannot be replaced while it runs, so the apply is at the next start or at `Restart
  now`: the launch that holds the instance record (164 (1)), before `app.whenReady`'s window and before any workspace or
  run, revalidates, persists the launch's directory as `workspace/lastOpened` (041 (a)), takes `apply.lock`, starts the
  verified setup **silently with relaunch** and exits. Relaunch: electron-builder's NSIS installer honours `--force-run`
  after `/S` (public prior art, §8) — to be measured on the assisted installer of PR-1a; the alternative is a fourth
  reserved token (`PD-STARTUP-002` revision), which this plan does not recommend. The 5 s first-paint bound is exempt for
  this launch (PD-STARTUP-008 (8)); what it shows meanwhile is UD-6.

**Concurrency (177).** Only the record holder applies; a launch handed over never does. A launch that claims the record
and finds `apply.lock` naming a live installer does not start the old tree: it waits — showing that Rotaris is being
updated, as REQ-STARTUP-162's shutdown wait does — then re-enters REQ-STARTUP-164 at clause (1). A lock naming a process
that has ended is an apply that did not complete: revalidate and retry within UD-9's bound, then discard. Two stubs racing
to prepare a new portable version are already settled by ADR-0054 ("Two launches racing to prepare").

**Cleanup (178).** `.partial` removed when a download ends, at quit, and otherwise at the next launch before a new
download; superseded pending updates removed (UD-5 decides which release wins); applied ones removed by the updated build's
first paint; the installer-hand-off leak of §1 closes because the installer now runs from `<data>/updates/<version>/`.

**What does not change.** The endpoint, the check's undisableability, exact names, the signature-before-parse order, the
1 MiB small-read bound, the chunked digest, no override, the compiled-in keys, ADR-0055's successor hand-over, and the
classification.

---

## 4. Crash, cancel and failure — what each interruption leaves

| Interrupted at | On disk | Next launch | Installation |
|---|---|---|---|
| manifest/signature fetch | nothing, or a `<version>/` with partial small files | removes them (178) | untouched |
| asset streaming / cancel | `<asset>.partial` (removed at once on cancel or quit; may survive a kill) | removes the partial, downloads again from byte 0 (175) | untouched |
| between digest match and record write | verified asset, no record | no record → files removed (171) | untouched |
| `verified`, never applied | record + files | revalidates and applies (installed flavour), or nothing to do (portable, already swapped) | old version runs until the apply |
| portable atomic swap | target is old or new bytes, `.old` present or not | runs whichever is at the path; `.old` removed only after the new version painted (176) | always startable |
| installer running, app killed | `apply.lock` with live installer pid | a launch waits for the installer (177) | depends on the installer — **unmeasured, UD-12** |
| installer killed / power loss mid-install | `apply.lock` naming a dead pid | treated as incomplete; revalidate + retry within UD-9 | **NSIS over-install atomicity unmeasured: the spike in PR-3 decides whether "never neither" holds** |
| revalidation fails (tampered, corrupt, key not carried) | record + files | discarded, nothing applied; report per UD-4 | untouched |
| updated build fails to start | pending files + `.old` (portable) still present | manual recovery path documented; automatic rollback is UD-11 | portable: `.old` restorable by hand |

---

## 5. The stages — one pull request each, against `main`

Every stage: its own temporary branch and worktree; `pnpm check` green; `pnpm verify:plan` followed; the affected views
updated in the same commit; first executions reported into ADR-0054, `PD-STARTUP-008` and `first-executions.md`. Under
[R-080](../product/requests.md#r-080)'s working rule each goes up as a pull request and lands only by the owner's act. No
stage adds a platform, a channel, a differential or delta download, or `electron-updater`.

**PR-0 — this plan** (docs only): the request row, REQ-STARTUP-169 to 181, `PD-STARTUP-008`, `PD-SHELL-005` revision 2,
the back-pointers, ESC-43, three defect notes. Waits for R-081 to reach `main` (the request log is contiguous).

### Stage 1 — the first installable release path (before any behaviour change)

**PR-1a — the installer conforms, and CI installs it.** *The repair landed on `main` on 2026-10-23 —
`nsis.oneClick: false`, `allowToChangeInstallationDirectory`, and a project include,
`apps/desktop/resources/installer.nsh`, writing `HKCU\Software\Rotaris\InstallDir` (ADR-0054, "The portable, the assisted
installer and the icon"). What this stage still owes is what that change measured not at all.* The assisted per-user NSIS
installer of REQ-STARTUP-016 to 019 (Welcome → Directory → Install → Finish, `%LOCALAPPDATA%\\Rotaris`, the uninstall entry,
`/S` and `/D=`), through `electron-builder.yml` and the `include`d NSIS script. A Windows-only `installer-proof` (and a CI
job in `ci.yml` on `windows-latest` x64): silent install into a scratch directory, registry values read back, the installed
`Rotaris.exe` launched to first paint with the network blocked at a proxy sink, **its log line classifying it `installer`
and checking nothing on a development feed**, silent uninstall leaving the per-user and per-workspace directories. Measures
`--force-run` after `/S` for PR-3. Owner input: none (the icon, O-4, is not needed to install).

**PR-1b — the portable launcher stub (first-release plan §4.5).** Spike first on a Windows x64 host (CLAUDE.md), result into
ADR-0054; then the stub: P4's preparation with the marker, `ROTARIS_PORTABLE_ARTIFACT`, arguments forwarded, the handle on
the artifact closed before the payload starts. Proofs: the two runs of REQ-STARTUP-156, the damaged-preparation classes,
the read-only directory, the rename-aside while running. **Needs a Windows x64 host**; `windows-latest` can build and run
the functional proofs, but REQ-STARTUP-155 timings are taken on the gate class machine.

**PR-1c — a release from a draft, installed from its download.** After O-2, O-3, O-4, O-11 and OQ-74 (§7): the owner pushes
a prerelease tag; `release.yml` produces the draft; on O-6's gate machine both artifacts are **downloaded from the draft**
and launched under REQ-STARTUP-159's four conditions (the portable twice). Recorded as REQ-STARTUP-156's gate, pass or not
performed. Agents push no tag and publish nothing.

**PR-1d — the current click flow, executed once against two real artifacts.** The apply and restart steps owed since
2026-09-28: an installed and a portable rc1 updated to rc2 through `Update now` / `Restart now`. **The feed obstacle:**
REQ-STARTUP-109 filters prereleases and drafts out and REQ-STARTUP-111 forbids moving the endpoint, so an update between
two drafts cannot be offered by the real feed. Either the first two **stable** releases are the test, or the gate machine
gets a separate, never-released snapshot whose OS store trusts a test root that a recording proxy answers
`api.github.com` with (IMPL-6). Baseline before Stage 2 changes the behaviour.

### Stage 2 — the pending update, its persistence and its integrity (no visible behaviour change)

**PR-2.** `updater/pending.ts` (171: schema, atomic write, read-as-absent, removal), `updater/revalidate.ts` (172),
`dataLayout.updates` (`packages/platform/src/dirs.ts`), the staging port moved from the temporary directory to
`<data>/updates/<version>/` (`electron.ts`), the size bound in `streamInChunks` (169), the atomic portable swap and `.old`
kept until the replaced artifact paints (176), the cleanup of 178, the installer running from the pending directory. The
click flow still triggers everything. Tests: unit over fakes for every row of §4 (an interruption injected at each port
call), `pnpm updater-proof` extended: a development launch with a planted `pending.json` leaves it byte-for-byte (173's last
sentence). Views: `02-process-view.md` files table, `05-state-ownership.md`. **Decisions needed: none** to build the store;
UD-5 and UD-9 set two constants and can follow.

### Stage 3 — the next-start apply and its recovery

**PR-3.** In `index.ts`, after `claimInstance` succeeds and before the first window: read `pending.json`; for the installed
flavour revalidate, persist the launch's directory, take `apply.lock`, start the setup `/S --force-run` (or the PR-1a
measured equivalent) and exit; a launch finding a live lock waits (177); the updated build's first paint clears the record,
the lock and `.old`. **Spike first: the installer's own over-install atomicity** — kill the setup at points across its run,
cut power on a VM, and record whether the tree still starts (UD-12 is decided on that evidence). Proof: a Windows
`update-apply-proof` against two locally packaged versions and a pending update signed with a **proof-only key** compiled
into a proof-only package (IMPL-5; `release:pipeline preflight` already refuses a build whose carried keys differ from the
key record, so such a package can never be released). **Blocked by:** PR-1a; UD-6, UD-8, UD-9, UD-11, UD-12.

### Stage 4 — the non-modal surface, the automatic trigger and `Restart now`

**PR-4.** `updater.ts`: the check starts the download itself (169); the notice faces of `PD-SHELL-005` revision 2 — the
download notice with a cancel action, the ready notice with `Restart now` on both flavours; `update.cancel` in
`commands/update.ts`; the action kind in `@rotaris/contracts`' notice action union and its dispatch in
`renderer/main.tsx` (`04-seams.md` §6, a notice, and §1, a command); `Restart now` on the installed flavour through PR-3's
apply, behind the existing `confirmUnsaved` → `integrationAllows` → `confirmClose` at the click and at the hand-off; REQ-180's
sentence in `NETWORK_DISCLOSURE` (`packages/ui/src/settings/About.tsx`). A surface change: `pnpm mockup` before drawing,
the `build-ui` skill, `pnpm app:drive` shots after. Proofs: `updater-proof`, `notice-proof`, the guard cases in
`updater.test.ts`. **Blocked by:** UD-1, UD-2, UD-3, UD-4, UD-5, UD-7, UD-10.

### Stage 5 — end-to-end acceptance on the built artifacts

**PR-5.** REQ-STARTUP-181's seven observations on O-6's machine for the installer and the portable, each recorded pass or
not performed, between two releases signed with a key both carry (the feed obstacle of PR-1d applies). Then the first
executions: `PD-STARTUP-008` and `PD-SHELL-005` revision 2 report back in place, ADR-0054 gains its report, one row in
`first-executions.md`. **Blocked by:** Stage 1 complete, O-6.

---

## 6. What the owner must decide

None of these is decided by this plan, by R-084, or under R-072's delegation: the request reserves them to the owner, and
the requirement clauses that depend on them say *reserved*. Each names the stage it blocks.

| # | Decision | Options | Recommended | Blocks |
|---|---|---|---|---|
| UD-1 | Metered or data-saving connections | (a) download regardless; (b) skip automatic download where Windows reports the connection metered (a native cost query) and offer it by click; (c) a setting — a preference key, so a further directive on REQ-STARTUP-146 and REQ-SHELL-006 | (a) for the first slice, disclosed (180); revisit with (b) | PR-4 |
| UD-2 | What a cancel means | (a) this process only: the offer returns with a manual download action, and the next launch downloads again; (b) the version is waved off as a dismissal is; (c) downloads pause until the user starts one | (a) | PR-4 |
| UD-3 | What dismissing means once downloads are automatic | (a) dismissing the download or ready notice only hides it; waving a version off is a separate act on the cancelled offer; (b) dismissing the download notice cancels and waves off; (c) keep REQ-STARTUP-117 as it reads | (a) — needs a revision of PD-STARTUP-008 naming REQ-STARTUP-117, REQ-SHELL-114, REQ-NOTIFY-216 | PR-4 |
| UD-4 | Which background failures the user sees | (a) transport failures silent and retried at the next launch; signature, manifest, digest and revalidation refusals shown as `Update not installed`; (b) everything shown; (c) everything silent except an apply the user started | (a) | PR-4 |
| UD-5 | Which release a pending update yields to | newer release appears: (a) replace the pending one, (b) keep it until applied; the latest release becomes **older** than the pending one (a release withdrawn): (c) discard pending, (d) still apply it | (a) and (c) | PR-2 constants, PR-4 |
| UD-6 | What the first start after an installed-flavour update shows while its installer runs | (a) a small non-modal "Updating Rotaris…" window, then the updated app opens; (b) nothing until the updated app paints; (c) the installer's own progress page | (a) | PR-3 |
| UD-7 | A notice after the update took effect | (a) one transient acknowledgement in the first window ("Updated to X"); (b) a persistent notice with the release summary; (c) none | (a) | PR-4 |
| UD-8 | Install timing, stated explicitly | **Next start** is the contract. (i) Never install at quit — `autoInstallOnAppQuit`'s pattern is **not** the contract; (ii) the portable's artifact is swapped as soon as it is verified (the running process is unaffected, the next start runs it) vs swapped at the next start by the launcher stub | (i) confirm; (ii) swap when verified | PR-2, PR-3 |
| UD-9 | Retention and retries | how many next-start apply attempts before a pending update is discarded; how long an unapplied pending update is kept; whether an offline start applies | 2 attempts; kept until applied or superseded; offline start applies (172 needs no network) | PR-3 |
| UD-10 | Where progress lives when another notice holds the single banner (REQ-SHELL-114) | (a) banner only — progress hidden while another notice is shown; (b) also an "Updates" line in About & Legal with progress and cancel; (c) a title-bar indicator (a new surface, design work) | (b) | PR-4 |
| UD-11 | Automatic rollback when the updated build will not start | (a) none: `.old` kept until the new version paints, recovery documented; (b) the launcher stub falls back to `.old` (portable); (c) both flavours, which the installed tree cannot do without UD-12 (b) | (a) now, (b) later | PR-3 |
| UD-12 | If PR-3's spike shows the NSIS over-install is not interruption-safe | (a) accept the residual risk, documented; (b) a side-by-side versioned install layout (an ADR-0054 revision and a new installer shape); (c) installer-only updates disabled until (b) | decide on the spike's evidence | PR-3 |

**Not the owner's — implementation choices the stages make and record** (they decide no product behaviour):
IMPL-1 the `<data>/updates/` layout and `pending.json` schema; IMPL-2 the hard-link-then-replace swap (or copy where a
link fails); IMPL-3 `--force-run` versus a relauncher, chosen on PR-1a's measurement; IMPL-4 hashing the retained asset at
apply (≈1 s, inside the exempt launch); IMPL-5 a proof-only key in proof-only packages, refused by the pipeline's preflight;
IMPL-6 how the gate snapshot intercepts the feed for update acceptance, kept off the release-gate snapshot; IMPL-7 no
`Range` resume — a download interrupted restarts at byte 0 (a resume would be a broadening to ask for, not to take);
IMPL-8 the cancel's 2 s bound (170) as the figure the proof measures; IMPL-9 log lines at `info`/`warn` per
`PD-MONITOR-002`.

---

## 7. What blocks an installable release, and whose it is

Nothing below is claimed done. Each is already recorded where it lives; R-084 adds the last two.

| Blocker | Owner | Where |
|---|---|---|
| O-2 — the signing key pair, the secret, the public key in `RELEASE_SIGNING_KEYS` | **owner** | [first-release-plan §6.1](first-release-plan.md) |
| O-3 — the LGPL corresponding-sources address | **owner** | §6 |
| O-11 — the reviewed-exceptions table | **owner** (a maintainer's signature) | §6 |
| OQ-72, OQ-74, OQ-75 — the notices' readings; OQ-83 — the signature's form | consortium under R-072 | [open-questions.md](open-questions.md) |
| O-4 — the icon | **owner** | §4.9 |
| O-6 — the gate machine (snapshot-restored Windows x64 VM) | **owner** | §5 |
| §4.5 — the portable's launcher stub, its spike on a Windows x64 host | agent, on a host | PR-1b |
| The one-click installer defect — repaired on `main` 2026-10-23; its measurement (pages, `/S`, `/D=`, the two registry values) is owed | agent | PR-1a |
| The tag, the draft's publication, the release itself | **owner** | R-080's working rule |
| IC-3, IC-8, `PD-STARTUP-001` — no Linux or macOS artifact | unchanged | [implementation-conditions.md](implementation-conditions.md) |
| UD-1 to UD-12 | **owner** | §6 |
| ESC-43 — domain 19's update requirements against domain 11 | **owner** | [owner-decisions.md](owner-decisions/15-escalations-after-the-gate-2026-10-22.md#esc-43) |

---

## 8. Prior art, and why it is not the contract

`electron-updater`'s public documentation (electron-builder, read 2026-10-22) names the pattern this request resembles:
`autoDownload` (download as soon as an update is found), `autoInstallOnAppQuit` — since electron-builder 27 an
`autoInstallEvent` of `"onQuit"`, `"manual"` or `"onNextLaunch"` — and `quitAndInstall({ isSilent, isForceRunAfter })`, whose
NSIS form passes `--force-run` to the installer. The correspondence, and the difference:

- **`autoDownload`** ≈ REQ-STARTUP-169, but here the signature over `SHA256SUMS.txt` is verified before anything is parsed or
  downloaded, against keys compiled into the build — not a digest from a `latest.yml` beside the artifacts.
- **`autoInstallOnAppQuit` / `"onQuit"`** — install whenever the app quits — is **not** the owner's contract and is not
  built (175, UD-8 (i)). **Next start** is: the version that runs after the next start is the new one, applied by the
  launch that holds the instance record, before any work exists to interrupt.
- **`quitAndInstall`** ≈ `Restart now` (174), but behind the three guards a clicked close asks, and on the portable through
  ADR-0055's record hand-over rather than a quit.

ADR-0054's reasons for refusing `electron-updater` all still hold (extra published assets, its own verification source, a
replaced macOS bundle, channels and configurable feeds), and nothing here reopens Alternative A.
