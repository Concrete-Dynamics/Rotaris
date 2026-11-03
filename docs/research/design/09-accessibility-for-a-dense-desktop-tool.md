# 09. Accessibility for a dense desktop tool

WCAG 2.2 AA on the desktop, mapped onto REQ-SHELL-144..168: contrast, focus, keyboard reach, names, live regions for streaming, reduced motion and scaling.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 09 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

What does a keyboard, screen-reader or low-vision operator need from a window that streams for hours, runs several agents and packs data into 24 px rows? This guide reads WCAG 2.2 AA, as applied to software, against the shell's accessibility contract (`REQ-SHELL-144` – `REQ-SHELL-153`, `REQ-SHELL-160`) and the surface requirements that fix a name or a key. It decides no screen, tab, order, label or shortcut and restates no §1 rule; where research meets adopted text, section 8 asks. A toast, which this product calls an acknowledgement, is named by field name only here.

## 2. Principles

1. **2.2 AA, read for a whole program.** 2.2 adds Focus Not Obscured, Dragging Movements, Target Size and Accessible Authentication at AA [1]. For software the program is the unit, Resize Text means 200 % or the platform's limit, Reflow a 1280-at-400 % equivalent with tables and toolbars excepted [40]; enlarged text may scroll two ways without failing Reflow [10].
2. **Contrast is a floor, measured where it paints.** 4.5:1 is body-text practice adjusted for 20/40 acuity, the same whichever colour is the text, and never rounded: 4.499:1 fails [36]. Thin lines and light weights paint fainter than they compute; a boundary owes 3:1 only where it identifies the control, a textless status icon always [4]. Low-contrast text is on 83.9 % of a million home pages [31].
3. **Colour never alone.** A non-colour cue is required, and two particular hues need one whatever their contrast [42]; a Windows contrast theme maps every role to a system colour pair, grey text for disabled only [7].
4. **Focus is visible, unobscured and not selection.** The ring reaches 3:1 against whatever is adjacent where it sits [4]; at AAA a 2 px outset outline passes the area test and a 2 px inset one needs about 3 px [3]; sticky bars and panels must not hide it entirely [2]; selection looks different from focus [12]. Forced colours drop `box-shadow` and recolour outlines [6], and transitory surfaces then take a 2 px border [7].
5. **One tab stop per composite; the role promises the keys.** Roving tabindex, or `aria-activedescendant` with the author drawing and scrolling the current item; pointer and keys share it; selection follows focus only where that is cheap [12]. "No ARIA is better than Bad ARIA" [35]: ARIA pages average 59.1 errors against 42, a correlation only [31], and misbehaving widgets rank just after CAPTCHA among readers' worst barriers [33].
6. **Focus has a successor.** Never the body after a close or a removal [12]; a modal returns focus to its opener or the next logical place and may open on the least destructive choice [13]; a discoverable command stays focusable as `aria-disabled` [12].
7. **A name states the action.** 77.38 % of 10,408 apps had an unlabelled image button [30]. An icon button's tooltip repeats its name on hover and focus and closes on Escape [17]; such content is dismissible, hoverable and persistent [18]. A shortcut shows in several channels, and announcing it implements nothing [11]; chords a platform or reader owns are avoided [12].
8. **Announce the event, not the stream.** A status message reports without moving focus, as a whole phrase: `log` for sequence, `status` for state, `alert` only if urgent [21]. Assertive may clear queued speech; `aria-busy` holds a region's changes for one update [47]. Live regions drop and vary by reader [26], work best present and empty from the start [19], and read controls as text [20]. One editor cues a pending answer by sound and speaks it once, politely [46]; a terminal library speaks output assertively and stops at 20 lines [45]; NVDA's own terminal diffing changes the result again [48].
9. **Structure is what makes text accessible.** Screen-reader developers met unstructured CLI output with heavy effort while still succeeding, memorised text columns, repeated work after silent completion, heard spinners as punctuation and copied long output out to reread it [28]; one editor offers a reading copy of transient output [23]. AI assistants overloaded visually impaired developers, who asked for "AI timeouts", lost where answers began and accepted output by accident [44]. The families are discover, glance, navigate, be alerted [29].
10. **A drawing has a name, a description and its data.** A short and a long alternative, the data as a table where practical [49]; drawn relationships determinable [50]; no table is a critical failure, and inert marks take no tab stop [51]; unnamed SVG shapes are silent [52]; a bounded value is a `meter` with value text [53].
11. **A field shows its label and its errors honestly.** A visible label even where `aria-label` passes 4.1.2 [55]; a `radiogroup` named by its question [54]; help by `aria-describedby`, never placeholder [56]; `aria-invalid` only after validation fails [57]; pre-selection makes people miss the question [58].
12. **Motion and size have floors.** Opacity is not motion under 2.3.3, and self-starting animation falls to 2.2.2 [41], which also wants auto-updating content stoppable [22]; reduce-motion calms repetition [9]. A target is 24 × 24 CSS px or clear of a 24 px circle [8]; macOS minimums are 20 pt controls and 10 pt text [9].
13. **Machine first, then hand.** Automation reaches 57 % of issues by volume, mostly contrast, while focus order and visibility stay manual [32]; a clean scan proves nothing [31]; Chromium builds its accessibility tree only on demand [43]. By hand: keyboard only, reader on, display off, contrast and large text [27]; JAWS 40.5 % and NVDA 37.7 % lead on desktop [33]; record effort, not only success [28]. 71.2 % of low-vision high-contrast users prefer light on dark [39].

