# 07. Visual composition beyond tokens

Hierarchy, rhythm, optical alignment, grouping, density, earned surfaces, measure, alignment axes, colour as signal, icon and motion restraint: the craft tokens alone do not give.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 07 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

The question: once every value on a surface is an adopted `--rt-*` token, what still decides whether it reads well, and how is that checked? The record's answer is that "the tokens hold but composition breaks" ([§7.1](../../design/README/07-7-fidelity-consult-before-maintain-after.md)): every transcript row had become a box while no literal colour existed. This guide turns the literature on grouping, space, alignment, hierarchy, measure, colour, icons and motion into a method (§4) and checks (§6) that `build-ui` builds against and rubric rows C1–C9, D2 and O2 score.

It decides no primary view, content or label (`REQ-SHELL-023`; design README §2), mints no token and restates no §1 rule; arguments with a rule are in section 8 only. Giving way at the minimum size is guide 14's; states and timing are guide 13's.

## 2. Principles

**Grouping is spent in order of strength.** Proximity alone makes items read as related or separate, overriding colour or shape similarity [1]. A border or background is stronger still, which is why boundaries are added out of caution and become clutter; whitespace comes first, and a full-width band can read as the end of the content [2]. Cards suit heterogeneous items that each lead elsewhere; homogeneous items people scan or compare suit a vertical list [3].

**Space states relation and importance.** Tight gaps bind, larger gaps separate, repeated gaps make peers, more surrounding space reads as more important, and layout, not the component, owns the gaps between components [4]. Small steps serve compact parts, middle steps items of larger components, the largest only between a view's regions; optical correction is allowed where token spacing looks wrong [5]. A desktop platform keys a short vocabulary of gaps to relationships — sibling buttons, control to header, control to label, edge to text [6].

**Alignment is the other half of coherence.** Horizontal and vertical keylines matter equally, and type sits against a box's inner padding so text edges form the line [7]. Aligned items read as related, indented ones as subordinate [8]. Asymmetric glyphs centred geometrically look off-centre [9]; an icon beside text is centred on the line in the text's colour, and an icon control shows state on its background [10]; icons keep one size and weight per context [9].

**Hierarchy is a budget.** One high-attention element or group per view; a highlighted navigation item competes with the primary action [12]. If everything is contrasted nothing stands out, and a blurred screenshot shows what dominates, often a saturated colour [11]. Orientation surfaces recede behind task surfaces [13]. Few type sizes and weights read better than many [14][11].

**Text has a measure.** Running text reads best at about 45–90 characters per line, counted in characters [16]; the enhanced WCAG criterion asks for at most 80 [17]. Evidence for narrower columns is mixed; headings, ragged-right setting and more surrounding space cut fixations, while bold and italic showed no effect [15]. Figures that align in columns are tabular [18].

**Complexity is measurable.** Perceived visual complexity can be estimated from a screenshot by counting text and non-text regions, and it drives a first impression far more than colourfulness [19].

**Colour is a signal with one meaning.** A colour must not mean two things [20] or carry a fact alone [21]. Hue dominates form, and a target differing by one unique feature is found at a glance [23]. Discrimination falls steeply from three to eight categorical hues, colours sharing a name are confused, and small marks need larger differences [24]. About 8 % of men of European descent have red-green deficiency [25]. On a dark ground depth reads as lighter surfaces rather than shadow [26]; small text pairs should aim toward 7:1 above the 4.5:1 floor [27]. A boundary needs 3:1 where it identifies the control, and anti-aliasing renders thin lines fainter than their colour [22].

**Motion is for status.** Gratuitous motion distracts and is never the only carrier [28]; task motion is subtle, and motion users routinely notice is reduced [29]. Elements moving together read as related, and what an animation says also reaches assistive technology [30]. Motion running over five seconds beside other content needs a way to stop it [31].

## 3. Patterns and anti-patterns

