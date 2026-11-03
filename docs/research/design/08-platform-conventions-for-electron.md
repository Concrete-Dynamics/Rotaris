# 08. Platform conventions for Electron

Window chrome, menus and accelerators, native dialogs, scrollbars, DPI, focus rings, system theme, clipboard and drag-and-drop on Windows, macOS and Linux, and the Electron pitfalls around each.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 08 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

What does each host desktop expect of a window — frame, menus, keys, dialogs, scrolling, scale, text, focus, theme, attention, drag — and which duties does the renderer take over once the product draws its own chrome? Covered: the main window's product-drawn title bar (`PD-SHELL-003`), the native-framed auxiliary windows, and the native surfaces a theme reaches (`REQ-SHELL-130`).

Not decided here: which primary views, tabs, labels or orders exist (`REQ-SHELL-023` and the authorities §2 names), any string the specification fixes, or the macOS artifact (IC-3). Composites are guide 05's, floors 09's, giving way 14's. Field names appear once: a taskbar flash or Dock bounce is what `REQ-SHELL-161` calls the **attention hint**; an OS notification is the operating system's, never this product's **notice**.

## 2. Principles

1. **A frameless window inherits the frame's duties.** A hidden title bar keeps the macOS traffic lights but leaves Windows and Linux without controls unless an overlay draws them [1]. A drag region swallows pointer events, so a control inside needs `no-drag`, and right-clicking it can open the system menu [2]. Windows expects the bare bar to drag, open the window menu on right-click and maximize on double-click; the title truncates first, the controls never, and the bar grows with text size [3]. Content there stays inside the rectangle the platform reports, whose controls may sit left or right [5]. Apple prefers the system frame to an imitation [4].
2. **The window still says whether it has focus.** "All title bar elements should be semi-transparent when the window is inactive" [3]; macOS greys an inactive window's controls, and a custom frame does that itself [4].
3. **The first frame and every native surface follow the theme.** Create hidden, show on `ready-to-show`, and set the native background anyway, as the event can arrive late [6]. `nativeTheme.themeSource` drives `prefers-color-scheme` and native menus, dialogs and frames [7]; a root colour scheme turns scrollbars and form popups dark [9].
4. **An OS contrast setting is the person's, not a theme.** Forced colours replace author colours and drop box shadows [9]. Windows contrast themes are small user-edited palettes, often at 7:1, mapped to system colour roles [10]; a quarter of low-vision users of such modes choose dark text on light [11].
5. **Focus survives any ground.** The enhanced criterion asks for the area of a 2 CSS px perimeter, so a ring drawn inside the edge must be thicker [14]; a restyled ring needs 3:1 against its neighbours [15]. macOS rings fields but highlights a focused list row, moves focus only on input, and hides the ring when the focused item vanishes [13].
6. **Keys are written in the platform's words.** `CommandOrControl` is Command on macOS and Control elsewhere; menu accelerators fire only while the app is focused, global shortcuts everywhere [16]. Apple orders modifiers Control, Option, Shift, Command, prefers Command, and says not to repurpose standard shortcuts [17]; Command-Comma and Control+Comma open settings [17][19]. KDE never binds a bare function key, which laptops hide [18]. A shortcut shown only in a tooltip is seldom learned [20]; typed commands mirroring visible ones are taken up at once, while Alt key-tip sequences are not [21].
7. **Menus are where commands are learned.** The macOS menu bar keeps the standard menus in order, a Window menu even for one window, and commands found elsewhere too, unavailable ones disabled [22]. On Windows and Linux an Electron menu is per window, and a default one appears if none is set [23]. Electron draws no context menu; one is built from the event's edit flags and reached by Shift+F10 too [24]. A context menu's commands also exist elsewhere [25].
8. **Dialogs are for decisions that block.** A parented native box is a sheet on macOS, Escape answers its cancel button, and its synchronous form blocks the process [26]. "Never use a dialog to create more dialogs." [27]; open and save use the toolkit's chooser [27].
9. **Scrollbars differ by host.** Classic bars take layout space and overlay bars none; a stable gutter stops the shift [29]. Width is only `auto`, `thin` or `none`, and `none` strands mouse users [30]. Nested same-axis scrollers are unpredictable, and automatic scrolling moves only as far as context needs [28].
10. **A fractional scale is the ordinary case.** A CSS pixel is 1/96 inch, so a scaled display offers fewer CSS pixels than its resolution [31]; 125 % and 150 % are standard Windows settings [33]. A 1 px hairline stays one device pixel at 150 % and becomes two at 200 % [32]. Targets want 24 CSS px or spacing [37].
11. **Text renders differently on each build.** Windows positions glyphs fractionally and anti-aliases in ClearType or greyscale, greyscale preferred since Windows 8 [34]; FreeType often blends without linear gamma, so light text on dark looks frail [35]; a light weight loses legibility under poor rendering [36].
12. **Attention is asked once and withdrawn.** Windows flashes one button, the needing window's, only to keep a task going, and clears it on activation [42]; Electron's `flashFrame(true)` runs until the app stops it [43]. An OS notification can fail silently without a shortcut identity or a signature [44], and the window must show all it said [45].
13. **Accent is personal.** Windows lets an app override the accent if contrast holds [46]; macOS and GNOME 47 apply the person's choice (D08-14) [47][48]; Electron's accent read and change event carry contradictory platform tags [49].
14. **A drop is guarded and copies.** A drop zone cancels `dragover` and a window guard stops stray file drops [39]; a drop navigates nothing while `navigateOnDragDrop` stays false [41]; Ctrl means copy on Windows [40]; a drag needs a single-pointer alternative [38].