## 3. Patterns and anti-patterns

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| One persistent region per surface [19][21] | transcript, strip, acknowledgements | absent: a region per row, or none | mounted with the window; `REQ-NOTIFY-019` names |
| Token-by-token speech (anti) [26][34] | a streaming row | the reader talks over itself | busy while streaming, one update at the end (G7); D09-9 |
| Counter as phrase [21] | queue, token totals | "3" spoken alone | `REQ-TOOLS-063`'s sentence; `612,480 tok` (§1.11) |
| Control only in a region (anti) [20][25] | a notice action | heard as text | focusable action (G1, `REQ-NOTIFY-040`); D09-5 |
| Roving composite [12] | `NavRail`, `Tabs`, G3 | absent: a focused box naming no item | `REQ-SHELL-152`, `REQ-SHELL-153`, `REQ-MONITOR-304` |
| Role without keys (anti) [35] | any composite role | arrows do nothing | built once in `design-system/`, APG model [14][15][16] |
| Focus successor [12][13] | close, removal, disable | `activeElement` is `body` | opener or next request (G2); `REQ-NOTIFY-008` |
| Obscured focus (anti) [2] | compact layout | ring under a drawer, the update banner or a notice | `--rt-title-bar-height` scroll padding; `REQ-SHELL-055` |
| Clipped ring (anti) [3][4] | `overflow: hidden` rows | ring cut on one side | `--rt-focus` inside the box (`REQ-SHELL-148`) |
| Shadow-only float (anti) [6][7] | forced colours | a dialog edge vanishes | the `--rt-border` hairline (§1.7); D09-11 |
| Hue-only state (anti) [42] | `StatusDot`, personas | dots differ only in hue | dot plus word (§1.3, `REQ-SHELL-149`) |
| Glyph progress (anti) [28] | tool output | braille dots read aloud | `Spinner` "Working" (`REQ-SHELL-137`) |
| Text table (anti) [28] | tabular output | mono columns, no header cells | `Table`, `TableCard` |
| Rows virtualised away (anti) [24] | transcript, diff | find misses off-screen rows | a text path behind G7, G6 |
| Unnamed drawing (anti) [49][52] | `Sparkline`, G16 | a bare `svg` | `meter` [53]; `REQ-TRACE-328` |
| Placeholder as label (anti) [55][56] | Settings, sign-in | grey hint only | `--rt-label-column` label |
| Pre-selected answer (anti) [58] | question stepper | a radio checked on open | none checked; `radiogroup` [54] |
| Drag-only move (anti) [1] | board, dividers | no key path | `REQ-TRACE-390`; `REQ-SHELL-068` |
| Small target (anti) [8] | row commands, chips | 16 px touching a neighbour | `--rt-control-height-compact` |
| Contested chord (anti) [12] | a new binding | Insert, Ctrl+Option | `REQ-SHELL-165`, `REQ-SHELL-048` |
| Shortcut in every channel [11][17] | icon `Button`s | chord only in a hover `Kbd` | `Kbd` read whole (`REQ-SHELL-057`) |
| Results heading [24] | a filter's count | count only in a region | focus to the heading that says it |

