# 01. How AI design tools design applications

How v0, Lovable, Figma Make, Stitch and Claude Design-class tools decompose a brief, what their system prompts pin and leave to the model, how to brief an agent for design, and why generated interfaces converge.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 01 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

The question: what do generative design tools' published practice and the research on their output say about what to pin before an agent draws a surface, how to brief it, and how to check what it made? The answer shapes the `design-ui` brief and the `build-ui` and `review-ui` loops.

Out of scope: the generated look's tells (guide 02), composition (07), critique method (11). It decides no token, rule, component, primary view, tab, order or label; a source's "screen" or "page" is read as a surface inside one primary view.

Sources: vendors' self-description, seldom measured, and studies, several of them preprints.

## 2. Principles

1. **Unguided generation lands on the centre of its training data.** A vendor says its model "samples from this high-probability center": one face family, purple gradients on white [1]. Across five tools layout and appearance converge more than colour [24]; prototypes rate usable but conventional (n = 92) [28]; models fixate on a narrow design region [29]; groups using a model grow more alike [30]; frictionless generation is argued to deepen it [23].
2. **What sits in context is what comes out.** v0 is trained on a library's default components and warns that customised ones surprise it [3]; NN/g traces generic styling to such defaults [12]; Figma's first generator reproduced a real app once unvetted examples of it sat in context [19]. A published app-builder system prompt pins tooling and nothing of layout, type or colour [22].
3. **The tools pin the design system before the brief.** Claude Design builds one from code and design files and applies it to every later project [14]; Stitch passes it by id and bars colour, font and radius values from the generation prompt [48]; v0 uses no token or component it cannot verify from the source [4]; output quality tracks the source's [17].
4. **Components beat prose.** A registry of pre-built components gave 95.08 percent compliance, the best of three strategies [25]; Atlassian's generators invented icons, token names and sizes until templates and structured configuration were added [8]. Code models invent packages (5.2 percent or more commercial, 21.7 open) [41]; a missing token is one an agent invents, which one linter flags [10].
5. **Guidance is middle-altitude, short and routed.** Neither bare values nor taste words [1]; each value with its reason [10], which a token format can carry as a typed value and a description [50]; a root file routing to short files read on demand [6]; a skill of about 400 tokens loaded only for frontend work [1]. More context is not better [7]; models drop instructions silently as they multiply (best 68.9 percent at 500) [37] and use the middle of a long context worst [38].
6. **Restating rules can backfire.** A rule list with right and wrong examples raised accessibility violations above naive generation [35]; naming a forbidden thing can prime it (single-author preprint) [39]. Vendors still name defaults to avoid [2]; the two agree when a ban travels with its positive rule and a check.
7. **A brief is specific, real and bounded.** Language first, one region and one change at a time, point at the element, real content, name what must not change [13]; precise vocabulary [21]; name components, audience and sizes [17]. Prompts listing states and edge cases came closest, yet missed spacing, grouping and hierarchy [12][15]. Designers write short adjective briefs (n = 10) [31]; a structured specification beat free text [32]; models ask poor clarifying questions [33].
8. **A generator's account of its work is not evidence.** One stated rationale in four is not fully built, worst for behaviour (0.66) [24]; system status, user control and error recovery reach 0.38 for the best tool [24]. With tokens grounded, misses are fine colour, spacing and radius [26]; layout is the weak axis [36]; even the best outputs keep composition faults [12].
9. **Checking reads render and source together, in the loop.** A dual-stream checker reached 92.1 percent recall against 32.3 code-only, and its repairs raised rated attractiveness from 3.04 to 3.92 (n = 26) [27]; a judge agreed with experts 90.95 percent with screenshots across an interaction, 79.06 without [44]; checker feedback beat up-front instructions (0.292 against 0.386 inaccessibility) [35]. Design systems now offer agents token lookup and a CSS lint [9]; one rule set ships for generation and as a review skill [11].
10. **Model critique helps and decays.** It catches subtle faults and improves copy, less with each iteration [34]; real designer critiques as examples improve it [42]; iteration gains are small and early [33]; judgements of ease of use sit near chance [43].
11. **Dense tool surfaces and the chat pattern (here the transcript and the composer) are where defaults reassert.** One tool skips style questions for dashboards — the inference is the researchers' [16]; redesigned conversational features converged on the chat window (n = 14) [45]. Drift-prevention claims are unmeasured [20], and people feel less responsible for model-assisted work [30].

