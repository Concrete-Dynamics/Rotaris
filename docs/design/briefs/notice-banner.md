# The notice banner and the acknowledgements — the update's faces — brief

**Status:** proposed
**Written:** 2026-11-21 by `design-ui` (brief), for [R-117](../../product/requests.md#r-117)'s stages that draw the update notice and the acknowledgement; moved here from [`title-bar-and-rail.md`](title-bar-and-rail.md) the same day by the ruling of [OQ-557](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-557), and brought to the rulings of OQ-552 to OQ-556 ([R-072](../../product/requests.md#r-072))
**Surface:** the **notice** the updater publishes into the banner (REQ-SHELL-114, G1 of `docs/design/README.md` §4.2) and the one **acknowledgement** UD-7 adds (REQ-SHELL-112); §7 row "Notice banner, acknowledgements"; mockup section `toast` for the acknowledgement's craft, none for the banner; nearest built code `packages/ui/src/Notice.tsx`, `Acknowledgements.tsx`, `apps/desktop/src/main/updater/updater.ts` (its faces); theme `rotaris-dim`

The title-bar indicator and its action — R2 and R3 — are [`title-bar-and-rail.md`](title-bar-and-rail.md)'s; this brief keeps R1 and R4 and names them as that one does.

## 1. Authority

**Fixed, by the clause that binds** (a directive is cited in place of the requirement it displaces):

| Id | The clause that binds here |
|---|---|
| [`PD-SHELL-005`](../../product/directives/pd-shell-005.md#pd-shell-005) rev. 3 (narrows REQ-SHELL-118, REQ-SHELL-115, REQ-STARTUP-118) | the download notice keeps its identity, is updated in place, carries REQ-STARTUP-118's words, is **persistent** and its Dismiss only hides it (UD-3); its action cancels, enabled throughout; it becomes REQ-STARTUP-174's ready notice; a failure UD-4 shows becomes REQ-STARTUP-120's notice in place, a silent transport failure the offer; **when the notice changes**: in place while current, otherwise only a shown failure publishes, and the offer a cancel leaves into an empty slot |
| [`PD-STARTUP-008`](../../product/directives/pd-startup-008.md#pd-startup-008) rev. 3 | UD-1 metered → the offer; UD-2 a cancel → the offer, held for the process; UD-3 dismissing the download or ready notice only hides it; UD-4 a transport failure of a download the user did not start is silent, every integrity refusal shown; UD-7 the "Updated to" acknowledgement; UD-8 swap on verification; item 13 the in-place ready notice `Update installed` (OQ-553) and no ready notice while another holds the slot (OQ-554); item 14 which states publish; item 15 an integrity refusal: no `Try again` (OQ-555) |
| [`PD-SHELL-018`](../../product/directives/pd-shell-018.md#pd-shell-018) rev. 2 (narrows REQ-SHELL-115, REQ-NOTIFY-044) | the action "open the page of an available release", no parameter (OQ-556); the first main window of an updated version shows one transient acknowledgement of the version |
| [`PD-STARTUP-014`](../../product/directives/pd-startup-014.md#pd-startup-014) | a link-only build raises `Rotaris {version} is available` with the summary and one action opening the release's page; withheld when the page is refused; dismissing waves the version off |
| REQ-STARTUP-116, -117 (narrowed), -118 (narrowed), -119, -120 (narrowed), -121, -170, -174 (narrowed), -179 | the offer's strings; the waved-off version; the download's strings and repaint rule; `Update installed`; the failure's strings and `Try again`; `Restart now` only on `Update installed` and the installed flavour's ready notice; cancel within its bound, leaving nothing; the ready notice's guards; failures of the background path, no retry of a refused release in one process |
| REQ-SHELL-114, -115, -112/-113, REQ-NOTIFY-003, -011, -015, -019, -024, -035..-044, -217, -221 (narrowed), -222 (narrowed), -258 | one notice slot; the closed action list; one acknowledgement surface, its lifetime, its focus rule and name; a failure published persistently; replacement; the banner's drawing, its dismiss rule (040) and its optional meter (043); the retained update identifier; the failure and completed-update notices; no state by colour alone |
| `docs/design/README.md` §1.3, §1.7, §1.8, §1.9, §1.11, §4.2 G1 | lifecycle colours; one filled control, hairline or bare-text controls; motion on status only; icon ink by meaning; copy voice; the banner's drawing |

**Fixed strings, by id:** `Rotaris {version} is available`, `Open the release notes for the full changelog.`, `Update now` (REQ-STARTUP-116); `Downloading Rotaris {version}`, `{measured} — verifying against the published checksum when it finishes.` (REQ-STARTUP-118); `Update not installed`, `Rotaris is unchanged. You can try again or download the release manually.`, `Try again` (REQ-STARTUP-120); `Rotaris is unchanged. You can download the release manually.` (PD-STARTUP-008 item 15, an integrity refusal); `Restart now` (REQ-STARTUP-174); `Update installed` (REQ-STARTUP-119; PD-STARTUP-008 item 13 for the in-place ready notice) and its message (item 13); the kind word `Done` (REQ-NOTIFY-019).

**Departures from the mockup, each with its clause.** The mockup draws no banner; G1 is the banner's drawing as built. The mockup's `toast` is drawn bottom-right with a shadow; the acknowledgement is REQ-NOTIFY-012/013's surface as built (`Acknowledgements.tsx`), unchanged.

**Left open, and settled below:** the installed flavour's ready title and message (REQ-STARTUP-174), the cancel's label (PD-SHELL-005), the open-release action's label (PD-STARTUP-014), the acknowledgement's wording (UD-7), the meter's label.

**Out of this brief:** the title-bar indicator and its action ([`title-bar-and-rail.md`](title-bar-and-rail.md)); UD-6's "being updated" window and REQ-STARTUP-177's waiting launch (a window of its own with no §7 row: its brief is owed by the stage that builds it); the three guard dialogs `Restart now` asks (REQ-SHELL-119, REQ-SHELL-124, REQ-STARTUP-046, as built in `updater.ts`); every notice other than the update's.

## 2. Journeys that cross it

The update's journeys, U1 to U8, are [`title-bar-and-rail.md`](title-bar-and-rail.md) §2's, which both briefs share. The banner is where U1 starts, where U3's cancel and U4's offer are answered, where U6's failure is read and copied, where U7 opens the release, and where U8 hides the notice; the acknowledgement ends U1 and U2. Since the rulings: U5's "which transitions re-take the banner" is §4.1; U6 offers `Try again` except on an integrity refusal (OQ-555); U8's Dismiss exists on the download notice too (OQ-552).

## 3. Content model and hierarchy

**R1 — the update notice** (REQ-SHELL-114; G1): glyph, title (the primary), message, optional details, the one action, Dismiss on every face (each face is persistent since PD-SHELL-005 revision 3), and — while a download with a known size runs — REQ-NOTIFY-043's meter under the text. Its faces are §6's.

**R4 — the "Updated to" acknowledgement** (UD-7): kind word, title, no body, no action, close control (REQ-NOTIFY-013..022).

**Difficult data.** A version as long as the release naming allows (`0.1.0rc6` form, REQ-STARTUP-028); `{measured}` as `{N} MB` with N in four digits (REQ-STARTUP-118, size unknown); a technical sentence in the details as long as a digest mismatch's two hexadecimal digests; a ready notice while three runs are active (U2's guard).

### 3.1 What the banner needs from main

The updater owns every fact here (`background-update-plan/03` "State owner"); the renderer draws and dispatches, never decides. The title-bar indicator's channel, `update:state`, is [`title-bar-and-rail.md`](title-bar-and-rail.md) §3.1's; R1 needs nothing from it.

- **The meter on the notice itself:** an optional progress field on `NoticeSchema` (`packages/contracts/src/notices.ts`), the whole percent, set only by the download face and only when the feed states a size; REQ-NOTIFY-043 already removes it with the notice, so it is the notice's payload, not the channel's.
- **Actions** cross as notice-action members, dispatched in `dispatchNoticeAction` (seams §6): `restart` (exists), the cancel member PD-SHELL-005 adds, and `open-release-page` with no parameter (OQ-556) — main keeps the page beside the offer and checks it at the press (an `https` address on the feed's host, the feed repository's releases path, no user information, no port but the default), opens it in the default browser, and logs and ignores a press for an offer it no longer holds.
- **Dismiss** reaches REQ-NOTIFY-217's recording of the waved-off version only from the offer faces (§6 rows 1 and 5); from every other face it hides and records nothing (UD-3), which a test pins.

## 4. States

R1 the update notice · R4 the acknowledgement.

| Region | ideal | empty: first use | empty: cleared | empty: no results | filtered | cannot-show | loading | streaming / partial | error | success | disabled | permission-needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | offer (U3, U4, a silent transport failure) and link-only (U7): §6 rows 1, 5 | n/a: no update, no notice (REQ-STARTUP-110 keeps a check failure invisible) | U8: dismissed download, ready or failure → the slot is empty, the indicator carries downloading and ready; nothing returns (§4.1) | n/a: no list | n/a | link-only page refused → the same notice with no action (PD-STARTUP-014); another notice holds the slot → nothing returns but a failure (§4.1) | n/a: the check is invisible until it finds a release | downloading: §6 row 2, meter when the size is known (REQ-NOTIFY-043), message repainted per whole percent (REQ-STARTUP-118), only while current | `Update not installed`: §6 rows 4 and 4′ | ready: §6 rows 3, 3′ | n/a: the cancel is enabled throughout (REQ-STARTUP-170), and no update face sets `action.disabled` | metered (U4): the offer, identical (UD-1) |
| R4 | `Done`, `Updated to Rotaris {version}` | n/a: only after an update | closed by its control or REQ-NOTIFY-011's lifetime | n/a | n/a | n/a: the first main window always hosts it (REQ-SHELL-112) | n/a | n/a | n/a: a failed apply is R1's `Update not installed` (REQ-STARTUP-179) | as ideal | n/a | n/a |

### 4.1 Transitions — which publish (OQ-554)

"Current" is the update notice's retained identifier (REQ-NOTIFY-217) equal to the current notice's. **In place** keeps the identifier and replaces nothing; **publish** replaces whatever holds the slot (REQ-NOTIFY-024); **nothing** leaves the slot as it is and lets the indicator carry the state.

| From → to | Update notice current | Slot empty (the update notice dismissed) | Another notice holds the slot |
|---|---|---|---|
| check finds a release → downloading, or the offer (metered, UD-1), or link-only | publish (a first publication) | publish | publish |
| downloading → a repaint of `{measured}` | in place | nothing | nothing |
| downloading → ready (row 3 or 3′) | in place | nothing | nothing |
| downloading → offer, a cancel from the banner | in place | — (the banner's control is gone) | — |
| downloading → offer, a cancel from the indicator | in place | **publish** the offer | nothing; downloads again at the next launch (UD-2) |
| downloading → offer, a transport failure the user did not start (UD-4) | in place | nothing | nothing |
| downloading → `Update not installed`, a transport failure of a download the user started (row 4) | in place | publish | publish |
| downloading or ready → `Update not installed`, an integrity refusal or a discard UD-4 shows (row 4′) | in place | publish | publish |
| ready → `Update not installed`, `Restart now` failed (row 4) | in place | publish | publish |
| next start → `Update not installed`, the apply failed (row 4) | — | publish | publish |
| next start → the updated version runs → R4 | — | the acknowledgement (not a notice) | the acknowledgement |

The indicator's state is emitted before the notice for one transition, so the two never disagree in a painted frame. `show` in `updater.ts` publishes afresh only in the cells marked publish after the first row; an in-place update whose notice is no longer current publishes nothing.

## 5. Interaction

**Patterns.** The banner is the *persistent notification* pattern, here the glossary's **notice**; the acknowledgement is a *toast*, here the **acknowledgement**.

**Tab sequence.** The banner's stops follow the title bar's: details summary, Copy, the action, Dismiss (`Notice.tsx`).

**Initial focus** never moves to R1 or R4 (REQ-STARTUP-169, REQ-NOTIFY-015).

**Focus after each change.** A cancel from R1: the action control is the same element, relabelled `Update now` once the transfer has ended — focus stays on it; until then a second press is a no-op. `Restart now` declined at a guard: focus returns to the control that asked. Dismiss on R1: focus moves to the next stop after the banner, the view's first; not measured on the built banner, so the build reads `document.activeElement` after it (F3).

**Reversibility.** Cancel is reversible by `Update now` and takes no confirmation (`ConfirmDialog` is not drawn for it, rubric F3). `Restart now` is guarded by REQ-STARTUP-174's three asks and nothing else. Dismiss on the offer waves a version off (REQ-STARTUP-117) and is undone by a newer release; on every other face it only hides (UD-3).

**Palette.** None of these actions is a palette entry: REQ-SHELL-049's list holds none, and adding one is a request, not this brief's.

## 6. Copy

| # | State | Severity | Title | Message | Action | Dismiss |
|---|---|---|---|---|---|---|
| 1 | offer — metered (UD-1), after a cancel (UD-2), after a silent transport failure (OQ-552) | info | `Rotaris {version} is available` | the summary, or `Open the release notes for the full changelog.` | `Update now` | waves off (REQ-STARTUP-117) |
| 2 | downloading | info | `Downloading Rotaris {version}` | `{measured} — verifying against the published checksum when it finishes.` | **`Cancel download`** | hides (UD-3; PD-SHELL-005 rev. 3) |
| 3 | ready, installed flavour | success | **`Rotaris {version} is ready`** | **`Downloaded and verified. It installs the next time Rotaris starts, or now with Restart now.`** | `Restart now` | hides (UD-3) |
| 3′ | ready, in place (UD-8) | success | `Update installed` | `Rotaris {version} has been downloaded, verified and installed. It runs the next time Rotaris starts, or now with Restart now.` (OQ-553) | `Restart now` | hides |
| 4 | failed: a download the user started, `Restart now`, a next-start apply | error | `Update not installed` | `Rotaris is unchanged. You can try again or download the release manually.` | `Try again` | hides |
| 4′ | refused on authenticity or integrity, or a discard UD-4 shows | error | `Update not installed` | `Rotaris is unchanged. You can download the release manually.` (OQ-555) | none | hides |
| 5 | link-only | info | `Rotaris {version} is available` | the summary, or the fallback of row 1 | **`Open release page`**, with `ph-arrow-square-out` after it (the `McpSettings.tsx` "Get a key" precedent) | waves off (PD-STARTUP-014) |

Bold is written here; the rest is the record's. Rows 4 and 4′ carry the technical sentence as copyable details (REQ-STARTUP-179, REQ-NOTIFY-038). Row 2's meter label, also its accessible name: **`{percent}% downloaded`**, which the message states in words (REQ-NOTIFY-043).

**R4:** title **`Updated to Rotaris {version}`**, no body, kind `ok` (announced `Done`).

**Bounds.** The version is bounded by REQ-STARTUP-028's naming; `{measured}` by its two forms. No string grows with a run.

## 7. Accessibility obligations

- **State never by colour alone** (REQ-SHELL-149, REQ-NOTIFY-258): R1 keeps its severity word in its name (`Notice.tsx`).
- **Live regions.** R1 is `status` (`alert` for `Update not installed`) as built. While downloading, the build measures whether each repaint of the message is announced inside the `status` banner and, if it is, takes the message out of the announcement and keeps the title's change in it (§10 item 1). R4 is announced by the stack's own `status` (`Acknowledgements.tsx`, REQ-NOTIFY-019).
- **The Dismiss's name** is unchanged on every face (`Notice.tsx`); what it does differs (§10 item 2).
- **Focus ring** inside each control's bounds at `--rt-focus-ring-width` in `--rt-focus` (REQ-SHELL-148, REQ-SHELL-160 (c)).
- **Contrast** of the meter's fill against the banner, measured from pixels (REQ-SHELL-144, -145, -160 (a)).

## 8. Composition intent

**Density tier:** the banner's, as built (G1). R1 adds one thing: the meter, a `MeterBar` `tone="accent"`, thin, spanning the text column under the message (REQ-NOTIFY-043), present only while a sized download runs. R4 unchanged. Earned count: zero new bordered or filled boxes.

**Relations (`UiLayoutContract`):** `align-y` middle `notice-dismiss` → `notice-action`, kept (UIR-008); `containment` of the meter in the text column at 1000×680.

**Give-way.** None of its own: the banner's text column wraps as built; the meter spans it at every width.

## 9. Components

| Region | Component (inventory name, variant) | Note |
|---|---|---|
| R1 | the Shell implementation `NoticeBanner` (G1) with `Button` secondary (action) and ghost (Dismiss, Copy); `MeterBar` `tone="accent"` | the meter is REQ-NOTIFY-043's, not yet drawn: the banner gains it, no new component |
| R4 | `Acknowledgement` via `Acknowledgements.tsx`, kind `ok` | no action (the transient's one-member type stays one member) |

No gap: no §4.2 proposal is needed.

## 10. Disagreements and gaps

1. **The banner's repaint announcements** — suspected, not measured: a `status` banner whose message repaints per whole percent may be announced each time. The build measures it with the platform's screen reader (rubric F3) and files a defect if it is.
2. **Dismiss means two things** — on the offer it waves a version off, on every other face it hides (UD-3); the control reads `Dismiss` on all, and on the download notice it stands beside `Cancel download`, whose effect is the other one, stop and discard (OQ-552's cost). Rows 1 and 3's messages carry the consequence; row 2's message is REQ-STARTUP-118's and cannot; the indicator staying after the Dismiss is the evidence. No per-notice description is added (it would widen `NoticeSchema`). Recorded for the audit.
3. **A link-only notice with its action withheld** keeps the fallback "Open the release notes …" with nothing to open them. Recorded for the audit; PD-STARTUP-014 fixes the withholding.

*Settled 2026-11-21 under [R-072](../../product/requests.md#r-072), kept as history:* the download notice's exit (OQ-552), the in-place ready notice (OQ-553), which transitions take the banner back (OQ-554, §4.1), `Try again` after an integrity refusal (OQ-555), REQ-NOTIFY-044's vocabulary (OQ-556), this surface's §7 row (OQ-557).

## 11. Evidence plan

**Capture.** `pnpm ui-review` (all views; theme `rotaris-dim`) at 1400×900 and 1000×680. The pack reaches none of §4's cells; `pnpm app:drive` reaches them through the **verification-only face seam** of [`title-bar-and-rail.md`](title-bar-and-rail.md) §11 (present only under `ROTARIS_DRIVER`; it never touches the feed, the download or the apply). Per cell: publish the face, `waitFor` its selector, `shot` — offer `[data-testid="notice"][data-severity="info"]`; downloading `[data-testid="notice"] .meter`; size unknown, the same without `.meter`; ready `[data-severity="success"]`; failed `[data-severity="error"]` with and without `[data-testid="notice-action"]` (rows 4, 4′); link-only `[data-action="open-release-page"]`; each row of §4.1 by publishing `notice.report` first, then the transition, then reading the current notice's title; dismissed, `click .notice__dismiss` then `waitFor` the indicator; the acknowledgement `[data-testid="acknowledgement"][data-kind="ok"]`. Never a sleep.

**Rubric rows to pass:** F1 (U1–U8 walked on the seam), F2 (§4, §4.1), F3 (the banner's stops, focus after cancel and Dismiss), F4 (§6 against the fixed strings character for character), C2, C3, C6, C8, C9, D3, D4, O1.

**Must move:** the download notice's action `Update now` (disabled) → `Cancel download` (enabled), and its Dismiss 0 → 1; the ready outcome's title `Update installed` / `Finish the update` → rows 3 and 3′; an integrity refusal's action `Try again` → none; the banner's meter 0 → 1 while a sized download runs; R4 0 → 1 on the first window after an update; a repaint, a ready state or a silent failure while another notice holds the slot: the slot's title unchanged.

**Must hold, with the proof that measures it:** the notice's `align-y` between action and dismiss (`notice-proof`, the `notice-action` contract); the notice chain and the in-place update by identity (`notice-proof`); the acknowledgement's lifetime and focus rule (`notice-proof`); dismissing an update face other than the offer records no version (the unit test OQ-552 names); no check and no request on a development build (`updater-proof`).
