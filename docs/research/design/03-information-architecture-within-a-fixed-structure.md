# 03. Information architecture within a fixed structure

What remains to design when the primary views, their order, their tabs and their labels are fixed by the specification: content model, grouping, hierarchy and disclosure inside a view.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 03 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

Inside a primary view whose place, label and tabs `REQ-SHELL-023`, `REQ-SHELL-027`, `REQ-CONFIG-268`,
`REQ-LIBRARY-103` and `REQ-TRACE-232` fix, what is still a design decision, and how is it made well? The layer below
the navigation rail: which objects a region holds, which attributes lead, how they group, what folds away, how panes
relate, how a collection is narrowed. Requirements often fix much of that too (`REQ-CONFIG-320` orders Settings ›
Runtime), so the first step is to find where the specification stops.

The guide decides no view, tab, category, column, label, order or fixed string, and proposes none; research arguing
with the fixed structure is a question in section 8. Composition is guide 07's, journeys 04's, states 13's, giving way
at 1000×680 14's.

## 2. Principles

**The work left is beneath navigation.** Information architecture — the inventory of content and function, its
organisation and names — is a separate artifact from the navigation that exposes it, drafted first [3]. Inside a view
it starts from the objects listed (an artifact, a requirement, a commit), their core content and their sortable
metadata; a list or a board is a view onto an object, not one [1]. Each command belongs to the object it acts on, with
the states in which it shows [2].

**Rank before drawing.** An object's attributes are ranked as a step of their own; the rank later becomes size,
colour, position or a fold [1]. §1.4 says how a rank is expressed; this step says what it is.

**Depth costs more than breadth.** With end items fixed, a three-level tree was significantly slower than two-level
ones [15]; depth, not items per level, drove retrieval time, and people's preferred shape was not their fastest [16].

**Disclose by use, at most twice.** Frequent options first, rare ones a level down, split by use data [9]; most
configuration options are rarely set, and finding the right one is near half of configuration issues [17]. More than
two levels confuse, and staged steps fail when they depend on each other [9]; nesting suits a tree [11]. Folds hurt when
most content is needed or compared, so a crucial fact never sits in a closed one [10]. A disclosure is a labelled
button beside what it reveals, one per view, its state exposed [12][13]; folded text escapes find unless marked
hidden-until-found [14].

**Hold positions still.** A static arrangement beat an adaptive one in one lab study [18]; frequent items shown as copies
in a region of their own were preferred, and adapting on every interaction did worse than static [19].

**Group by space, then by container, always in markup.** Proximity is among the most important grouping cues and a
reflow can pull a group apart [28]; a shared region also groups, can override proximity, is overused where whitespace
would do, and as a heavy band can read as the end of content [29]. Grouping must be determinable by software [31],
sections carry headings [32], and a heading describes its topic [33]. Perceived groups can be inferred from a
screenshot well enough to compare with the intended ones [30].

**Labels are the navigation inside a view.** Scent depends on a label's words, neighbours, position and reader; "More"
carries almost none [7]. Programmers navigate code by following scent [8].

**Panes keep overview and detail related.** Detail beside overview is the most consistently preferred form, at a cost
in space; browsing the overview leaves the detail alone, a change in the detail shows at once in the overview, and
magnifying a selection has mostly failed [21]. An inspector follows the selection; a window fixed on one thing does not
retarget [22]. Selection stays marked in every leading pane; a hidden pane has two ways back [23]. A pane that changes
the main view leads, a subordinate one trails, and when narrow overlaps rather than squeezes [24]; the detail and the
selection survive a narrowing [25]; a closed detail panel stays closed, an empty one says why [26].

**A working set kept in open folds is lost.** In one exploratory study developers spent about 35 % of their time on
navigation mechanics and lost what they kept in open tabs and expanded nodes once those were reused [27].

**Tabs separate what is not compared.** Tabs suit separable content; navigation tabs and in-view tabs never share a
control [34]. A setting that does not apply stays visible, disabled, with its reason [35].

