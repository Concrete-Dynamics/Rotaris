# Background updates — installable from a release, downloaded by itself, applied at the next start — 7. What blocks an installable release, and whose it is

Part 7 of 8 of [this document](../background-update-plan.md), which indexes every part.

## 7. What blocks an installable release, and whose it is

Nothing below is claimed done. Each is already recorded where it lives; R-084 adds the last two.

| Blocker | Owner | Where |
|---|---|---|
| O-2 — the signing key pair, the secret, the public key in `RELEASE_SIGNING_KEYS` | **owner** | [first-release-plan §6.1](../first-release-plan.md) |
| O-3 — the LGPL corresponding-sources address | **owner** | §6 |
| O-11 — the reviewed-exceptions table | **owner** (a maintainer's signature) | §6 |
| OQ-72, OQ-74, OQ-75 — the notices' readings; OQ-83 — the signature's form | consortium under R-072 | [open-questions.md](../open-questions.md) |
| O-4 — the icon | **owner** | §4.9 |
| O-6 — the gate machine (snapshot-restored Windows x64 VM) | **owner** | §5 |
| §4.5 — the portable's launcher stub, its spike on a Windows x64 host | agent, on a host | PR-1b |
| The one-click installer defect — repaired on `main` 2026-10-23; its measurement (pages, `/S`, `/D=`, the two registry values) is owed | agent | PR-1a |
| The tag, the draft's publication, the release itself | **owner** | R-080's working rule |
| IC-3, IC-8, `PD-STARTUP-001` — no Linux or macOS artifact | unchanged *(2026-10-26, [R-087](../../product/requests.md#r-087): IC-3 binds macOS alone; a Linux artifact may be built under [ADR-0066](../adr/0066-the-linux-artifact-is-built-on-a-developer-host.md), and none is published while `PD-STARTUP-001` stands)* | [implementation-conditions.md](../implementation-conditions.md) |
| UD-1 to UD-12 | **owner** | §6 |
| ESC-43 — domain 19's update requirements against domain 11 | **owner** | [owner-decisions.md](../owner-decisions/15-escalations-after-the-gate-2026-10-22.md#esc-43) |

---