## 4. Method

1. **Collect obligations**: the contract rows, the surface's fixed strings (`REQ-CHAT-178`, `REQ-SHELL-039`, `REQ-NOTIFY-019`, `REQ-NOTIFY-041`), `REQ-NOTIFY-008` per disabled control, `REQ-NOTIFY-258` per state. The specification's wording wins (§1.11).
2. **Inventory roles**: per control and drawing its role, name, description, keys; per composite one tab stop and its current-item technique [12][35].
3. **Walk focus**: entry, order, successors [12][13]; at 1000×680 and below 1180 and 1080 px, whether a drawer, the update banner, a notice or the strip covers it [2]; the ring's neighbours and clipping [3][4].
4. **Measure from pixels** in all three themes: text, the ring on selection tints and the filled control, thin strokes, no rounding [4][36]; once under a Windows contrast theme [6][7].
5. **Check every cue**: a meaningful colour has its word or shape [42].
6. **Classify every change** as log, status, alert or silent; name its one persistent region; write it as a phrase; keep controls out of regions [19][20][21][47].
7. **Describe every drawing** and every set of fields: name, description, data, value text [49][53]; labels, groups, error timing [55][57].
8. **Targets and motion**: the 24 px circle [8]; the pulse under `REQ-SHELL-135` [41].
9. **Machine, then hand**: accessibility forced on at launch [43]; `pnpm ui-audit`, `pnpm theme-proof`; keyboard only, then NVDA or JAWS, VoiceOver and Orca, with times [27][28][48].
10. **Raise what meets adopted text** as a section 8 question; change no structure.

## 5. Worked example

**Surface:** §7's row *Agent list, context rings, inspector* — mockup `WORKSPACE` → `agents panel`, `inspector`; nearest built code `packages/ui/src/AgentTree.tsx`, `packages/ui/src/ContextRing.tsx`. Structure `REQ-MONITOR-036` – `REQ-MONITOR-043`, keys `REQ-MONITOR-304`, inspector `REQ-MONITOR-052`; gap G3.

1. *Obligations.* `REQ-MONITOR-304` fixes the keys and makes a key move equal a click; `REQ-MONITOR-041` puts the full task in the tooltip; `REQ-SHELL-149` wants state as a word; `REQ-MONITOR-038` has one component serve the sidebar, Overview and Mission, so a repair reaches all three.
2. *Roles.* The tree is `role="tree"` named "Agents", one tab stop; rows are `treeitem` with `aria-level`, `aria-selected`, and `aria-expanded` only on parents, as the pattern asks [14]. Prefix and dot are `aria-hidden`, so a row reads persona, task, `running · 12s`: the state in words [42].
3. *Focus.* Focus stays on the tree's box and no `aria-activedescendant` names a row, so a reader may hear the tree and not the current agent, and the ring circles the panel while a tint marks the row [12]. A reader pass confirms it before anything is filed; the answer is one technique of step 2, chosen in the component. With "agent pop-out" on, a key move equal to a click could open a window per arrow (D09-8). There is no type-ahead, which the pattern recommends past seven roots [14].
4. *Contrast.* Each dot clears 3:1 on `--rt-chrome` and on a selected row's `--rt-accent-tint-*`, from pixels, in all three themes; the ring is measured against that tint, since the done state and the ring are both violet [4].
5. *Announcements.* A row turning `waiting` changes text nobody hears. The sighted glance at the tree is the alerting family [29]; the strip's polite status region is the candidate speaker, with a whole phrase [21]; which region speaks is D09-9.
6. *Drawings.* `ContextRing` is a `meter` 0–100 whose value text gives percent, limit and compression threshold, its `svg` hidden: the pattern [53]. The value text omits the unit the voice writes, `tok` (§1.11).
7. *Tooltip.* The full task sits in a native `title`, exempt from 1.4.13 [18] but never shown on focus, so the keyboard operator reads the elided task through the name only.
8. *Motion.* The pulse is the 1.6 s opacity breathe, outside 2.3.3 [41], started through `markMotionStart` so `REQ-SHELL-135` is read at each start; with motion off the word still says `running`.