**A collection says how it is narrowed.** Applied filters are listed beside the list, each removable [39]; empty and
no-match are two states with two ways forward [40]; search filters a collection, find leaves content whole and steps
through it [41]; a search field sits beside what it searches and names its scope [46]; a silently narrow scope makes
people conclude content is absent [42]; a result count is a status message [43].

**A monitoring view holds what must be watched.** Its test is whether a fact must be watched, not whether it is related;
the always-important fact leads and the rest stay quiet until urgent; a number needs a comparison [44]. Card kinds and
their order, which becomes the stacking order on reflow, are content decisions [45].

**Content carries the weight, chrome recedes.** Density survives when navigation chrome recedes behind task content:
"Don't compete for attention you haven't earned." [38]

**Validate the inside.** A card sort yields one level of groups and candidate names [4]; a tree test measures labels
apart from visual design [5]; expert-derived groupings differed substantially from users' [6].

## 3. Patterns and anti-patterns

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Object inventory first [1][2] | any region | regions named after tabs or columns | rank attributes; data in the mono face (§1.4) |
| Every row its own box (anti) [29] | lists, transcript | bordered boxes equal rows | §1.7 flat; `--rt-divider` between rows; a `Card` only where earned (§7.2) |
| Fold inside a fold (anti) [9][11] | transcript, Settings | a chevron inside an open region | one fold, then `REQ-CHAT-061`'s card; nesting as a tree (G3) |
| Crucial fact folded (anti) [10] | folded tool group | `failed` seen only when opened | per-outcome counts and most-severe colour on the header (G7) |
| Labelled disclosure [12][13] | an advanced layer | bare chevron, no `aria-expanded` | `Button` with a name; the `--rt-focus` ring (§1.7) |
| Rule as the only section mark (anti) [31][32] | grouped regions | hairline, no heading in the tree | `SectionLabel` (§1.4) as a real heading |
| Empty label (anti) [7][33] | headings, notice actions | "More", "Details", a mechanism's name | §1.11 no filler; §7.4's described tool row |
| Promote by reordering (anti) [18][19] | streaming lists | positions move between commands | fixed orders (`REQ-TRACE-232`); recent items as copies |
| Inspector follows selection [21][22] | Git, Requirements, agents | detail ignores selection | `REQ-MONITOR-072`; tint plus accent ink in every pane (§1.2) [23] |
| Narrowing keeps the reading [24][25] | 1180 and 1080 px | selection lost on resize | overlay drawers (`REQ-SHELL-059`, G9) |
| Band as a floor (anti) [29] | a notice in a view | content beneath reads as ended | G1: a rule and a glyph, no filled background |
| Invisible narrowing (anti) [39][42] | Library, Git | a short list, no reason given | each applied value a `Tag`; an exact mono count (§1.11) |
| Empty and no-match merged (anti) [40] | any collection | one message for both | `EmptyState`, grid motif for empty only (§1.10); `REQ-NOTIFY-006` |
| Filtering a sequence (anti) [41] | transcript | rows vanish under a query | find highlights in place with an accent tint (§1.2) |
| Detail on a monitoring view (anti) [44][45] | Overview | a list or diff no specified card holds (`REQ-MONITOR-164` to `-171`) | `KpiCard` with `Sparkline`; detail where it links |
| Working set in folds (anti) [27] | long sessions | kept work only as open state | a Library artifact |

## 4. Method

1. **Find where the specification stops.** List every requirement and directive fixing the surface — view, tabs or
   categories, order inside them, fixed strings. What none fixes is the design space.
2. **Inventory the objects**, each with core content, metadata, commands and the states in which each shows [1][2].
3. **Rank each object's attributes** [1]; one primary per region.
4. **Disclose by use** [9][17]: the few things nearly everyone sets lead, the rare go one level down in the same
   category or tab; stop at two levels [9]; nest as a tree [11]; never fold a failed or waiting state [10]; a fold is a
   named button, found by find [13][14].
5. **Group by space, then container** [28][29]: related items get the smaller gap, a heading sits nearer its group than
   the one above, a container comes only where space cannot carry the group, and every visual group has a heading or
   named group in markup [31][32].
