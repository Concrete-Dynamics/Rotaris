# The title bar's update indicator and its action — brief

**Status:** proposed
**Written:** 2026-11-21 by `design-ui` (brief), for [R-117](../../product/requests.md#r-117)'s stages that draw the indicator ([`PD-SHELL-018`](../../product/directives/pd-shell-018.md#pd-shell-018), "Recorded, not built"); the same day the notice's and the acknowledgement's faces moved to [`notice-banner.md`](notice-banner.md) under [OQ-557](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-557), and the rulings of OQ-552 to OQ-556 and of the channel question were written in ([R-072](../../product/requests.md#r-072))
**Surface:** the **title bar**'s update indicator and its one action (PD-SHELL-018); §7 row "Title bar, nav rail"; mockup section `title bar`; nearest built code `packages/ui/src/AppShell.tsx` (the title bar), `ImprovementActivity.tsx`, `apps/desktop/src/main/updater/updater.ts`; theme `rotaris-dim`

The regions are named across both briefs: **R1** the update notice and **R4** the "Updated to" acknowledgement are [`notice-banner.md`](notice-banner.md)'s; **R2** the indicator and **R3** its action are this brief's.

## 1. Authority

**Fixed, by the clause that binds** (a directive is cited in place of the requirement it displaces):

| Id | The clause that binds here |
|---|---|
| [`PD-SHELL-018`](../../product/directives/pd-shell-018.md#pd-shell-018) rev. 2 (extends REQ-SHELL-033, narrows REQ-SHELL-115, REQ-NOTIFY-044) | the indicator: present while a download runs and while a verified pending update waits, absent otherwise; after the improvement-analysis indicator (REQ-SHELL-037), before the window controls ([`PD-SHELL-003`](../../product/directives/pd-shell-003.md#pd-shell-003)); version and measured progress with the cancel, or "ready" with `Restart now`; present whatever holds the banner; takes no focus and opens nothing on its own; an accessible name and description stating the state (REQ-SHELL-058); elides to an icon before anything else in the bar is clipped |
| [`PD-STARTUP-008`](../../product/directives/pd-startup-008.md#pd-startup-008) rev. 3 | UD-1 metered → no download, so no indicator; UD-2 a cancel holds for the process and the next launch downloads again; UD-3 dismissing the download or ready notice only hides it; UD-4 a silent transport failure; UD-8 swap on verification; UD-10 the indicator; item 13 the in-place ready state (OQ-553) and the ready state carried by the indicator alone while the update notice is not current (OQ-554); item 14 which states publish |
| [`PD-SHELL-005`](../../product/directives/pd-shell-005.md#pd-shell-005) rev. 3 | the cancel member, enabled throughout; "When the notice changes" (OQ-554) |
| REQ-STARTUP-118, -170, -174, -175 | `{measured}` and its repaint rule; cancel within its bound, leaving nothing; `Restart now`'s three guards; nothing restarts on its own |
| REQ-SHELL-033, -037, -058, -065, -115, -149, REQ-SHELL-144..-148, -160 | the bar's order and height token; the neighbour's name; tooltip = description; nothing clipped at 1000×680; one identifier, one result from either place; the accessibility contract |
| `docs/design/README.md` §1.3, §1.7, §1.8, §1.9, §1.11 | lifecycle colours; one filled control, hairline or bare-text controls; motion on status only; icon ink by meaning; copy voice |

**Departures from the mockup, each with its clause.** The mockup's `title bar` ends in a `⌘K Commands` hint and a help glyph and has no status item; the bar's items and order are REQ-SHELL-033's with PD-SHELL-003 and PD-SHELL-018, so the indicator stands where PD-SHELL-018 puts it and the mockup gives only its craft: right-hand items in tertiary ink at the small text step, icon and text on one line.

**Left open, and settled below:** the indicator's wording (PD-SHELL-018), the icon form's shape, the place among the bar's right-hand items, the live-region rule, the data the renderer needs.

**Out of this brief:** the notice and the acknowledgement ([`notice-banner.md`](notice-banner.md)); UD-6's "being updated" window and REQ-STARTUP-177's waiting launch; the three guard dialogs `Restart now` asks (as built in `updater.ts`).

## 2. Journeys that cross it

Guide 04 §4's table has no update journey; these are the update's own, shared with [`notice-banner.md`](notice-banner.md), and they cross **Watch** (nothing interrupts, REQ-STARTUP-169, -175), **Several agents** (`Restart now` asks the active-run confirmation, REQ-STARTUP-046), **Recover** (the failure notice) and **Away and back** (the indicator stays while away). Compose, Approve, Answer, Steer, Review, Trace, Configure, Reuse and First launch are crossed only where another notice takes the banner (U5).

- *When a newer Rotaris is published, I want it to arrive without my asking and without stopping my work, so that I am current without managing it.* *When it is ready, I want to choose when it takes effect, so that a run is never cut off.* *When I cannot update in place, I want to be sent to the release, so that I can install it myself.*

| # | Entry → steps → exit | Wait (its limit) | Ask (its commitment) | Trust point (the evidence) | Recover |
|---|---|---|---|---|---|
| U1 | check after the window shows → banner "Downloading" + indicator → verified → ready notice + ready indicator → user quits → next start runs the new version → "Updated to" acknowledgement | the transfer: none stated, shown as `{measured}`; the next-start apply: REQ-STARTUP-177's stated bound | none until ready | the version named; "verifying against the published checksum" (REQ-STARTUP-118) | U3 cancel; U6 failure |
| U2 | ready → `Restart now` (banner or indicator) → the three guards → the successor starts → acknowledgement | the successor's start | each guard is a decline-able ask; a decline changes nothing (REQ-STARTUP-174) | the guards name what they protect | a decline returns to ready, unchanged |
| U3 | downloading → `Cancel download` (banner) or the indicator's cancel → transfer ends → the offer with `Update now` (UD-2) where [`notice-banner.md`](notice-banner.md) §4.1 publishes it → exit: `Update now`, Dismiss (waves off, REQ-STARTUP-117), or nothing (the next launch downloads) | the cancel's end: REQ-STARTUP-170's bound | none | no error notice follows (REQ-STARTUP-170) | `Update now`; else the next launch |
| U4 | metered connection → offer with `Update now` (UD-1) → as U3's exit | — | `Update now` commits to the download | the offer is the same notice as any offer | Dismiss |
| U5 | downloading or ready → another notice replaces the banner (REQ-NOTIFY-024) → the indicator alone carries the state, the cancel and `Restart now` (UD-10); only a failure takes the banner back (OQ-554) | as U1 | as U1, U2 | the indicator's description | the indicator's action |
| U6 | an integrity refusal, a failed download the user started, a failed `Restart now` or next-start apply → `Update not installed` with details; the indicator leaves | — | `Try again`, none on an integrity refusal (OQ-555) | the technical sentence in details, copyable (REQ-NOTIFY-038) | `Try again`; download by hand |
| U7 | link-only build → `Rotaris {version} is available` with `Open release page` → the browser opens the release's page → the user installs it | — | the action opens a browser, nothing else | the page is the feed's repository's own (PD-STARTUP-014) | Dismiss (waves off) |
| U8 | downloading or ready → Dismiss (UD-3, OQ-552) → the banner is empty, the indicator stays, the apply still follows | — | — | the indicator | the indicator's action |

## 3. Content model and hierarchy

**R2 — the update indicator** (PD-SHELL-018): one group in the title bar, **immediately after the improvement-analysis indicator and before the Sessions control**, so the two background-activity indicators stand together and the controls keep their place beside the window controls (both readings satisfy PD-SHELL-018's "after … before"; this one is chosen). It holds a state icon, a label, a figure while downloading, and one action. Its primary is the label; the action is subordinate and drawn quieter. Present only in the downloading and ready phases.

**R3 — the indicator's action**: `Cancel` while downloading, `Restart now` while ready — the same action members the banner dispatches (REQ-SHELL-115: one identifier, one result from either place).

**Difficult data.** A version as long as the release naming allows (`0.1.0rc6` form, REQ-STARTUP-028); `{measured}` as `{N} MB` with N in four digits (REQ-STARTUP-118, size unknown); the improvement indicator showing its longer retrospective label (`ImprovementActivity.tsx`) beside a deep workspace path with a session name (PD-SHELL-016 clause 6) at 1000×680.

### 3.1 What the renderer needs from main — the channel `update:state` (§10 item 1)

The updater owns every fact here (`background-update-plan/03` "State owner"); the renderer draws and dispatches, never decides. One payload, validated at the boundary, pushed to every main window on each transition and read by a window that mounts later through a read command (`update.state`, the `improvements.activity` precedent in `packages/contracts/src/commands.ts`, read after the window subscribes):

| Datum | When | For |
|---|---|---|
| `phase`: `downloading`, `ready`, or `none` | always | R2 present or absent |
| `version`, bounded by REQ-STARTUP-028's naming | downloading, ready | R2's label and description |
| `measured`: REQ-STARTUP-118's exact `{measured}` string | downloading | R2's figure, identical to R1's message |
| `inPlace`: the target was already replaced (UD-8) | ready | the in-place copy (OQ-553) |
| `noticeId`: the update notice's retained identifier (REQ-NOTIFY-217), or none | always | the renderer compares it with `notice:current`'s identifier for §7's live-region rule; main re-emits nothing when another notice is published |

No address, path or URL crosses. For one transition main emits the state before it changes the notice, so the indicator and the banner never disagree in a painted frame. R1's meter is not on this channel: it is the notice's own field ([`notice-banner.md`](notice-banner.md) §3.1).

## 4. States

| Region | ideal | empty: first use | empty: cleared | empty: no results | filtered | cannot-show | loading | streaming / partial | error | success | disabled | permission-needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R2 | ready: icon in `--rt-done`, `{version} ready`, `Restart now` | absent (PD-SHELL-018) | absent after a cancel, a failure (shown or silent), an apply | n/a | n/a | below the full form's fit: the icon form (§8) — icon and an icon-only action, label and figure in the description | n/a: absent until the download starts | downloading: icon in `--rt-run`, `Downloading {version}`, the `{measured}` figure in `--rt-font-mono`, `Cancel` | absent: a failure is R1's (UD-4) | ready (as ideal) | n/a: never drawn disabled | absent on a metered offer: no download runs (UD-1) |
| R3 | `Restart now`, ghost | n/a | n/a | n/a | n/a | icon-only: `ph-x` (cancel), `ph-arrow-clockwise` (restart), each named (§7) | n/a | `Cancel` | n/a | n/a | n/a: a second press while cancelling is a no-op, not a disabled control | n/a: the guards are dialogs, not this control |

**What the indicator carries alone.** Whenever the update notice is not current — dismissed (UD-3) or replaced (REQ-NOTIFY-024) — R2 is the only place the progress, the ready state, the cancel and `Restart now` stand: the ready state is not published then (PD-STARTUP-008 item 13), and a cancel from R3 publishes the offer only into an empty slot (item 14). Which transitions publish is [`notice-banner.md`](notice-banner.md) §4.1.

## 5. Interaction

**Patterns.** The indicator is a *status indicator with an inline action*. No popover: the icon form keeps its action as an icon-only button, so the cancel and `Restart now` stay one press away at every width (UD-10).

**Tab sequence in the title bar:** workspace chip → R3 (when present) → Sessions → window controls. The improvement indicator and R2's status part are not stops; each carries its description (REQ-SHELL-058).

**Initial focus** never moves to R2 or R3 (REQ-STARTUP-169, PD-SHELL-018).

**Focus after each change.** A cancel from R3: R2 leaves, focus moves to the next title-bar stop (Sessions, else the first window control), never to `body` (F3). `Restart now` declined at a guard: focus returns to the control that asked.

**Reversibility.** A cancel from R3 takes no confirmation; it is reversible by `Update now` where the offer is published, else by the next launch (UD-2), which its description says. `Restart now` is guarded by REQ-STARTUP-174's three asks and nothing else.

**Palette.** Neither action is a palette entry: REQ-SHELL-049's list holds none.

## 6. Copy

**R2, visible:** downloading **`Downloading {version}`** then the figure `{measured}`, action **`Cancel`**; ready **`{version} ready`**, action `Restart now`.

**Bounds.** The version is bounded by REQ-STARTUP-028's naming; `{measured}` by its two forms; the label elides before anything else (§8). No string grows with a run.

## 7. Accessibility obligations

- **R2's name and description** (PD-SHELL-018, REQ-SHELL-058): name **`Update status`**, as REQ-SHELL-037 names its neighbour; description, which is also its tooltip — downloading **`Downloading Rotaris {version}: {measured}. You can keep working; it is verified against the published checksum when it finishes.`**; ready **`Rotaris {version} has been downloaded and verified. It installs the next time Rotaris starts, or now with Restart now.`**; ready in place (OQ-553) **`Rotaris {version} has been downloaded, verified and installed. It runs the next time Rotaris starts, or now with Restart now.`**
- **R3's names and descriptions:** cancel — name **`Cancel the update download`**, description **`Stops the download of Rotaris {version} and removes what it wrote. It downloads again the next time Rotaris starts.`** (true whether or not the offer is published, UD-2; OQ-554); restart — name `Restart now`, description **`Restarts Rotaris to install {version}. You are asked first about unsaved settings, a running integration and active runs.`**, in place **`Restarts Rotaris to run {version}. You are asked first about unsaved settings, a running integration and active runs.`** (REQ-STARTUP-174's guards). In the icon form the names are unchanged and the descriptions are the tooltips; the label hidden by elision is never the only place a fact is (REQ-SHELL-058).
- **State never by colour alone** (REQ-SHELL-149, REQ-NOTIFY-258): R2's icon colour always has its label or, in the icon form, its name and description.
- **Live regions.** R2 is **not** a live region for its figure: a percent repainted per whole number would be announced up to a hundred times. R2 announces a **phase change** (download started, ready) through one visually hidden `status` element **only while `noticeId` differs from the current notice's identifier** — when the update notice holds the banner, R1 already says it.
- **The phase announcement's words** (settled by the build, 2026-11-21, R-117; review-ui UIR-U03): downloading
  **`Rotaris {version} is downloading.`**; ready **`Rotaris {version} is ready. Restart now is in the title bar.`** — the
  visually hidden `status` element above, spoken only while the update notice does not hold the banner.
- **Focus ring** inside each control's bounds at `--rt-focus-ring-width` in `--rt-focus` (REQ-SHELL-148, REQ-SHELL-160 (c)); R3 is `-webkit-app-region: no-drag`, as `.title-bar__sessions` is.
- **Contrast** of R2's label, figure and icon against `--rt-chrome`, measured from pixels (REQ-SHELL-144, -145, -160 (a)).
- **Reduced motion:** R2 draws no pulse (REQ-SHELL-135; §8).

## 8. Composition intent

**Density tier:** the title bar's, from the mockup's `title bar` section — one line, icon and text in one `--rt-space-*` gap, right-hand items quiet.

**Earned surfaces:** R2 is **not** a card and not a filled pill: icon, label and figure are bare text in `--rt-text-secondary` at the bar's small step, the figure in `--rt-font-mono`; only the icon carries colour — `--rt-run` while downloading, `--rt-done` when ready (§1.3 lifecycle family, §1.9 one coloured icon). R3 is the ghost variant at `--rt-control-height-compact`, bare text in the accent ink (§1.7, OQ-503's reading), so the window's one filled control stays the view's. Earned count in the bar with R2 present: zero new bordered or filled boxes.

**No motion on R2:** the dot that pulses in the bar is the improvement indicator's; a second pulse beside it would read as the same activity, and §1.8 permits a pulse only on a status dot. R2's icon is static; its change is the figure.

**Relations (`UiLayoutContract`, ids proposed):**

| Relation | Subject → target | Why |
|---|---|---|
| `align-y` middle | `update-indicator` → `improvement-activity` | one line with its neighbour |
| `align-y` middle | `update-action` → `update-indicator` | the action centred on the label it serves (UIR-008's class) |
| `spacing-token` | `update-indicator` ↔ `improvement-activity` | the bar's own gap token, `--rt-space-2` as `.title-bar` sets |
| `text-fit` | `update-indicator` label | whole or elided at the label, never cut mid-word (L10's rule) |
| `hit-test` | `update-action`, each window control | topmost at its centre at every band |
| `containment` | `.title-bar` | `scrollWidth` equals `clientWidth` (REQ-SHELL-065, REQ-SHELL-022) |

**Give-way.** Measured against the bar's free width, never a written breakpoint (`WorkspaceChip.tsx`'s own measuring is the precedent). Order: (1) R2 drops its label, keeping icon, figure and an icon-only action; (2) R2 drops the figure (it stays in the description); (3) only then the improvement label elides (L10); (4) the workspace chip shortens below its full path to its REQ-WORKSPACE-149 floor. "Clipped" in PD-SHELL-018 is read as cut or ellipsized below that floor; the chip's middle-shortening of a long path above the floor is its own drawing, not a clip, or a deep path would force the icon form at every width (§10 item 2).

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| R2 + R3 | full | full while it fits with the chip at its full path; else step 1 | step 1 when the improvement indicator shows | step 1, step 2 with the improvement indicator | icon form (steps 1–2) in the busiest state: improvement retrospective label, deep path with a session name |
| improvement indicator | whole | whole | whole | whole until R2 is an icon | elided at its label (L10) |
| workspace chip | full or middle-shortened | as now | as now | as now, at or above its floor | at its floor at most |
| window controls, Sessions | whole | whole | whole | whole | whole, hit-tested |

## 9. Components

| Region | Component (inventory name, variant) | Note |
|---|---|---|
| R2 | a Shell component beside `ImprovementActivity` (one per indicator, as that file is one per analysis); Phosphor `ph-download-simple`, `ph-arrow-circle-up` in `--rt-icon-size` | not a `Tag`: a Tag is a filled pill (`tag-run`), which §8 declines in the bar |
| R3 | `Button` ghost, compact; icon-only form with `Tooltip` content equal to the description | selection idiom: none — an action, not a selectable control |

No gap: no §4.2 proposal is needed. `PopoverMenu` was weighed for the icon form and declined: it is a `menuitemradio` selection menu (`overlays.tsx`), and the icon form needs one action, not a choice.

## 10. Disagreements and gaps

1. **A seventeenth channel — decided 2026-11-21 under [R-072](../../product/requests.md#r-072).** The claim was §3.1's recommendation, against seams §2 ("a seventeenth is a real decision") and `background-update-plan/05` ("No stage adds … a channel", written for R-084 before PD-SHELL-018). Both advocates recommended the channel; ruled as they recommend: **`update:state`**, main → every main window, the payload of §3.1, with the read command `update.state` for a window that mounts later, and R1's meter as an optional field of the notice rather than of the channel (REQ-NOTIFY-043). An existing channel was asked first, as seams §2 requires: `notice:current` is "the single current notice or null" (ADR-0049), and exactly when PD-SHELL-018 needs the indicator — another notice holding the slot — it no longer carries the update; extending it would make every notice carry the updater's state and the notice store hold a fact the updater owns, and the indicator's lifetime (downloading and ready, whatever holds the slot) is not a notice's. `improvement:activity` is the precedent for an app-wide state pushed to every window with a read on mount. No requirement is departed from, so no directive. The payload carries `noticeId` rather than a "current" flag (one advocate would have dropped it): the renderer compares it with `notice:current`, so main need not re-emit the state whenever an unrelated notice is published. The plan's sentence carries a dated correction; seams §2's count, the process view and the state-ownership view are updated by the stage that builds the channel, in its commit.
2. **"Clipped"** — §8's reading of PD-SHELL-018 (the chip's shortening above its floor is not a clip). A reading, not ruled; the owner may overturn it.

*Settled 2026-11-21 under R-072, kept as history:* the download notice's exit (OQ-552), the in-place ready notice (OQ-553), which transitions take the banner back (OQ-554), `Try again` after an integrity refusal (OQ-555), the open-release member in REQ-NOTIFY-044 (OQ-556), and the notice's and the acknowledgement's §7 row (OQ-557), whose items 2, 3, 5, 7, 8 and 9 stood here; the banner's repaint announcements, Dismiss's two meanings and the withheld link-only action moved with the notice to [`notice-banner.md`](notice-banner.md) §10.

## 11. Evidence plan

**Capture.** `pnpm ui-review` (all views; theme `rotaris-dim`) at 1400×900 and 1000×680, and `pnpm ui-audit -- --sizes=` 1000×680, 1079×680, 1081×680, 1179×680, 1181×680, 1400×900 (§8 gives way across both thresholds). The pack reaches none of §4's cells; `pnpm app:drive` reaches them.

**Reaching each cell.** The development host cannot run the update path (`updater-proof`: no check, no request), and REQ-STARTUP-111 forbids moving the endpoint, so the surfaces are captured through a **verification-only face seam** the build adds to the driver (`apps/desktop/src/main/driver.ts`, present only under `ROTARIS_DRIVER`): it publishes the updater's own face functions into the notice store and the same `update:state` publisher R2 reads, and never touches the feed, the download or the apply. The mechanism stays `updater-proof`'s and REQ-STARTUP-181's. Per cell: publish the face, then `waitFor` its selector, then `shot` — downloading `[data-testid="update-indicator"][data-phase="downloading"]`; ready `[data-phase="ready"]`; another notice holding the slot `notice.report` then `[data-testid="update-indicator"]`; dismissed, `click .notice__dismiss` then `waitFor` the indicator; a late window, `update.state` read on mount, the indicator present in a window opened after the download started; the icon form `resize 1000 680` with the improvement indicator shown, then `[data-testid="update-indicator"][data-form="icon"]`. Never a sleep.

**Rubric rows to pass:** F1 (U1–U8 walked on the seam), F2 (§4), F3 (the Tab sequence, the names of §7, focus after cancel), F4 (§6, §7 character for character), C2, C3, C6, C8, C9, D3, D4, O1.

**Must move:** R2 present in 0 → 1 title-bar slot while downloading or ready, 0 otherwise; a window opened during a download shows R2 at once.

**Must hold, with the proof that measures it:** the title bar's height at `--rt-title-bar-height` and `.title-bar`'s `scrollWidth` equal to its `clientWidth` at 1000×680 (`pnpm ui-audit` `CONTAINMENT`, `SHRUNK`); the improvement label whole or elided at the label, never running under the control after it — now R2 (`retrospective-proof`'s title-bar label geometry); the workspace chip's shortening and floor (`workspace-proof`); the title-bar controls topmost at their centres (`init-proof`'s `consent`); no check and no request on a development build (`updater-proof`).