## 3. Patterns and anti-patterns

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Pin the language first [14][48] | every surface | absent: a generic dark panel, a stock sans, literal hex | §1 and `docs/design/system/tokens/` loaded before the brief; `build-ui` step 1 |
| Compose from the registry [25] | filling a region | absent: a hand-drawn control | `packages/ui/src/design-system/`; `tools/check-ui-language.mjs` |
| Library-default attractor [3][12] | any control written from memory | a dialog or button of the stock library's shape; a radius off the scale | `Dialog`, `ConfirmDialog`, `Button`; §1.6 radii |
| Reference copied as structure [19][12] | a mockup or frame in context | a region, tab or label no cited requirement names | §2; `REQ-SHELL-023`; mockup read for craft |
| Unverified names [4][8][41] | any token, icon, component | an `--rt-*` name absent from the tokens; an unknown `ph-*` | the token source; §1.9; the 27-component inventory; `review-ui` step 6 |
| Generic word, stock pattern [12][45] | briefing in loose words | "chat", "feed", "alert" drawn as their stock forms | the glossary: transcript, row, notice, acknowledgement |
| Rule list as brief [37][35] | a long brief | restated tokens; a constraint silently missing | cite § and REQ; binding constraints first and last |
| Prohibition alone [39][2] | the negative list | "no gradients" with no positive rule | §1.7 flat elevation, the `--rt-hairline-width` hairline, beside the ban |
| Real content [13][15] | every brief | absent: lorem, "600K+", a short path | §1.11 exact mono numbers, `--rt-font-mono` |
| Named states [24][15] | every region | absent: only the happy path | `REQ-MONITOR-105` statuses; rubric F2 |
| Self-report as evidence [24] | a handoff | "matches the design" with no pack | `pnpm ui-review`, `pnpm ui-audit`; `build-ui` step 7 |
| Check in the loop [27][44][35] | after each draw | absent: judged from component code | layout contracts, `pnpm theme-proof`, `pnpm app:drive shot` |
| Element-level refinement [14][48][13] | a near result | absent: the view redrawn for one fault | `debug-ui`; one change per pass |
| Lock language, vary composition [47] | exploring an undrawn region | variants differing in colour or face | §1 fixed; layout varies within specified regions |
| Every row a card (record, §7.1) | dense lists | identical boxes for different content | §7.1–7.2; earned surfaces; rubric C5 |

## 4. Method

For an agent briefing or drawing a surface; the `design-ui` brief template holds what the steps fill.

1. **Pin before briefing.** Load §1, the token source and the inventory by reference; name the theme. Paste neither the 175 tokens nor the mockup [7][48].
2. **Fix the structure as data.** List the requirement and directive ids, the §7 row and what may not change: the views, labels, shortcuts and order (`REQ-SHELL-023`, `REQ-SHELL-027`, `REQ-SHELL-049`), every built region [8][13].
3. **Write in a fixed order** [46][32]: one line of purpose; a required pointer to the language; the regions the requirements name; states and edge cases per region; real content in the copy voice; the components by name; the untouchables. Binding constraints go first and are restated in one line at the end [38]; what the component layer and the lint enforce is left out [37][7].
4. **Name every element** in the glossary's word and every value by its token name, never a size word [21][12].
5. **Settle the open choices** — which component, which state colour, which pane becomes an overlay drawer below 1180 px. One the specification cannot settle is an open question, not a guess [33].
6. **Draw one region or one component per pass**, one change per prompt; refine a near result at the element [13][14].
7. **Check inside the loop.** `pnpm lint` (`check-ui-language`, `check-theme-colours`), `pnpm ui-audit`, `pnpm theme-proof`; feed each finding back before reporting [35][5][18].
8. **Judge from frames across a journey step and from source together** — before and after a click, during a stream [44][27].
9. **Weigh the critic.** Ground it in the record's own findings; cap it at three iterations; treat its usability verdicts as weak beside the deterministic findings [42][33][43].
10. **Compare with the sibling views and the mockup's craft**, not alone, since convergence shows across outputs and not within one [24][30].
11. **Report numbers from the pack**, never the builder's description of its work [24].