6. **Name** each group and control by what it holds, in the glossary's words [7][33].
7. **Relate the panes**: coupling [21], inspector or fixed window [22], side [24], what 1180 and 1080 px keep [25][26].
8. **Narrow collections honestly**: filter or find [41], applied values listed [39], empty against no-match [40],
   counts announced [43], search beside its content [46].
9. **Freeze positions** between operator commands [18][19].
10. **Check as structure before pixels**: a card sort inside a fixed category [4], a tree test of labels [5]; what argues
    with the fixed structure goes to the brief's §10 and section 8 as a question.

## 5. Worked example

**Settings › Runtime** — §7 row "Settings panes and save bar", mockup section `SETTINGS`, nearest built code
`packages/ui/src/SettingsView.tsx` and `packages/ui/src/settings/ConfigSettings.tsx` (`RuntimeSettings`, `SaveBar`,
`Toggle`), read 2026-11-02.

*Where the specification stops.* `REQ-CONFIG-320` fixes Runtime's six groups in order; `REQ-CONFIG-321` to
`REQ-CONFIG-328`, `REQ-CONFIG-471` and `PD-CONFIG-003` fix their members; `REQ-CONFIG-270` keeps Save, Discard and the
status in view; `REQ-CONFIG-274` makes every category reachable by vertical scrolling alone at 1000×680. Open: each preference's inner rank, how
groups are expressed, a dependent control's gap, whether the advanced card folds, how a commit policy shows.

*Objects.* The preference: label, value, unit and range, hint, scope (`REQ-CONFIG-471`), stored against pending value,
commit policy — deferred to Save, except memory diagnostics, written at once (`REQ-CONFIG-261`). Commands: change, Save,
Discard, two confirmations (`REQ-CONFIG-327`).

*Rank.* Label and value lead, the unit rides with the value, the hint is a caption, and the commit policy is stated
only where it departs from the category's, as the diagnostics hint does. Hints are painted `--rt-text-secondary`; §1.1
gives captions `--rt-text-tertiary`, which the redaction statement takes (`REQ-CONFIG-326`) — a question for the pack.

*Disclosure.* The advanced card is the rarely used layer [17]. The specification places it last and calls it a card;
whether it may open collapsed is unstated, so a brief raises it in its §10 instead of drawing a fold.

*Grouping.* `.settings__heading` sits `--rt-space-4` below what precedes it and `--rt-space-2` above its group, so it
binds downward [28]; it is a plain `h2`, not the `SectionLabel` kicker, a D2 check against the mockup. The runtime
policy card is named by the requirement, so it is earned; inside it the improvement analysis timeout follows the toggle
it qualifies, and should sit one spacing step closer to it than toggles sit to each other [28]. The record already paid
for the label column: UIR-010 measured two selects' left edges 51.04 px apart and one select 729.2 px wide to hold
`single`, repaired to one label column with fields bounded to content
(`docs/architecture/codebase/17-all-twelve-critic-findings-repaired-and.md`).

*Panes.* The category list is a vertical navigation list (`REQ-SHELL-153`), its selection kept visible while focus is in
the body [23].

*Disabled.* Without a configuration service the diagnostics toggle is disabled (`disabled={!props.serviceAvailable}`) and
the card draws its empty state, "No configuration service.", in that same case (`REQ-CONFIG-471`), so the reason stands
beside the control as `REQ-NOTIFY-008` and [35] ask. A first reading of the prop alone (2026-11-02) took it for a
reason-less disabled control; following the prop to its producer refuted that, which is the method's own lesson: read the
producer, not the attribute.

*Filled control.* Save, present only while dirty (`REQ-CONFIG-281`), is the one filled control (§1.7).

## 6. Checks

On the `pnpm ui-review` pack or the DOM, at 1400×900 and 1000×680.

- **C5** — containers per region ≤ the content kinds the material gives one; in the transcript only the user's row,
  approval, diff and an open tool card are bounded (§7.2) [29]. §7.1's "the tokens hold but composition breaks"
  (`docs/design/README/07-7-fidelity-consult-before-maintain-after.md`) is this check failing.
