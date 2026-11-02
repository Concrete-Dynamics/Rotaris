# 02. The generated look and its counter-moves

The catalogue of tells by which an interface reads as generated, and for each the counter-move stated as a rule or token of the adopted language.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 02 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

What makes a surface read as generated rather than designed, how a builder or critic sees it in a built Rotaris surface, and which part of the adopted language already answers each tell. The answer is almost always a citation: §1 is the recorded decision a generated surface lacks.

Nothing about structure is decided here. Primary views, their order, tabs, labels and contents come from `docs/spec/` (`REQ-SHELL-023`, §2). A tell the specification mandates is raised in section 8, not repaired. Composition in general is guide 07, states guide 13, accessibility guide 09.

## 2. Principles

- **The look is convergence on the most common choice.** An unguided model samples the safe centre of its training data, so faces, palettes and layouts collapse together [1]; model-generated designs are less diverse than a crowd's, whatever the prompt [2]; generative tools converge in layout more than in colour [3].
- **A tell is a default nobody chose.** A typeface, gradient or card is fine when a decision stands behind it [4]; a deliberately adopted shared system is not sameness, the unexamined average is [5]. The counter-move is direction supplied as context, not an adjective [1][5]; here, §1 cited by token name.
- **Familiarity is not the penalty; complexity is.** Typical, low-complexity layouts were judged most attractive at first sight, and complexity registers first [6]; it predicts appeal far more than colourfulness [7]. Distinctiveness belongs to hierarchy, density and real content, not to a novel arrangement or another accent.
- **Polish hides broken composition.** Generated surfaces look finished and fail on grouping, spacing and overused colour [8]. A shared bounded region outweighs proximity, so boxing every item splits what belongs together [9]; cards suit heterogeneous content and weaken scanning of homogeneous items [10].
- **Tells concentrate in what is not drawn.** Model-designed interfaces get layout right and miss accessibility and behaviour [11]: empty, sparse, dense and error states [12], announced status messages [13].
- **Judge by rules and evidence, not taste.** One tell is coincidence, several mark the template [14]; generative tools state rationales they did not build [3]; a separate critique step raised diversity most [2].
- **Depth and motion carry a role.** Each elevation level has one job, and grouping by raised elevation is a misuse [15]; state is a token-driven tint, not a change of position or size [16]; frequent interactions should not animate [17].
- **Exactness reads as competence.** Precise figures carry more weight than round ones [18]; emoticons in work text lower perceived competence [19].
- **Density is a stated choice.** A mature table system picks row height per layout and holds header and toolbar to it [20].

## 3. Patterns and anti-patterns

