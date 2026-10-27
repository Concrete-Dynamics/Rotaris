# The first release — Windows only, skills and workspace-context injection — 5. The release gate

Part 6 of 8 of [the first-release plan](../first-release-plan.md), which indexes every part.

## 5. The release gate

This is REQ-STARTUP-156 narrowed to one key. Each check is recorded as pass, fail, or "not performed". A check
that was not performed fails the gate.

| Check | Where it runs |
|---|---|
| The version guard and the package-pin guard pass | pipeline |
| Notices validation passes | pipeline |
| `SHA256SUMS.txt` covers every asset, and every digest matches | pipeline |
| The signature verifies, against a key every offerable build carries (168 b) | pipeline, against the key record |
| The body carries its seven elements, as the directive narrows them | pipeline |
| Installer and portable launched to first paint under REQ-STARTUP-159's four conditions; the portable twice | the gate machine (§6) |

**The gate machine** must meet REQ-STARTUP-156's four conditions:

- a Windows x64 machine that is not used for building or development;
- no Node, no Python and no other separately installed runtime;
- outbound network blocked for the whole check;
- the artifact is downloaded from the draft release and matches its manifest line.

A snapshot-restored virtual machine meets all four, and restoring it between releases is allowed. This repo's
development machine is Windows ARM64, and REQ-STARTUP-026 makes emulation carry no acceptance criterion, so it
cannot be the gate.

**The conditions that bind this release:**

- **IC-7** is discharged by §4.3. *Discharged 2026-09-27: the generator lists the language servers.*
- **IC-4** half 2 is the owner's (§6). It binds the restore's sign-off, and the restore ships in this release.
- **IC-3 and IC-8** bind only artifacts this release does not publish.
- **ESC-6** already accepted win32 reporting confinement as `available: false` for the first release.