- **C2, extended** — a group heading's space above is at least twice its space below; related items sit one spacing
  step closer than groups do [28].
- **C3** — labels in a region share one left edge within 1 px (`align-x`); no field wider than its longest value (UIR-010).
- **C1** — exactly one element per region at its largest size in `--rt-text`.
- **D3** — exactly one accent-filled control per dense view.
- *New, O1* — no Overview region holds a list, diff or history beyond the cards `REQ-MONITOR-164` to `REQ-MONITOR-171`
  fix, the sessions card among them [44][45].
- **O2** — transcript, settings and commit rows differ in face, ink or structure [1].
- *New* — headings or named groups in the accessibility tree ≥ visual groups drawn [31][32].
- *New* — no heading, disclosure or notice action is a bare generic word [7][33].
- *New* — no `[aria-expanded=true]` region inside two others; each disclosure has `role=button`, `aria-expanded` and a
  name [9][13].
- *New* — no `failed`, `blocked` or `waiting` state reachable only by opening a fold [10]; find reports a match inside a
  folded tool group [14].
- *New* — two captures during a run with no operator command show the same order in the delegation tree and the
  sessions card [19].
- *New, D4* — after resizing across 1180 and 1080 px and back, the selection and the open detail are unchanged, and a
  closed pane stays closed after a selection change [25][26]; "bound the box, not only the child"
  (`.agents/skills/build-ui/SKILL.md` step 8) applies to the pane.
- *New, F2* — a narrowed collection shows each applied value as a `Tag` and an exact `n of N`, its no-match text differs
  from its empty text [39][40], and the count is in a `role=status` region (F3) [43].
- *New, F4* — every disabled control names its reason beside it or in its tooltip (`REQ-NOTIFY-008`) [35].
- *Proposed tooling* — groups inferred from the PNG match the sections the markup declares [30].

Read `packages/contracts/src/theme/themes.ts` before filing a token as an invention (`review-ui` step 6); UIR-001 to
UIR-012 are the precedent for a check stated as a number.

## 7. How this applies here

**Requirements:** `REQ-SHELL-023`, `-027`, `-059`, `-072` to `-079`, `-124`, `-152`, `-153`; `REQ-CONFIG-261`,
`-268` to `-274`, `-281`, `-286`, `-320` to `-328`, `-399`, `-471`; `REQ-LIBRARY-103`, `-104`; `REQ-TRACE-232`,
`-322`; `REQ-CHAT-046`, `-061`; `REQ-MONITOR-072`, `-164` to `-171`; `REQ-NOTIFY-006`, `-008`.
**Directives:** `PD-CONFIG-003`, `PD-ORCH-005`.
**Tokens:** `--rt-space-2`, `--rt-space-4`, `--rt-divider`, `--rt-accent-tint-07`, `--rt-accent-tint-14`, `--rt-text`,
`--rt-text-secondary`, `--rt-text-tertiary`, `--rt-focus`.
**Components:** `SectionLabel`, `Card`, `EmptyState`, `Tag`, `Tabs`, `TableCard`, `ToggleSwitch`, `KpiCard`,
`Sparkline`, `Button`, `Tooltip`; gaps G1, G3, G7, G9 (`docs/design/README/04-4-component-inventory-against-the-specification.md` §4.2).

**Who reads which section.**

| Derivative | Reads |
|---|---|
| `design-ui` brief §1 | §4 step 1 |
| `design-ui` brief §3 | §2, §4 steps 2–9, §5 |
| `design-ui` brief §10 | §8 |
| rubric C2, C3, O2 | §6 |
| rubric O1 | §2, §6 |

Section 6's new checks are proposals for the rubric's next version.

## 8. Where this disagrees with the adopted material

**D03-1 —** Related objects, not a list of areas, are argued to be the main wayfinding device [1]. The seven primary
views mix task areas and object collections in a fixed order (`REQ-SHELL-023`). Should the specification state links
between a requirement, the commits implementing it and the run that produced them? — none filed; request

