# 12. Design-system governance and drift

Tokens as contract, component ownership, lint as governance, review dates, deprecation and adoption measurement, and why copies drift.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 12 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

The question: how does an adopted language stay the language the product draws, and how does an agent tell when it has stopped? Rotaris holds the machinery: 175 `--rt-*` tokens in `themes.ts` held to the adopted sheet by a parity test, one component layer guarded by `check-ui-language`, a colour lint, a metric baseline that only shrinks, and the rendered checks. This guide turns the literature on tokens, copies, lint, ownership, status, deprecation and adoption counts into a method (section 4) and checks (section 6) for a change to a token, a theme or a component.

It decides no primary view or its contents (`REQ-SHELL-023`; design README §2) and mints, retires or restates no member of the language. Composition is guide 07's; every argument with the adopted material is in section 8.

## 2. Principles

**A token is a named decision; its meaning is the contract.** A public interchange format went stable in 2025 (a community report, not a W3C Standard); it forbids guessing a type from the value, follows alias chains, reports cycles as errors, constrains names only mechanically, and gives each token a plain-text description [1]. A token chosen because its colour matches breaks in another theme [5]. Alias tokens named by function let light, dark and high contrast exist without hard-coded values [6]; consumers start from semantic tokens [4], and a theme is a set of values for the same names [5]. Hand-kept per-theme files drift [2]; one system keeps high contrast as an override of only what changes [3]. Functional names resist the near-duplicate that presentational names invite [7].

**A broken reference is silent.** A custom property is only syntax-checked at computed-value time, so an undefined `var()` fails with no parse error [8]; a property registered with a syntax falls back to a known initial value instead [9].

**Copies drift, mostly on purpose and sometimes into faults.** In an industrial study 52 % of clone groups were changed inconsistently, 28 % of those by accident, and about 15 % were faults [10]. Three quarters were deliberate, so flagging every difference mostly flags intent; the system whose maintainers searched for duplicates had 10 % accidental [10]. A same-name fork partitions a codebase; the remedy is that a consumer never chooses a version [11]. Style code accretes: deployed applications carried on average 60 % unused selectors [12].

**People do not see drift by eye.** About 40 % of design violations between mock-up and build were layout, and nearly all fell on leaf components, not containers [13]. Developers found about half the injected violations, a tool 96 % [13]; listing what changed between two versions, developers missed about half [14]. Pixel baselines catch what markup snapshots miss [15]. Documentation decays too: 28.9 % of popular repositories cited a code element that no longer existed, for 4.7 years on average [16].

**A system is a product with owners, not a finished file.** Neglect and a library behind production are its usual death [17]; it needs upkeep by a named team [18], and a review date says the whole page was checked [19]. Governance is a path from an unmet need to a released component, so teams do not hack around the system [20]; product compositions (recipes) stay outside the core [21]; a design-to-code mismatch is a system bug, an unjustified product deviation is the product's to remove [22]. Admission tests need and uniqueness, then consistency and assistive-technology testing [23]; a release checklist lists tokens only, every state, 4.5:1 and 3:1, visual regression and a migration [24]. Self-reported success goes with a defined governance process [25]. Components with many minor contributors had more faults and failures, the count the strongest predictor in most of the measures taken [26]; owners approve fit separately from a peer's correctness review [27].

**Status and deprecation are evidence, shown at the point of use.** One system marks only the exception, a trial tag with a time-and-evidence exit [28]; another makes each stage a checklist, with theming through functional variables and zero automated accessibility violations [29]. Deprecation is documented, shipped in a minor release and removed only in a later major [30]; it names its replacement, warns at use, ships an automated migration and is announced ahead [29][31]. Most breaking changes in one ecosystem touched code no client used: measure call sites first [32].

**Lint is governance when it is exact.** Public systems reject raw colour, spacing, type, border and shadow values [33]; disables without a reason, needless or out of scope can be reported [34]. A check blocks the build only with no effective false positives, noisier ones go to review, and a new blocking check follows the fix of existing violations [35]. One system grades token enforcement by domain, colour required first [36]; another files every violation under its domain, so the lint doubles as a coverage measure [37].

