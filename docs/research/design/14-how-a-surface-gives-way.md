# 14. How a surface gives way

Behaviour at the minimum window size and the compact thresholds: bounding the box rather than the child, collapsing panes, eliding text, and what the SHRUNK audit measures.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 14 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

With less room than it was drawn for, what gives way first, in what form, and how is each box bounded so nothing is lost, clipped or hidden by a container that shrank? Covered: regions, content, overlay drawers, truncation, tables, dialogs, the board, window minimums, the sweep. Not decided here: any threshold, pane, label or mode; the record fixes them:

| Figure | Owner | What gives way |
|---|---|---|
| 1440×900 opening, 1000×680 floor | `REQ-SHELL-022` | at the floor every control inside, Tab-reached, label whole |
| 1180 px of the Workspace view's width | `REQ-SHELL-059` | agents & todos pane and inspector become overlay drawers |
| window below 1180, then 1080 px | `REQ-SHELL-047` | status strip path item, then background-session item |
| viewport below 1080 px | `REQ-MONITOR-165` | Overview metric grid, four columns to two |
| dock below 900, then 700 px | `PD-CHAT-001` rev. 3 | composer strip controls shorten to their icon |
| open column 276–340 pt | `REQ-TRACE-238` | the board's columns area scrolls sideways |

Only one threshold makes overlay drawers. The 200 % of `REQ-SHELL-160`(d) and `REQ-SHELL-030` is OS display scaling in logical pixels; the renderer still lays out 1000×680 (D14-6).

## 2. Principles

- **The trigger is the space a surface has.** Breakpoints describe the app's window, not the display [1]; a component in a pane answers to the pane, since one viewport holds containers of very different widths [14][33]. At 1000 px a platform's own navigation pane has already compacted [1][2].
- **Give way by steps, per region.** Reposition, resize, reflow, show or hide, re-architect: chosen per region [3]; a pane steps from full to reduced to overlay [2].
- **Rank before shrinking.** The lowest-priority region absorbs first [8]; side panes keep proportion with the main area [5]; nested splits collapse outside in [6]. Every region a little smaller is what `SHRUNK` reports [53].
- **Secondary goes first; the name never.** Metadata goes before its item [3][4]; a table drops columns by priority class, keeps its identifying column [37] and counts what it hid [38]; titles, labels, errors and notices wrap, never truncate [18].
- **Truncation has a position and a reveal.** End for names, middle for strings differing at their edges, front for continuation [18]; middle is single-line only [19] and needs a measured script, since the platform ellipsis cuts only the end [34]. The full text is reached on focus as well as hover [16]; a cell wraps before it truncates [39].
- **Bound the box, not only the child.** A flex item will not shrink below its content [31]; repair the item, not the text [11]; wrapping alone fails [12]. A box independent of its children takes its size from the layout [32]; a panel body may be shorter than its content and scroll inside [13]. Clipping hides a failure the next longer value shows [23]. The record paid for this as UIR-014 and the worktrees table [52][53].
- **Relocated passes; lost fails.** Content behind a toggle passes while reachable; tables, code and boards scroll on two axes inside their own region while their headings reflow [15], that region focusable and named [41].
- **A dialog is bounded by its window** [46]: header and button row pinned, the body scrolls [45]; a sideways scroll means the size was wrong [47].
- **An overlay drawer arrives closed and keeps the place.** Collapse hides the pane [7] at its own width [7]; a choice closes it [6]; what was read and the selection survive [20]; the width is remembered [22]; a hidden pane needs more than one way back [9]. Hiding costs discoverability [10]: hidden navigation is used about half as often on desktop, while partial overflow costs almost nothing [29].
- **A minimum is declared, never derived.** A layout that switches at thresholds has no minimum of its own [6]; desktop floors sit near 1024×600 [5]. Electron's `minWidth` binds the operator's drags [42]; its reference contradicts itself on `setSize`, and Wayland may ignore requested sizes [43]; zoom spreads to an origin's windows [44].
- **Height is its own axis**: a short window can defeat two panes a wide one allows [21].
- **Failures live between the screenshots.** Most web pages tested fail at some width, presets miss many, and a stepped sweep that bisects where results flip finds where each begins [23]; failures take five shapes [24], one a layout lasting a few pixels at a boundary [23]. Geometry and pixels each catch the other's misreadings [25]; text-spacing overrides expose fixed boxes [17]; short labels grow most [35].
- **Repair by transplant; accept on the whole sweep.** Extend a neighbouring width's working layout rather than squeeze [26]; a repair counts only if no other width broke [27]; the cause usually sits on an ancestor [28].