Anti-patterns unless marked *(pattern)*; for a pattern the tell is what its absence looks like.

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Every row a card | transcript, Library lists, commits | box count equals item count | rows on the ground split by `--rt-divider`; earned surfaces (§1.7, §7.2) [2][3][46] |
| *(pattern)* Proximity first | grouping in a view | groups told apart only by boxes | `--rt-space-*` steps, a `spacing-token` relation [1][4] |
| False floor | full-width tinted band mid-scroll | rows below go unread | rule plus glyph, never a fill (§4.2 G1, §7.2 item 3) [2] |
| Cards for comparison | items scanned or compared | few per view, eyes hopping | `Table`, `TableCard`, plain rows [3] |
| Large tier squeezed | dense surfaces | region gaps shrunk to fit | `--rt-space-1`/`-2` inside parts, `--rt-space-4`+ between [5] |
| *(pattern)* One relation, one gap | label to field, button to button | one pair at two gaps | `--rt-label-column`, `--rt-field-min` (UIR-010) [6][47] |
| Box-edge alignment | padded `Card` beside a bare list | text edges differ by padding | `align-x` on text keylines [7] |
| Flat tree | delegation, folded tool group | depth carried by nothing | `--rt-space-4` per level (`PD-CHAT-005`) [8] |
| Geometric icon centring | asymmetric Phosphor glyphs | glyph looks off, `align-y` passes | optical nudge, recorded [9] |
| Competing emphasis | dense view | two loud shapes survive a blur | one filled control (§1.7); tint plus ink (§1.2) [11][12] |
| Loud orientation | rail, title bar, status strip | chrome as bright as content | `--rt-chrome`, `--rt-text-tertiary` [13] |
| Weight ladder | headings in dense rows | 600 or 700 weights | size, colour, space (§1.4) [14] |
| Edge-to-edge prose | wide windows | lines past 90 characters | `--rt-prose-measure`; §7.2 item 4 [16][17] |
| Proportional data figures | counts, costs, durations | digits jitter by row | `--rt-font-mono` (§1.4) [18] |
| One hue, two meanings | state hues as emphasis | amber meaning nothing | §1.3, §1.9; `--rt-viz-*` for identity (§7.3) [20][24] |
| Colour alone | any state | a dot with no word | dot-plus-word (`REQ-SHELL-149`) [21] |
| Shadow for resting depth | cards on dark ground | soft shadow under `Card` | `--rt-surface`, `--rt-surface-2` (§1.7) [26] |
| Motion in content | streaming, expansion | rows slide or fade in | §1.8; `PD-CHAT-006` [28][29] |
| Pulses in phase | several agents running | dots breathe as one | none adopted; counted in §6 [30] |

## 4. Method

Per region, before capture, against the surface's §7 mockup section and built code.

1. **Name what is fixed.** List the requirements and directives fixing the region's geometry and strings; composition decides the rest [46]. Say whether its content is homogeneous [3].
2. **Group with space.** Give each relationship a `--rt-space-*` step, small inside parts, large between regions [4][5]; write repeated pairs as `spacing-token` relations [6].
3. **Earn each enclosure.** For every border, fill or `Card`, say what it separates from what, and drop it if space already does [2]; look for a band that reads as a floor [2].
4. **Publish the axes.** Choose text keylines — `PageHeader` title, `SectionLabel`, first `Table` column, row text — and publish `align-x`/`align-y` on them [7]; indent on a token step [8].
5. **Spend attention.** Count primaries per region and filled controls per view [12]; blur the PNG at 5, 10 and 20 px and name what survives [11]; check chrome sits below content [13].
6. **Set the measure.** Bound prose in characters, letting code, diffs and tables opt out [16][17]; set figures in mono [18].
7. **Name each colour.** Give every coloured element its state or identity, a word beside it, and no second meaning [20][21]; test small marks at drawn size and under simulated deficiency [24][25].
8. **Check icons optically** — one size and weight per context, centred on the line, state on the background [9][10].
9. **List the motion** — every animation, why it moves, how many run at once, what reaches assistive technology [28][29][30].
10. **Read the source before calling a value an invention**; deterministic sweeps keep their severity [48].