## 6. Checks

Rubric ids mark rows `.agents/skills/review-ui/references/critique-rubric.md` carries; **New** is a proposal.

- **F3** — interactive elements with an empty accessible name: 0 (`REQ-SHELL-144`) [30][31].
- **F3** — composites exposing no current item by roving `tabindex` or `aria-activedescendant`: 0 [12].
- **F3** — after a dialog closes, a focused row goes or a focused button disables, `document.activeElement` is never `body` [12][13].
- **F3** — the 2 px ring on self-painted navigation and dividers lies inside the control, uncut by an ancestor's overflow (`REQ-SHELL-148`) [3].
- **New: obscured** — at 1000×680 and below each compact threshold, no focused rectangle is wholly under a drawer, the update banner, a notice or the strip [2].
- **New: ring neighbours** — `--rt-focus` at 3:1 against `--rt-bg`, `--rt-surface`, each `--rt-accent-tint-*` and the primary fill, in all three themes [4].
- **New: focus and selection** — a selected, focused row shows tint and ring at once, told apart in grey-scale [12].
- **C6** — colour-only states: 0; each has its word or glyph in the row (`REQ-SHELL-149`) [42].
- **New: thin strokes** — hairlines, the ring's tick and 300-weight numerals measured from pixels, unrounded [4][36].
- **New: forced colours** — focus is an outline, and every `Dialog`, `CommandPalette` and drawer keeps an edge [6][7].
- **New: regions** — live regions at first paint equal those after a stream; created on demand: 0; interactive descendants not also in the Tab order: 0 [19][20].
- **New: politeness** — assertive or `alert` only on the approval dialog, the question stepper and error notices [21][47].
- **New: phrase** — each counter's spoken text carries its noun and unit [21].
- **F2** — every `Spinner` named; glyph progress in tool output hidden or given text [28].
- **New: drawings** — every data `svg` named or hidden; every `meter` with value text and unit [52][53].
- **New: target** — every control in `geometry.json` 24 × 24 CSS px or clear of a 24 px circle [8].
- **D3** — at most one filled control per dense view (§1.7).
- **C9** — with reduced motion in force, `document.getAnimations()` is empty (`REQ-SHELL-135`) [41].
- **New: labels and answers** — no placeholder-only field [55][56]; the question stepper opens with nothing checked [58].
- **New: hand pass** — a recorded keyboard walk and one reader per platform, with times, beside every machine pass [27][28][32].

## 7. How this applies here

