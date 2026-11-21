# The update's surfaces — the title-bar indicator, the update notice and the "Updated to" acknowledgement — brief

**Status:** proposed
**Written:** 2026-11-21 by `design-ui` (brief), for [R-117](../../product/requests.md#r-117)'s stages that draw the indicator and the action ([`PD-SHELL-018`](../../product/directives/pd-shell-018.md#pd-shell-018), "Recorded, not built")
**Surface:** the **title bar**'s update indicator (PD-SHELL-018), the **notice** the updater publishes into the banner (REQ-SHELL-114, G1 of `docs/design/README.md` §4.2) and the one **acknowledgement** UD-7 adds; §7 row "Title bar, nav rail" (the notice and the acknowledgement have no row of their own: [OQ-557](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-557)); mockup section `title bar`, and `toast` for the acknowledgement's craft; nearest built code `packages/ui/src/AppShell.tsx` (the title bar), `ImprovementActivity.tsx`, `Notice.tsx`, `Acknowledgements.tsx`, `apps/desktop/src/main/updater/updater.ts` (its faces); theme `rotaris-dim`

## 1. Authority

**Fixed, by the clause that binds** (a directive is cited in place of the requirement it displaces):

| Id | The clause that binds here |
|---|---|
| [`PD-SHELL-018`](../../product/directives/pd-shell-018.md#pd-shell-018) (extends REQ-SHELL-033, narrows REQ-SHELL-115) | the indicator: present while a download runs and while a verified pending update waits, absent otherwise; after the improvement-analysis indicator (REQ-SHELL-037), before the window controls ([`PD-SHELL-003`](../../product/directives/pd-shell-003.md#pd-shell-003)); version and measured progress with the cancel, or "ready" with `Restart now`; present whatever holds the banner; takes no focus and opens nothing on its own; an accessible name and description stating the state (REQ-SHELL-058); elides to an icon before anything else in the bar is clipped; the action "open the page of an available release"; the first main window of an updated version shows one transient acknowledgement of the version |
| [`PD-STARTUP-008`](../../product/directives/pd-startup-008.md#pd-startup-008) rev. 2 | UD-1 metered → REQ-STARTUP-116's offer with `Update now`; UD-2 a cancel → the offer with `Update now`, held for the process; UD-3 dismissing the download or ready notice only hides it; UD-4 a transport failure of a download the user did not start is not shown, every integrity refusal is REQ-STARTUP-120's notice; UD-7 the "Updated to" acknowledgement; UD-8 portable and AppImage swap on verification; UD-10 the indicator |
| [`PD-SHELL-005`](../../product/directives/pd-shell-005.md#pd-shell-005) rev. 2 (narrows REQ-SHELL-118) | the download notice keeps its identity, is updated in place, carries REQ-STARTUP-118's words, is **not persistent**, and its action cancels, enabled throughout; it becomes REQ-STARTUP-174's ready notice; a failure becomes REQ-STARTUP-120's notice in place |
| [`PD-STARTUP-014`](../../product/directives/pd-startup-014.md#pd-startup-014) | a link-only build raises `Rotaris {version} is available` with the summary and one action opening the release's page; withheld when the page is refused; dismissing waves the version off |
| REQ-STARTUP-116, -117 (narrowed), -118, -120, -170, -174, -175, -179 | the offer's strings; the waved-off version; the download's strings and repaint rule; the failure's strings and `Try again`; cancel within its bound, leaving nothing; the ready notice's `Restart now` and its three guards; nothing restarts on its own; failures of the background path |
| REQ-SHELL-114, -115, -112/-113, REQ-NOTIFY-011, -015, -019, -024, -035..-043, -258 | one notice slot; the closed action list; one acknowledgement surface, its lifetime, its focus rule and name; replacement; the banner's drawing, its dismiss rule (040) and its optional meter (043); no state by colour alone |
| REQ-SHELL-033, -037, -058, -065, -149, REQ-SHELL-144..-148, -160 | the bar's order and height token; the neighbour's name; tooltip = description; nothing clipped at 1000×680; the accessibility contract |
| `docs/design/README.md` §1.3, §1.7, §1.8, §1.9, §1.11, §4.2 G1 | lifecycle colours; one filled control, hairline or bare-text controls; motion on status only; icon ink by meaning; copy voice; the banner's drawing |

**Fixed strings, by id:** `Rotaris {version} is available`, `Open the release notes for the full changelog.`, `Update now` (REQ-STARTUP-116); `Downloading Rotaris {version}`, `{measured} — verifying against the published checksum when it finishes.` (REQ-STARTUP-118); `Update not installed`, `Rotaris is unchanged. You can try again or download the release manually.`, `Try again` (REQ-STARTUP-120); `Restart now` (REQ-STARTUP-174); `Update installed` (REQ-STARTUP-119, the in-place outcome); the kind word `Done` (REQ-NOTIFY-019).

**Departures from the mockup, each with its clause.** The mockup's `title bar` ends in a `⌘K Commands` hint and a help glyph and has no status item; the bar's items and order are REQ-SHELL-033's with PD-SHELL-003 and PD-SHELL-018, so the indicator stands where PD-SHELL-018 puts it and the mockup gives only its craft: right-hand items in tertiary ink at the small text step, icon and text on one line. The mockup's `toast` is drawn bottom-right with a shadow; the acknowledgement is REQ-NOTIFY-012/013's surface as built (`Acknowledgements.tsx`), unchanged.

**Left open, and settled below:** the indicator's wording (PD-SHELL-018), the ready notice's title and message (REQ-STARTUP-174), the cancel's label (PD-SHELL-005), the open-release action's label (PD-STARTUP-014), the acknowledgement's wording (UD-7), the icon form's shape, the place among the bar's right-hand items, the live-region rule, the data the renderer needs.

**Out of this brief:** UD-6's "being updated" window and REQ-STARTUP-177's waiting launch (a window of its own with no §7 row: its brief is owed by the stage that builds it); the three guard dialogs `Restart now` asks (REQ-SHELL-119, REQ-SHELL-124, REQ-STARTUP-046, as built in `updater.ts`).

## 2. Journeys that cross it

Guide 04 §4's table has no update journey; these are the update's own, and they cross **Watch** (nothing interrupts, REQ-STARTUP-169, -175), **Several agents** (`Restart now` asks the active-run confirmation, REQ-STARTUP-046), **Recover** (the failure notice) and **Away and back** (the indicator stays while away). Compose, Approve, Answer, Steer, Review, Trace, Configure, Reuse and First launch are crossed only where another notice takes the banner (U5).

- *When a newer Rotaris is published, I want it to arrive without my asking and without stopping my work, so that I am current without managing it.* *When it is ready, I want to choose when it takes effect, so that a run is never cut off.* *When I cannot update in place, I want to be sent to the release, so that I can install it myself.*

| # | Entry → steps → exit | Wait (its limit) | Ask (its commitment) | Trust point (the evidence) | Recover |
|---|---|---|---|---|---|
| U1 | check after the window shows → banner "Downloading" + indicator → verified → ready notice + ready indicator → user quits → next start runs the new version → "Updated to" acknowledgement | the transfer: none stated, shown as `{measured}`; the next-start apply: REQ-STARTUP-177's stated bound | none until ready | the version named; "verifying against the published checksum" (REQ-STARTUP-118) | U3 cancel; U6 failure |
| U2 | ready → `Restart now` (banner or indicator) → the three guards → the successor starts → acknowledgement | the successor's start | each guard is a decline-able ask; a decline changes nothing (REQ-STARTUP-174) | the guards name what they protect | a decline returns to ready, unchanged |
| U3 | downloading → `Cancel download` (banner) or the indicator's cancel → transfer ends → offer with `Update now` (UD-2) → exit: `Update now` (back to downloading), Dismiss (waves off, REQ-STARTUP-117), or nothing (next launch downloads) | the cancel's end: REQ-STARTUP-170's bound | none | no error notice follows (REQ-STARTUP-170) | `Update now` |
| U4 | metered connection → offer with `Update now` (UD-1) → as U3's exit | — | `Update now` commits to the download | the offer is the same notice as any offer | Dismiss |
| U5 | downloading or ready → another notice replaces the banner (REQ-NOTIFY-024) → the indicator alone carries the state, the cancel and `Restart now` (UD-10) | as U1 | as U1, U2 | the indicator's description | which transitions re-take the banner: OQ-554 |
| U6 | an integrity refusal, a failed download the user started, a failed `Restart now` or next-start apply → `Update not installed` with details | — | `Try again` (OQ-555 for an integrity refusal) | the technical sentence in details, copyable (REQ-NOTIFY-038) | `Try again`; download by hand |
| U7 | link-only build → `Rotaris {version} is available` with `Open release page` → the browser opens the release's page → the user installs it | — | the action opens a browser, nothing else | the page is the feed's repository's own (PD-STARTUP-014) | Dismiss (waves off) |
| U8 | downloading or ready → Dismiss (UD-3) → the banner is empty, the indicator stays, the apply still follows | — | — | the indicator | the indicator's action |

## 3. Content model and hierarchy

**R1 — the update notice** (REQ-SHELL-114; G1): glyph, title (the primary), message, optional details, the one action, Dismiss where persistent, and — while a download with a known size runs — REQ-NOTIFY-043's meter under the text. Its faces are §6's.

**R2 — the update indicator** (PD-SHELL-018): one group in the title bar, **immediately after the improvement-analysis indicator and before the Sessions control**, so the two background-activity indicators stand together and the controls keep their place beside the window controls (both readings satisfy PD-SHELL-018's "after … before"; this one is chosen). It holds a state icon, a label, a figure while downloading, and one action. Its primary is the label; the action is subordinate and drawn quieter. Present only in the downloading and ready phases.

**R3 — the indicator's action**: `Cancel` while downloading, `Restart now` while ready — the same action members the banner dispatches (REQ-SHELL-115: one identifier, one result from either place).

**R4 — the "Updated to" acknowledgement** (UD-7): kind word, title, no body, no action, close control (REQ-NOTIFY-013..022).

**Difficult data.** A version as long as the release naming allows (`0.1.0rc6` form, REQ-STARTUP-028); `{measured}` as `{N} MB` with N in four digits (REQ-STARTUP-118, size unknown); the improvement indicator showing its longer retrospective label (`ImprovementActivity.tsx`) beside a deep workspace path with a session name (PD-SHELL-016 clause 6) at 1000×680; a ready notice while three runs are active (U2's guard).

### 3.1 What the renderer needs from main

The updater owns every fact here (`background-update-plan/03` "State owner"); the renderer draws and dispatches, never decides.

| Datum | When | For |
|---|---|---|
| `phase`: downloading, ready, or none | always | R2 present or absent |
| `version` | downloading, ready | R2's label and description |
| `measured`: REQ-STARTUP-118's exact `{measured}` string | downloading | R2's figure, identical to R1's message |
| `percent`: the whole percent, or none when the feed states no size | downloading | R1's meter (REQ-NOTIFY-043: absent when unknown) |
| `inPlace`: the target was already replaced (UD-8) | ready | the ready copy (OQ-553) |
| `noticeId`: the update notice's id while it is the current notice, else none | always | §7's live-region rule |

Actions cross as notice-action members, dispatched in `dispatchNoticeAction` (seams §6): `restart` (exists), the cancel member PD-SHELL-005 adds, and an **open-release-page member with no parameter** — main holds the page with the offer and validates it (PD-STARTUP-014), so no address crosses from a renderer.

**Recommendation: a new main → renderer channel for R2, and an extended `Notice` for R1's meter.**

- R2 by a channel of its own (an `update:state` push to every main window, with a read command for a window that mounts later — `improvement:activity` and its read in `main/commands/improvements.ts` are the precedent, `reauth:prompt` the worked example of seams §2). `notice:current` is "the single current notice or null" (`contracts/channels.ts`, ADR-0049): exactly when PD-SHELL-018 needs the indicator — another notice holding the slot — that payload no longer carries the update, so extending it would make every notice carry the updater's state and the notice store hold a fact the updater owns. The indicator's lifetime (downloading and ready, whatever holds the slot) is not a notice's lifetime. The cost is the seventeenth channel (§10 item 1).
- R1's meter on the notice itself: an optional progress field on `NoticeSchema`, set only by the download face; REQ-NOTIFY-043 already removes it with the notice, so it belongs to the notice's payload, not to the channel above.

## 4. States

R1 the update notice · R2 the indicator · R3 its action · R4 the acknowledgement.

| Region | ideal | empty: first use | empty: cleared | empty: no results | filtered | cannot-show | loading | streaming / partial | error | success | disabled | permission-needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | offer (U3, U4) and link-only (U7): §6 rows 1, 5 | n/a: no update, no notice (REQ-STARTUP-110 keeps a check failure invisible) | U8: dismissed download or ready → the slot is empty, R2 carries the state | n/a: no list | n/a | link-only page refused → the same notice with no action (PD-STARTUP-014); another notice holds the slot → R2 alone (U5) | n/a: the check is invisible until it finds a release | downloading: §6 row 2, meter when the size is known (REQ-NOTIFY-043), message repainted per whole percent (REQ-STARTUP-118) | `Update not installed`: §6 row 4 | ready: §6 row 3 (`inPlace`: OQ-553) | n/a since PD-SHELL-005 rev. 2: the cancel is enabled throughout (REQ-STARTUP-170), and no update face sets `action.disabled` | metered (U4): the offer, identical (UD-1) |
| R2 | ready: icon in `--rt-done`, `{version} ready`, `Restart now` | absent (PD-SHELL-018) | absent after a cancel, a failure, an apply | n/a | n/a | below the full form's fit: the icon form (§8) — icon and an icon-only action, label and figure in the description | n/a: absent until the download starts | downloading: icon in `--rt-run`, `Downloading {version}`, the `{measured}` figure in `--rt-font-mono`, `Cancel` | absent: a failure is R1's (UD-4) | ready (as ideal) | n/a: never drawn disabled | absent on a metered offer: no download runs (UD-1) |
| R3 | `Restart now`, ghost | n/a | n/a | n/a | n/a | icon-only: `ph-x` (cancel), `ph-arrow-clockwise` (restart), each named (§7) | n/a | `Cancel` | n/a | n/a | n/a: a second press while cancelling is a no-op, not a disabled control | n/a: the guards are dialogs, not this control |
| R4 | `Done`, `Updated to Rotaris {version}` | n/a: only after an update | closed by its control or REQ-NOTIFY-011's lifetime | n/a | n/a | n/a: the first main window always hosts it (REQ-SHELL-112) | n/a | n/a | n/a: a failed apply is R1's `Update not installed` (REQ-STARTUP-179) | as ideal | n/a | n/a |

## 5. Interaction

**Patterns.** The banner is the *persistent notification* pattern, here the glossary's **notice**; the indicator is a *status indicator with an inline action*; the acknowledgement is a *toast*, here the **acknowledgement**. No popover: the icon form keeps its action as an icon-only button, so the cancel and `Restart now` stay one press away at every width (UD-10).

**Tab sequence in the title bar:** workspace chip → R3 (when present) → Sessions → window controls. The improvement indicator and R2's status part are not stops; each carries its description (REQ-SHELL-058). The banner's stops follow the bar: details summary, Copy, the action, Dismiss (`Notice.tsx`).

**Initial focus** never moves to R1, R2, R3 or R4 (REQ-STARTUP-169, PD-SHELL-018, REQ-NOTIFY-015).

**Focus after each change.** A cancel from R1: the action control is the same element, relabelled `Update now` once the transfer has ended — focus stays on it; until then a second press is a no-op. A cancel from R3: R2 leaves, focus moves to the next title-bar stop (Sessions, else the first window control), never to `body` (F3). `Restart now` declined at a guard: focus returns to the control that asked. Dismiss on R1: focus moves to the next stop after the banner, the view's first; not measured on the built banner, so the build reads `document.activeElement` after it (F3).

**Reversibility.** Cancel is reversible by `Update now` and takes no confirmation (`ConfirmDialog` is not drawn for it, rubric F3). `Restart now` is guarded by REQ-STARTUP-174's three asks and nothing else. Dismiss on the offer waves off a version (REQ-STARTUP-117) and is undone by a newer release; on downloading or ready it only hides (UD-3).

**Palette.** None of these actions is a palette entry: REQ-SHELL-049's list holds none, and adding one is a request, not this brief's.

## 6. Copy

| # | State | Severity | Title | Message | Action | Dismiss |
|---|---|---|---|---|---|---|
| 1 | offer — metered (UD-1), after a cancel (UD-2), after a silent transport failure (OQ-552) | info | `Rotaris {version} is available` | the summary, or `Open the release notes for the full changelog.` | `Update now` | yes; waves off |
| 2 | downloading | info | `Downloading Rotaris {version}` | `{measured} — verifying against the published checksum when it finishes.` | **`Cancel download`** | none while PD-SHELL-005 keeps it non-persistent (OQ-552) |
| 3 | ready | success | **`Rotaris {version} is ready`** | **`Downloaded and verified. It installs the next time Rotaris starts, or now with Restart now.`** | `Restart now` | yes; hides (UD-3) |
| 3′ | ready, in place (UD-8; OQ-553) | success | `Update installed` | **`Rotaris {version} runs the next time it starts, or now with Restart now.`** | `Restart now` | yes; hides |
| 4 | failed | error | `Update not installed` | `Rotaris is unchanged. You can try again or download the release manually.` | `Try again`; none on an integrity refusal while OQ-555 stands | yes |
| 5 | link-only | info | `Rotaris {version} is available` | the summary, or the fallback of row 1 | **`Open release page`**, with `ph-arrow-square-out` after it (the `McpSettings.tsx` "Get a key" precedent) | yes; waves off |

Bold is written here; the rest is the specification's. Row 2's meter label, also its accessible name: **`{percent}% downloaded`**, which the message states in words (REQ-NOTIFY-043).

**R2, visible:** downloading **`Downloading {version}`** then the figure `{measured}`, action **`Cancel`**; ready **`{version} ready`**, action `Restart now`.
**R4:** title **`Updated to Rotaris {version}`**, no body, kind `ok` (announced `Done`).

**Bounds.** The version is bounded by REQ-STARTUP-028's naming; `{measured}` by its two forms; the label elides before anything else (§8). No string grows with a run.

## 7. Accessibility obligations

- **R2's name and description** (PD-SHELL-018, REQ-SHELL-058): name **`Update status`**, as REQ-SHELL-037 names its neighbour; description, which is also its tooltip — downloading **`Downloading Rotaris {version}: {measured}. You can keep working; it is verified against the published checksum when it finishes.`**; ready **`Rotaris {version} has been downloaded and verified. It installs the next time Rotaris starts, or now with Restart now.`** (in place: **`Rotaris {version} is installed and runs the next time it starts, or now with Restart now.`**).
- **R3's names and descriptions:** cancel — name **`Cancel the update download`**, description **`Stops the download of Rotaris {version} and removes what it wrote. It stays available with Update now.`**; restart — name `Restart now`, description **`Restarts Rotaris to install {version}. You are asked first about unsaved settings, a running integration and active runs.`** (REQ-STARTUP-174's guards). In the icon form the names are unchanged and the descriptions are the tooltips; the label hidden by elision is never the only place a fact is (REQ-SHELL-058).
- **State never by colour alone** (REQ-SHELL-149, REQ-NOTIFY-258): R2's icon colour always has its label or, in the icon form, its name and description; R1 keeps its severity word in its name (`Notice.tsx`).
- **Live regions.** R1 is `status` (`alert` for `Update not installed`) as built. R2 is **not** a live region for its figure: a percent repainted per whole number would be announced up to a hundred times. R2 announces a **phase change** (download started, ready) through one visually hidden `status` element **only while `noticeId` is none** — when the update notice holds the banner, R1 already says it. The same rule binds R1's message while downloading: the build measures whether each repaint is announced inside the `status` banner and, if it is, takes the message out of the announcement and keeps the title's change in it (§10 item 6). R4 is announced by the stack's own `status` (`Acknowledgements.tsx`, REQ-NOTIFY-019).
- **Focus ring** inside each control's bounds at `--rt-focus-ring-width` in `--rt-focus` (REQ-SHELL-148, REQ-SHELL-160 (c)); R3 is `-webkit-app-region: no-drag`, as `.title-bar__sessions` is.
- **Contrast** of R2's label, figure and icon against `--rt-chrome`, and of the meter's fill against the banner, measured from pixels (REQ-SHELL-144, -145, -160 (a)).
- **Reduced motion:** R2 draws no pulse (REQ-SHELL-135; §8).

## 8. Composition intent

**Density tier:** the title bar's, from the mockup's `title bar` section — one line, icon and text in one `--rt-space-*` gap, right-hand items quiet.

**Earned surfaces:** R2 is **not** a card and not a filled pill: icon, label and figure are bare text in `--rt-text-secondary` at the bar's small step, the figure in `--rt-font-mono`; only the icon carries colour — `--rt-run` while downloading, `--rt-done` when ready (§1.3 lifecycle family, §1.9 one coloured icon). R3 is the ghost variant at `--rt-control-height-compact`, bare text in the accent ink (§1.7, OQ-503's reading), so the window's one filled control stays the view's. R1 is G1's banner as built; the meter is a `MeterBar` `tone="accent"`, thin, under the text (REQ-NOTIFY-043). R4 unchanged. Earned count in the bar with R2 present: zero new bordered or filled boxes.

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
| `align-y` middle | `notice-dismiss` → `notice-action` | kept (UIR-008) |

**Give-way.** Measured against the bar's free width, never a written breakpoint (`WorkspaceChip.tsx`'s own measuring is the precedent). Order: (1) R2 drops its label, keeping icon, figure and an icon-only action; (2) R2 drops the figure (it stays in the description); (3) only then the improvement label elides (L10); (4) the workspace chip shortens below its full path to its REQ-WORKSPACE-149 floor. "Clipped" in PD-SHELL-018 is read as cut or ellipsized below that floor; the chip's middle-shortening of a long path above the floor is its own drawing, not a clip, or a deep path would force the icon form at every width (§10 item 4).

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| R2 + R3 | full | full while it fits with the chip at its full path; else step 1 | step 1 when the improvement indicator shows | step 1, step 2 with the improvement indicator | icon form (steps 1–2) in the busiest state: improvement retrospective label, deep path with a session name |
| improvement indicator | whole | whole | whole | whole until R2 is an icon | elided at its label (L10) |
| workspace chip | full or middle-shortened | as now | as now | as now, at or above its floor | at its floor at most |
| window controls, Sessions | whole | whole | whole | whole | whole, hit-tested |
| R1 | as built | as built | as built | as built | as built; the meter spans the text column |

## 9. Components

| Region | Component (inventory name, variant) | Note |
|---|---|---|
| R1 | the Shell implementation `NoticeBanner` (G1) with `Button` secondary (action) and ghost (Dismiss, Copy); `MeterBar` `tone="accent"` | the meter is REQ-NOTIFY-043's, not yet drawn: the banner gains it, no new component |
| R2 | a Shell component beside `ImprovementActivity` (one per indicator, as that file is one per analysis); Phosphor `ph-download-simple`, `ph-arrow-circle-up` in `--rt-icon-size` | not a `Tag`: a Tag is a filled pill (`tag-run`), which §8 declines in the bar |
| R3 | `Button` ghost, compact; icon-only form with `Tooltip` content equal to the description | selection idiom: none — an action, not a selectable control |
| R4 | `Acknowledgement` via `Acknowledgements.tsx`, kind `ok` | no action (the transient's one-member type stays one member) |

No gap: no §4.2 proposal is needed. `PopoverMenu` was weighed for the icon form and declined: it is a `menuitemradio` selection menu (`overlays.tsx`), and the icon form needs one action, not a choice.

## 10. Disagreements and gaps

1. **A seventeenth channel** — the claim: §3.1 recommends one; it meets seams §2 ("a seventeenth is a real decision") and `background-update-plan/05` ("No stage adds … a channel", written for R-084 before PD-SHELL-018). Not an open question: the task leaves the choice to the build stage, which records it in seams §2.
2. **Leaving the download notice** — the claim: UD-3 dismisses the download notice and UD-4 hides a background transport failure; they meet PD-SHELL-005 (non-persistent, so no Dismiss) and REQ-NOTIFY-040 (a non-persistent notice leaves only by replacement or a run-start clear). [OQ-552](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-552).
3. **The in-place ready notice** — REQ-STARTUP-119's narrowing keeps `Update installed`; REQ-STARTUP-174 words the ready notice as "will be installed the next time Rotaris starts", false once UD-8 has swapped. [OQ-553](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-553).
4. **"Clipped"** — §8's reading of PD-SHELL-018 (the chip's shortening above its floor is not a clip). A reading, not ruled; the owner may overturn it.
5. **Which transitions take the banner back** — ready, the offer after a cancel from R3, and a failure, while another notice holds it: REQ-NOTIFY-024 against PD-SHELL-018's "while another notice holds" and REQ-STARTUP-179's "always visible". [OQ-554](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-554).
6. **The banner's repaint announcements** — suspected, not measured: a `status` banner whose message repaints per whole percent may be announced each time. The build measures it with the platform's screen reader (rubric F3) and files a defect if it is.
7. **`Try again` after an integrity refusal** — REQ-STARTUP-120 offers it; REQ-STARTUP-179 forbids retrying that release in the same process. [OQ-555](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-555).
8. **The open-release action's vocabulary** — PD-SHELL-018 narrows REQ-SHELL-115; REQ-NOTIFY-044, which `NoticeActionSchema` also implements and PD-STARTUP-008 closed with "No other action is added", is not narrowed. [OQ-556](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-556).
9. **No §7 row for the notice and the acknowledgement** — the skill's step 1 stops on a surface with no row; this brief carries them under the title bar's row. [OQ-557](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-557).
10. **Dismiss means two things** — on the offer it waves a version off, on downloading and ready it hides (UD-3); the control reads `Dismiss` on both. Rows 1 and 3's messages carry the consequence; no per-notice description is added (it would widen `NoticeSchema`). Recorded for the audit.
11. **A link-only notice with its action withheld** keeps the fallback "Open the release notes …" with nothing to open them. Recorded for the audit; PD-STARTUP-014 fixes the withholding.

## 11. Evidence plan

**Capture.** `pnpm ui-review` (all views; theme `rotaris-dim`) at 1400×900 and 1000×680, and `pnpm ui-audit -- --sizes=` 1000×680, 1079×680, 1081×680, 1179×680, 1181×680, 1400×900 (§8 gives way across both thresholds). The pack reaches none of §4's cells; `pnpm app:drive` reaches them.

**Reaching each cell.** The development host cannot run the update path (`updater-proof`: no check, no request), and REQ-STARTUP-111 forbids moving the endpoint, so the surfaces are captured through a **verification-only face seam** the build adds to the driver (`apps/desktop/src/main/driver.ts`, present only under `ROTARIS_DRIVER`): it publishes the updater's own face functions into the notice store and the same state publisher R2 reads, and never touches the feed, the download or the apply. The mechanism stays `updater-proof`'s and REQ-STARTUP-181's. Per cell: publish the face, then `waitFor` its selector, then `shot` — offer `[data-testid="notice"][data-severity="info"]`; downloading `[data-testid="notice"] .meter` and `[data-testid="update-indicator"][data-phase="downloading"]`; size unknown, the same without `.meter`; ready `[data-phase="ready"]`; failed `[data-severity="error"]`; link-only `[data-action="open-release-page"]`; another notice holding the slot `notice.report` then `[data-testid="update-indicator"]`; dismissed, `click .notice__dismiss` then `waitFor` the indicator; the acknowledgement `[data-testid="acknowledgement"][data-kind="ok"]`; the icon form `resize 1000 680` with the improvement indicator shown, then `[data-testid="update-indicator"][data-form="icon"]`. Never a sleep.

**Rubric rows to pass:** F1 (U1–U8 walked on the seam), F2 (§4), F3 (the Tab sequence, the names of §7, focus after cancel), F4 (§6 against the fixed strings character for character), C2, C3, C6, C8, C9, D3, D4, O1.

**Must move:** R2 present in 0 → 1 title-bar slot while downloading or ready, 0 otherwise; the download notice's action `Update now` (disabled) → `Cancel download` (enabled); the ready outcome's title `Update installed` / `Finish the update` → row 3's; the banner's meter 0 → 1 while a sized download runs; R4 0 → 1 on the first window after an update.

**Must hold, with the proof that measures it:** the title bar's height at `--rt-title-bar-height` and `.title-bar`'s `scrollWidth` equal to its `clientWidth` at 1000×680 (`pnpm ui-audit` `CONTAINMENT`, `SHRUNK`); the improvement label whole or elided at the label, never running under the control after it — now R2 (`retrospective-proof`'s title-bar label geometry); the workspace chip's shortening and floor (`workspace-proof`); the title-bar controls topmost at their centres (`init-proof`'s `consent`); the notice's `align-y` between action and dismiss (`notice-proof`, the `notice-action` contract); the notice chain and the in-place update by identity (`notice-proof`); the acknowledgement's lifetime and focus rule (`notice-proof`); no check and no request on a development build (`updater-proof`).
