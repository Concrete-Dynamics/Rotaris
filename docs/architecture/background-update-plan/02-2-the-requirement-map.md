# Background updates — installable from a release, downloaded by itself, applied at the next start — 2. The requirement map

Part 2 of 8 of [this document](../background-update-plan.md), which indexes every part.

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
| REQ-NOTIFY-219, 212 | "no signature is verified"; "once per launch" | **contradict domain 11** today, independent of R-084 | raised as [ESC-43](../owner-decisions/15-escalations-after-the-gate-2026-10-22.md#esc-43) |

New, in one line each: **169** the download starts on its own, bounded by the stated size; **170** progress and cancel;
**171** the pending update and its one record; **172** verified again before any apply; **173** it takes effect at the
next start, without a click; **174** `Restart now` behind the existing guards; **175** nothing restarts or installs on its
own, and nothing installs at quit; **176** never an installation that cannot start; **177** one apply at a time, a launch
during an apply waits; **178** what stays on disk; **179** failures of the background path; **180** the disclosure;
**181** acceptance on the built artifact.

---
