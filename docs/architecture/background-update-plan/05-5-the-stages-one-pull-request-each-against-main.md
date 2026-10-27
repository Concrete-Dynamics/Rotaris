# Background updates — installable from a release, downloaded by itself, applied at the next start — 5. The stages — one pull request each, against `main`

Part 5 of 8 of [this document](../background-update-plan.md), which indexes every part.

## 5. The stages — one pull request each, against `main`

Every stage: its own temporary branch and worktree; `pnpm check` green; `pnpm verify:plan` followed; the affected views
updated in the same commit; first executions reported into ADR-0054, `PD-STARTUP-008` and `first-executions.md`. Under
[R-080](../../product/requests.md#r-080)'s working rule each goes up as a pull request and lands only by the owner's act. No
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