## 5. Worked example

**Surface:** "Transcript rows, run header" (§7); nearest built code `packages/ui/src/transcript/Row.tsx`, `packages/ui/src/TranscriptSurface.tsx`, styled in `packages/ui/src/shell.css`; primary view Workspace.

1. **Fixed.** `REQ-CHAT-046` gives twelve row categories; `REQ-CHAT-057` the 52 px and 112 px columns, the 30 px minimum height and 10 by 5 px margins; `REQ-CHAT-060`–`062` the one-liners; `REQ-CHAT-175` the description; `PD-CHAT-005` persona colour and indent. A homogeneous sequence: rows, not cards.
2. **Space.** `REQ-CHAT-057` already sets consecutive rows closer than a row to the edge. The block start (`.row--block-start`, `--rt-space-3`) against the continuation margin is the cue that separates speakers; publish it.
3. **Enclosures.** Since §7.2 the earned surfaces are the user prompt (`--rt-accent-tint-07`, accent border), the approval prompt and edit diff (panel, 2 px rail) and the expanded tool card (`--rt-surface`, 620 px cap); the rest sits on `--rt-bg`. Check that this is the whole list, and that an approval panel does not read as the transcript's end.
4. **Axes.** The keyline is the third grid column's start; inside a tool card it is the padding edge. Delegated rows indent `--rt-space-4` per level, capped at two (§7.3).
5. **Attention.** A blurred capture of a long run should keep the user's tinted rows and any approval panel, nothing else; the role line is an uppercase `--rt-text-2xs` label in the accent shade, ranked by size and colour.
6. **Measure.** Prose is capped at 78 % of the row (§7.2 item 4); at 1400×900 with both panes docked, `.row__body`'s width over the face's advance at `--rt-text-sm` gives characters per line, against 45–90 and 80.
7. **Colour.** Tool one-liners ride axis Y, reasoning and delegation the accent (§7.2 item 5), the persona bar `--rt-viz-*` (§7.3). One C6 question: `.tool__outcome--running` draws in `--rt-accent-300`, the done hue family, where §1.3 gives running `--rt-run`.
8. **Motion.** `PD-CHAT-006` removed the streaming indicator; `◉ running…` and `◉ reasoning…` keep `rt-pulse` at `--rt-duration-slow` per cycle, where §1.8 states 1.6 s for the status dot. Read both from `document.getAnimations()` and count pulses in a delegated run.
9. **Give way.** At 1000×680 the view is compact (`REQ-SHELL-059`); the description ellipsizes (§7.4) and no box is `SHRUNK` [48].

## 6. Checks

Read from the `pnpm ui-review` pack (PNGs, `geometry.json`, `styles.json`) or the DOM; rubric ids mark what the rubric carries, the rest are proposed.

- **C1** — at most one element per region at `--rt-h4` or larger; no computed weight outside 300, 400, 500 [12][14].
- **C1, proposed** — a 10 px blur of each view leaves at most two dominant shapes, neither a state colour [11].
- **C2** — every margin, padding and gap resolves to a `--rt-space-*` value; a repeated relationship has one value across views [4][6].
- **C2, proposed** — an optical correction off the module is listed with its reason [5].
- **C3** — text keylines in a region share an x within 1 px, measured at inner padding [7].
- **C3, proposed** — an icon beside text is centred within 1 px of the line box's centre [10].
- **C4** — a `Table`'s header row follows its body rows' height tier at both sizes [32].
- **C5** — bordered or filled boxes per region are counted and each says what it separates; no full-width tinted band sits above more content in a scroller [2][3].
- **C6** — every coloured element names one meaning from §1.3 or §1.9 and carries a word or glyph; no hue means two things in one view [20][21].
- **C6, proposed** — triad, danger and info stay distinguishable under protan and deutan simulation and at `StatusDot` size [24][25].
- **C7** — the longest prose line per view holds 45–90 characters, at most 80; every figure is in `--rt-font-mono` [16][17][18].
- **C8** — one glyph size per context (`--rt-icon-size` in the rail); an icon control's hover changes its background, not its glyph [9][10].
- **C9** — `document.getAnimations()` lists only status indicators and overlays; concurrent pulses are counted; each has a non-visual equivalent [28][29][30].
- **C9, proposed** — an indicator pulsing past five seconds stops under the in-app reduced-motion setting (`REQ-SHELL-135`) [31].
- **D2** — the PNG beside its §7 mockup section: the same line-or-card choices, the same air.
- **O2** — a transcript row, a settings field and a commit do not share one container template [3].
- **Proposed, complexity** — distinct text and non-text regions per view are counted per iteration and rise only with a stated reason [19].
- **Proposed, contrast** — small mono data text reports its rendered ratio, aiming at 7:1; hairlines are read from pixels, not tokens [27][22].