## 5. Worked example

**Surface:** §7 row "Transcript rows, run header"; mockup `WORKSPACE` → `transcript column`; nearest built code `packages/ui/src/transcript/Row.tsx`, `packages/ui/src/TranscriptSurface.tsx`, `packages/ui/src/RunHeader.tsx`.

The generator's default here is the chat window [45]; the record paid for a quieter form of it — "the tokens hold but composition breaks", every row a card (`docs/design/README/07-7-fidelity-consult-before-maintain-after.md` §7.1).

1. **Pin.** §1; theme `rotaris-dim`; the inventory's `Tag` and `StatusDot` for the run header's state (§7.2 item 6).
2. **Structure.** `REQ-CHAT-046` fixes twelve row categories, the folded tool group among them; `REQ-CHAT-057` the 52 px timestamp and 112 px role columns, the 30 px minimum row, attribution on a block's first row; `REQ-CHAT-060`–`REQ-CHAT-062` the tool and reasoning one-liners and the `INPUT`/`OUTPUT` card; `REQ-CHAT-175` and `REQ-CHAT-177` the description as header at every verbosity stop; `PD-CHAT-004` the activity line; `PD-CHAT-005` the persona colour and the indent. Untouchable: these geometries, the rail, the composer.
3. **Order.** Purpose (reading a run as it streams); the §1 pointer; regions (run header, rows, folded group, card); states; content; components; untouchables, restated last.
4. **States, named.** Tool row `running`, `ok`, `failed`, `blocked` (`REQ-MONITOR-105`); reasoning streaming and finished; a group folded and open; a row whose description is cut at 120 code points.
5. **Real content.** `▸ Runs npm test … ok · 3.2s`; `▸ reasoning · 12s · ~3,400 tok`; two personas at once; a delegated agent two levels down; a long path.
6. **Earned surfaces, decided.** `.row--user` on `--rt-accent-tint-07`; `.tool__card` on `--rt-surface`; approval and diff rows a panel with a rail; every other row on `--rt-bg`, separated by `--rt-divider`. Persona colours from `--rt-viz-1` … `--rt-viz-6` (§7.3).
7. **Check.** `pnpm rows-proof` still measures 52, 112 and 30 px; `spacing-token` relations on the row margins; animations limited to the pulsing `StatusDot`.
8. **Judge.** `pnpm app:drive shot` before and after expanding a tool row and during streaming reasoning, at 1400×900 and 1000×680, beside the mockup's column.
9. **Report** counts: bordered boxes per frame, filled controls, measured columns.

## 6. Checks

Each is answerable from the `pnpm ui-review` pack or the DOM; a rubric id marks one the rubric carries, "proposed" one it does not.