**D03-2 —** Platform guidance applies a changed setting at once, with no confirmation button [35]. The configuration
categories defer to Save and Discard behind a leave guard (`REQ-CONFIG-270`, `REQ-CONFIG-286`, `REQ-SHELL-124`), while
Interface applies at once (`REQ-CONFIG-399`). What keeps the deferred Save, and how does a control show its commit policy where
the two meet? — [OQ-530](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-530)

**D03-3 —** Platform list guidance separates a row's texts by size, weight and colour [36]. §1.4 keeps hierarchy to
size, colour and space, never weight. Do a dense row's title, description and metadata stay distinct without weight? — [OQ-500](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-500)

**D03-4 —** Platform guidance lets people choose a sidebar's areas and order [37], and an adaptable menu was preferred
and matched an optimal fixed one in speed in one study [18]. The rail's order and labels are fixed (`REQ-SHELL-023`,
`REQ-SHELL-027`). Should the operator be able to tailor the navigation rail? — none filed; request

**D03-5 —** People concentrate on the default tab, so it should hold the most used content [34]. A tab strip opens on
its first tab (`REQ-SHELL-152`), and the Library's is Prompts (`REQ-LIBRARY-103`). Is Prompts the tab operators use most? — none filed; request

**D03-6 —** Expert-derived groupings differed substantially from users' own [6]. The views, the Settings categories and
the Library tabs (`REQ-SHELL-023`, `REQ-CONFIG-268`, `REQ-LIBRARY-103`) were never tested by an operator sort. Should a
tree test [5] of the fixed labels be run as sanitized evidence? — none filed; not-a-question

**D03-7 —** Revealing a predicted subset at once and fading in the rest over 500 ms sped menu selection [20]. §1.8 keeps
animation to status indicators. Does §1.8 mean to exclude onset motion in the command palette's listing? — [OQ-496](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-496)

**D03-8 —** Animating a change of scale substantially reduces reorientation [21]. §1.8 meets the Requirements board's
graph presentation (`REQ-TRACE-322`), which re-centres. May that presentation animate a change of centre or scale? — [OQ-496](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-496)

**D03-9 —** Separate views cost split attention, large in dynamic tasks (map and driving studies) [21]. A run can be
watched in a persona window beside the main window (`REQ-SHELL-072` to `REQ-SHELL-079`). Does following one run across
two windows cost the operator measurably? — none filed; not-a-question

**D03-10 —** Attention encodings, pulsing above all, are for conditions needing a response [44]. `REQ-MONITOR-171`
pulses other busy sessions in the run colour, and §1.8 pulses an actively running state. Does running need the
operator, or should the pulse be kept for states that do? — [OQ-502](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-502)

**D03-11 —** An aggregate status lists only non-zero exceptions [45]. The agents card prints every count, zeros
included (`REQ-MONITOR-169`, narrowed by `PD-ORCH-005` revision 6 clause 23). Is the line's fixed shape worth the
attention its zeros spend? — none filed; already-ruled: PD-ORCH-005 clause 23

**D03-12 —** The broadest scope should be the default, any narrowing stated on the results [42]. One Library query
already filters all three tabs (`REQ-LIBRARY-104`), meeting the first half. With the tab labels fixed
(`REQ-LIBRARY-103`), how does a tab that is not selected say it holds matches? — [OQ-534](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-534)

## 9. References and further reading

