# The first release — Windows only, skills and workspace-context injection — 1. Scope

Part 1 of 8 of [the first-release plan](../first-release-plan.md), which indexes every part.

## 1. Scope

| In the first release | Where it stands | Section |
|---|---|---|
| Skills — discovery, the catalog, load modes, the Settings tab, skill commands, `/skill <path>` | built 2026-09-15 (ADR-0063; `pnpm skills-proof`) | §2 |
| Skills — `/skills`, REQ-CHAT-162's listing | ~~**not built** (`SKILLS_LISTING_NOT_BUILT`, `packages/ui/src/slash/skills.ts`)~~ **built 2026-09-27** (`pnpm skills-proof`, launches 1c and 1d); OQ-67 on its reach from Settings ruled 2026-10-06 as built ([R-071](../../product/requests.md#r-071)): the Skills tab's table is that reach | §2 |
| Skills — ESC-37, ESC-38, ESC-39 | **ruled 2026-09-27** as recommended ([R-052](../../product/requests.md#r-052)); amended | §2 |
| Workspace-context injection, REQ-WORKSPACE-041..050 | built 2026-09-22 under `PD-WORKSPACE-002` | §3 |
| Injection — REQ-WORKSPACE-049's latency bound, a built-app proof | **built 2026-09-27** (`pnpm injection-proof`); the bound **met on Linux**, the Windows gate-class reading **owed**; OQ-64 **ruled 2026-09-27**; OQ-68 raised | §3 |
| The Windows release pipeline, REQ-STARTUP-027..038, 141..143, 156, 158, 167, 168 | **the tag workflow, the manifest, the signature step, the key record and the release body built 2026-10-22** ([R-080](../../product/requests.md#r-080); §4.2, §4.7, §4.8; not yet run on a tag); the installer built once (ADR-0054, 2026-09-04); **the version guard built 2026-09-27** (§4.1), ~~and the setup manifest it checks is owed~~ **the setup manifest built 2026-09-28** (§4.1; the guard passes both halves; its consumer, machine setup, is not built and not in this plan); **the notices generator built 2026-09-27** (§4.3), its validation refusing until O-3, O-11 and OQ-74; **the two bundled assets wired into `pnpm package` 2026-09-27** (§4.4), so a package refuses with it | §4 |
| The updater, REQ-STARTUP-107..124 | ~~**not built** — no module in `apps/desktop/src/main/`~~; **in the first release**, ruled 2026-09-27; **built 2026-09-28** (`apps/desktop/src/main/updater/`, `pnpm updater-proof`; the compiled-in key set empty until O-2; the apply and the restart unit-tested over fakes, their run against a real artifact owed to the next Windows package, IC-3 — *corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*); OQ-83, OQ-84, OQ-85 raised; repaired at verification the same day (classification order, the record pass, the re-offer, the launch-time cleanup), OQ-86 raised (ruled 2026-10-06, R-071, and built: the active-run confirmation at the click and before the hand-off); and at the second verification (a refused record pass now fails the restart); OQ-311 ruled 2026-10-14 under R-072 and built by fin46 (every main window's unsaved-settings guard asked ahead of the run box at the click and at the hand-off; unit-tested over fakes, its built-app run owed with the rest) | §4.6 |

**Deferred by "thats it".** Each item stays owed where the record already carries it:

- The other product gaps in `codebase.md`'s "Where the next work lands", for example providers' device-code and
  PKCE authenticators, Git integration and merge, the manual compression part, and persona memory.
- The open notes in `../defects/`. *Since 2026-09-29 ([R-067](../../product/requests.md#r-067)) the owner has ruled the
  decisions five of them waited on — ESC-42's floor, OQ-103's cancel in flight, REQ-LIBRARY-092's fallback (OQ-113),
  `delegate`'s `session_id` (OQ-66; built 2026-09-29, its note in `fixed/`, OQ-131 ~~open on~~ on the readings built, ratified 2026-10-06 by [R-071](../../product/requests.md#r-071) in `PD-ORCH-005` clause 37) and the graceful stop's status (OQ-96, whose note is settled) — and has directed that
  this workflow repair the open notes and the live runs' findings. Each note stays open until its repair lands; OQ-114 to
  OQ-116 ~~are open~~ stood against the live runs' figures and blocked nothing in this plan; all three were ruled
  2026-10-06 ([R-071](../../product/requests.md#r-071)).*
- The ~~four~~ red proofs: ~~`transcript-proof`,~~ `library-proof`, `part-h-proof`, ~~and `theme-proof`'s contrast section
  (OQ-56)~~ *(`theme-proof` ran green whole, its contrast section included, at all three themes and five scales on
  2026-10-06 on bundle `finacc3-accept1-3`'s head, load average 1.8 at its start: OQ-56 was ruled 2026-09-18 and its
  token raised)*. *`transcript-proof` was recorded as passing on 2026-09-28 (REQ-CHAT-055's measurement round under R-062) and
  reopened the same day: its fix round passed four runs of six, never three in a row, on Linux, and fix round 2 two of six (nine passes in fifteen); ~~the per-increment cost
  no longer grows with depth, the pooled comparison stands about two thirds of a frame over at the median~~ *(fix round 1's
  reading: the per-increment cost at parity in its six traced pairs, the pooled comparison about two thirds of a frame over
  at the median)*; fix round 2 reads the per-increment script at parity in two traced pairs of five and 2.5–4.8 ms higher
  on the loaded side in three, so whether the cost still grows with depth is unshown, and its six runs stand about a frame
  and a half over at the median (+24.1 ms); the verifier's three on that build read +9.0, +40.7 and +18.1 ms, and fix
  round 3 (record only) re-ran it three times on a quiet host, +2.9, +11.0 and +0.9 ms, three passes, with the loaded
  side's script still 1.2–4.2 ms higher per increment in each traced pair — six passes in twelve on that build, so the
  note is not moved; the CPU-profile round of 2026-09-29 named the loaded side's extra script by function — the
  transcript's own passes over every displayed row — and repaired them, after which twelve consecutive runs passed and sixteen of seventeen in all, the one red on a saturated host (a series on a host that stays quiet is still owed),
  so the append comparison is green again on Linux and the note is moved
  ([note](../../defects/fixed/appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript.md), repaired; OQ-89 — OQ-76 on its branch, renumbered at the merge — holds the
  reading under a burst, with the round's evidence).* *Two more were measured red on 2026-09-27 while §2.2 was built, both before it and unchanged by it:*
  ~~`slash-proof` at its first catalogue assertion since ADR-0063
  ([note](../../defects/fixed/slash-proof-expects-every-built-in-to-carry-the-action-badge.md)), and `skills-proof`'s policy
  launch on Linux only ([note](../../defects/fixed/skills-proof-writes-its-global-policy-where-only-windows-reads-it.md)).~~
  **Both repaired 2026-09-28 under R-062, in the proofs and not the product** — the badge assertion reads ADR-0063's
  set (`action` for the built-ins and mirrors, `skill` for `/skill` and `/skills`), and every proof takes the global
  configuration directory from `configDirFor`; `skills-proof` passed 10 checks over 9 launches as root on Linux
  ([fixed](../../defects/fixed/skills-proof-writes-its-global-policy-where-only-windows-reads-it.md),
  [fixed](../../defects/fixed/slash-proof-expects-every-built-in-to-carry-the-action-badge.md)). ~~`slash-proof` is not
  green for it.~~ **`slash-proof` is green again 2026-09-29 (R-067).** It moved from one red to another: it ~~now stops at the model chip's eval~~
  stopped at the model chip's eval ([fixed](../../defects/fixed/slash-proofs-model-chip-eval-shares-its-offset-with-the-usage-notice-read.md),
  repaired 2026-09-28 in the proof with the chip's close and the ground it measures on), and ~~now stops~~ then stopped at a **product**
  red: REQ-CHAT-027's partial shade at 4.06:1 on the ground the composer dock paints, every other check passing in a
  diagnostic run ([fixed](../../defects/fixed/the-slash-token-colours-clear-their-floor-on-a-ground-the-composer-no-longer-paints.md);
  ADR-0050's fourth execution) — repaired in the product by deriving the four on the dock's `--rt-surface`
  (`COMPOSER_GROUND`), every role at 4.50:1 or more on all three palettes (ADR-0050's fifth execution). On Linux as
  root, ~~`resilience-proof`,~~ `notice-proof` and `init-proof` are red for their recorded notes
  ([override select](../../defects/fixed/resilience-proofs-override-launch-selects-a-native-select-the-wait-header-no-longer-draws.md), and
  [code intelligence as root](../../defects/fixed/the-code-intelligence-server-dies-when-the-app-runs-as-root.md) for the last
  two). **`resilience-proof` repaired 2026-09-28 under R-062, in the proof and not the product:** scenario 4 chooses the
  model through the driver and every launch is bounded, and all ten scenario blocks (eleven launches) pass as root on Linux. The overrun it
  showed was a product loop, not an ignored signal: a quit whose standard output has been closed never ends
  ([note](../../defects/fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md), repaired 2026-09-29 under R-067; REQ-MONITOR-131's
  backstop). `sandbox-proof` reads the host's own verdict since 2026-09-28 ([Windows verdict, fixed](../../defects/fixed/sandbox-proof-asserts-the-windows-verdict-on-every-platform.md)).
  It is green on Linux without `bwrap`. On Linux with `bwrap` it was red on a **product** defect that IC-8's first Linux
  execution found ([absent-subpath residue](../../defects/fixed/the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md)).
  That defect was repaired 2026-09-29 under R-067: the renderer now refuses the command. The proof is green there too,
  and OQ-140 carries the cost of that repair on Linux. On Windows it was re-run on 2026-10-21 (the Windows ARM64 session's D3) and
  passed on the outside path, which leaves IC-8 where it was.
  Measured red there on 2026-09-29, beside REQ-CHAT-055's CPU-profile round: ~~`terminal-proof` (112 of 116; its
  live section's commands are PowerShell's,
  [note](../../defects/fixed/terminal-proofs-live-section-drives-powershell-commands-on-every-platform.md))~~ *(measured at `fa377e6`, before `ef1540e`'s repair of the same defect on `main`)* and
  ~~`chat-controls-proof` in a checkout without the bundled code-intelligence runtime~~
  ([note](../../defects/fixed/chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md)) *(repaired
  2026-09-29 under R-067: the proof's workspaces now carry an answered project setup and a launch that starts one anyway
  fails by name; green without the bundle. `notice-proof` goes red the same way —
  [note](../../defects/fixed/notice-proof-reads-a-failed-project-setup-in-place-of-the-hook-review-notice.md), ~~open~~ **repaired
  2026-10-01 (fin2) the same way, green without the bundle**)*.
  **2026-09-28, R-062:** `init-proof`'s later red was a product race, a skip answered before the open's
  resolution swallowing the background task ([fixed](../../defects/fixed/a-skip-answered-before-the-open-resolves-swallows-the-background-task.md)),
  and behind it the setup dialog drawing that background run as its own and refusing Escape
  ([fixed](../../defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md); OQ-123), whose repair let a skip move
  a task completed during it into skipped until the skip stopped reading after the resolution, and let a skip and
  the run's recording erase each other until both went through one marker-write queue
  ([fixed](../../defects/fixed/a-skip-can-move-a-completed-task-into-skipped.md)),
  and `code-intel-proof`'s were three harness defects
  ([token order](../../defects/fixed/code-intel-proofs-branch-launch-puts-the-sandbox-switch-ahead-of-the-token.md),
  [setup collision](../../defects/fixed/code-intel-proofs-setup-launches-collide-with-the-background-initialization.md),
  and, found in the fix round, [fixed-offset presses](../../defects/fixed/code-intel-proofs-setup-launches-press-at-fixed-offsets.md)).
  A fourth, the shared capture seam's Settings press, which a notice could deflect, was repaired 2026-09-30 under R-067
  ([fixed](../../defects/fixed/the-capture-seams-settings-category-press-can-be-deflected-by-a-notice.md)): the seam now presses
  again until the category is selected, and logs when it never is. *(This line read "One more stays open … the nine
  proofs that use the seam are exposed to it until it is repaired" until then.)* `code-intel-proof`
  no longer uses that seam (its setup launches open Settings by chord and press only after the notice), after the fix
  round's verifier found its first correction too late for `setup-cancel` (three reds in seven runs). As measured after the last repairs, `init-proof` passes
  three runs in a row as root on Linux and `code-intel-proof` passes four section-5 runs and then three whole runs in a row.
  **2026-10-01 (fin2):** in a checkout without the bundled code-intelligence runtime `init-proof` still went red as "the
  background task recorded nothing" ([fixed](../../defects/fixed/init-proof-reads-a-missing-code-intelligence-bundle-as-a-task-that-recorded-nothing.md)):
  it now builds the bundle when it builds, refuses under `--skip-build` naming `pnpm code-intel:bundle`, and quotes the app
  log's setup failure; green as root on Linux built from nothing and again with `--skip-build`.
- The unbuilt directives `PD-TOOLS-003` (**built 2026-09-27**, R-055), `PD-TOOLS-004` (**built 2026-09-27**, R-057), `PD-TOOLS-005` (**built 2026-09-28**, R-062), `PD-ORCH-004` (**built 2026-09-27**, R-057) and `PD-MONITOR-002` (**built 2026-09-27**, R-055). *Annotated 2026-10-13: all five are built; their first executions are in `../product/directives.md`.*
- The macOS and Linux artifacts, which are bound by IC-3 and IC-8 and now also by `PD-STARTUP-001`.

**One deferral the owner should look at twice.** Persona memory is a named empty slot in REQ-WORKSPACE-060's
ordered unit list, and REQ-WORKSPACE-050 decides where it is discovered. It is outside "workspace injection" as
the specification uses the words, so it is deferred. If the owner meant it to be included, it is the largest
item this plan would gain.
