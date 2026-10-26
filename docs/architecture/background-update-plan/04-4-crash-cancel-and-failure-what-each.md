# Background updates — installable from a release, downloaded by itself, applied at the next start — 4. Crash, cancel and failure — what each interruption leaves

Part 4 of 8 of [this document](../background-update-plan.md), which indexes every part.

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