## 3. Patterns and anti-patterns

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Holding priority [8] | any split | every region a few px narrower | transcript absorbs; panes hold `REQ-SHELL-064` widths |
| *Anti:* fit by shrinking the container [52] | a repair at the floor | `SHRUNK`; content past its box | build-ui step 8 [53] |
| Reset the item's minimum [11][31] | a row holding a path | a long value widens the row | `min-width: 0`; elide in `--rt-font-mono` |
| Scroll in the region [13][41] | transcript, `LogPanel`, `Table` | the view scrolls | `TableCard` scrolls, the view does not |
| Priority columns [37][40] | `Table` in Git, Library | seven columns at 48 px [52] | per-column floor on `--rt-space-*`; identity stays |
| Middle elision [18][19] | paths, branches | the file name lost | `REQ-WORKSPACE-149` rule 2's measured cut [54] |
| *Anti:* truncated label [18] | titles, notices, errors | `…` in a `PageHeader` | wrap; `REQ-SHELL-022` |
| Reveal on focus [16] | any elided value | full text on hover only | `Tooltip`; `REQ-SHELL-058` |
| Overlay arrives closed [7] | crossing 1180 | a drawer open over the transcript | `REQ-SHELL-061`; G9 |
| Choosing closes [6] | agent chosen in a drawer | sidebar stays open | `REQ-SHELL-063` |
| Place survives [20][22] | resize either way | scroll or width reset | `REQ-SHELL-064`, `-069` |
| Pinned dialog chrome [45][46] | approval, hook review | Deny below the window edge | `Dialog` capped at the window; G2 |
| *Anti:* sideways dialog scroll [47] | a long command line | a horizontal bar on the body | wrap or middle-elide; code scrolls in its box [15] |
| Board scrolls, column holds [15] | board at 1000 px | a column under 276 pt | `REQ-TRACE-237`, `-238`; G15 |
| Inner container scrolls first [48] | a card dragged off screen | both axes move at once | one container per axis; `REQ-TRACE-237` |
| Non-drag move [49][50] | a distant column | reached only by scrolling | `REQ-TRACE-297`'s move control |
| *Anti:* clip to pass [23] | `overflow: hidden` on a row | a clean screenshot | `CONTAINMENT`, `SHRUNK` still report |

## 4. Method