**An adoption count is a signal, never a verdict.** Library analytics count insertions and detachments [38]; a code-side count must resolve re-exports or one component counts as several [39], and is a trend only when run on every push to main [40]. Stylesheets can be inventoried into defined, used, unused and unknown custom properties [41]; override counts locate friction [42]. A headline number is skewed by one heavy user and silent on correct use [43].

## 3. Patterns and anti-patterns

Anti-patterns unless marked *(pattern)*; for a pattern the tell is what its absence looks like.

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| A control drawn twice | a variant is needed | a class re-implementing a component | the one layer (seams §8 step 2) [10][11] |
| Token by look | a hue that "fits" | `--rt-ok` painting a lifecycle state | §1.3's table; `--rt-run`, `--rt-wait`, `--rt-done` [5] |
| Primitive reached directly | product CSS | an `--rt-axis-*` step in a rule | the semantic alias (§1.3) [4][6] |
| Theme as a full copy | a theme is added | a second file of every token | `palette({…})` overrides of `rotaris-dim` [2][3] |
| Mode in a name | a token is added | a theme word in an `--rt-*` name | same names, three value sets (`REQ-SHELL-128`) [5] |
| Silent reference | a `var()` typo | a property quietly inherits | lint against the token source [8][9] |
| Two definitions, one name | keyframes, classes | `@keyframes rt-pulse` in two sheets | one definition (§1.8) [11] |
| Stale exception | a lint disable | no reason, or nothing suppressed | a reasoned, counted exception [34][42] |
| Headline adoption | reporting compliance | imports high, composition broken | counts beside `ui-review` (§7.1) [43][48] |
| Review by eye | a shared component changes | one screenshot, a read diff | packs before and after, every view [13][14] |
| Documentation drift | names cited in `docs/design/` | a token or path that is gone | an existence check [16] |
| *(pattern)* Deprecate in stages | retiring a token or prop | renamed in place, or removed at once | mark, warn, migrate, remove [29][30][31] |
| *(pattern)* Status as evidence | a §4.2 gap first drawn | "current" asserted, no check named | named checks as the exit [28][29] |
| *(pattern)* Recipes outside the core | transcript row, folded tool group | compositions in `design-system/` | compose `Tag`, `StatusDot`, `Button` [21] |

## 4. Method

For any change to a token, a theme, a `design-system/` component, or a surface that draws a state.

1. **Find the single home.** For each thing drawn, name the component or token that already states it (§4's inventory, §1's tables). If none does, it is a §4.2 gap and a proposal, not a local drawing [20][23].
2. **Enumerate the copies.** Grep for classes, keyframes and literals that re-implement the home; count real call sites, re-exports resolved to the defining file [32][39].
3. **Diff each copy against the home, value by value.** A difference cites what made it deliberate (a requirement, a directive, a §7 note), or it is accidental [10][22].
4. **Check meaning, not match.** Each colour token answers "which state or identity" from the semantic tier, never a ramp step; no health token on a lifecycle mark [4][5].
5. **Resolve across themes.** Read the computed value in `rotaris-dim`, `nocturne` and `high-contrast`; two meanings that resolve to one value in any theme are one colour [1][5].
6. **Classify the change and its owner.** A layer departing from §1 is the layer's defect, a surface departing from the layer the surface's; a token or component change touches every view it renders in [22][27].
7. **Retire in stages.** Mark with the replacement, warn at use, migrate every call site, then remove; a blocking rule lands with its violations cleared, or the baseline records the debt [29][31][35].
8. **Verify rendered.** Capture before and after in every view the home renders in, at both sizes and three themes; state numbers and the dynamic states not captured [13][14][15].
9. **Record.** A defect note for what was found, the view and its date for what changed; a review date moves only on a whole re-read [19][48].

## 5. Worked example