Anti-patterns unless marked *(pattern)*; for a pattern the tell is what its absence looks like.

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Every row a card | transcript, Library, Settings, session lists | border count = item count | rows on one surface split by `--rt-divider`; `Card` only for a heterogeneous group (§7.2) [9][10][21] |
| Equal weight | any region | same padding, radius, height everywhere | one primary per region by size, colour, space (§1.4); a §1.6 radius, a child's ≤ its parent's [22][12] |
| One gap for all | grouping | related and unrelated equally far apart | `--rt-space-*` by relation on the 8 px module (§1.5) [23][8] |
| Filler metrics, the field's "dashboard filler" | Overview, Mission | one-number boxes, one stat twice, a big ring | one fact once; `KpiCard` with its requirement's caption [24][25] |
| Under-density | `Table`, `TableCard`, `LogPanel` | 40 px rows for expert data | `--rt-control-height-compact`; header at row height [20][25] |
| Gradient, glow, glass | grounds, buttons, panels | gradient fill, aurora, blur | §1.7's forbidden list; opaque `--rt-surface`, `--rt-surface-2` [22][21][26][27] |
| Shadow on everything | cards at rest | in-flow shadow; border plus soft shadow | `--rt-border`; `--rt-shadow-md`/`-lg` only on what floats (§1.7) [15][28] |
| Hover lift | `Card`, rows, `Button` | `translateY` or scale; `transition: all` | `--rt-hover` wash, no scale (§1.7); `--rt-duration-fast` [29][16][12] |
| Entrance choreography | sections, transcript | fade-and-rise; shimmering placeholder | two infinite animations only (§1.8) [29][30] |
| Accent everywhere | dense views | several filled buttons, a hue per block | one filled control (§1.7); axis colours as states (§1.3) [31][21] |
| A dot that means nothing | rail, headers | coloured dot, no state | `StatusDot` on a §1.3 state with its word (`REQ-SHELL-149`) [21] |
| Emoji and sparkles | rail, headings, commands | emoji bullets; a sparkle for magic | Phosphor, one coloured icon per row (§1.9); `Tooltip` [21][32][19] |
| Placeholder empty state | empty regions | stock sentence; view-filling frame; "no items" while loading | `EmptyState` with why and a control to fill it (`REQ-NOTIFY-006`); a loading line first [33][34][35] |
| States drawn *(pattern)* | every region | only the populated state | empty, loading, error drawn and announced [12][11][13] |
| Placeholder as label | `Input`, `Select`, `TextArea` | field named by its hint | visible label and accessible name [36] |
| Rounded figures | metrics, status strip | `600K+`, proportional digits | `--rt-font-mono`, exact (§1.4, §1.11) [12][18] |
| Generic copy | `Button`, notices | lines that fit any product | the command's name; state words (§1.11) [22] |
| Centred demo column | transcript | whole surface narrowed | prose within `--rt-prose-measure`, data full width (§7.2) [35][37] |
| Speaker bubbles | transcript | tinted bubble per sender | row category and persona colour `--rt-viz-*` (§7.3) [38] |
| Uniform stream | transcript | one undifferentiated scroll | row categories, folded tool groups (`REQ-CHAT-046`) [39] |
| Nearest-domain misread | view content | borrowed content order | order from the view's requirements [8] |
| Keyboard path shown *(pattern)* | commands | no shortcut visible | `Kbd` in the command palette and tooltips (`REQ-SHELL-049`) [40] |
| Stated, not built | an agent's report | claims the pack does not show | judge from `pnpm ui-review` [3] |

## 4. Method

1. **Gather** the surface's §7 row, the requirements and directives that fix it, its mockup section (`pnpm mockup`, craft only) and, for an audit, the `pnpm ui-review` pack.
2. **Separate fixed from free.** A tell inside what the specification fixes goes to section 8 as a question; only what it leaves open is a repair.
3. **Walk section 3** with a number per row: bordered boxes per region, filled controls per view state, distinct gaps, running animations, shadows at rest.
4. **Count the cluster.** One row is a note; three or more on one surface is the generated look, a rubric D1 finding [14].
5. **Name the counter-move by citation** (§1.x, a `--rt-*` token, a component); where §1 has none, a §4.2 proposal or an open question, never an invented value.
6. **Feed difficult data first**: the longest path and persona name, a deep delegation tree, 200 % scaling, every empty, loading and error state [41].
7. **Read the source before calling a value an invention** (`review-ui` step 6); judge by the pack, not the builder's account [3], in a separate critique pass of at most three iterations [2].

## 5. Worked example

**Overview** — §7 row "Overview", mockup `HOME` and `expanded overview strip`, nearest built code `packages/ui/src/OverviewView.tsx` and its rules in `packages/ui/src/shell.css`. Read from source; the pack confirms each number.