1. **Name the bounds.** List every figure binding the surface (§1's table and its own, such as `REQ-SHELL-061`, `-064`, `-065`, `REQ-CONFIG-274`, `REQ-TRACE-237`, `-376`), and which width each reads: window, view or container [1][14]. Never introduce one.
2. **Rank the regions.** For each: which holds, which absorbs, the proportion kept with the main area [5][8]; nested ones give way outside in [6].
3. **Choose one technique per region per band** [3] — opening size, each threshold, the floor, the floor's height [21] — and write it down.
4. **Rank the content inside.** What never truncates [18]; what goes first [3][4]; which column identifies the row [37]; where each string is cut [18][19]; how its full text is reached by focus and by name [16].
5. **Bound every box.** Size from the grid and the window, never from content [32]; reset flex minimums on the item [11][31]; `min-height: 0` and an inner scroll on vertical bodies [13]; dialogs capped at the window [45][46]; a floor on every shrinkable column [39][40]. Never make a thing fit by shrinking what holds it [53].
6. **Draw the crossing.** The drawer starts closed [7], takes its pane's width [22], closes on a choice [6], keeps the place [20], and has a keyboard route back [9].
7. **Sweep, then bisect.** `pnpm ui-audit -- --sizes=…` [55] at the floor, the opening size and one pixel either side of every threshold [23]; at 680 tall; with text-spacing overrides [17]. Confirm geometry against the PNG and the reverse [25]; sort findings into the five shapes [24].
8. **Repair by transplant, re-run everything.** Extend the arrangement working at the neighbouring width [26]; look up the ancestor chain first [28]; accept only when every width and contract is green [27], with the number before and after (build-ui step 7).

## 5. Worked example — the agent list and inspector at the threshold

**Surface.** §7 row "Agent list, context rings, inspector": mockup `WORKSPACE` → `agents panel`, `inspector`; nearest built code `AgentTree.tsx`, `ContextRing.tsx`, `Inspector.tsx`, the compact arrangement in `WorkspaceView.tsx` and `.workspace--narrow` in `shell.css` [51][56].

1. **Bounds.** `REQ-SHELL-059`, `-060` (one drawer at a time), `-061` (at 1000×680 both closed, centre at least 850 px, queue capped at 150 px, send visible), `-062`, `-063`, `-064` (sidebar 236/180/520, inspector 288/220/560, widths survive the crossing), `-065`, `REQ-MONITOR-041` (a row never widens the panel). `useNarrow` reads `(max-width: 1179px)`, the viewport (D14-2).
2. **Rank.** The transcript absorbs; both panes hold [8]. At their maxima the centre of a 1181 px view is near 100 px, the disproportion [5] warns of (D14-3).
3. **Technique.** Panes re-architect into overlay drawers [3]; tree rows elide; the meta label and timeout `Tag` take a line of their own, the record's repair after a tag cut the persona column from 112 to 35 px [54]; `ContextRing` holds; inspector sections reflow.
4. **Content.** The persona name ends in `…`, its full text the `Tooltip` and description [16]; the task name below it goes first [4]; a path in the inspector is middle-elided by `REQ-WORKSPACE-149`'s measurer [18][54].
5. **Boxes.** The drawers are `width: min(320px, 80%)` with `--rt-shadow-lg` [56]; a reviewer checks that width against the pane's own width [7][22] and `REQ-SHELL-064`, and that the inspector drawer's body scrolls inside it at 680 tall [13].
6. **Crossing.** Below 1180 both drawers start closed [7]; choosing an agent opens the inspector's and closes the sidebar's [6]; the transcript keeps its scroll position [20]; re-docking re-applies widths [22]. The drawer bar's labels and names are read against `REQ-SHELL-062`. Defect 83, a `matchMedia` change lost while no listener was attached, is why state is re-read on attach [56].
7. **Sweep.** `pnpm ui-audit -- --views=2 --sizes=1440x900,1181x900,1179x900,1000x680` and 1180 plus the rail's width, so both readings of D14-2 are measured: `SHRUNK` on `.agents` and `.inspector`, `CONTAINMENT` of the drawers, `STACKING` on the toggles, the centre against 850 px [55].
8. **Repair.** A failure at 1181 takes the arrangement that works at 1440 or at 1179 [26], never a narrower transcript, and the whole sweep runs again [27].

## 6. Checks

Brackets: rubric ids; *new*: a proposed row.

- **K1** [D4] No `SHRUNK` or `CONTAINMENT` finding at 1000×680, 1440×900, and 1079/1081 and 1179/1181 px [23][24][53].
- **K2** [D4; *new*] At each threshold ±1 px the surface is in exactly one arrangement [23].
- **K3** [D4] At the floor every control is inside the window, Tab-reached, its label whole (`REQ-SHELL-022`); `scrollWidth` equals `clientWidth` on the view and `.status-strip` [52][54].
- **K4** [D4; *new*] Only a `Table`, a diff, the board's columns area or a code excerpt scrolls sideways, each focusable and named, its heading still [15][41].
- **K5** [F3, F4] Every elided string's full text is its accessible description and shows on keyboard focus [16].
- **K6** [D4; *new*] No `PageHeader` title, notice, acknowledgement, field label or error ends in `…` at the floor [18].
- **K7** [C7; *new*] Paths, branches and worktree names keep both ends; descriptions cut at the end [18][19].
- **K8** [D4; *new*] Every shrinkable `Table` column has a floor on the 8 px module; the identifying column survives every threshold; hidden columns are counted [37][38][40].
- **K9** [D4] Every `Dialog` fits the window minus a `--rt-space-*` margin; only the body scrolls; the button row is visible at 1000×680 [45][46][47].
- **K10** [D4, C9; *new*] A crossing leaves drawers closed and the transcript's scroll position and pane widths unchanged, and animates nothing in conversation content (§1.8; D14-1) [7][20][22].
- **K11** [C2] Density changes ride `--rt-space-*`; `spacing-token` relations hold at both sizes [4].
- **K12** [D4; *new*] With text-spacing overrides at 1000×680, `text-fit` and `CONTAINMENT` stay green [17].
- **K13** [D4; *new*] The renderer's inner size is recorded per platform at the floor; a restored bound never sits below it [42][43].
- **K14** [*new*] A geometry finding is filed with its PNG, a visual one with a measurement [25].

## 7. How this applies here

**Requirements.** `REQ-SHELL-022`, `-023`, `-030`, `-038`, `-047` – `-049`, `-055`, `-058` – `-071`, `-144`, `-147`, `-148`, `-160`, `-167`; `REQ-MONITOR-040`, `-041`, `-051`, `-165`; `REQ-WORKSPACE-149`; `REQ-CHAT-057`, `-061`, `-175`, `-177`; `REQ-TOOLS-063`; `REQ-CONFIG-274`, `-346`; `REQ-TRACE-237`, `-238`, `-297`, `-318`, `-376`. **Directive:** `PD-CHAT-001` revision 3.

**Tokens:** `--rt-space-1` … `--rt-space-24`, `--rt-border`, `--rt-divider`, `--rt-shadow-md`, `--rt-shadow-lg`, `--rt-focus`, `--rt-font-mono`. **Components:** `Table`, `TableCard`, `Tooltip`, `Dialog`, `ConfirmDialog`, `PageHeader`, `KpiCard`, `Tag`, `LogPanel`, `ContextRing`. **Gaps (§4.2):** G2, G3, G6, G7, G8, G9, G10, G15.

**The record's lessons**, as experience: "the tokens hold but composition breaks" (§7.1) [51]; UIR-001's 1847 px strip in a 1400 px window, UIR-014's header squeezed from 76 to 56 px, the worktrees table at 48.56 px a column [52]; "bound the box, not only the child" [53]; the timeout tag on its own line [54].

**Who reads what.**

| Derivative | Reads |
|---|---|
| `design-ui` brief §8 | §2, §3, §4 steps 1–6 |
| `design-ui` brief §10 | §8 |
| `design-ui` brief §11 | §4 step 7 |
| `design-ui` audit step 2, the capture sizes | §4 step 7 |
| rubric D4 | §2, §6 |

The rubric may lift section 6's *new* checks.

## 8. Where this disagrees with the adopted material

- **D14-1 —** Resizing should be smooth, nothing jumping or vanishing unanimated [5]. §1.8: motion for status only; `REQ-TRACE-318` draws the rails' widening unanimated. *Is a pane becoming an overlay drawer drawn in one frame, or a change §1.8 admits motion for?* — [OQ-496](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-496)

  *Ruled 2026-11-03 (OQ-496): A pane becoming an overlay drawer is drawn in one update; a drawer then opened enters with the entrance tokens.*
- **D14-2 —** Thresholds belong to the container, not the viewport [14][33]. `REQ-SHELL-059`: the view's own width; `REQ-MONITOR-051`: viewport; `REQ-SHELL-047`: window; `useNarrow` reads the viewport [56]. *Which width triggers Workspace compact mode, and do the two requirements name one?* — [OQ-524](../../archive/architecture/open-questions/71-spikes-and-later-questions-38.md#oq-524)

  *Ruled 2026-11-03 (OQ-524): A directive narrows REQ-MONITOR-051: compact mode is measured by the Workspace view's own width (REQ-SHELL-059).*
- **D14-3 —** A side pane should never look too wide or narrow beside the main area [5]. `REQ-SHELL-064`'s maxima leave a 1180 px view's centre near 100 px; `REQ-SHELL-065`'s 700 px is stated at 1440×900. *Is 700 px the centre's floor at every docked width?* — [OQ-525](../../archive/architecture/open-questions/71-spikes-and-later-questions-38.md#oq-525)

  *Ruled 2026-11-03 (OQ-525): REQ-SHELL-065's 700 px is an acceptance figure at 1440×900 with declared defaults; REQ-SHELL-064's maxima stand.*
- **D14-4 —** Hidden navigation on desktop is used about half as often [29]. `REQ-SHELL-061`: both drawers closed at the floor. *At 1000×680, how does the operator learn an agent behind a closed drawer is waiting, other than from its rows?* — [OQ-506](../../archive/architecture/open-questions/70-spikes-and-later-questions-37.md#oq-506)

  *Ruled 2026-11-03 (OQ-506): At 1000×680 the focused run's wait is the dialog and transcript rows; a background run's is on the sessions card.*
- **D14-5 —** Tiled windows beat overlapping ones for tasks spanning both [30] (low confidence). `REQ-SHELL-059`, `-060`: one drawer at a time over the content. *Below 1180 px, is the delegation tree beside the transcript given up by design?* — [OQ-526](../../archive/architecture/open-questions/71-spikes-and-later-questions-38.md#oq-526)

  *Ruled 2026-11-03 (OQ-526): The loss is confirmed: below the compact threshold one overlay drawer shows at a time, adopted text unchanged.*
- **D14-6 —** Reflow implies zoom down to 320 CSS px [15]; zoom spreads to an origin's windows [44]. `REQ-SHELL-160`(d), `REQ-SHELL-030`: OS display scaling. *Is a usable layout owed under renderer zoom, where a 1000 px window lays out below every threshold?* — [OQ-495](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-495)

  *Ruled 2026-11-03 (OQ-495): No layout is owed under renderer zoom; every window stays at zoom factor 1 and reflow to 320 CSS px stays guidance.*
- **D14-7 —** A hidden pane needs several ways back, a command with a shortcut among them [9]. `REQ-SHELL-049` names no drawer command; `REQ-SHELL-062`'s toggles exist only when compact. *Are toggles and Escape the whole keyboard route, or does `REQ-SHELL-048`'s vocabulary owe the drawers a command?* — [OQ-505](../../archive/architecture/open-questions/70-spikes-and-later-questions-37.md#oq-505)

  *Ruled 2026-11-03 (OQ-505): Toggles and Escape stay the drawers' route and no drawer command is minted; an open drawer is one F6 press away.*
- **D14-8 —** One-line elided previews give too little to judge an item [36]. `REQ-CHAT-175`: a one-line description; §7.4: `nowrap`, ellipsized. *Does one elided line let the operator recognise a tool row in a narrow window?* — [OQ-531](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-2.md#oq-531)

  *Ruled 2026-11-03 (OQ-531): REQ-CHAT-175's one line stands with no wrap; a cut line reveals the full derived line on focus and hover.*
- **D14-9 —** Short labels grow most, against shortening them for width [35]. `PD-CHAT-001` rev. 3: strip controls shorten to their icon. *Does an icon with its tooltip carry what the label did for a keyboard user?* — none filed; already-ruled: PD-CHAT-001
- **D14-10 —** Electron's window floor binds only drags [42]. `REQ-SHELL-022`: no surface declares its own minimum; `REQ-SHELL-167`: auxiliary windows resize freely. *What must a persona window or the terminal window show at the smallest size it can be dragged to?* — [OQ-527](../../archive/architecture/open-questions/71-spikes-and-later-questions-38.md#oq-527)

  *Ruled 2026-11-03 (OQ-527): A directive narrows REQ-SHELL-167: a persona window keeps a 560×420 floor and the terminal window 560×360.*
- **D14-11 —** A fade at the edge can signal a scrolling dialog body [47]. §1.7: no gradient fills. *Is the hairline above the button row the cue that a `Dialog` body scrolls?* — none filed; already-ruled: §1.7
- **D14-12 —** A collapsed pane floats above the content [7]. §1.7 reserves `--rt-shadow-md` and `-lg` for dialogs, popovers, acknowledgements and the palette; the drawers carry `--rt-shadow-lg` [56]. *Is an overlay drawer among the surfaces §1.7 lets float?* — [OQ-513](../../archive/architecture/open-questions/70-spikes-and-later-questions-37-continued-2.md#oq-513)

  *Ruled 2026-11-03 (OQ-513): Read in a §1.7 note: the shadow list names kinds of floating surface, so the overlay drawers keep --rt-shadow-lg.*
- **D14-13 —** Widening every rail at drag start moves the columns the pointer aims for [48]. `REQ-TRACE-318`: each rail widens to an open column's minimum. *At 1000 px, must a drag keep the lifted card's column and the one under the pointer in view?* — [OQ-532](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-2.md#oq-532)

  *Ruled 2026-11-03 (OQ-532): Both columns in view is unmeetable at 1000 px; autoscroll is REQ-TRACE-237's own scroll, REQ-TRACE-318 unchanged.*

## 9. References and further reading

[1] [Microsoft Learn, Screen sizes and breakpoints for responsive design](https://learn.microsoft.com/en-us/windows/apps/design/layout/screen-sizes-and-breakpoints-for-responsive-design) — window, not display; classes; retrieved 2026-11-01
[2] [Microsoft Learn, NavigationView](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/navigationview) — stepped pane; retrieved 2026-11-01
[3] [Microsoft Learn, Responsive design techniques](https://learn.microsoft.com/en-us/windows/apps/design/layout/responsive-design) — five techniques; retrieved 2026-11-01
[4] [Microsoft Fluent 2 Design System, Layout](https://fluent2.microsoft.design/layout) — less metadata; retrieved 2026-11-01
[5] [GNOME Human Interface Guidelines, Adaptive](https://developer.gnome.org/hig/guidelines/adaptive.html) — floor; proportion; smooth resize; retrieved 2026-11-01
[6] [GNOME libadwaita documentation, Adaptive Layouts](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/adaptive-layouts.html) — declared minimum; outer first; choosing closes; retrieved 2026-11-01
[7] [GNOME libadwaita documentation, AdwOverlaySplitView](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.OverlaySplitView.html) — hidden on collapse; own width; retrieved 2026-11-01
[8] [Apple Developer Documentation, holdingPriorityForSubview(at:)](https://developer.apple.com/documentation/appkit/nssplitview/holdingpriorityforsubview(at:)) — holding priority; retrieved 2026-11-01
[9] [Apple Human Interface Guidelines, Split views](https://developer.apple.com/design/human-interface-guidelines/split-views) — ways back; retrieved 2026-11-01
[10] [Apple Human Interface Guidelines, Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) — discoverability; retrieved 2026-11-01
[11] [CSS-Tricks (Chris Coyier), Flexbox and Truncated Text](https://css-tricks.com/flexbox-truncated-text/) — fix the flex child; retrieved 2026-11-01
[12] [Defensive CSS (Ahmad Shadeed), Minimum content size in CSS flexbox](https://defensivecss.dev/tip/flexbox-min-content-size/) — wrap alone fails; retrieved 2026-11-01
[13] [Ahmad Shadeed, Min and Max Width/Height in CSS](https://ishadeed.com/article/min-max-css/) — inner scroll; retrieved 2026-11-01
[14] [Every Layout (Heydon Pickering, Andy Bell), The Sidebar](https://every-layout.dev/layouts/sidebar/) — container, not viewport; retrieved 2026-11-01
[15] [W3C Web Accessibility Initiative, Understanding Success Criterion 1.4.10: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) — reachable; section exceptions; 320 px; retrieved 2026-11-01
[16] [W3C Web Accessibility Initiative, Understanding Success Criterion 1.4.4: Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) — truncation with reveal; retrieved 2026-11-01
[17] [W3C Web Accessibility Initiative, Understanding Success Criterion 1.4.12: Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) — override test; retrieved 2026-11-01
[18] [IBM Carbon Design System, Overflow content](https://carbondesignsystem.com/patterns/overflow-content/) — positions; never truncated; retrieved 2026-11-01
[19] [Apple Developer Documentation, NSLineBreakMode.byTruncatingMiddle](https://developer.apple.com/documentation/appkit/nslinebreakmode/bytruncatingmiddle) — single line; retrieved 2026-11-01
[20] [Android Developers, Canonical layouts](https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts) — place kept; retrieved 2026-11-01
[21] [Android Developers, Use window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes) — height classes; retrieved 2026-11-01
[22] [GitHub Primer, PageLayout](https://primer.style/components/page-layout) — remembered pane width; retrieved 2026-11-01
[23] [Walsh, Kapfhammer, McMinn (ACM SIGSOFT ISSTA), Automated Layout Failure Detection for Responsive Web Pages without an Explicit Oracle (ISSTA 2017)](https://eprints.whiterose.ac.uk/id/eprint/116989) — prevalence; sweep; small-range; clipping; retrieved 2026-11-01
[24] [ReDeCheck project, ReDeCheck: Responsive Design Checker (README)](https://github.com/redecheck/redecheck) — five shapes; retrieved 2026-11-01
[25] [Althomali, Kapfhammer, McMinn (IEEE ICST), Automatic Visual Verification of Layout Failures in Responsively Designed Web Pages (ICST 2019)](https://eprints.whiterose.ac.uk/id/eprint/230100) — geometry against pixels; retrieved 2026-11-01
[26] [Althomali, Kapfhammer, McMinn (IEEE ICST), Automated Repair of Responsive Web Page Layouts (ICST 2022)](https://eprints.whiterose.ac.uk/id/eprint/230094) — transplant; retrieved 2026-11-01
[27] [Zerin, Asad, Hossain, Sakib (arXiv, ICSME 2025), Repairing Responsive Layout Failures Using Retrieval Augmented Generation](https://arxiv.org/abs/2511.00678) — no new failure; retrieved 2026-11-01
[28] [Zerin, Hossain, Sakib (arXiv, ENASE 2025), A Heuristic Approach to Localize CSS Properties for Responsive Layout Failures](https://arxiv.org/abs/2605.25476) — ancestor cause; retrieved 2026-11-01
[29] [Nielsen Norman Group (Kara Pernice, Raluca Budiu), Hamburger Menus and Hidden Navigation Hurt UX Metrics](https://www.nngroup.com/articles/hamburger-menus/) — hidden cost; partial overflow; retrieved 2026-11-01
[30] [Lane, Kuester, Shneiderman (University of Maryland), User Interfaces for a Complex Robotic Task: A Comparison of Tiled vs. Overlapped Windows (CS-TR-3784)](https://drum.lib.umd.edu/handle/1903/478) — tiled faster; retrieved 2026-11-01
[31] [W3C CSS Working Group, CSS Flexible Box Layout Module Level 1, section 4.5 Automatic Minimum Size of Flex Items](https://www.w3.org/TR/css-flexbox-1/#min-size-auto) — automatic minimum; retrieved 2026-11-01
[32] [W3C CSS Working Group, CSS Containment Module Level 2](https://www.w3.org/TR/css-contain-2/) — size from layout; retrieved 2026-11-01
[33] [W3C CSS Working Group, CSS Conditional Rules Module Level 5 (container queries)](https://www.w3.org/TR/css-conditional-5/) — container queries; retrieved 2026-11-01
[34] [W3C CSS Working Group, CSS Overflow Module Level 3, section 5.1 Overflow Ellipsis](https://www.w3.org/TR/css-overflow-3/) — end only; retrieved 2026-11-01
[35] [W3C Internationalization Activity, Text size in translation](https://www.w3.org/International/articles/article-text-size) — short labels grow; retrieved 2026-11-01
[36] [Jacqueline Sachse (Aslib Journal of Information Management), The influence of snippet length on user behavior in mobile web search](https://www.emerald.com/insight/content/doi/10.1108/ajim-07-2018-0182/full/html) — one-line previews; retrieved 2026-11-01
[37] [Filament Group (Maggie Wachs), A responsive design approach for complex, multicolumn data tables](https://www.filamentgroup.com/lab/responsive-design-approach-for-complex-multicolumn-data-tables.html) — priority columns; retrieved 2026-11-01
[38] [Nielsen Norman Group (Page Laubheimer), Data Tables: Four Major User Tasks](https://www.nngroup.com/articles/data-tables/) — counted, recoverable columns; retrieved 2026-11-01
[39] [GitHub Primer, Data table: guidelines](https://primer.style/product/components/data-table/guidelines/) — column floors; wrap first; retrieved 2026-11-01
[40] [Amazon Web Services, Cloudscape Design System, Cloudscape components: table interfaces](https://raw.githubusercontent.com/cloudscape-design/components/main/src/table/interfaces.tsx) — column minimums; retrieved 2026-11-01
[41] [Adrian Roselli, Under-Engineered Responsive Tables](https://adrianroselli.com/2020/11/under-engineered-responsive-tables.html) — named scroll region; retrieved 2026-11-01
[42] [Electron (OpenJS Foundation), BaseWindowConstructorOptions Object](https://raw.githubusercontent.com/electron/electron/main/docs/api/structures/base-window-options.md) — floor binds drags; retrieved 2026-11-01
[43] [Electron (OpenJS Foundation), BrowserWindow](https://raw.githubusercontent.com/electron/electron/main/docs/api/browser-window.md) — `setSize`; Wayland; retrieved 2026-11-01
[44] [Electron (OpenJS Foundation), webContents](https://raw.githubusercontent.com/electron/electron/main/docs/api/web-contents.md) — per-origin zoom; retrieved 2026-11-01
[45] [Microsoft Fluent 2 Design System, Dialog - usage (Fluent 2, web, React)](https://fluent2.microsoft.design/components/web/react/core/dialog/usage) — pinned chrome; retrieved 2026-11-01
[46] [GNOME libadwaita documentation, Adw.Dialog](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.Dialog.html) — bounded by window; retrieved 2026-11-01
[47] [IBM Carbon Design System, Modal - usage](https://carbondesignsystem.com/components/modal/usage/) — no sideways scroll; fade; retrieved 2026-11-01
[48] [Atlassian Design System, Auto scroll: about](https://atlassian.design/components/pragmatic-drag-and-drop/optional-packages/auto-scroll/about) — inner first; retrieved 2026-11-01
[49] [Nielsen Norman Group (Page Laubheimer), Drag-and-Drop: How to Design for Ease of Use](https://www.nngroup.com/articles/drag-drop/) — off-screen targets; retrieved 2026-11-01
[50] [W3C Web Accessibility Initiative, Understanding Success Criterion 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) — pointer alternative; retrieved 2026-11-01
[51] [Rotaris record, design README §7](../../design/README/07-7-fidelity-consult-before-maintain-after.md) — surface row; §7.1, §7.4; retrieved 2026-11-02
[52] [Rotaris record, all twelve critic findings repaired](../../architecture/codebase/17-all-twelve-critic-findings-repaired-and.md) — UIR-001..012, UIR-014; retrieved 2026-11-02
[53] [Rotaris record, build-ui step 8](../../../.agents/skills/build-ui/SKILL.md) — bound the box; retrieved 2026-11-02
[54] [Rotaris record, seams §8](../../architecture/views/04-seams/08-8-a-drawn-surface.md) — strip elision; timeout tag; retrieved 2026-11-02
[55] [Rotaris record, `ui-audit.mjs`](../../../apps/desktop/scripts/ui-audit.mjs) — sweeps; `--sizes`; retrieved 2026-11-02
[56] [Rotaris record, `WorkspaceView.tsx` and `shell.css`](../../../packages/ui/src/WorkspaceView.tsx) — `useNarrow`; drawers; retrieved 2026-11-02
