# Background updates — installable from a release, downloaded by itself, applied at the next start — 3. The design the stages build

Part 3 of 8 of [this document](../background-update-plan.md), which indexes every part.

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