## 7. How this applies here

**Requirements.** `REQ-SHELL-023`; `REQ-SHELL-036` (the session chip's dot and word), `REQ-SHELL-149` (never colour alone); `REQ-SHELL-059`; `REQ-SHELL-128`, `REQ-SHELL-129` (themes, floors, metrics); `REQ-SHELL-135`; `REQ-SHELL-144`, `REQ-SHELL-145`, `REQ-SHELL-148`; `REQ-CHAT-046`, `REQ-CHAT-057`, `REQ-CHAT-060`, `REQ-CHAT-061`, `REQ-CHAT-062`, `REQ-CHAT-175`; `REQ-MONITOR-036`, `REQ-MONITOR-038`; `REQ-NOTIFY-258`.

**Directives.** `PD-CHAT-004` (the activity line), `PD-CHAT-005` (persona colour, indent), `PD-CHAT-006` (no streaming indicator).

**Tokens.** `--rt-bg`, `--rt-surface`, `--rt-surface-2`, `--rt-chrome`, `--rt-border`, `--rt-border-strong`, `--rt-divider`, `--rt-text-tertiary`, `--rt-accent-300`, `--rt-accent-tint-07`, `--rt-run`, `--rt-done`, `--rt-info-500`, `--rt-viz-1` … `--rt-viz-6`, `--rt-space-1` … `--rt-space-24`, `--rt-prose-measure`, `--rt-label-column`, `--rt-field-min`, `--rt-icon-size`, `--rt-font-mono`, `--rt-text-2xs`, `--rt-text-sm`, `--rt-h4`, `--rt-duration-slow`.

**Components.** `Card`, `TableCard`, `Table`, `PageHeader`, `SectionLabel`, `StatusDot`, `Button`, `ContextRing`, `MeterBar`; §4.2 gaps G1, G3, G7.

**The record's lessons**, as experience: §7.1 and §7.2 [46]; UIR-001..012, each a number before and after [47]; "bound the box, not only the child" and the critic that filed an adopted token as an invention [48].

**Who reads which section.**

| Derivative | Reads |
|---|---|
| `design-ui` brief §8 (composition intent) | §2, §3, §4 steps 1–9 |
| `design-ui` brief §10 | §8 |
| `design-ui` audit step 4, the tells walk | §3 |
| rubric C1, C2, C4, C6, C7, D2, O2 | §2, §6 |
| rubric C3 | §4 step 4, §6 |
| rubric C5 | §4 step 3, §6 |
| rubric C8 | §6 |

No dated notes yet.

## 8. Where this disagrees with the adopted material

**D07-1 —** *Claim:* platform guidance ranks by weight and promotes a confined title by weight at body size [33][34][14]. *Adopted:* §1.4, three weights, hierarchy "never weight". *Question:* are size, colour and space at body size enough for row headers, `Table` group headers and the approval dialog's tool name, and how is that measured? — [OQ-500](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-500)

**D07-2 —** *Claim:* platforms advise one interface font, or as few faces as possible [34][33]. *Adopted:* §1.4, Space Grotesk, Manrope, JetBrains Mono. *Question:* does the display-versus-body split earn its place on dense surfaces? — [OQ-500](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-500)

**D07-3 —** *Claim:* mature systems use a 4 px base and line-heights off the 8 px grid [35]. *Adopted:* §1.5, the 8 px module. *Question:* does the module govern line-heights, or only gaps between boxes? — none filed; not-a-question

**D07-4 —** *Claim:* token spacing may take optical corrections [5]. *Adopted:* §1, "cite the token, never a literal colour or pixel value". *Question:* may a correction off the module exist, and how is it recorded so the audit does not flag it? — [OQ-499](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-499)

**D07-5 —** *Claim:* desktop guidance gives cards, list items and controls a resting shadow plus a 1 px stroke [36]. *Adopted:* §1.7, a shadow only means this floats. *Question:* should the record state why resting surfaces carry none beside native surfaces that do? — none filed; not-a-question

**D07-6 —** *Claim:* fully flat controls weaken clickability cues [37]. *Adopted:* §1.7, no bevels, one filled control, the rest hairline or bare text. *Question:* do secondary `Button`s and icon controls read as controls, and how would that be tested? — [OQ-503](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-503)

**D07-7 —** *Claim:* one hue as accent and as state means two things [20]; same-name colours are confused [24]. *Adopted:* §1.2–1.3, accent hue 292 and Z violet = done. *Question:* can a selected row, a link and a done `StatusDot` be told apart on one surface? — none filed; already-ruled: §1.3 (colour never carries a fact on its own)

**D07-8 —** *Claim:* neighbouring hues sharing a name are confused, more on small marks [24]. *Adopted:* §1.3, teal (165) running, info cyan (210) outside the triad. *Question:* are running and info dots distinguishable at 6 px? — none filed; already-ruled: §1.3, REQ-SHELL-149

**D07-9 —** *Claim:* palette guidance offers a grey tinted toward the accent [39], pairs one by default for dense interfaces [40], and a colour engine's default tints neutrals [41]; others keep pure grey [39][42]. *Adopted:* §1.1, chroma exactly 0. *Question:* is the chroma-0 ground's reason recorded so it can be weighed? — none filed; not-a-question

**D07-10 —** *Claim:* dark text on light reads better for normal vision, the cost grows as text shrinks, and dark is advised as a switch [38]. *Adopted:* §1.1; `REQ-SHELL-128`, three dark themes, `rotaris-dim` default. *Question:* with long sessions of small mono text, is a light theme owed? — none filed; request

**D07-11 —** *Claim:* animated transitions improve tracking of rearranged items, about one second for large moves [43]. *Adopted:* §1.8, status indicators only. *Question:* should board cards changing columns, a graph re-laying out or a re-sorting delegation tree be an exception? — [OQ-496](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-496)

**D07-12 —** *Claim:* position beats angle and area [44]; rings read by arc remain less accurate than bars [45]. *Adopted:* §4, `ContextRing` beside `MeterBar`. *Question:* where several fill-of-capacity values are compared, which component serves them? — none filed; not-a-question

**D07-13 —** *Claim:* measure is counted in characters, 45–90 [16], at most 80 [17]. *Adopted:* §7.2 item 4, prose at 78 % of the row; `--rt-prose-measure` is a pixel length (`themes.ts`). *Question:* should the transcript's measure be stated in characters? — [OQ-535](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-535)

## 9. References and further reading

[1] [Nielsen Norman Group (Aurora Harley), Proximity Principle in Visual Design](https://www.nngroup.com/articles/gestalt-proximity/) — proximity groups; retrieved 2026-11-01
[2] [Nielsen Norman Group (Aurora Harley), The Principle of Common Region: Containers Create Groupings](https://www.nngroup.com/articles/common-region/) — enclosure overused; false floors; retrieved 2026-11-01
[3] [Nielsen Norman Group (Page Laubheimer), Cards: UI-Component Definition](https://www.nngroup.com/articles/cards-component/) — cards against lists; retrieved 2026-11-01
[4] [IBM Carbon Design System, Spacing](https://carbondesignsystem.com/elements/spacing/overview/) — space as relation; layout owns gaps; retrieved 2026-11-01
[5] [Atlassian Design System, Spacing](https://atlassian.design/foundations/spacing) — density tiers; optical adjustment; retrieved 2026-11-01
[6] [Microsoft Learn, Content layout and spacing - Windows apps](https://learn.microsoft.com/en-us/windows/apps/design/basics/content-basics) — gaps by relationship; retrieved 2026-11-01
[7] [IBM Carbon Design System, 2x Grid](https://carbondesignsystem.com/elements/2x-grid/overview/) — both axes; type on padding; retrieved 2026-11-01
[8] [Apple Human Interface Guidelines, Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — indentation as hierarchy; retrieved 2026-11-01
[9] [Apple Human Interface Guidelines, Icons](https://developer.apple.com/design/human-interface-guidelines/icons) — optical centring; consistency; retrieved 2026-11-01
[10] [IBM Carbon Design System, Icons: Usage](https://carbondesignsystem.com/elements/icons/usage/) — colour, centring, state; retrieved 2026-11-01
[11] [Nielsen Norman Group (Kelley Gordon), Visual Hierarchy in UX: Definition](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) — the blur test; retrieved 2026-11-01
[12] [Adobe Spectrum 2, Attention hierarchy](https://spectrum.adobe.com/foundations/attention-hierarchy) — one high-attention element; retrieved 2026-11-01
[13] [Linear (Charlie Aufmann, Maxime Heckel), Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh) — orientation recedes; retrieved 2026-11-01
[14] [GNOME Human Interface Guidelines, Typography](https://developer.gnome.org/hig/guidelines/typography.html) — few sizes and weights; retrieved 2026-11-01
[15] [Scaltritti et al., Investigating Effects of Typographic Variables on Webpage Reading Through Eye Movements](https://www.nature.com/articles/s41598-019-49051-x) — headings, alignment, space, weight; retrieved 2026-11-01
[16] [Matthew Butterick, Line length](https://practicaltypography.com/line-length.html) — 45–90 characters; retrieved 2026-11-01
[17] [W3C Web Accessibility Initiative, Understanding Success Criterion 1.4.8: Visual Presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html) — at most 80; retrieved 2026-11-01
[18] [Matthew Butterick, Alternate figures](https://practicaltypography.com/alternate-figures.html) — tabular figures; retrieved 2026-11-01
[19] [Reinecke et al., Predicting Users' First Impressions of Website Aesthetics With a Quantification of Perceived Visual Complexity and Colorfulness](https://www.eecs.harvard.edu/~kgajos/papers/2013/reinecke13aesthetics.pdf) — complexity from region counts; retrieved 2026-11-01
[20] [Apple Human Interface Guidelines, Color](https://developer.apple.com/design/human-interface-guidelines/color) — one colour, one meaning; retrieved 2026-11-01
[21] [W3C Web Accessibility Initiative, Understanding Success Criterion 1.4.1: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) — never colour alone; retrieved 2026-11-01
[22] [W3C Web Accessibility Initiative, Understanding Success Criterion 1.4.11: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) — boundary contrast; anti-aliasing; retrieved 2026-11-01
[23] [Christopher G. Healey, Perception in Visualization](https://www.csc2.ncsu.edu/faculty/healey/PP/) — hue over form; pop-out; retrieved 2026-11-01
[24] [Gramazio, Laidlaw and Schloss, Colorgorical: Creating discriminable and preferable color palettes for information visualization](https://raw.githubusercontent.com/connorgr/colorgorical/master/src/public/static/pdf/colorgorical.pdf) — palette size, names, mark size; retrieved 2026-11-01
[25] [Jennifer Birch, Worldwide prevalence of red-green color deficiency](https://opg.optica.org/josaa/abstract.cfm?uri=josaa-29-3-313) — prevalence; retrieved 2026-11-01
[26] [Atlassian Design System, Elevation](https://atlassian.design/foundations/elevation) — lighter is higher in dark; retrieved 2026-11-01
[27] [Apple Human Interface Guidelines, Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) — 7:1 for small text; retrieved 2026-11-01
[28] [Apple Human Interface Guidelines, Motion](https://developer.apple.com/design/human-interface-guidelines/motion) — purposeful motion; retrieved 2026-11-01
[29] [IBM Carbon Design System, Motion](https://carbondesignsystem.com/elements/motion/overview/) — productive motion; noticed-motion test; retrieved 2026-11-01
[30] [Microsoft Fluent 2 Design System, Motion](https://fluent2.microsoft.design/motion) — concerted motion; live regions; retrieved 2026-11-01
[31] [W3C Web Accessibility Initiative, Understanding Success Criterion 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) — five seconds; retrieved 2026-11-01
[32] [IBM Carbon Design System, Data table: Style](https://carbondesignsystem.com/components/data-table/style/) — header follows row tier; retrieved 2026-11-01
[33] [Microsoft Learn, Typography in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography) — semibold titles; one font; retrieved 2026-11-01
[34] [Apple Human Interface Guidelines, Typography](https://developer.apple.com/design/human-interface-guidelines/typography) — weight for emphasis; few faces; retrieved 2026-11-01
[35] [Microsoft, Fluent 2 Design System, Typography](https://fluent2.microsoft.design/typography) — 4 px base; line-heights; retrieved 2026-11-01
[36] [Microsoft Learn, Layering and elevation in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/layering) — resting shadow; retrieved 2026-11-01
[37] [Nielsen Norman Group (Kate Moran), Flat Design: Its Origins, Its Problems, and Why Flat 2.0 Is Better for Users](https://www.nngroup.com/articles/flat-design/) — flat signifiers; retrieved 2026-11-01
[38] [Nielsen Norman Group (Raluca Budiu), Dark Mode vs. Light Mode: Which Is Better?](https://www.nngroup.com/articles/dark-mode/) — polarity; dark as a switch; retrieved 2026-11-01
[39] [Radix (WorkOS), Composing a palette](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette) — tinted or pure grey; retrieved 2026-11-01
[40] [Radix (WorkOS), Color - Radix Themes](https://www.radix-ui.com/themes/docs/theme/color) — tinted grey by default; retrieved 2026-11-01
[41] [Google, Material Foundation, dynamic_scheme.ts (material-color-utilities)](https://github.com/material-foundation/material-color-utilities/blob/main/typescript/dynamiccolor/dynamic_scheme.ts) — tinted neutrals; retrieved 2026-11-01
[42] [IBM Carbon Design System, Color overview](https://carbondesignsystem.com/elements/color/overview/) — untinted dark themes; retrieved 2026-11-01
[43] [Heer and Robertson, Animated Transitions in Statistical Data Graphics](https://idl.cs.washington.edu/files/2007-AnimatedTransitions-InfoVis.pdf) — tracking; duration; retrieved 2026-11-01
[44] [Jeffrey Heer and Michael Bostock, Crowdsourcing Graphical Perception: Using Mechanical Turk to Assess Visualization Design](https://idl.cs.washington.edu/files/2010-MTurk-CHI.pdf) — position over angle; retrieved 2026-11-01
[45] [Drew Skau and Robert Kosara, Arcs, Angles, or Areas: Individual Data Encodings in Pie and Donut Charts](https://media.eagereyes.org/papers/2016/Skau-EuroVis-2016.pdf) — rings by arc; retrieved 2026-11-01
[46] [Rotaris record, design README §7.1–7.4](../../design/README/07-7-fidelity-consult-before-maintain-after.md) — composition broke; the repair; retrieved 2026-11-02
[47] [Rotaris record, all twelve critic findings repaired](../../architecture/codebase/17-all-twelve-critic-findings-repaired-and.md) — UIR-001..012; retrieved 2026-11-02
[48] [Rotaris record, build-ui step 8](../../../.agents/skills/build-ui/SKILL.md) — bound the box; with `review-ui` step 6, read the source first; retrieved 2026-11-02