**Fixed, not judged.** `REQ-MONITOR-164` (header: title, session label, List sessions, New session); `REQ-MONITOR-165` (two resizable columns, a four-column metric card grid reflowing to two below 1080 px, the onboarding empty state); `REQ-MONITOR-166`–`169` (each metric card); `REQ-MONITOR-173` (the right column's four cards, in order).

- *Filler metrics.* Four equal cards is the shape the field names a tell [25]; mandated here, so it is D02-18. Inside it no card is a bare number: Tokens carries a sparkline and the cost label (`PD-MONITOR-001`), Tool calls a caption and up to five mono `Tag` chips, Repository its base and branch, Agents the caps and states lines.
- *Every row a card.* Sessions are `.ov-session` rows split by a hairline inside one card; each card is the adopted `.card` — `--rt-surface`, a 1 px `--rt-border`, `--rt-radius-md`, no shadow (§1.7).
- *Accent everywhere.* With a session, one filled control (New session). In the onboarding empty state the header's New session and the empty state's Open Workspace are both `btn-primary`: two filled controls in one view state against §1.7. Check D3 on that state's PNG.
- *Placeholder empty state.* The onboarding state names why and offers one command; the proposals hint names both ways a proposal is made (`PD-LIBRARY-002`). `.overview__empty` is sized to its message since UIR-007 measured an empty state at 71 % of its view (`docs/architecture/codebase/17-all-twelve-critic-findings-repaired-and.md`).
- *States.* The empty state is withheld while sessions load; the repository card reads "Reading the repository…" with the ellipsis character [12]; under two samples the sparkline is drawn empty with the words `no history yet` (`REQ-MONITOR-166`). Capture before the session list answers [33].
- *Rounded figures.* `.kpi-value` is mono, weight 300, tabular; totals carry `en-US` separators and `tok` (§1.4, §1.11). Cloud credit shows `—` with a sentence saying why.
- *A dot that means nothing.* Each session dot has a visually hidden state word and pulses only for a busy background run with reduced motion off (§1.8, `REQ-SHELL-135`, `REQ-SHELL-149`).

**Result.** One tell present (two filled controls in one state), one mandated tell raised, no cluster: by step 4 the view does not read as generated.

## 6. Checks

From the ui-review pack or the DOM; rubric ids where the rubric carries the check already.

- **C5** — bordered or `--rt-surface`-filled in-flow boxes per region ≤ the heterogeneous groups the material gives; in the transcript only user, approval, diff and tool-card rows have a surface (§7.2).
- **D3** — exactly one filled primary control per view **in every state**, the empty state included.
- **C9** — on a settled view `document.getAnimations()` holds only `.status-dot.is-pulsing` and `.spinner`; no `transition-property: all`.
- *Proposed* — rest and hover differ only in `background-color`: no `transform`, `box-shadow` or box-size change [12][16].
- *Proposed* — `box-shadow` only on a dialog, the command palette, a popover, a tooltip or an acknowledgement; nothing at rest has both a border and a blurred shadow [15][28].
- **C2** — every gap is a `--rt-space-*` value; *proposed:* the label-to-value gap is smaller than the gap between groups [23].
- **C1** — weights ∈ {300, 400, 500}; 300 only on `--rt-font-mono` numerals.
- *Proposed* — every radius is `--rt-radius-sm`, `-md`, `-lg` or `-pill`, a child's ≤ its parent's [12].
- **C6** — every coloured `StatusDot` has a state word in the accessible tree; every colour is a §1.3 token.
- **C8** — no `Extended_Pictographic` code point in product chrome; one coloured icon per row.
- **F2** — a PNG per region for empty, loading, error; *proposed:* no `EmptyState` in the DOM before the store or run host answers [33].
- *Proposed* — acknowledgements, notices, run state and `Spinner` carry `role="status"`, `role="alert"` or `aria-live` [13].
- **F4** — no rounded figure where the specification gives an exact one (its own strings, such as `REQ-CHAT-062`'s `~<T> tok`, win); *proposed:* no three-period ellipsis [12].
- **F3** — every `Input`, `Select`, `TextArea` has an accessible name beyond its placeholder [36].
- **C7** — prose within `--rt-prose-measure` or §7.2's caps; code, diffs and tables exempt [37].
- **O1** — *proposed:* no `KpiCard` holding one number without its requirement's caption [24].
- **D1** — *proposed:* filed when three or more section-3 rows match on one surface, each cited [14].
- *Proposed* — `pnpm theme-proof` samples empty-state text over the grid motif at its worst point [27][42].

## 7. How this applies here

**Requirements.** `REQ-SHELL-023`, `-027`, `-049` (structure, never touched here); `REQ-SHELL-135`, `-137`; `REQ-SHELL-144`, `-145`, `-148`, `-149`, `-160` (the accessibility contract); `REQ-NOTIFY-006`, `-019`; `REQ-CHAT-046`, `-057`, `-060`, `-062`; `REQ-MONITOR-164`–`169`, `-173`.

**Directives.** `PD-CHAT-004`, `PD-CHAT-005` (§7.3); `PD-MONITOR-001`; `PD-LIBRARY-002`.

**Tokens.** `--rt-surface`, `--rt-surface-2`, `--rt-border`, `--rt-divider`, `--rt-hover`, `--rt-shadow-md`, `--rt-shadow-lg`, `--rt-radius-*`, `--rt-space-*`, `--rt-font-mono`, `--rt-duration-fast`, `--rt-viz-1`…`-6`, `--rt-prose-measure`, `--rt-control-height-compact`.

**Components.** `Card`, `KpiCard`, `Table`, `TableCard`, `LogPanel`, `Button`, `Tag`, `StatusDot`, `EmptyState`, `Spinner`, `Tooltip`, `Kbd`, `CommandPalette`, `Acknowledgement`; gap G7, the transcript row.

**The record's own lessons.** "The tokens hold but composition breaks", every transcript row a card (`docs/design/README/07-7-fidelity-consult-before-maintain-after.md` §7.1, repaired §7.2); UIR-001..012, of which UIR-006 (eleven interactive heights to three) and UIR-007 (the oversized empty state) are tells here (`docs/architecture/codebase/17-all-twelve-critic-findings-repaired-and.md`); "bound the box, not only the child" (`.agents/skills/build-ui/SKILL.md` step 8, `SHRUNK`); a critic filing an adopted tint as an invention (`.agents/skills/review-ui/SKILL.md` step 6).

| Reader | Reads |
|---|---|
| `design-ui` audit step 2, "walk the tells" | sections 3, 4, 6 |
| `design-ui` brief | none; it reads guides 03–14 |
| rubric D1 | section 3; section 4 step 4 |
| rubric C5, C8, O1 | section 3's card, icon and filler rows; section 6 |
| `build-ui` step 6, "while building" | section 6 |
| `review-ui` step 4, step 6 | section 6; section 4 step 7 |

## 8. Where this disagrees with the adopted material

Each item is a question to raise; none is a change to make.

- **D02-1 —** A model still converges on common faces, Space Grotesk named, though the same text recommends it for a code aesthetic [1]. Meets §1.4 (`--rt-font-display`). *Does that association matter, or does §1.4's role split answer it?*
- **D02-2 —** A violet accent and purple gradients are named leading tells [43]. Meets §1.2 (the violet accent), §1.3 (Z violet = done). *Does the association attach to the hue, or only to gradients and accent-everywhere, which §1.7 forbids?*
- **D02-3 —** Extreme weight contrast and threefold size jumps are offered as the counter to the generic look [1]. Meets §1.4, "never weight". *Is that advice confined to expressive marketing surfaces?*
- **D02-4 —** A flat ground is called generic, layered gradients recommended [1]; chart embellishment aided memory without hurting accuracy [51]. Meets §1.7's forbidden list, §1.10. *Does memorability ever matter for Overview's `KpiCard` and `Sparkline`?*
- **D02-5 —** Minimal motion is called a tell; one orchestrated load sequence is recommended [1]. Meets §1.8. *Is an application window's first paint ever such a moment, given `REQ-SHELL-135`?*
- **D02-6 —** Mono data labels, hairlines with dense columns and a big number over a small label are listed as clichés [29]. Meets §1.4, §1.7, `KpiCard`. *Should the record say these are habits on a marketing site and earned on a data surface?*
- **D02-7 —** A pulsing status dot is catalogued as a tell [28]. Meets §1.8 (`.status-dot.is-pulsing`). *Is the pulse bound to an actively running state wherever it is drawn?*
- **D02-8 —** A shadow should have at least two layers, ambient and direct [12]. Meets §1.7 (`--rt-shadow-md`, `-lg`). *Do the adopted shadow tokens already meet that, or need they not?*
- **D02-9 —** Material specifies a card rising on hover and drag [44]; a press scale-down is argued as feedback [45]. Meets §1.7, "No scale or shrink effects anywhere". *Is a board card lifted while dragged a floating surface, and is press feedback fully "one ramp step darker"?*
- **D02-10 —** Flat interactive styling raised missed and false clicks [46]. Meets §1.7 (flat, no bevels). *Do tint, accent ink, the one filled control and the focus ring signal clickability enough in dense views?*
- **D02-11 —** Translucency is a platform convention for navigation and controls, banned from content [47]. Meets §1.7 (no glass or blur). *Should the record say why the title bar and navigation rail stay opaque?*
- **D02-12 —** A design system reserves glow and gradient to mark AI content [48]. Meets §1.7. *Is there any content here such a marker would distinguish, when every row comes from an agent?*
- **D02-13 —** APCA is preferred over WCAG 2 for perceptual contrast [12]. Meets `REQ-SHELL-144`, `-145`. *Should `pnpm theme-proof` report an APCA figure beside the WCAG 2 ratios?*
- **D02-14 —** The fastest face differs per reader [49]. Meets §1.4 (three fixed faces). *Should the preference store ever hold a reading face for the transcript?*
- **D02-15 —** Dark text on light gave better acuity and proofreading [50]. Meets §1.1 and the default `rotaris-dim`. *Does the record treat the dark ground as chosen identity rather than measured advantage?*
- **D02-16 —** An editable operator turn is drawn as a card, a surface as affordance [52]. Meets §7.2 item 2 (the user row's fill, for findability). *Could that fill be read as an edit affordance it does not offer?*
- **D02-17 —** Text should never sit over textures [42]. Meets §1.10 (the motif behind empty states). *Does `REQ-SHELL-160`(a) cover empty-state text over the motif?*
- **D02-18 —** A row of equal big-number cards is a named tell [25][24]. Meets `REQ-MONITOR-165` and rubric O1. *Does O1 read that grid as earned by `REQ-MONITOR-166`–`169`'s captions?*

## 9. References and further reading

[1] [Anthropic (Rajasekaran, Wei, Bricken), Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills) — convergence; direction as context; D02-1, -3 to -5; retrieved 2026-11-01
[2] [Ma et al., Exploring the Capabilities of Large Language Models for Generating Diverse Design Solutions](https://arxiv.org/html/2405.02345) — lower diversity; critique helps; retrieved 2026-11-01
[3] [Imteyaz et al., Design Theater](https://arxiv.org/abs/2607.22928) — unbuilt rationales; layout converges; retrieved 2026-11-01
[4] [Filip Wojda (regards), How to Make a Website Look Less Vibe Coded](https://www.regards.design/blog/make-website-look-less-vibe-coded) — a tell is unchosen; retrieved 2026-11-01
[5] [Sascha Becker, Same Same but Different](https://saschb2b.com/blog/same-same-but-different) — shared system is not sameness; retrieved 2026-11-01
[6] [Tuch et al., The role of visual complexity and prototypicality regarding first impression of websites](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/38315.pdf) — prototypical, simple rated best; retrieved 2026-11-01
[7] [Reinecke et al., Predicting users' first impressions of website aesthetics](https://kgajos.seas.harvard.edu/papers/reinecke13aesthetics.pdf) — complexity over colourfulness; retrieved 2026-11-01
[8] [Nielsen Norman Group, Good from Afar, But Far from Good: AI Prototyping in Real Design Contexts](https://www.nngroup.com/articles/ai-prototyping/) — broken grouping; domain misread; retrieved 2026-11-01
[9] [Stephen E. Palmer, Common region: a new principle of perceptual grouping](https://pubmed.ncbi.nlm.nih.gov/1516361/) — enclosure beats proximity; retrieved 2026-11-01
[10] [Nielsen Norman Group, Cards: UI-Component Definition](https://www.nngroup.com/articles/cards-component/) — when cards hurt; retrieved 2026-11-01
[11] [Sawicki et al., Qualitative Evaluation of LLM-Designed GUI](https://arxiv.org/abs/2601.22759) — accessibility and behaviour missing; retrieved 2026-11-01
[12] [Vercel Labs, Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) — radii, state contrast, states, figures, ellipsis, shadows, APCA; retrieved 2026-11-01
[13] [W3C WAI, Understanding SC 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — announce status; retrieved 2026-11-01
[14] [Joshua Snoddy, Why Do AI-Generated Websites All Look the Same?](https://www.joshuasnoddy.com/blog/why-ai-websites-look-the-same/) — tells cluster; retrieved 2026-11-01
[15] [Atlassian Design System, Elevation](https://atlassian.design/foundations/elevation) — one job per level; retrieved 2026-11-01
[16] [Google, Jetpack Compose Material 3, StateTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/StateTokens.kt) — state as tint; retrieved 2026-11-01
[17] [Apple, Motion, Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/motion) — no motion on frequent interactions; retrieved 2026-11-01
[18] [Janiszewski, Uy, Precision of the anchor influences the amount of adjustment](https://pubmed.ncbi.nlm.nih.gov/18271859/) — precise figures weigh more; retrieved 2026-11-01
[19] [Glikson, Cheshin, van Kleef, The Dark Side of a Smiley](https://pure.uva.nl/ws/files/30232658/1948550617720269.pdf) — emoticons cost competence; retrieved 2026-11-01
[20] [IBM Carbon Design System, Data table: usage](https://carbondesignsystem.com/components/data-table/usage/) — row height by density; retrieved 2026-11-01
[21] [Jeff Humble (The Fountain Institute), 7 Signs a UI Has Been Vibe Coded](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui) — nested cards, glows, dots, emoji, colour budget; retrieved 2026-11-01
[22] [Kosta Canatselis, Spot the Slop: A UI Designer's Guide to Fixing AI Defaults](https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c) — gradients, uniformity, generic copy; retrieved 2026-11-01
[23] [Laith Aljunaidy, Why AI-generated UIs get spacing wrong](https://uxskill.laithjunaidy.com/blog/ai-design-spacing-whitespace.html) — one gap everywhere; retrieved 2026-11-01
[24] [Nielsen Norman Group, Prompt to Design Interfaces: Why Vague Prompts Fail](https://www.nngroup.com/articles/vague-prototyping/) — one-number boxes; retrieved 2026-11-01
[25] [Laith Aljunaidy, Why AI-generated dashboards all look the same, and the density fix](https://uxskill.laithjunaidy.com/blog/ai-dashboard-design-generic.html) — equal stat cards; retrieved 2026-11-01
[26] [Nielsen Norman Group, Glassmorphism: Definition and Best Practices](https://www.nngroup.com/articles/glassmorphism/) — contrast over translucency; retrieved 2026-11-01
[27] [W3C WAI, Understanding SC 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) — contrast against the actual background; retrieved 2026-11-01
[28] [Paul Bakaus (Impeccable), Impeccable: AI slop catalogue](https://impeccable.style/slop) — border plus shadow; pulsing dot; retrieved 2026-11-01
[29] [Anthropic, frontend-design (SKILL.md)](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) — hover on every card; entrances; D02-6; retrieved 2026-11-01
[30] [Nielsen Norman Group, Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/) — shimmer distracts; retrieved 2026-11-01
[31] [Atlassian Design System, Button (legacy): usage](https://atlassian.design/components/button/button-legacy/usage) — one primary per area; retrieved 2026-11-01
[32] [Nielsen Norman Group, The Problem with AI Sparkles Icons](https://www.nngroup.com/articles/ai-sparkles-icon-problem/) — label the icon; retrieved 2026-11-01
[33] [Nielsen Norman Group, Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/) — not empty while loading; retrieved 2026-11-01
[34] [IBM Carbon Design System, Empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/) — types; one control; retrieved 2026-11-01
[35] [Vercel, AI Elements, Conversation](https://elements.ai-sdk.dev/components/conversation) — demo centring, stock empty copy; retrieved 2026-11-01
[36] [WHATWG, HTML Living Standard: The placeholder attribute](https://html.spec.whatwg.org/multipage/input.html#the-placeholder-attribute) — a hint is not a label; retrieved 2026-11-01
[37] [W3C WAI, Understanding SC 1.4.8: Visual Presentation](https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html) — bounded measure; retrieved 2026-11-01
[38] [Vercel, AI Elements, Message](https://elements.ai-sdk.dev/components/message) — sender-tinted default; retrieved 2026-11-01
[39] [Nielsen Norman Group, Accordion Editing and Apple Picking](https://www.nngroup.com/articles/accordion-editing-apple-picking/) — lost in one stream; retrieved 2026-11-01
[40] [Lane et al., Hidden Costs of Graphical User Interfaces](http://www.ruf.rice.edu/~lane/papers/hidden_costs.pdf) — experts skip shortcuts; retrieved 2026-11-01
[41] [Steven Garrity (A List Apart), Design with Difficult Data](https://alistapart.com/article/design-with-difficult-data) — worst real content; retrieved 2026-11-01
[42] [GNOME Human Interface Guidelines, Typography](https://developer.gnome.org/hig/guidelines/typography.html) — no text over textures; retrieved 2026-11-01
[43] [prg.sh (Pragnesh Gajjar), Why Your AI Keeps Building the Same Purple Gradient Website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website) — the violet default; retrieved 2026-11-01
[44] [Google, Jetpack Compose Material 3, ElevatedCardTokens.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ElevatedCardTokens.kt) — hover elevation; retrieved 2026-11-01
[45] [Emil Kowalski, 7 Practical Animation Tips](https://emilkowal.ski/ui/7-practical-animation-tips) — press scale; retrieved 2026-11-01
[46] [Burmistrov et al., Flat Design vs Traditional Design: Comparative Experimental Study](https://www.flatisbad.com/publications/Burmistrov-INTERACT15.pdf) — flat costs clicks; retrieved 2026-11-01
[47] [Apple Human Interface Guidelines, Materials](https://developer.apple.com/design/human-interface-guidelines/materials) — functional-layer glass; retrieved 2026-11-01
[48] [IBM Carbon Design System, Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/) — glow marks AI; retrieved 2026-11-01
[49] [Wallace et al., Towards Individuated Reading Experiences](https://jeffhuang.com/papers/Readability_TOCHI22.pdf) — fastest face varies; retrieved 2026-11-01
[50] [Piepenbrock et al., Positive display polarity is advantageous for both younger and older adults](https://documentacion.fundacionmapfre.org/documentacion/bib/143702.do) — dark on light reads better; retrieved 2026-11-01
[51] [Bateman et al., Useful Junk?](https://vis.csail.mit.edu/classes/6.859/readings/pdfs/Bateman-UsefulJunk.pdf) — embellishment aids memory; retrieved 2026-11-01
[52] [Zed Industries, Agent Panel](https://zed.dev/docs/ai/agent-panel) — editable operator turn; retrieved 2026-11-01