[1] [Sophia V. Prater, A List Apart, Object-Oriented UX](https://alistapart.com/article/object-oriented-ux/) — objects, ranking, wayfinding; retrieved 2026-11-01

[2] [Sophia V. Prater, A List Apart, OOUX: A Foundation for Interaction Design](https://alistapart.com/article/ooux-a-foundation-for-interaction-design/) — commands per object; retrieved 2026-11-01

[3] [Jen Cardello, NN/g, The Difference Between Information Architecture (IA) and Navigation](https://www.nngroup.com/articles/ia-vs-navigation/) — IA apart from navigation; retrieved 2026-11-01

[4] [Samhita Tankala and Katie Sherwin, NN/g, Card Sorting](https://www.nngroup.com/articles/card-sorting-definition/) — one level of groups; retrieved 2026-11-01

[5] [Page Laubheimer, NN/g, Tree Testing](https://www.nngroup.com/articles/tree-testing/) — labels tested bare; retrieved 2026-11-01

[6] [Helen Petrie et al., University of York (INTERACT 2011), Using card sorts for understanding website information architectures](https://www-users.york.ac.uk/~pc530/pubs/Petrie_Interact2011.pdf) — expert groups differ; retrieved 2026-11-01

[7] [Raluca Budiu, NN/g, Information Scent](https://www.nngroup.com/articles/information-scent/) — what scent depends on; retrieved 2026-11-01

[8] [Joseph Lawrance et al., IEEE TSE, How Programmers Debug, Revisited](https://digitalcommons.memphis.edu/facpubs/2870) — navigation by scent; retrieved 2026-11-01

[9] [Jakob Nielsen, NN/g, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) — use split, two levels; retrieved 2026-11-01

[10] [Huei-Hsin Wang, NN/g, Accordions on Desktop](https://www.nngroup.com/articles/accordions-on-desktop/) — when folds hurt; retrieved 2026-11-01

[11] [IBM Carbon, Accordion: Usage](https://carbondesignsystem.com/components/accordion/usage/) — a tree for nesting; retrieved 2026-11-01

[12] [Apple HIG, Disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls) — labelled, adjacent, one per view; retrieved 2026-11-01

[13] [W3C WAI, ARIA Authoring Practices Guide, Disclosure (Show/Hide) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) — button, aria-expanded; retrieved 2026-11-01

[14] [Chrome for Developers, Making collapsed content accessible with hidden=until-found](https://developer.chrome.com/docs/css-ui/hidden-until-found) — folds and find; retrieved 2026-11-01

[15] [Kevin Larson and Mary Czerwinski, Microsoft Research (CHI 98), Web Page Design: Implications of Memory, Structure and Scent for Information Retrieval](https://www.microsoft.com/en-us/research/publication/web-page-design-implications-memory-structure-scent-information-retrieval/) — depth slower; retrieved 2026-11-01

[16] [Panayiotis G. Zaphiris, HFES 2000, Depth Vs Breadth in the Arrangement of Web Links](https://ktisis.cut.ac.cy/bitstream/20.500.14279/2872/6/Zaphiris2000-Depth_Vs_Breath.pdf) — depth drives time; retrieved 2026-11-01

[17] [Greg Wilson, It Will Never Work in Theory, Too Many Knobs](https://neverworkintheory.org/2016/06/09/too-many-knobs.html) — options rarely set; retrieved 2026-11-01

[18] [Leah Findlater and Joanna McGrenere, UBC (CHI 2004), A Comparison of Static, Adaptive, and Adaptable Menus](https://www.cs.ubc.ca/labs/edapt/papers/findlater2004.pdf) — static, adaptable; retrieved 2026-11-01

[19] [Krzysztof Z. Gajos et al. (AVI 2006), Exploring the Design Space for Adaptive Graphical User Interfaces](https://kgajos.seas.harvard.edu/papers/kgajos-avi06.pdf) — copies, rate of change; retrieved 2026-11-01

[20] [Leah Findlater et al., UBC (CHI 2009), Ephemeral Adaptation](https://www.cs.ubc.ca/labs/edapt/papers/findlater2009.pdf) — gradual onset; retrieved 2026-11-01

[21] [Andy Cockburn, Amy Karlson, Benjamin B. Bederson, ACM Computing Surveys, A Review of Overview+Detail, Zooming, and Focus+Context Interfaces](https://www.microsoft.com/en-us/research/wp-content/uploads/2008/01/cockburn-ComputingSurveys09.pdf) — coupling, split attention, zoom; retrieved 2026-11-01

[22] [Apple HIG, Panels](https://developer.apple.com/design/human-interface-guidelines/panels) — inspector against fixed window; retrieved 2026-11-01

[23] [Apple HIG, Split views](https://developer.apple.com/design/human-interface-guidelines/split-views) — selection kept, ways back; retrieved 2026-11-01

[24] [GNOME HIG, Utility Panes](https://developer.gnome.org/hig/patterns/containers/utility-panes.html) — side, overlap; retrieved 2026-11-01

[25] [Android Developers (Google), Canonical layouts](https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts) — narrowing keeps the detail; retrieved 2026-11-01

[26] [Cloudscape (AWS), Split view](https://cloudscape.design/patterns/resource-management/view/split-view/) — empty detail, closed stays closed; retrieved 2026-11-01

[27] [Amy J. Ko et al., IEEE TSE 2006, An Exploratory Study of How Developers Seek, Relate, and Collect Relevant Information](https://faculty.washington.edu/ajko/papers/Ko2006SeekRelateCollect.pdf) — navigation time, lost working sets; retrieved 2026-11-01

[28] [Aurora Harley, NN/g, Proximity Principle in Visual Design](https://www.nngroup.com/articles/gestalt-proximity/) — proximity, reflow; retrieved 2026-11-01

[29] [Aurora Harley, NN/g, The Principle of Common Region](https://www.nngroup.com/articles/common-region/) — containers, false floor; retrieved 2026-11-01

[30] [Mulong Xie et al. (ESEC/FSE 2022), Psychologically-Inspired, Unsupervised Inference of Perceptual Groups of GUI Widgets](https://arxiv.org/abs/2206.10352) — groups from screenshots; retrieved 2026-11-01

[31] [W3C WAI, Understanding Success Criterion 1.3.1: Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html) — grouping in markup; retrieved 2026-11-01

[32] [W3C WAI, Understanding Success Criterion 2.4.10: Section Headings](https://www.w3.org/WAI/WCAG22/Understanding/section-headings.html) — sections headed; retrieved 2026-11-01

[33] [W3C WAI, Understanding Success Criterion 2.4.6: Headings and Labels](https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html) — labels describe; retrieved 2026-11-01

[34] [Evan Sunwall, NN/g, Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/) — separable content, default tab; retrieved 2026-11-01

[35] [Microsoft Learn (Windows apps), Guidelines for app settings](https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings) — disabled with reason, immediacy; retrieved 2026-11-01

[36] [GNOME HIG, Boxed Lists](https://developer.gnome.org/hig/patterns/containers/boxed-lists.html) — row texts by weight; retrieved 2026-11-01

[37] [Apple HIG, Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) — customizable sidebar; retrieved 2026-11-01

[38] [Charlie Aufmann and Maxime Heckel, Linear, A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh) — chrome recedes; the quotation; retrieved 2026-11-01

[39] [Kathryn Reeves, Baymard Institute, Always Display Applied Filters](https://baymard.com/blog/how-to-design-applied-filters) — applied values listed; retrieved 2026-11-01

[40] [Cloudscape (AWS), Empty states](https://cloudscape.design/patterns/general/empty-states/) — empty against no-match; retrieved 2026-11-01

[41] [GNOME HIG, Search](https://developer.gnome.org/hig/patterns/nav/search.html) — search against find; retrieved 2026-11-01

[42] [Katie Sherwin, NN/g, Scoped Search: Dangerous, but Sometimes Useful](https://www.nngroup.com/articles/scoped-search/) — broadest scope; retrieved 2026-11-01

[43] [W3C WAI, Understanding Success Criterion 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — counts as status; retrieved 2026-11-01

[44] [Stephen Few, Perceptual Edge, Dashboard Design for Real-Time Situation Awareness](http://www.perceptualedge.com/articles/Whitepapers/Dashboard_Design.pdf) — watch test, salience, alerts; retrieved 2026-11-01

[45] [PatternFly (Red Hat), Dashboard: design guidelines](https://www.patternfly.org/patterns/dashboard/design-guidelines) — card kinds, non-zero exceptions; retrieved 2026-11-01

[46] [Apple HIG, Search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields) — search beside content; retrieved 2026-11-01