**Surface:** "Agent list, context rings, inspector", §7's table; nearest built code `AgentTree.tsx`, `ContextRing.tsx`, `Inspector.tsx` in `packages/ui/src/`, styled in `shell.css`; drawn in the Workspace and Mission primary views.

1. **Home.** `REQ-MONITOR-040` and `-052` ask for a state-coloured dot that pulses while the agent is live. The home is `StatusDot` (`design-system/core.tsx`), painting `run`, `wait`, `done`, `fail` from `--rt-run`, `--rt-wait`, `--rt-done`, `--rt-fail` and `idle` from `--rt-info-500` (§4.1).
2. **Copies.** `.agent-row__dot` draws the same dot at `--rt-status-dot-size` by hand in six places: `AgentTree.tsx`, `AgentTable.tsx`, `Inspector.tsx` twice, `MissionView.tsx`, `PersonaWindow.tsx`. §7.2 left it on 2026-09-09 because it rendered identically [48].
3. **Diff.** `done` takes `--rt-ok`, not `--rt-done`; `failed` takes `--rt-danger-300`, not `--rt-fail`; `idle` takes `--rt-text-tertiary`, not `--rt-info-500`; `cancelled` takes `--rt-warn`; the pulse runs at `--rt-duration-slow` where §1.8's `.status-dot.is-pulsing` cycles at 1.6 s. No requirement or note cites any of the five: by step 3, accidental.
4. **Meaning.** `--rt-ok` and `--rt-warn` are the health family, which §1.3 never mixes with the lifecycle family on one surface; the agent list mixes them.
5. **Themes.** `themes.ts` resolves `--rt-ok` and `--rt-run` to one axis Y step in all three themes (§7.3), so done and running differ only by the pulse.
6. **Owner.** The layer is right and the surface departs from it, so the defect is the surface's: `docs/defects/the-agent-rows-hand-drawn-status-dot-paints-done-in-the-running-hue.md`, which also records `@keyframes rt-pulse` reaching the renderer twice, in opposite phases.
7. **Retire.** Tests that pin the copy (`persona-run-cancel.test.ts` asserts `agent-row__dot--running`) are call sites too; an authorized repair moves them with it.
8. **Verify.** A repair is read in `ui-review` packs of Workspace and Mission, before and after, with a running, a done and a failed agent at once — one capture shows one state — and each dot's computed background and `getAnimations()` duration stated.
9. **Record.** The note exists; §7.2 stays as written, and D12-11 asks what follows.

## 6. Checks

Read from the `pnpm ui-review` pack, the DOM or the source; a rubric id marks what the rubric carries.

- **C6** — every state dot's computed background equals that of the token §1.3 names for its state; no `--rt-ok` or `--rt-warn` on a lifecycle mark; done and running differ in hue in all three themes [5].
- **C9** — every infinite animation on a status dot reports 1.6 s in `document.getAnimations()`; `@keyframes rt-pulse` is defined once in what the renderer loads [11].
- **Proposed, one home** — every state dot sized by `--rt-status-dot-size` in the DOM carries `data-ui-component="StatusDot"`; the count without it is stated, each copy listed by file [10][39].
- **Proposed, token parity** — the parity test in `contracts.test.ts` passes, and every `var(--rt-*)` in the built CSS is defined in `themes.ts`: zero unknown, the unused listed [8][41].
- **Proposed, theme delta** — `nocturne` and `high-contrast` set only the names they override; the override count per theme is stated [2][3].
- **Proposed, literal debt by domain** — `ui-language-baseline.json`'s total per category (`css-metric` 677, `css-motion` 6, `inline-metric` 7 on 2026-11-02) never rises between landed heads [37][40].
- **Proposed, exceptions** — every disable of a design-language rule carries a reason and suppresses a real violation; their count is stated [34][42].
- **Proposed, record references** — every `--rt-*` name, component and path cited in `docs/design/` and this corpus exists [16].
- **Proposed, change review** — a `design-system/` component change attaches before-and-after packs for every view it renders in [14][15].
- **Proposed, gap status** — a G1–G16 component, when first drawn, states its status and the checks its exit needs: `ui-audit` contracts, `theme-proof` floors, `REQ-SHELL-144..168` [24][28][29].