**Requirements:** `REQ-SHELL-022`, `-029`, `-030`, `-039`, `-047` – `-049`, `-055`, `-057`, `-068`, `-073`, `-128` – `-130`, `-135`, `-137`, `-144` – `-153`, `-160`, `-164`, `-165`; `REQ-NOTIFY-003`, `-008`, `-011`, `-015`, `-019`, `-040`, `-041`, `-258`; `REQ-CHAT-178`; `REQ-TOOLS-063`; `REQ-MONITOR-036` – `-043`, `-052`, `-304`; `REQ-TRACE-328`, `-390`. **Directives:** `PD-WORKSPACE-001` (an acknowledgement's action), `PD-CHAT-004` (a line updating in place). **Tokens:** `--rt-focus`, `--rt-focus-ring-width`, `--rt-control-height-compact`, `--rt-rail-label-size`, `--rt-text-tertiary`, `--rt-accent-tint-07` / `-10` / `-14`, `--rt-border`, `--rt-chrome`, `--rt-title-bar-height`, `--rt-label-column`. **Components:** `Button`, `Kbd`, `Tooltip`, `Tabs`, `NavRail`, `CommandPalette`, `Dialog`, `Acknowledgement`, `StatusDot`, `Spinner`, `ContextRing`, `Sparkline`, `Table`, `TableCard`, `Input`; gaps G1 – G3, G5 – G7, G14 – G16 (§4.2). **Code:** `AgentTree.tsx`, `ContextRing.tsx` in `packages/ui/src/`.

**Readers.**

| Derivative | Reads |
|---|---|
| `design-ui` brief §7 (accessibility obligations) | §2, §4 steps 1–8, §6 |
| `design-ui` brief §10 | §8 |
| rubric F3 | §2, §6 |

A **New** check binds only once a rubric version adopts it.

**Already in the record.** Tab strips select on arrow over panes already built (`REQ-SHELL-152`), where automatic activation fits [16]; vertical lists move focus without selecting (`REQ-SHELL-153`) [12]; dividers take keys (`REQ-SHELL-068`); a board move has a key path (`REQ-TRACE-390`); the graph lists its edges as text (`REQ-TRACE-328`); a native dialog's accessibility is the host's (`REQ-SHELL-164`); the approval dialog opens on Deny with no default (`REQ-TOOLS-063`), as [13] advises.

**Paid for already.** "The tokens hold but composition breaks" (`docs/design/README/07-7-fidelity-consult-before-maintain-after.md` §7.1): a ring is measured against what it lands on, not its token pair. UIR-001..012 (`docs/architecture/codebase/17-all-twelve-critic-findings-repaired-and.md`) cut interactive heights from eleven to three, 24, 32 and 80, which is what lets the target check hold; UIR-011 showed `REQ-TRACE-390`'s accessible description must equal the visible text. "Bound the box, not only the child" (`.agents/skills/build-ui/SKILL.md` step 8) covers a ring forced inward by a shrunk container. A critic once filed an adopted token as an invention (`.agents/skills/review-ui/SKILL.md` step 6): read `packages/contracts/src/theme/themes.ts` before filing a contrast token.

## 8. Where this disagrees with the adopted material

- **D09-1 —** One colour cannot contrast on every surface; a two-colour ring keeps one band visible [5]. Meets §1.7, a 2 px `--rt-focus` ring as the only focus treatment, beside violet tints and the accent fill. *Is one colour enough where the ring meets accent ink, and would a second band be the same treatment or a second one?* — none filed; already-ruled: REQ-SHELL-145, REQ-SHELL-160 (c)
- **D09-2 —** A 2 px inset indicator fails 2.4.13's area test [3]. Meets `REQ-SHELL-148` and `REQ-SHELL-160` (c), the ring wholly inside the control at the theme's width, and §1.8 note 3. *Are inset rings held to 2.4.13 (AAA), and at what width?* — [OQ-493](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-493)
- **D09-3 —** The WCAG 2 ratio overstates contrast for dark colours; the alternative is unvalidated and not adopted [37]. Meets `REQ-SHELL-144`, `REQ-SHELL-145`, `REQ-SHELL-129`: 4.5:1 and 3:1 as the floors. *Should `pnpm theme-proof` report a perceptual reading for `--rt-text-tertiary` and 300-weight numerals, as information only?* — none filed; not-a-question
- **D09-4 —** Normal vision reads small text better dark on light [38]; low-vision high-contrast users mostly prefer the reverse [39]. Meets §1.1's dark ground and `REQ-SHELL-128`'s three themes, all `dark: true` in `themes.ts`. *Should the record state why no light theme is offered?* — none filed; request
- **D09-5 —** Messages that vanish in seconds fail Timing Adjustable [25]. Meets `REQ-NOTIFY-011`'s lifetime and `REQ-NOTIFY-015`'s no focus, for an acknowledgement carrying an action (`PD-WORKSPACE-001`); `REQ-NOTIFY-003` republishes failures as notices. *Can a keyboard operator reach that action within that lifetime, and should the lifetime hold while pointer or focus is on it?* — [OQ-498](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-498)
- **D09-6 —** A state change on an interactive drawing should differ 3:1 from its prior state or add a cue [51]; hover need not [4]. Meets §1.2, selection as tint plus accent ink. *On the board and the graph (G15, G16), is a selected node told apart without colour?* — none filed; already-ruled: REQ-SHELL-149
- **D09-7 —** macOS sets 10 pt as the minimum text [9]. Meets `REQ-SHELL-029`, rail labels at 9 px (`--rt-rail-label-size`). *Does a 9 px label meet the platform floor on macOS?* — [OQ-504](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-504)
- **D09-8 —** Selection should not follow focus where it starts slow work [12]. Meets `REQ-MONITOR-304`, a key move having the effect of a click, with `REQ-SHELL-073` opening a persona window on click when "agent pop-out" is on; `REQ-SHELL-153` keeps the two apart for vertical lists. *Should an arrow key through the delegation tree ever open a persona window?* — [OQ-512](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-512)
- **D09-9 —** Streams are announced on arrival and completion, assertive kept for the imperative [46][47]; developers want to control how often an assistant speaks [44]; Pause, Stop, Hide may reach output the operator did not start [22]. Meets `REQ-SHELL-144`, whose reader clause is a non-empty name, and `REQ-CHAT-178`; nothing says which surface speaks, how loudly or how often. *Which surfaces own a live region at what politeness, and is announcement frequency the operator's choice?* — [OQ-507](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-507)
- **D09-10 —** A terminal library speaks output assertively, capped at 20 lines [45]; assertive may clear queued speech [47]. Meets `REQ-SHELL-146`, which asks named controls, contrast and an announced empty state of the terminal window and nothing of running output. *How is running output spoken, and is it capped?* — [OQ-507](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-507)
- **D09-11 —** Under forced colours shadows vanish and transitory surfaces want a 2 px border [6][7]. Meets §1.7, a shadow only meaning that a surface floats, and 1 px hairlines; `REQ-SHELL-128` offers the product's own `high-contrast`. *What marks a `Dialog` or drawer as floating under a Windows contrast theme, and is that theme supported?* — [OQ-494](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-494)
- **D09-12 —** Software owes text enlargement to 200 % or the platform limit [40]. Meets `REQ-SHELL-160` (d) and `REQ-SHELL-030`, icons measured under OS display scaling in logical pixels, and `REQ-SHELL-022`'s guarantees at 1000×680. *Is text enlargement owed, and must `REQ-SHELL-022` then hold at an effective 500 × 340?* — [OQ-495](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-495)
- **D09-13 —** Multi-pane windows should cycle named regions on F6 and Shift+F6 [11]. Meets `REQ-SHELL-049`, the authoritative shortcut table, which has no such binding. *Does keyboard parity want a way between the window's regions, and through which command?* — [OQ-505](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-505)

## 9. References and further reading

- [1] [W3C WAI, What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) — the new AA criteria; retrieved 2026-11-01
- [2] [W3C WAI, Understanding SC 2.4.11: Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) — overlays; retrieved 2026-11-01
- [3] [W3C WAI, Understanding SC 2.4.13: Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) — area, inset; retrieved 2026-11-01
- [4] [W3C WAI, Understanding SC 1.4.11: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) — adjacency, icons, thin lines; retrieved 2026-11-01
- [5] [Sara Soueidan, A guide to designing accessible, WCAG-conformant focus indicators](https://www.sarasoueidan.com/blog/focus-indicators/) — two colours; retrieved 2026-11-01
- [6] [MDN Web Docs, forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors) — forced properties; retrieved 2026-11-01
- [7] [Microsoft Learn, Contrast themes](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/high-contrast-themes) — system colours, borders; retrieved 2026-11-01
- [8] [W3C WAI, Understanding SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — 24 px circle; retrieved 2026-11-01
- [9] [Apple, Accessibility, Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/accessibility) — macOS sizes, motion; retrieved 2026-11-01
- [10] [W3C WAI, Understanding SC 1.4.10: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) — Reflow and Resize Text; retrieved 2026-11-01
- [11] [Microsoft Learn, Keyboard accessibility](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/keyboard-accessibility) — F6, shortcut channels; retrieved 2026-11-01
- [12] [W3C WAI-ARIA APG, Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) — composites, focus, chords; retrieved 2026-11-01
- [13] [W3C WAI-ARIA APG, Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) — return, initial focus; retrieved 2026-11-01
- [14] [W3C WAI-ARIA APG, Tree View Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) — keys, states; retrieved 2026-11-01
- [15] [W3C WAI-ARIA APG, Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) — interactive cells only; retrieved 2026-11-01
- [16] [W3C WAI-ARIA APG, Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) — activation by latency; retrieved 2026-11-01
- [17] [GitHub Primer, IconButton accessibility](https://primer.style/product/components/icon-button/accessibility/) — names, tooltips; retrieved 2026-11-01
- [18] [W3C WAI, Understanding SC 1.4.13: Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) — three conditions; retrieved 2026-11-01
- [19] [Scott O'Hara, Are we live?](https://www.scottohara.me/blog/2022/02/05/are-we-live.html) — persistent regions; retrieved 2026-11-01
- [20] [MDN Web Docs, ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions) — plain text; retrieved 2026-11-01
- [21] [W3C WAI, Understanding SC 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — roles, phrases; retrieved 2026-11-01
- [22] [W3C WAI, Understanding SC 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) — auto-updating content; retrieved 2026-11-01
- [23] [Microsoft, Visual Studio Code, Accessibility](https://code.visualstudio.com/docs/configure/accessibility/accessibility) — Accessible View; retrieved 2026-11-01
- [24] [GitHub Blog, Accessibility considerations behind code search and code view](https://github.blog/engineering/user-experience/accessibility-considerations-behind-code-search-and-code-view/) — virtualisation, headings; retrieved 2026-11-01
- [25] [Adrian Roselli, Defining 'Toast' Messages](https://adrianroselli.com/2020/01/defining-toast-messages.html) — timed messages; retrieved 2026-11-01
- [26] [Microsoft Edge, ariaNotify explainer](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/Accessibility/AriaNotify/explainer.md) — region failures, fallback; retrieved 2026-11-01
- [27] [GNOME, Accessibility, Human Interface Guidelines](https://developer.gnome.org/hig/guidelines/accessibility.html) — manual checklist; retrieved 2026-11-01
- [28] [Sampath, Merrick, Macvean, Accessibility of Command Line Interfaces (CHI 2021)](https://storage.googleapis.com/gweb-research2023-media/pubtools/6065.pdf) — structure, status, effort; retrieved 2026-11-01
- [29] [Potluri et al., CodeTalk (CHI 2018)](https://www.microsoft.com/en-us/research/publication/codetalk-improving-programming-environment-accessibility-for-visually-impaired-developers/) — four families; retrieved 2026-11-01
- [30] [Chen et al., Unblind Your Apps (ICSE 2020)](https://arxiv.org/abs/2003.00380) — missing labels; retrieved 2026-11-01
- [31] [WebAIM, The WebAIM Million 2026](https://webaim.org/projects/million/) — failure rates, ARIA; retrieved 2026-11-01
- [32] [Deque Systems, Automated Accessibility Testing Coverage](https://www.deque.com/automated-accessibility-testing-coverage/) — coverage by volume; retrieved 2026-11-01
- [33] [WebAIM, Screen Reader User Survey #10 Results](https://webaim.org/projects/screenreadersurvey10/) — readers, barriers; retrieved 2026-11-01
- [34] [W3C WAI-ARIA APG, Feed Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/feed/) — busy while updating; retrieved 2026-11-01
- [35] [W3C WAI-ARIA APG, Read Me First](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/) — roles as promises; retrieved 2026-11-01
- [36] [W3C WAI, Understanding SC 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) — derivation, rounding; retrieved 2026-11-01
- [37] [Andrew Somers, Myndex, Why APCA](https://git.apcacontrast.com/documentation/WhyAPCA) — dark colours; retrieved 2026-11-01
- [38] [Raluca Budiu, Nielsen Norman Group, Dark Mode vs. Light Mode](https://www.nngroup.com/articles/dark-mode/) — polarity; retrieved 2026-11-01
- [39] [WebAIM, Survey of Users with Low Vision #2 Results](https://webaim.org/projects/lowvisionsurvey2/) — preference, zoom; retrieved 2026-11-01
- [40] [W3C AG WG, WCAG2ICT for WCAG 2.2](https://www.w3.org/TR/wcag2ict-22/) — software readings; retrieved 2026-11-01
- [41] [W3C WAI, Understanding SC 2.3.3: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) — opacity, auto-start; retrieved 2026-11-01
- [42] [W3C WAI, Understanding SC 1.4.1: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) — non-colour cue; retrieved 2026-11-01
- [43] [Electron, Accessibility](https://www.electronjs.org/docs/latest/tutorial/accessibility) — tree on demand; retrieved 2026-11-01
- [44] [Flores-Saviaga et al., The Impact of Generative AI Coding Assistants on Developers Who Are Visually Impaired (CHI 2025)](https://arxiv.org/html/2503.16491) — overload, focus; retrieved 2026-11-01
- [45] [xterm.js, AccessibilityManager.ts](https://github.com/xtermjs/xterm.js/blob/master/src/browser/AccessibilityManager.ts) — output speech, cap; retrieved 2026-11-01
- [46] [Microsoft, VS Code, chatAccessibilityService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/accessibility/chatAccessibilityService.ts) — pending cues; retrieved 2026-11-01
- [47] [W3C, WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/) — busy, politeness; retrieved 2026-11-01
- [48] [NV Access, NVDA 2026.3 User Guide](https://download.nvaccess.org/documentation/userGuide.html) — terminal diffing; retrieved 2026-11-01
- [49] [W3C WAI, Understanding SC 1.1.1: Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html) — chart alternatives; retrieved 2026-11-01
- [50] [W3C WAI, Understanding SC 1.3.1: Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html) — relationships; retrieved 2026-11-01
- [51] [Frank Elavsky, Chartability workbook](https://chartability.github.io/POUR-CAF/) — tables, tab stops, state contrast; retrieved 2026-11-01
- [52] [W3C, SVG Accessibility API Mappings](https://www.w3.org/TR/svg-aam-1.0/) — unnamed shapes; retrieved 2026-11-01
- [53] [W3C WAI-ARIA APG, Meter Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/meter/) — meter, value text; retrieved 2026-11-01
- [54] [W3C WAI-ARIA APG, Radio Group Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) — group names; retrieved 2026-11-01
- [55] [W3C WAI, Understanding SC 3.3.2: Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html) — visible labels; retrieved 2026-11-01
- [56] [W3C WAI, Form Instructions](https://www.w3.org/WAI/tutorials/forms/instructions/) — described-by, placeholder; retrieved 2026-11-01
- [57] [W3C WCAG 2.2 Techniques, ARIA21](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21) — invalid timing; retrieved 2026-11-01
- [58] [Government Digital Service, GOV.UK Design System, Radios](https://design-system.service.gov.uk/components/radios/) — no pre-selection; retrieved 2026-11-01