- No literal colour or pixel value in the change; every colour resolves to an `--rt-*` name present in `packages/contracts/src/theme/themes.ts` [4][18] (C6; the lint).
- Every control is an export of `packages/ui/src/design-system/`; no imported pattern outside the inventory [25][3] (O1).
- Every icon is a `ph-*` class the bundle holds; no emoji; at most one coloured icon per row [6] (C8, C6).
- Every computed radius is the value of one `--rt-radius-*` token, §1.6 [26] (proposed).
- Every computed font weight is one of §1.4's three; one primary element per region, §1.4 (C1).
- Every repeated gap is one spacing token, the same relationship the same token (C2); one left edge per region [26][12] (C3).
- At most one filled control per dense view, §1.7 (D3).
- The bordered or filled boxes per region equal the earned set the brief lists; for the transcript, only the user row, the expanded card, approval and diff rows, §7.2 (C5).
- Each state the brief names has a PNG, and each says what it is [24][15] (F2).
- `document.getAnimations()` lists only status dots and the spinner, §1.8 (C9).
- No `SHRUNK` or `CONTAINMENT` finding at 1000×680 or across 1180 and 1080 px [36] (D4).
- Contrast floors from `pnpm theme-proof`; one `--rt-focus` ring of `--rt-focus-ring-width` on every focus stop [35] (F3).
- No string carries a glossary *Avoid* word [12] (F4).
- Distinct content gets distinct treatment against the neighbouring view (O2); no tell from guide 02 [24][30] (D1).
- No region, tab or label absent from the requirement ids the brief cites [19] (proposed).
- The handoff states numbers measured from the pack, not the builder's account [24] (proposed).
- The brief carries token names and no token values [48] (proposed).

## 7. How this applies here

**Requirements.** `REQ-SHELL-023`, `REQ-SHELL-027`, `REQ-SHELL-049` (the fixed structure); `REQ-SHELL-047`, `REQ-SHELL-059` (the 1180 and 1080 px thresholds); `REQ-SHELL-144`, `REQ-SHELL-145`, `REQ-SHELL-148`, `REQ-SHELL-149` (contrast, focus, never colour alone); `REQ-SHELL-135` (reduced motion); `REQ-CHAT-046`, `REQ-CHAT-057`, `REQ-CHAT-060`, `REQ-CHAT-061`, `REQ-CHAT-062`, `REQ-CHAT-175`, `REQ-CHAT-177`; `REQ-MONITOR-105`.

**Directives.** `PD-CHAT-004` (the activity line), `PD-CHAT-005` (persona colour, indent).

**Tokens.** `--rt-bg`, `--rt-surface`, `--rt-divider`, `--rt-border-strong`, `--rt-accent-tint-07`, `--rt-accent-tint-14`, `--rt-run`, `--rt-wait`, `--rt-done`, `--rt-fail`, `--rt-focus`, `--rt-viz-1` … `--rt-viz-6`, `--rt-font-mono`, `--rt-weight-medium`, `--rt-space-4`, `--rt-radius-md`.

**Components.** `Button`, `Tag`, `StatusDot`, `Spinner`, `Dialog`, `ConfirmDialog`.

**The record's lessons**, as experience: §7.1; UIR-001..012, each a number before and after (`docs/architecture/codebase/17-all-twelve-critic-findings-repaired-and.md`); "bound the box, not only the child" (`.agents/skills/build-ui/SKILL.md` step 8); the critic that filed an adopted token as an invention (`.agents/skills/review-ui/SKILL.md` step 6).

**Who reads which section.**