## 7. How this applies here

**Requirements.** `REQ-SHELL-023`; `REQ-SHELL-036` (five colour groups, one state colour per group); `REQ-SHELL-128`, `REQ-SHELL-129` (three themes and their tokens); `REQ-SHELL-144`, `REQ-SHELL-145` (contrast floors, the tokens' contrast guarantees); `REQ-MONITOR-040`, `REQ-MONITOR-052` (the agent's dot); `REQ-NOTIFY-048`.

**Directives.** `PD-CHAT-005` (a persona's colour from `--rt-viz-*`, §7.3).

**Tokens.** `--rt-run`, `--rt-wait`, `--rt-done`, `--rt-fail`, `--rt-ok`, `--rt-warn`, `--rt-danger-300`, `--rt-info-500`, `--rt-fill-x`, `--rt-fill-y` and their `-ink` pairs, `--rt-text-tertiary`, `--rt-status-dot-size`, `--rt-duration-slow`, `--rt-surface-2`.

**Components.** `StatusDot`, `Tag`, `Button`, `SegmentedControl`, `ContextRing`; gaps G1–G16 of §4.2.

**Mechanisms.** `tools/check-ui-language.mjs`, `tools/ui-language-baseline.json`, `tools/check-theme-colours.mjs` [51]; the parity test in `packages/contracts/src/contracts.test.ts` [52]; `pnpm ui-review`, `pnpm ui-audit`, `pnpm theme-proof`.

**The record's lessons**, as experience: "the tokens hold but composition breaks" (§7.1) [48]; UIR-001..012, UIR-005 among them, the adopted sheet disagreeing with §1.2 [49]; "bound the box, not only the child", and reading the source before filing an invention (`review-ui` step 6) [50]; "a copy kept for a second harness is the copy that drifts" [53].

| Derivative | Reads |
|---|---|
| `build-ui` step 3 (tokens, variants, literal debt) | §3; §4 steps 1–4 and 7 |
| `design-ui` brief step 9 (components; gaps to §4.2) | §4 steps 1–2; §3 |
| `design-ui` audit step 2 | §6 |
| rubric rows C6, C9 | §2 for the reasoning, §6 for the measures |
| `review-ui` step 6 (read the source) | §4 steps 3–5; §6 |
| `debug-ui`, a copy or token repair | §4 steps 2–8 |

No dated notes yet.

## 8. Where this disagrees with the adopted material

**D12-1 —** *Claim:* the coded components and a token repository are the source of truth; design tools and documentation work from them [44]. *Adopted:* design README §1–§2, `docs/design/` authoritative; §1.12, `tokens/colors.css` authoritative. *Question:* where `themes.ts` and the adopted sheet disagree, which governs, and is the one-way parity test the whole answer?

**D12-2 —** *Claim:* a widely used model hands each consumer an editable copy of a component's source [45]. *Adopted:* `AGENTS.md`, a design-equivalent control exists only in `packages/ui/src/design-system/`. *Question:* is the rule's reason, the measured drift of copies [10], recorded beside it?

**D12-3 —** *Claim:* a product team may own an interim component outside the core when its deadline cannot wait [46][22]. *Adopted:* the same single-home rule, enforced by `check-ui-language`; seams §8 step 2. *Question:* while a G1–G16 gap is unfilled, where does a surface's sanctioned interim drawing live, and how is it marked?

**D12-4 —** *Claim:* the tokens consumers pick should state their meaning, leaving intent-free names to primitives [5][4]. *Adopted:* §1.3, the axis colours; `--rt-fill-x`, `--rt-fill-y` and their `-ink` pairs name the axis and are read directly by `.tag-run`, `.tag-wait` and `shell.css`. *Question:* should the fill tokens reach consumers through names that state waiting and running?

**D12-5 —** *Claim:* one team reduced each theme to three generated inputs, contrast continuous [47]. *Adopted:* `REQ-SHELL-128`, three built-in themes. *Question:* is a generator worth recording as a way to produce the three, without changing their number?

**D12-6 —** *Claim:* an outgoing item stays visible during a transition, marked with its reason and replacement; about a third of one survey's subscribers could not tell what was old [1][25]. *Adopted:* `AGENTS.md`, a rule that outlives its convention is deleted, not annotated. *Question:* does that convention extend to `--rt-*` tokens and component props, or do they take a deprecated stage?

**D12-7 —** *Claim:* stylistic findings frustrate when they block the build; they belong in review [35]. *Adopted:* `check-ui-language` fails `pnpm lint` inside `pnpm check`. *Question:* which design-language checks are exact enough to block, and which belong to `review-ui`?

**D12-8 —** *Claim:* a production system grades token enforcement by domain, colour required, space and shape strongly recommended [36]. *Adopted:* `AGENTS.md` on §1, cite the token by name, never a literal colour or pixel value; the tooling already grades, colour exact, metrics on a 690-occurrence baseline [51]. *Question:* should the adopted text say that the pixel half is on a burn-down?

**D12-9 —** *Claim:* a new blocking check is enabled only after every existing violation is fixed [35]. *Adopted:* `build-ui` step 3, literal debt added or burned down through `ui-language-baseline.json`. *Question:* is a baseline that admits standing debt the record's chosen trade, and where is that choice written?

**D12-10 —** *Claim:* a mismatch between the design library and the coded components is a system bug [22], and a consumer should never have a choice of version [11]. *Adopted:* §1.2, `components.css` line 65's `.seg-opt.is-active` left as imported, the product overriding it; §1.12, a specimen card's chroma left differing. *Question:* should a known divergence inside the adopted sheet be carried as a defect note rather than as a paragraph of §1?

**D12-11 —** *Claim:* copies diverge, mostly by intent but measurably by accident and into faults [10]. *Adopted:* §7.2, `.agent-row__dot` "deliberately left" as a refactor with no visible effect. *Question:* now that the copy paints done from `--rt-ok` and pulses at `--rt-duration-slow` (section 5), does §7.2's reason still hold?

## 9. References and further reading

[1] [W3C Design Tokens Community Group, Design Tokens Format Module 2025.10](https://www.designtokens.org/TR/2025.10/format/) — types, aliases, cycles, `$deprecated`, `$description`; retrieved 2026-11-01
[2] [W3C Design Tokens Community Group, Design Tokens specification reaches first stable version](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/) — hand-kept files drift; retrieved 2026-11-01
[3] [GitHub (Primer), primer/primitives](https://github.com/primer/primitives) — high contrast as an override file; retrieved 2026-11-01
[4] [Adobe Spectrum, Design tokens](https://spectrum.adobe.com/page/design-tokens/) — tiers; semantic first; retrieved 2026-11-01
[5] [Atlassian Design System, Design tokens](https://atlassian.design/foundations/tokens/design-tokens) — meaning over match; themes; retrieved 2026-11-01
[6] [Microsoft Fluent 2, Design tokens](https://fluent2.microsoft.design/design-tokens) — global and alias tokens; retrieved 2026-11-01
[7] [A List Apart (Alla Kholmatova), The language of modular design](https://alistapart.com/article/language-of-modular-design/) — functional names; retrieved 2026-11-01
[8] [W3C (editor Tab Atkins Jr.), CSS Custom Properties for Cascading Variables Module Level 1](https://www.w3.org/TR/css-variables-1/) — computed-value-time validity; retrieved 2026-11-01
[9] [W3C CSS Working Group, CSS Properties and Values API Level 1](https://www.w3.org/TR/css-properties-values-api-1/) — registered syntax; retrieved 2026-11-01
[10] [Juergens et al. (ICSE 2009), Do Code Clones Matter?](https://arxiv.org/abs/1701.05472) — clones, faults, intent; retrieved 2026-11-01
[11] [Titus Winters (O'Reilly), Software Engineering at Google, Chapter 16](https://abseil.io/resources/swe-book/html/ch16.html) — the one-version rule; retrieved 2026-11-01
[12] [Mesbah, Mirshokraie (ICSE 2012), Automated Analysis of CSS Rules to Support Style Maintenance](https://people.ece.ubc.ca/amesbah/resources/papers/icse12.pdf) — unused selectors; retrieved 2026-11-01
[13] [Moran et al. (ICSE 2018), Automated Reporting of GUI Design Violations for Mobile Apps](https://arxiv.org/abs/1802.04732) — violations, human recall; retrieved 2026-11-01
[14] [Moran et al. (ASE 2018), Detecting and Summarizing GUI Changes in Evolving Mobile Apps](https://arxiv.org/abs/1807.09440) — missed changes; retrieved 2026-11-01
[15] [Storybook, Visual tests](https://storybook.js.org/docs/writing-tests/visual-testing) — pixel baselines; retrieved 2026-11-01
[16] [Tan, Wagner, Treude (arXiv), Detecting Outdated Code Element References in Software Repository Documentation](https://arxiv.org/abs/2212.01479) — outdated references; retrieved 2026-11-01
[17] [Brad Frost, Atomic Design, Chapter 5: Maintaining design systems](https://atomicdesign.bradfrost.com/chapter-5/) — neglect, friction; retrieved 2026-11-01
[18] [Nielsen Norman Group (Therese Fessenden), Design Systems 101](https://www.nngroup.com/articles/design-systems-101/) — continuous upkeep; retrieved 2026-11-01
[19] [NHS digital service manual, Reassure users that a page is up to date](https://service-manual.nhs.uk/design-system/patterns/reassure-users-that-a-page-is-up-to-date) — whole-page review dates; retrieved 2026-11-01
[20] [Brad Frost, A design system governance process](https://bradfrost.com/blog/post/a-design-system-governance-process/) — need to release; retrieved 2026-11-01
[21] [Brad Frost, Design system components, recipes, and snowflakes](https://bradfrost.com/blog/post/design-system-components-recipes-and-snowflakes/) — recipes; retrieved 2026-11-01
[22] [Brad Frost, "The design system isn't working for me!" Design system governance: bugs, design discrepancies, features, and recipes](https://bradfrost.com/blog/post/design-system-governance-bugs-design-discrepancies-features-and-recipes/) — request ownership; retrieved 2026-11-01
[23] [GOV.UK Design System, Contribution criteria](https://design-system.service.gov.uk/community/contribution-criteria/) — admission tests; retrieved 2026-11-01
[24] [IBM Carbon Design System, Component checklist](https://carbondesignsystem.com/contributing/component-checklist/) — the stable gate; retrieved 2026-11-01
[25] [Sparkbox, Design Systems Survey 2022 (fifth edition)](https://designsystemssurvey.seesparkbox.com/) — governance and success; unclear status; retrieved 2026-11-01
[26] [Bird et al. (ESEC/FSE 2011), Don't Touch My Code!](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/bird2011dtm.pdf) — minor contributors; retrieved 2026-11-01
[27] [Manshreck, Sadowski (O'Reilly), Software Engineering at Google, Chapter 9](https://abseil.io/resources/swe-book/html/ch09.html) — owner approval; retrieved 2026-11-01
[28] [GOV.UK Design System, Government Digital Service, Component lifecycle statuses](https://design-system.service.gov.uk/community/component-lifecycle-statuses/) — trial and its exit; retrieved 2026-11-01
[29] [GitHub Primer, Component lifecycle](https://github.com/primer/design/blob/main/content/guides/component-lifecycle.mdx) — stage criteria; deprecation; retrieved 2026-11-01
[30] [Tom Preston-Werner, Semantic Versioning 2.0.0](https://semver.org/) — deprecate, then remove; retrieved 2026-11-01
[31] [Shopify Polaris, Deprecation guidelines](https://github.com/Shopify/polaris/blob/main/documentation/Deprecation%20guidelines.md) — warn at use; migration; retrieved 2026-11-01
[32] [Ochoa et al., Breaking Bad? Semantic Versioning and Impact of Breaking Changes in Maven Central](https://arxiv.org/abs/2110.07889) — measure use first; retrieved 2026-11-01
[33] [GitHub (Primer), primer/stylelint-config](https://github.com/primer/stylelint-config) — raw values refused; retrieved 2026-11-01
[34] [Stylelint, Options](https://stylelint.io/user-guide/options) — reporting disables; retrieved 2026-11-01
[35] [Sadowski et al. (CACM 61(4)), Lessons from Building Static Analysis Tools at Google](https://storage.googleapis.com/gweb-research2023-media/pubtools/4365.pdf) — what blocks; retrieved 2026-11-01
[36] [Atlassian Design System, ensure-design-token-usage](https://atlassian.design/components/eslint-plugin-design-system/ensure-design-token-usage/usage) — graded domains; retrieved 2026-11-01
[37] [Shopify (archived 2026-09-11), stylelint-polaris](https://github.com/Shopify/polaris/tree/main/stylelint-polaris) — violations by domain; retrieved 2026-11-01
[38] [Figma, View and explore library analytics](https://help.figma.com/hc/en-us/articles/360039238353-View-and-explore-library-analytics) — insertions, detachments; retrieved 2026-11-01
[39] [Zeplin (Omlet documentation), Omlet vs. React Scanner](https://github.com/zeplin/omlet/blob/main/docs/faqs/omlet-vs-react-scanner.md) — resolving re-exports; retrieved 2026-11-01
[40] [Zeplin (Omlet documentation), Set up regular scans](https://github.com/zeplin/omlet/blob/main/docs/cli/set-up-regular-scans.md) — a trend needs every push; retrieved 2026-11-01
[41] [Project Wallace (Bart Veneman), css-analyzer](https://github.com/projectwallace/css-analyzer) — property inventory; retrieved 2026-11-01
[42] [Omlet blog (Patrick Suzuki), Data Driven Design Systems in Practice](https://omlet.dev/blog/data-driven-design-systems-in-practice/) — override counts; retrieved 2026-11-01
[43] [Omlet blog (Pelin Kenez), How Workday uses data for Canvas Design System](https://omlet.dev/blog/how-workday-uses-data-for-canvas-design-system/) — headline limits; retrieved 2026-11-01
[44] [Brad Frost, The design system ecosystem](https://bradfrost.com/blog/post/the-design-system-ecosystem/) — code as source of truth; retrieved 2026-11-01
[45] [shadcn/ui, Introduction](https://ui.shadcn.com/docs) — owned copies; retrieved 2026-11-01
[46] [Brad Frost, Don't put crap in the design system](https://bradfrost.com/blog/post/dont-put-crap-in-the-design-system/) — interim work; retrieved 2026-11-01
[47] [Linear, How we redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui) — generated themes; retrieved 2026-11-01
[48] [Rotaris record, design README §7.1–7.4](../../design/README/07-7-fidelity-consult-before-maintain-after.md) — §7.1, §7.2, §7.3; retrieved 2026-11-02
[49] [Rotaris record, critic findings repaired](../../architecture/codebase/17-all-twelve-critic-findings-repaired-and.md) — UIR-001..012; retrieved 2026-11-02
[50] [Rotaris record, build-ui steps 3 and 8](../../../.agents/skills/build-ui/SKILL.md) — literal debt; bound the box; retrieved 2026-11-02
[51] [Rotaris record, tools/check-ui-language.mjs](../../../tools/check-ui-language.mjs) — the guard, its baseline, the colour lint; retrieved 2026-11-02
[52] [Rotaris record, packages/contracts/src/contracts.test.ts](../../../packages/contracts/src/contracts.test.ts) — the parity test; retrieved 2026-11-02
[53] [Rotaris record, AGENTS.md](../../../AGENTS.md) — one layer; a copy drifts; deleted, not annotated; retrieved 2026-11-02