## 3. Patterns and anti-patterns

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Bare drag gap [3] | title bar, every width | chips meet the controls at 1000 px | `REQ-SHELL-033` order; `.title-bar` drags [50] |
| *Anti:* control in a drag region [2] | title-bar controls | a press moves the window | `no-drag`, as `.title-bar__workspace` [54] |
| Inactive state [3][4] | several windows | a blurred window looks focused | tertiary ink on `--rt-chrome` (§1.1) |
| First frame in theme [6] | every window | white flash before paint | background from `--rt-bg` [56] |
| Native surfaces in theme [7][9] | menus, choosers, scrollbars | a light menu by a dark ground | `themeSource` from the dark flag; `REQ-SHELL-130` |
| *Anti:* shadow as the only edge [9] | `Dialog`, `CommandPalette`, `Tooltip` | a float dissolves in forced colours | `--rt-border` beside `--rt-shadow-md` (§1.7) |
| *Anti:* ring as box-shadow [9][14] | every focusable | no ring in forced colours | `outline` in `--rt-focus` (§1.7); `REQ-SHELL-148` |
| *Anti:* tooltip-only chord [20] | rail, title bar | chord learnable by hover only | `Kbd` in palette rows (`REQ-SHELL-053`) |
| Edit context menu [24] | composer, `Input`, `TextArea` | right-click gives nothing | native menu from edit flags, themed (`REQ-SHELL-130`) |
| *Anti:* dialog over dialog [27] | approval, question stepper, sign-in | two modals stacked | one approval dialog with its queue counter (G2) |
| Stable gutter, kept thumb [29][30] | transcript, `LogPanel`, `TableCard` | first overflow shifts columns | `scrollbar-gutter: stable`; thumb `--rt-border-strong` (§1.7) |
| *Anti:* nested same-axis scroller [28] | tool card, diff in the transcript | the wheel stops in a row | grow the row (§7.2's capped card) [51] |
| One hint, cleared [42][43] | approval waiting, operator elsewhere | flashing after the answer | `REQ-SHELL-161`; clear on focus or answer |
| *Anti:* OS notification as only route [44][45] | waiting approval | state absent in the window | notice (G1), queue counter, status strip |
| Guarded copy-only drop [39][40][41] | composer image drop | a stray drop opens the file | `REQ-CHAT-169` picker; `REQ-CHAT-173`; `--rt-hover` |

## 4. Method

1. **List the duties a region inherits** from the host, and who draws each [1][7][23].
2. **Assign each frame duty**: drag, double-click, window menu, inactive state, truncation, controls [1][2][3].
3. **Mark every interactive descendant of a drag region `no-drag`** and keep a bare gap at 1000 px [2][3].
4. **Theme the native**: background, `themeSource`, root colour scheme [6][7][9]; inspect each surface `REQ-SHELL-130` names under `REQ-SHELL-160`(b).
5. **Write each binding once** as `CommandOrControl` and check it against each platform's standard list [16][17][19]; a collision is a question, never a remap (`REQ-SHELL-165`).
6. **Choose native or drawn per menu**: edit menus native from the edit flags [24], every item reachable elsewhere [25].
7. **Keep dialogs single and asynchronous**, native only where `REQ-SHELL-164` names one [26][27].
8. **Give long scrollers a stable gutter and a thumb**, never a nested same-axis scroller [28][29][30].
9. **Capture at 100, 150 and 200 %** on a classic-scrollbar host, naming scale and platform; judge weight per build [32][34][35].
10. **Set one attention hint and clear it** once answered [42][43][45].
11. **Write each conflict between a source and the record as a section-8 question.**
12. **Plan the evidence**: which check the pack, the DOM or `pnpm app:drive` answers, and which needs a missing host; the frame is measured on Windows only [50].

## 5. Worked example — the title bar

Row *Title bar, nav rail*: mockup sections `title bar`, `nav rail`; nearest built code `AppShell.tsx`, `WorkspaceChip.tsx` and, since `PD-SHELL-003`, `WindowControls.tsx`, styled in `packages/ui/src/shell.css` [54], read 2026-11-02.

**Duties (steps 1–2).** `mainWindowOptions` sets `frame: false` everywhere and `setApplicationMenu(null)` removes the menu [55]; the controls end the bar [50]. Drag: `.title-bar` [54]. Double-click maximizes, measured on Windows 11 at 150 % on 2026-10-21 [50]. Window menu: that run reads no system-menu style [50] (D08-3). Inactive state: none styled [54], a gap. Truncation: the workspace slot's zero basis elides the path first [54]. Snap Layouts: no flyout [50] (D08-2).

**Drag exclusions (step 3).** `no-drag` is on the sessions control, workspace chip, improvement indicator and controls; brand mark, wordmark and version label drag [54].

**Theme and focus (step 4).** Main sets `themeSource` from the dark flag and modal windows' background from `--rt-bg` [56]; `packages/ui/src/theme.ts` writes the root colour scheme. The controls' `outline` sits inset, in bounds as `REQ-SHELL-148` asks [54], and survives forced colours [9]; its area is D08-9 [14]. Close takes `--rt-fail` only on hover and focus [50].

**One thing to file.** `.title-bar__name` declares `font-weight: 600` [54]; §1.4 says nothing goes above 500. Rubric C1 catches it; the repair is `debug-ui`'s.

**What the record paid for.** The chip's fixed basis follows "bound the box, not only the child" [53]; UIR-001, a status strip 1847 px wide in a 1400 px window, is that family one row lower [52]; §7.1's "the tokens hold but composition breaks" is why `title bar` is read before a chip is added [51].

## 6. Checks

Rubric ids in brackets; *new* marks a proposed row.

- **K1** [*new*] Every interactive descendant of `.title-bar` computes `-webkit-app-region: no-drag`, and `elementFromPoint` at its centre returns it [2].
- **K2** [D4; *new*] At 1000×680 a bare drag gap of non-zero width remains before the window controls [3].
- **K3** [D4] From 1440 to 1000 px the workspace path loses width before any chip; each control keeps `--rt-title-bar-height` [3][53].
- **K4** [*new*] With the main window blurred, the wordmark's computed colour differs from the focused state, by a token [3][4].
- **K5** [F3] Every focusable draws an `outline` (never only a `box-shadow`) of `--rt-focus-ring-width` in `--rt-focus`, in bounds for `REQ-SHELL-148` controls, at 3:1 against the painted surface (`REQ-SHELL-160`(c)) [9][14][15].
- **K6** [F4; *new*] `Kbd` prints ⌘ in Apple's modifier order on macOS and "Ctrl" elsewhere (`REQ-SHELL-057`) [16][17].
- **K7** [*new*] Every chord a `Tooltip` shows is also beside its command in the palette and keyboard help [20].
- **K8** [*new*] In each theme `themeSource` and root `color-scheme` follow the dark flag, every `BrowserWindow` opens hidden on `--rt-bg`, and no context menu or chooser is light (`REQ-SHELL-160`(b)) [6][7][9].
- **K9** [*new*] Under emulated `forced-colors: active`, `Dialog`, `CommandPalette` and `Tooltip` keep an edge and the ring shows [9].
- **K10** [*new*] The composer, `Input` and `TextArea` answer right-click and Shift+F10 with Cut, Copy and Paste per the edit flags [24].
- **K11** [*new*] Main calls no synchronous dialog, and no two product modals are open at once [26][27].
- **K12** [*new*] No overflowing scroller sets `scrollbar-width: none` (`.composer__strip` does [54]); `align-x` holds on a classic-scrollbar host [29][30].
- **K13** [D4; *new*] A pack at 150 % (`ROTARIS_CAPTURE_SCALE` [56]) shows every 1 px hairline, its manifest naming the scale [32][33].
- **K14** [*new*] Title-bar and status-strip targets are 24×24 CSS px or spaced so 24 px circles do not overlap [37].
- **K15** [*new*] The attention hint is on at most one window and cleared on focus or when its approval is answered elsewhere [42][43].
- **K16** [*new*] A file dropped outside the composer neither navigates nor opens; on the composer the effect is copy, whatever modifier is held [39][40][41].
- **K17** [C1] No title-bar text computes a weight above 500 (§1.4) [54].

## 7. How this applies here

**Requirements.** `REQ-SHELL-022`, `-023`, `-024`, `-033`, `-038`, `-041`, `-048`, `-049`, `-053`, `-057`, `-066` – `-068`, `-070`, `-128` – `-130`, `-144`, `-145`, `-148`, `-150`, `-160`, `-161`, `-164`, `-165`, `-167`; `REQ-WORKSPACE-149`; `REQ-CHAT-169`, `-173`; `REQ-TOOLS-063`. **Directive:** `PD-SHELL-003`, one product-drawn frame on every desktop.

**Tokens:** `--rt-bg`, `--rt-chrome`, `--rt-border`, `--rt-border-strong`, `--rt-hover`, `--rt-focus`, `--rt-focus-ring-width`, `--rt-hairline-width`, `--rt-title-bar-height`, `--rt-text-tertiary`, `--rt-fail`, `--rt-shadow-md`, `--rt-accent`, `--rt-done`. **Components:** `WindowControls` (shell, outside the inventory), `Button`, `Kbd`, `Tooltip`, `Dialog`, `CommandPalette`, `Input`, `TextArea`, `TableCard`, `LogPanel`, `StatusDot`. **Gaps (§4.2):** G1, G2, G10, G11.

**Who reads what.**

| Derivative | Reads |
|---|---|
| `design-ui` brief §5 | §3, §4 steps 1–7 |
| `design-ui` brief §10 | §8 |
| rubric F3 | §6 |

The rubric may lift section 6's *new* checks.

**A gap, not a disagreement.** Nothing states the main window's inactive appearance, which [3] and [4] expect of a custom frame: an open-question candidate.

## 8. Where this disagrees with the adopted material

- **D08-1 —** Apple prefers the system frame [4]; a hidden bar keeps macOS's own controls [1], at the left [5]. `PD-SHELL-003`: the product's, at the right, on macOS too. *Whose controls does the macOS main window carry, and who measures it without a macOS host (IC-3)?* — none filed; already-ruled: PD-SHELL-003 revision 2
- **D08-2 —** An overlay draws native caption controls on Windows [1]; the record finds no Snap Layouts flyout [50]. `PD-SHELL-003`: one control set everywhere. *Is losing the flyout accepted, or is the native overlay admissible on Windows?* — none filed; already-ruled: PD-SHELL-003
- **D08-3 —** Right-clicking the bare Windows bar should open the window menu [3]; the window has no system-menu style [50]. `PD-SHELL-003` names double-click only. *Is the window menu on the title bar's gap owed on Windows?* — none filed; already-ruled: PD-SHELL-003
- **D08-4 —** The macOS menu bar carries the command set, Window menu included [22]. `PD-SHELL-003`: no application menu on any desktop. *What does the macOS menu bar hold for this product?* — none filed; already-ruled: PD-SHELL-003 revision 2
- **D08-5 —** Windows sizes the bar to its contents, 32 px standard and 48 px with a search box [3]. `REQ-SHELL-033`, `-129`: 44 px in the default theme. *Is 44 px an accepted departure on Windows?* — [OQ-504](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-504)
- **D08-6 —** Windows' default title-bar material is Mica, a tinted translucent backdrop [3]. §1.7 forbids glass and backdrop blur; §1.1 fixes chroma 0. *Is losing the platform material the cost of §1.7?* — none filed; not-a-question
- **D08-7 —** Windows sets the title in Segoe UI [3]. §1.4: three faces only. *Does §1.4 govern title text on Windows, where native-framed auxiliary windows show the host's face?* — none filed; not-a-question
- **D08-8 —** macOS highlights a focused list row rather than ringing it [13]. §1.7: the ring is the only focus treatment; §1.2: a row tint is selection. *On macOS is a focused transcript or `Table` row ringed, as §1.7 says?* — [OQ-504](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-504)
- **D08-9 —** An inset ring needs more than 2 px to reach the enhanced area [14]. `REQ-SHELL-148`, `-129`: in bounds at 2 px; §1.8 note 3. *Is that shortfall against 2.4.13 accepted for self-painted controls?* — [OQ-493](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-493)
- **D08-10 —** "In users with normal vision, light mode leads to better performance most of the time" [12]. §1.1, `REQ-SHELL-128`: all three themes are dark. *Is a dark ground for every theme settled for small mono data?* — none filed; request
- **D08-11 —** Electron's example offers a reset to the system appearance [8]. `REQ-SHELL-128`: three named themes, none following the OS. *Is following the OS appearance in scope?* — none filed; request
- **D08-12 —** Forced colours override every token and may be light [9][10][11]. `REQ-SHELL-128`'s `high-contrast` is an app theme; `REQ-SHELL-160`(b). *Under an active OS palette, does the shell defer or switch theme, and how does (b) read when it is light?* — [OQ-494](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-494)
- **D08-13 —** A light weight's legibility depends on the renderer [35][36]. §1.4: weight 300 for large mono numerals on every build. *Does 300 hold on the Linux build, and who measures it?* — none filed; already-ruled: REQ-SHELL-160 (a)
- **D08-14 —** macOS replaces an app's accent with the person's choice [47]; GNOME apps follow it [48]; Electron reads it unevenly [49]. §1.2: one violet at hue 292. *Does the fixed accent stand on macOS and GNOME?* — none filed; request
- **D08-15 —** One colour should not mean two things [47]. §1.2, §1.3: accent and Z `done` share hue 292. *Does a selected row beside a `done` `StatusDot` read as one meaning?* — none filed; already-ruled: §1.3 (colour never carries a fact on its own)
- **D08-16 —** macOS hides unavailable context-menu items and their shortcuts, Windows shows accelerators [25]. `REQ-SHELL-048`, `-053`. *Does a drawn context menu follow each platform, or one presentation?* — none filed; not-a-question
- **D08-17 —** Guidance keeps the flash for an inactive app's blocking need, notifications for the rest [42]. `REQ-SHELL-161`: no notification for a declined raise. *May a run waiting on the approval dialog post an OS notification?* — none filed; request
- **D08-18 —** KDE never binds a bare function key [18]; Apple uses Command-Question mark for help, GNOME Control+? for shortcuts [17][19]. `REQ-SHELL-049`: F1 shows keyboard help. *Is F1 alone the chord on every desktop, laptops included?* — [OQ-504](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-504)
- **D08-19 —** Critical information should not sit only in a bottom bar [4]. `REQ-SHELL-024`, `-041`: safety flags in the status strip. *Is each flag stated elsewhere than the strip?* — none filed; not-a-question
- **D08-20 —** At 150 % a 1920×1080 display offers 1280×720 CSS px [31]. `REQ-SHELL-022`: 1440×900, never below 1000×680; `REQ-SHELL-167`'s work-area rule covers auxiliary windows only. *What does the main window open at when the work area cannot hold it?* — [OQ-508](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-508)
- **D08-21 —** A keyboard route alone does not meet 2.5.7 [38]. `REQ-SHELL-066` – `-068`: drag and keys; `REQ-SHELL-070`: reset. *Does a divider owe a single-pointer route?* — [OQ-493](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-493)

## 9. References and further reading

[1] [Electron, Custom Title Bar](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar) — hidden style, overlay; retrieved 2026-11-01
[2] [Electron, Custom Window Interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions) — drag regions; retrieved 2026-11-01
[3] [Microsoft, Windows app title bar](https://learn.microsoft.com/en-us/windows/apps/design/basics/titlebar-design) — bar duties, height, Mica, font; retrieved 2026-11-01
[4] [Apple, Windows](https://developer.apple.com/design/human-interface-guidelines/windows) — system frame, bottom bars; retrieved 2026-11-01
[5] [W3C WICG, Window Controls Overlay](https://wicg.github.io/window-controls-overlay/) — reported area, spoofing; retrieved 2026-11-01
[6] [Electron, BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window) — ready-to-show, background; retrieved 2026-11-01
[7] [Electron, nativeTheme](https://www.electronjs.org/docs/latest/api/native-theme) — themeSource; retrieved 2026-11-01
[8] [Electron, Dark Mode](https://www.electronjs.org/docs/latest/tutorial/dark-mode) — reset to system; retrieved 2026-11-01
[9] [W3C CSS WG, CSS Color Adjustment Module Level 1](https://www.w3.org/TR/css-color-adjust-1/) — forced colours, color-scheme; retrieved 2026-11-01
[10] [Microsoft, Contrast themes](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/high-contrast-themes) — colour roles; retrieved 2026-11-01
[11] [WebAIM, Survey of Users with Low Vision #2 Results](https://webaim.org/projects/lowvisionsurvey2/) — contrast-mode use; retrieved 2026-11-01
[12] [Nielsen Norman Group (Raluca Budiu), Dark Mode vs. Light Mode: Which Is Better?](https://www.nngroup.com/articles/dark-mode/) — polarity; retrieved 2026-11-01
[13] [Apple, Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection) — ring, row highlight; retrieved 2026-11-01
[14] [W3C WAI, Understanding Success Criterion 2.4.13: Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) — ring area; retrieved 2026-11-01
[15] [W3C WAI, Understanding Success Criterion 1.4.11: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) — 3:1; retrieved 2026-11-01
[16] [Electron, Keyboard Shortcuts](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts) — CommandOrControl; retrieved 2026-11-01
[17] [Apple, Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards) — modifiers, standard keys; retrieved 2026-11-01
[18] [KDE, Layout and navigation](https://develop.kde.org/hig/layout_and_nav/) — function keys; retrieved 2026-11-01
[19] [GNOME, Standard keyboard shortcuts](https://developer.gnome.org/hig/reference/keyboard.html) — Ctrl+comma, Ctrl+?; retrieved 2026-11-01
[20] [Malacria, Bailly, Harrison, Cockburn, Gutwin, Promoting Hotkey Use through Rehearsal with ExposeHK](https://www.csse.canterbury.ac.nz/~andy/papers/ehk.pdf) — tooltip-only shortcuts; retrieved 2026-11-01
[21] [Scarr, Cockburn, Gutwin, Quinn, Dips and Ceilings: Understanding and Supporting Transitions to Expertise in User Interfaces](https://www.csse.canterbury.ac.nz/~andy/papers/blur.pdf) — key tips; retrieved 2026-11-01
[22] [Apple, The menu bar](https://developer.apple.com/design/human-interface-guidelines/the-menu-bar) — standard menus; retrieved 2026-11-01
[23] [Electron, Application Menu](https://www.electronjs.org/docs/latest/tutorial/application-menu) — per-window menus; retrieved 2026-11-01
[24] [Electron, Context Menu](https://www.electronjs.org/docs/latest/tutorial/context-menu) — edit flags; retrieved 2026-11-01
[25] [Apple, Context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus) — hidden items; retrieved 2026-11-01
[26] [Electron, dialog](https://www.electronjs.org/docs/latest/api/dialog) — sheets, sync; retrieved 2026-11-01
[27] [KDE, Getting input](https://develop.kde.org/hig/getting_input/) — one dialog, chooser; retrieved 2026-11-01
[28] [Apple, Scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views) — nesting; retrieved 2026-11-01
[29] [W3C CSS WG, CSS Overflow Module Level 3](https://www.w3.org/TR/css-overflow-3/) — gutter; retrieved 2026-11-01
[30] [W3C CSS WG, CSS Scrollbars Styling Module Level 1](https://www.w3.org/TR/css-scrollbars-1/) — scrollbar-width; retrieved 2026-11-01
[31] [W3C CSS WG, CSS Values and Units Module Level 4](https://www.w3.org/TR/css-values-4/#absolute-lengths) — CSS pixel; retrieved 2026-11-01
[32] [W3C CSS WG, CSS Values and Units Module Level 4 (Editor's Draft)](https://drafts.csswg.org/css-values-4/#snap-a-length-as-a-border-width) — line snapping; retrieved 2026-11-01
[33] [Microsoft, DPI and device-independent pixels](https://learn.microsoft.com/en-us/windows/win32/learnwin32/dpi-and-device-independent-pixels) — fractional scale; retrieved 2026-11-01
[34] [Microsoft, Introducing DirectWrite](https://learn.microsoft.com/en-us/windows/win32/directwrite/introducing-directwrite) — anti-aliasing; retrieved 2026-11-01
[35] [Nikolaus Waxweiler (The FreeType Project), On Slight Hinting, Proper Text Rendering, Stem Darkening and LCD Filters](https://freetype.org/freetype2/docs/hinting/text-rendering-general.html) — gamma; retrieved 2026-11-01
[36] [Dobres, Reimer, Chahine, The Effect of Font Weight and Rendering System on Glance-Based Text Legibility](https://doi.org/10.1145/3003715.3005454) — weight by renderer; retrieved 2026-11-01
[37] [W3C WAI, Understanding Success Criterion 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — 24 px; retrieved 2026-11-01
[38] [W3C WAI, Understanding Success Criterion 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) — single pointer; retrieved 2026-11-01
[39] [MDN Web Docs, File drag and drop](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop) — guard; retrieved 2026-11-01
[40] [Microsoft, IDropTarget::DragOver (oleidl.h)](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-idroptarget-dragover) — modifiers; retrieved 2026-11-01
[41] [Electron, WebPreferences Object](https://www.electronjs.org/docs/latest/api/structures/web-preferences) — navigateOnDragDrop; retrieved 2026-11-01
[42] [Microsoft, Taskbar - Win32 apps](https://learn.microsoft.com/en-us/windows/win32/uxguide/winenv-taskbar) — flashing; retrieved 2026-11-01
[43] [Electron, Taskbar Customization (Windows)](https://www.electronjs.org/docs/latest/tutorial/windows-taskbar) — flashFrame; retrieved 2026-11-01
[44] [Electron, Notification](https://www.electronjs.org/docs/latest/api/notification) — silent failures; retrieved 2026-11-01
[45] [GNOME, Notifications](https://developer.gnome.org/hig/patterns/feedback/notifications.html) — withdrawal; retrieved 2026-11-01
[46] [Microsoft, Theming in Windows apps](https://learn.microsoft.com/en-us/windows/apps/develop/ui/theming) — accent override; retrieved 2026-11-01
[47] [Apple, Color](https://developer.apple.com/design/human-interface-guidelines/color) — system accent, one meaning; retrieved 2026-11-01
[48] [GNOME Project, Styles and Appearance - Libadwaita documentation](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/styles-and-appearance.html) — accent; retrieved 2026-11-01
[49] [Electron, systemPreferences](https://www.electronjs.org/docs/latest/api/system-preferences) — accent tags; retrieved 2026-11-01
[50] [Rotaris record, PD-SHELL-003](../../product/directives/pd-shell-003.md) — the frame, its Windows run; retrieved 2026-11-02
[51] [Rotaris record, design README §7](../../design/README/07-7-fidelity-consult-before-maintain-after.md) — §7.1, §7.2; retrieved 2026-11-02
[52] [Rotaris record, twelve critic findings repaired](../../architecture/codebase/17-all-twelve-critic-findings-repaired-and.md) — UIR-001..012; retrieved 2026-11-02
[53] [Rotaris record, build-ui skill](../../../.agents/skills/build-ui/SKILL.md) — step 8; retrieved 2026-11-02
[54] [Rotaris record, shell.css](../../../packages/ui/src/shell.css) — title bar, scrollers; retrieved 2026-11-02
[55] [Rotaris record, main-windows.ts](../../../apps/desktop/src/main/main-windows.ts) — frame, menu; retrieved 2026-11-02
[56] [Rotaris record, main index.ts](../../../apps/desktop/src/main/index.ts) — theme, capture scale; retrieved 2026-11-02