| Derivative | Reads (this guide's sections) |
|---|---|
| `design-ui` brief steps 1 and 12 | 4, steps 1–5 |
| `design-ui` brief §9, §11 | 3, rows 2–5; 6 |
| `design-ui` brief §10 | 8 |
| `design-ui` audit step 2 | 3 |
| rubric D1 | 3; 6 |
| `build-ui` steps 1, 2, 6, 7 | 4, steps 1, 6–8 |
| `review-ui` steps 4 and 6 | 6; 2, items 8–10 |

No dated notes yet.

## 8. Where this disagrees with the adopted material

**D01-1 —** *Claim:* one vendor reports its model converging on Space Grotesk once common faces are excluded, while also suggesting that face [2]; the same vendor names purple gradients on white as the colour default [1]. *Adopted:* §1.4 sets `--rt-font-display` to Space Grotesk; §1.2 makes violet (`--rt-accent`) the one accent (never a gradient, on a neutral dark ground). *Question:* should the record state why these two were chosen, so that no reader or critic takes them for a generator's default?

**D01-2 —** *Claim:* the vendors' general anti-convergence guidance asks for extreme weight contrast, 100/200 against 800/900, and size jumps of three times or more [1][2]. *Adopted:* §1.4, three weights only, nothing above `--rt-weight-medium`, hierarchy by size, colour and space. *Question:* when an agent carries a globally installed frontend-aesthetics skill advising this, which governs, and where is that precedence stated for it?

**D01-3 —** *Claim:* the same guidance prefers atmospheric backgrounds of layered gradients and geometric patterns to solid colour [2][1]. *Adopted:* §1.1 flat neutral ground; §1.7 forbids gradient fills; §1.10 grid motif behind empty states only. *Question:* does §1.7's list suffice against such skills, or does the precedence of `docs/design/` need stating for backgrounds too?

**D01-4 —** *Claim:* the same guidance recommends one orchestrated load animation with staggered reveals [2][1]. *Adopted:* §1.8, no animation in conversation content, motion for status indicators only. *Question:* is a primary view's arrival "conversation content" or outside §1.8's scope, and does §1.8 forbid an entrance animation of a view as a whole?

**D01-5 —** *Claim:* an anti-generic style skill for the same class of tool asks that every active component have an infinite loop state and replaces circular spinners with placeholders shaped like the final layout [49]; it agrees with no emoji, one accent and mono numbers. *Adopted:* §1.8 permits exactly two infinite animations, the 1.6 s pulse and the 0.8 s spinner; the inventory's `Spinner`. *Question:* is `Spinner` the loading indicator §1.8 intends inside dense views, or is a layout-shaped placeholder outside what §1.8 counts as animation?

**D01-6 —** *Claim:* multimodal models judging screenshots come near human averages on trust and visual hierarchy but sit near chance on ease of use (correlations −0.05 to 0.23) [43]. *Adopted:* `review-ui`, a report-only critic over screenshots, scores rubric F1 and D3 (`AGENTS.md`, "The design language"). *Question:* what weight may a model critic's usability finding carry, and should one require a journey walk or a deterministic observation beside it before it is filed?

**D01-7 —** *Claim:* exposure to examples raises conformity, late exposure without a creativity gain [40]; a linked design reference transmits its structure most faithfully [12]; examples in context were reproduced [19]. *Adopted:* §2 and §7, the mockup read "for craft, never for structure" as the consult-before step; `build-ui` step 1. *Question:* does intent alone keep the mockup's structure out of a surface, and what check would show that a surface took a region from `docs/design/mockup/` rather than from `REQ-SHELL-023` and its neighbours?

## 9. References and further reading

[1] [Anthropic, Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills) — convergence, altitude, weights; retrieved 2026-11-01
[2] [Anthropic, Prompting for frontend aesthetics](https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics) — negative lists, Space Grotesk, backgrounds, motion; retrieved 2026-11-01
[3] [Vercel, Design systems (legacy registry guide)](https://v0.app/docs/design-systems-legacy) — trained on library defaults; retrieved 2026-11-01
[4] [Vercel, Design Systems 2.0](https://v0.app/docs/design-systems-2) — verified sources only; retrieved 2026-11-01
[5] [Vercel, Introducing the v0 composite model family](https://vercel.com/blog/v0-composite-model-family) — pinned scaffolding; retrieved 2026-11-01
[6] [Figma, Write design system guidelines for Make kits](https://help.figma.com/hc/articles/43602393097239) — routed short files; retrieved 2026-11-01
[7] [Figma, Add guidelines to Figma Make](https://help.figma.com/hc/en-us/articles/33665861260823-Add-guidelines-to-Figma-Make) — context size; retrieved 2026-11-01
[8] [Atlassian, Turning Handoffs into Handshakes: Integrating Design Systems for AI Prototyping at Scale](https://www.atlassian.com/blog/how-we-build/turning-handoffs-into-handshakes-integrating-design-systems-for-ai-prototyping-at-scale) — invented names, templates; retrieved 2026-11-01
[9] [GitHub Primer, MCP server](https://primer.style/product/getting-started/foundations/mcp) — tokens by intent, CSS lint; retrieved 2026-11-01
[10] [Google Labs, design.md: a format specification for describing a visual identity to coding agents](https://github.com/google-labs-code/design.md) — values with reasons; lint; retrieved 2026-11-01
[11] [Vercel, Web Interface Guidelines](https://vercel.com/design/guidelines) — one rule set for generation and review; retrieved 2026-11-01
[12] [Nielsen Norman Group, Good from Afar, But Far from Good: AI Prototyping in Real Design Contexts](https://www.nngroup.com/articles/ai-prototyping/) — generic styling, faults, linked frame; retrieved 2026-11-01
[13] [Lovable, Prompting best practices](https://docs.lovable.dev/prompting/prompting-one) — brief practice; retrieved 2026-11-01
[14] [Anthropic, Introducing Claude Design by Anthropic Labs](https://www.anthropic.com/news/claude-design-anthropic-labs) — onboarding, refinement; retrieved 2026-11-01
[15] [Nielsen Norman Group, Testing AI with Real Design Scenarios: Evaluation Methodology and Prompts](https://www.nngroup.com/articles/testing-ai-methodology) — prompt levels, states and edge cases; retrieved 2026-11-01
[16] [Lovable, Design guidance](https://docs.lovable.dev/features/design-guidance) — style questions skipped for dashboards; retrieved 2026-11-01
[17] [Anthropic, Get started with Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design) — brief advice, source quality; retrieved 2026-11-01
[18] [Lovable, Design systems](https://docs.lovable.dev/features/design-systems) — per-generation violation scan; retrieved 2026-11-01
[19] [Figma, An update on our Make Designs feature](https://www.figma.com/blog/inside-figma-a-retrospective-on-make-designs/) — context examples reproduced; retrieved 2026-11-01
[20] [Figma, Build with more context and more control in Figma Make](https://www.figma.com/blog/introducing-make-kits-and-make-attachments/) — unmeasured drift claim; retrieved 2026-11-01
[21] [Bolt (StackBlitz), Prompting like a pro: 8 tips to get the best out of Bolt](https://bolt.new/blog/prompting-tips-for-bolt) — precise vocabulary; retrieved 2026-11-01
[22] [StackBlitz, bolt.new system prompt (prompts.ts)](https://github.com/stackblitz/bolt.new/blob/main/app/lib/.server/llm/prompts.ts) — pins tooling, not design; retrieved 2026-11-01
[23] [Shin et al., Interrogating Design Homogenization in Web Vibe Coding](https://arxiv.org/abs/2603.13036) — productive friction; retrieved 2026-11-01
[24] [Imteyaz et al., Design Theater: Evaluating the Gap Between User-Facing Design Reasoning and Implementation in Generative UI Tools](https://arxiv.org/html/2607.22928v2) — fidelity, adherence, homogeneity; retrieved 2026-11-01
[25] [Cha et al., Design System-Compliant User Interface Generation with LLM Agents](https://pure.seoultech.ac.kr/en/publications/design-system-compliant-user-interface-generation-with-llm-agents/) — registry compliance; retrieved 2026-11-01
[26] [Wang, Guo, Wang, Production-Grade AI Coding System for Client-Side Development](https://arxiv.org/html/2603.01460v1) — residual styling misses; retrieved 2026-11-01
[27] [Yuan et al., DesignRepair: Dual-Stream Design Guideline-Aware Frontend Repair with Large Language Models](https://arxiv.org/html/2411.01606v2) — dual-stream check, repair; retrieved 2026-11-01
[28] [Romero et al., Usable but Conventional: An Empirical Study on the UX of AI-Generated Interface Prototypes](https://sol.sbc.org.br/index.php/semish/article/view/43563) — pragmatic against hedonic; retrieved 2026-11-01
[29] [Chen et al., Understanding Design Fixation in Generative AI](https://arxiv.org/html/2502.05870v1) — fixation; retrieved 2026-11-01
[30] [Anderson, Shah, Kreminski, Homogenization Effects of Large Language Models on Human Creative Ideation](https://arxiv.org/html/2402.01536v2) — group homogenisation, responsibility; retrieved 2026-11-01
[31] [Yuan et al., Towards Human-AI Synergy in UI Design](https://arxiv.org/html/2412.20071) — short adjective briefs; retrieved 2026-11-01
[32] [Chen, Shi, Chen, SpecifyUI: Supporting Iterative UI Design Intent Expression through Structured Specifications and Generative AI](https://arxiv.org/html/2509.07334v1) — structured specification; retrieved 2026-11-01
[33] [Li, Zhang, Yang, Sketch2Code: Evaluating Vision-Language Models for Interactive Web Design Prototyping](https://arxiv.org/html/2410.16232v1) — clarifying questions, iteration gains; retrieved 2026-11-01
[34] [Duan et al., Generating Automatic Feedback on UI Mockups with Large Language Models](https://arxiv.org/abs/2403.13139) — critique use and decay; retrieved 2026-11-01
[35] [Suh et al., Human or LLM? A Comparative Study on Accessible Code Generation Capability](https://arxiv.org/html/2503.15885v1) — checker feedback loop, rule lists; retrieved 2026-11-01
[36] [Si et al., Design2Code: Benchmarking Multimodal Code Generation for Automated Front-End Engineering](https://aclanthology.org/2025.naacl-long.199) — layout, element recall; retrieved 2026-11-01
[37] [Jaroslawicz et al., How Many Instructions Can LLMs Follow at Once?](https://arxiv.org/html/2507.11538v1) — omission at density; retrieved 2026-11-01
[38] [Liu et al., Lost in the Middle: How Language Models Use Long Contexts](https://aclanthology.org/2024.tacl-1.9/) — position effect; retrieved 2026-11-01
[39] [Rana, Semantic Gravity Wells: Why Negative Constraints Backfire](https://arxiv.org/abs/2601.08070) — priming by prohibition; retrieved 2026-11-01
[40] [Kulkarni, Dow, Klemmer, Early and Repeated Exposure to Examples Improves Creative Work](https://ideas.repec.org/h/spr/undchp/978-3-319-01303-9_4.html) — conformity, timing; retrieved 2026-11-01
[41] [Spracklen et al., We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs](https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen) — invented packages; retrieved 2026-11-01
[42] [Duan et al., UICrit: Enhancing Automated Design Evaluation with a UICritique Dataset](https://arxiv.org/abs/2407.08850) — grounded critique; retrieved 2026-11-01
[43] [Berkeley, Georgia Tech and Adobe authors, MLLM as a UI Judge](https://arxiv.org/html/2510.08783v1) — judge reliability by factor; retrieved 2026-11-01
[44] [Tencent Hunyuan Team, ArtifactsBench: Bridging the Visual-Interactive Gap in LLM Code Generation Evaluation](https://arxiv.org/html/2507.04952v2) — screenshots across interaction; retrieved 2026-11-01
[45] [Bhat et al., Personalizing Personal Health Interfaces: Co-Design with Generative AI](https://arxiv.org/abs/2609.15046) — chat-window convergence; retrieved 2026-11-01
[46] [Google Labs, enhance-prompt (Stitch agent skill)](https://raw.githubusercontent.com/google-labs-code/stitch-skills/main/plugins/stitch-utilities/skills/enhance-prompt/SKILL.md) — six slots, fixed order; retrieved 2026-11-01
[47] [Google Labs, stitch-sdk](https://github.com/google-labs-code/stitch-sdk) — variation axes; retrieved 2026-11-01
[48] [Google Labs, generate-design (Stitch agent skill)](https://raw.githubusercontent.com/google-labs-code/stitch-skills/main/plugins/stitch-design/skills/generate-design/SKILL.md) — style pinned by id; retrieved 2026-11-01
[49] [Google Labs, taste-design (Stitch agent skill)](https://raw.githubusercontent.com/google-labs-code/stitch-skills/main/plugins/stitch-utilities/skills/taste-design/SKILL.md) — loop states, placeholders; retrieved 2026-11-01
[50] [W3C Design Tokens Community Group, Design Tokens Format Module 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/) — typed tokens, $description; retrieved 2026-11-01
