# 11. Design critique and evaluation

Heuristic sets, cognitive walkthrough, severity scales, taste against defect, and evidence-based critique over a rendered pack: where the review rubric comes from.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 11 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

How is a built Rotaris surface judged: what each inspection method finds and misses, how a finding is told from taste, how severity is rated, and what a model critic over the `pnpm ui-review` pack can be trusted with? This guide is the provenance of `.agents/skills/review-ui/references/critique-rubric.md` and the reasoning behind `review-ui`'s steps.

It writes no rubric row, decides no structure (`REQ-SHELL-023`, §2) and mints no member of the language. Composition is guide 07, accessibility guide 09, states and timing guide 13, the generated look guide 02. A structural idea met in a critique leaves it as an open question: critique is not where product decisions are made [8].

## 2. Principles

- **One evaluator is a sample.** One inspector finds about a third of known problems [19]; pairwise overlap ran 5–65 % across eleven studies, for experts and severe problems alike [31]; 46 % of 93 problems were found by one analyst of four [32]; professional teams report different sets [22], even from one recording [33]. One `review-ui` pass's silence is weak evidence.
- **Independence first, merge second.** Inspect alone, compare after [2]; the merge is where divergence shows [33]; a single-evaluator finding is kept, since the hardest problems often come from otherwise weak evaluators [19].
- **A heuristic is a reason, not a measurement.** Nielsen's ten are broad rules of thumb [1]. Defined criteria out-found unaided inspection where principle names did not, at about twice the time [46]; a criteria sweep after a free pass found more than a free second pass [48]. Domain expertise raises yield, and exit and error heuristics are applied worst [49]. Items are single judgeable clauses, and overlapping items get confused [51]; raters picked the right criterion 60 % of the time [47].
- **A violation is not automatically a defect.** Some are deliberate trade-offs backed by evidence [2]; what the specification or §1 chose is recorded as one.
- **Critique is analysis against stated objectives**, or it is preference [7]. Here they are written — `docs/spec/` and §1 — so a comment citing neither is taste. Polish inflates judged usability [9]. A finding is located and names the principle it breaks [4], as standard, gap and close [15]; strengths are named so a repair keeps them [4].
- **Severity is a composite, rated after discovery, and noisy.** Frequency, impact and persistence make one rating, given over the merged list [3]; three levels are the working default [4]. One rater is too unreliable; three averaged suffice [3]. A quarter to a third of shared problems were critical to one professional and minor to another [33]. Lists are mostly minor problems: rank, then count [20].
- **Inspection predicts; use confirms.** Inspectors caught about a third of what test users met, and a third of their reports no user met [21]; a method is judged by its effect on the design, not its count [34]. Experts rating a critique's accuracy agreed only slightly [14].
- **The walkthrough is one narrow lens.** Four questions per step from a defined user's view [5], each answered with a credible story [43]; worth it on novel patterns, not conventional ones [5]. It measures learnability only, scores against expert features and misses recurring problems, though users confirmed its predictions more often [43]; it found a third of what heuristic evaluation did, at higher cost [44]. It needs the step list in hand [45] and the built interface for timing and colour [43].
- **A model critic over-reports and mis-locates.** Over screenshots it found about 14 % of what trained reviewers found [13]; over structured data, an expert's F1 at lower precision [14]. Zero-shot critiques were mostly invalid; worked examples raised quality from 0.31 to 0.48, against designers' 0.75; plain-screenshot localization was near zero [15]. It over-applies guidelines, re-files dismissed findings and repeats one comment per element [14]; its pairwise verdicts hold only for clearly different designs, and its usability scores are biased [16].
- **Judges have biases with mitigations.** Order swaps flip verdicts, so run both orders; weaker judges prefer padding [24]; models favour their own output [25]; self-correction without feedback makes answers worse [26]. Ranking agrees better than scoring [15]; agreement is chance-corrected, and kappa under 0.60 is inadequate [23].
- **Iteration has a shape.** Gains come early [27][28]; a model critic degrades in later rounds [14]; quality is not monotonic, so keep the best [27]; one measure can regress while the whole improves [28]; a better composition comes from parallel alternatives, not more passes [17].
- **Machines take objective defects; journeys and time need driving.** Display defects are detectable [29]; a random addition tests a fixed sample [30]. Animations are listable [36], recordings show frames and layout shifts [35], a test clock pins an instant [37], staged frames raised judge agreement [38], durations have bands [39].

## 3. Patterns and anti-patterns

Anti-patterns unless marked *(pattern)*; for a pattern the tell is what its absence looks like.

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Single-pass verdict | any critique | one list read as the inventory | independent passes over one pack, the union kept [19][31] |
| Anchored merge | several critics | critics read each other first | write alone, merge after, keep who raised what [2][33] |
| Taste as defect | appearance | "feels off", no rule named | a §1.x rule, `--rt-*` token or REQ, else the taste lane (`review-ui` step 7) [7] |
| Trade-off as defect | fixed choices | "no default action" filed | record it, citing §1.7 or `REQ-TOOLS-063` [2][14] |
| Adopted value as invention | token findings | source unread | `packages/contracts/src/theme/themes.ts` first (`review-ui` step 6) [15][49] |
| Screenshot-only pack | model critic | no geometry or style cited | `geometry.json`, `styles.json` beside every PNG; the element, not a box read off pixels [13][14][15] |
| One comment per element | dense lists | a note on every transcript row | one finding per row category (`REQ-CHAT-046`) [14] |
| Re-filed dismissal | iterations 2–3 | same issue, new criterion | a ledger of dismissed findings [14] |
| Self-review | `build-ui` | the builder critiques itself | the separate `review-ui` pass [25] |
| Re-reading its own report | the loop | a change with no new evidence | a new `ui-audit`, `theme-proof` reading or `shot` [26] |
| Last iteration kept | three passes | iteration 3 kept for being last | compare packs in both orders, else a tie; keep the best [24][27][28] |
| Generic wait | work over 10 s | `Spinner` alone | the tool row's description (`REQ-CHAT-175`) [6] |
| Dead-end error | `error` notices | no way out | a notice action (`REQ-NOTIFY-044`) [6] |
| Colour alone | state | a dot with no word | `StatusDot` with its word (§1.3, `REQ-SHELL-149`) [10] |
| Emphasis everywhere | dense views | several filled controls | one filled control (§1.7), one coloured icon per row (§1.9) [10] |
| Journey-pinned walk *(pattern)* | novel surfaces | tasks the critic invented | guide 04's journeys with their step lists [22][45] |
| Domain heuristics *(pattern)* | agent surfaces | general heuristics only | human-AI guidelines beside `REQ-SHELL-144`..`168` [18] |
| Staged frames *(pattern)* | dialogs, overlay drawers | one end-state shot | before, during, after; reduced motion (`REQ-SHELL-135`) [38][41] |

## 4. Method

1. **Scope.** Name what is open (spacing, type, treatment) and what is fixed (`REQ-SHELL-023`, `-027`, `-049`, §2) [8].
2. **Load objectives and examples.** The surface's requirements and directives, §1, its §7 row; UIR-001..012 and §7.1 as worked examples, the grounding that raised critique quality [15][49].
3. **Build the pack.** `pnpm ui-review` at the fixed views and sizes plus one random capture (a state, a dialog mid-run) [30]; staged frames per transition and a reduced-motion capture [38][41]; `document.getAnimations()` per capture [36]; a throttled recording for streaming [35]. Drive with `pnpm app:drive` `waitFor`, never a sleep [37].
4. **Free read, then sweep** every rubric row, a number in each observation [48][51].
5. **Walk two or three journeys** on novel surfaces: a user description; the correct step sequence (the method's action list) at expert grain, where a command from the command palette is one step; four questions per step and a failure story where one fails [43][45][5]. The brief states goal against step and the four questions, which untrained analysts missed [43]; assumptions about the operator are output [44].
6. **Three lanes.** Deterministic (`pnpm ui-audit`; `pnpm theme-proof` from rendered pixels, `REQ-SHELL-160`; measured severity) [29]; predicted (walkthrough, heuristic: confirmed by a drive or a live run) [21]; taste (no rule named, reported apart) [7].
7. **Write** the element from `geometry.json`, the criterion id, standard, gap and close, the number in the sentence [15][4].
8. **Merge, then rate** by impact, frequency and persistence over the merged list [3][33].
9. **Iterate on external evidence**, at most three times; compare packs in both orders, keep the best, stop when the rejected share rises [26][24][27][14].
10. **Report** strengths, findings with numbers, the unresolved; structural ideas leave as open questions [4][8].

## 5. Worked example

**Approval card** — §7 row "Approval card" (mockup `WORKSPACE` → `approvalOn`), nearest built code `packages/ui/src/ApprovalDialog.tsx` and `.approval*` in `packages/ui/src/shell.css`; gap G2. Read from source; a drive of a scripted request confirms each number.

- **Scope.** `REQ-TOOLS-063` fixes the parts, three buttons, no default action, focus on Deny, Escape as Deny, the undeliverable state and the queue counter (`PD-ORCH-005` narrows it for a quit). Spacing, type and treatment are open. No default action costs an expert two Tabs per approval: a trade-off the requirement states, not a finding [2].
- **Deterministic.** The ring is inset (`outline-offset` minus `--rt-focus-ring-width`, `REQ-SHELL-148`; F3). Deny (`btn-danger`) and Approve for this session (`btn-secondary`) are hairlines; Approve once (`btn-primary`, `--rt-accent-600`) is the one fill: D3 holds.
- **Source trap.** `.approval__detail` declares `var(--rt-radius-sm, 4px)` and `var(--rt-text-xs, 12px)`, fallbacks unlike the tokens' values in `themes.ts`; `styles.json` decides, not the CSS text (`review-ui` step 6).
- **A requirement reading.** The key listener suppresses Enter only off a button, so Enter at initial focus activates Deny natively. Whether that meets "no button is activated by Enter" is deterministic: press Enter on a fresh dialog and read the delivered answer; if one is delivered, high.
- **Candidate (C7).** `{n} other requests waiting.` sets its count in `--rt-font-body`; §1.4 makes every number mono. Low, provisional until a second rater [3].
- **Walkthrough.** An expert operator mid-run, focus in the composer, approves one `npm test` once: (a) read headline and detail; (b) reach Approve once and press it; (c) see the run continue. (a) *Notice*: the box caps at 140 px and scrolls, so a long command hides its tail; feed one [45]. (b) *Link*: "Approve for this session" states its scope in the label alone; whether the operator ties it to `REQ-TOOLS-051`'s session option is a prediction [21]. (c) *Progress*: a queued request follows at once, so frames before and after must show the headline change and the counter fall [38], compared in both orders [24].
- **Strengths.** The detail box is mono, focusable and named with its masking description; the rule line is mono; the undeliverable line is `role="status"`.
- **Severity.** Met on every request, so a failure at (b) or (c) outranks an equal flaw in a rarely opened Settings category [3].

**Result.** No deterministic red from source; one low candidate, one requirement reading, two predictions for the drive.

## 6. Checks

From the pack, the DOM or `critique.json`; rubric ids where the rubric carries the check, *proposed* where it does not.

- **F3** — initial focus where the requirement puts it; every ring `--rt-focus-ring-width` in `--rt-focus`, `outline-offset` ≤ 0 where `REQ-SHELL-148` binds.
- **D3** — one `btn-primary` per view state; `btn-danger` and `btn-secondary` transparent at rest.
- **C7** — every rendered numeral, counts in sentences included, computes to `--rt-font-mono`.
- **C6** — every `StatusDot` has its state word in the accessible tree [10].
- **C9** — between transitions, with a run going, `document.getAnimations()` targets only `.status-dot.is-pulsing` and `.spinner` [36]; *proposed:* none under reduced motion (`REQ-SHELL-136`).
- **F1** — two or three journeys per novel surface, four answers per step, a PNG per step [5][43].
- *Proposed* — Enter at a dialog's initial focus delivers no answer where `REQ-TOOLS-063` binds.
- *Proposed* — every transition's duration is a `--rt-duration-*` or `--rt-ack-*` token; one far outside about 100–500 ms is filed [39].
- *Proposed* — no settled transcript row shifts while the next streams, from a throttled layout-shift track [35].
- *Proposed* — a tool row running over 10 s shows its description; every `error` notice carries a notice action [6].
- *Proposed* — each acknowledgement carrying an action records where else that command is reachable, or "nowhere" (D11-5) [42].
- *Proposed* — every finding names criterion, element, rule (§1.x, token, REQ) and a number, else it is taste [4][15], and counts once per row category [14]; each surface gets one strength or more, naming the token or contract met [4].
- *Proposed* — no finding of iteration 2 or 3 repeats a dismissed one under another criterion; iteration 3 is skipped when iteration 2's rejected share rose [14]; a before-and-after verdict stands only when both orders agree [24].
- *Proposed* — severity carries a frequency word (every run, per session, rare) beside the level [3].
- *Proposed* — two independent passes report kappa on criterion assignment, under 0.60 a rubric problem [23][47], and their unique share, mostly unique meaning unsaturated [32].
- *Proposed* — one random capture beyond the fixed views and sizes [30]; staged frames per dialog and overlay drawer [38].

## 7. How this applies here

**Requirements.** `REQ-SHELL-023`, `-027`, `-049` (never judged); `REQ-SHELL-117`, `-135`, `-136`, `-144`, `-148`, `-149`, `-160`; `REQ-TOOLS-051`, `-063`; `REQ-NOTIFY-011`, `-022`, `-044`; `REQ-CHAT-046`, `-175`.

**Directives.** `PD-ORCH-005` (narrows `REQ-TOOLS-063`); `PD-WORKSPACE-001` (the acknowledgement's one action).

**Tokens.** `--rt-focus`, `--rt-focus-ring-width`, `--rt-font-mono`, `--rt-font-body`, `--rt-text-xs`, `--rt-radius-sm`, `--rt-accent-600`, `--rt-run`, `--rt-ok`, `--rt-duration-fast`, `--rt-duration`, `--rt-duration-slow`, `--rt-ack-enter`, `--rt-ack-exit`.

**Components.** `Dialog`, `Button`, `ConfirmDialog`, `StatusDot`, `Spinner`, `Acknowledgement`, `KpiCard`, `MeterBar`; gaps G1, G2.

**The record's lessons**, as experience. "The tokens hold but composition breaks": every transcript row a card (`docs/design/README/07-7-fidelity-consult-before-maintain-after.md` §7.1), polish hiding composition [9]. UIR-001..012 (`docs/architecture/codebase/17-all-twelve-critic-findings-repaired-and.md`): UIR-001 read as craft and was a `REQ-SHELL-038` violation, UIR-003 a missing declaration, UIR-011 not doable as asked; UIR-018 filed `--rt-accent-tint-14` as a fourth tint (`review-ui` step 6). "Bound the box, not only the child" (`.agents/skills/build-ui/SKILL.md` step 8, `SHRUNK`): a repair passes at the child and regresses the box, so packs are compared [28]. A deleted critique is why findings travel in the message (`review-ui` step 9). Section 6 adds a frequency word to the rubric's severity, not a scale; section 4 step 3 extends the pack the drawn-surface seam ends in (`docs/architecture/views/04-seams/08-8-a-drawn-surface.md` step 6).

| Reader | Reads |
|---|---|
| `design-ui` brief §11 | §4 step 3 |
| `design-ui` audit step 2, capturing what the pack lacks | §4 step 3 |
| `design-ui` audit step 4, the free read and the journeys walk | §4 steps 4–5 |
| `design-ui` audit step 5, sorting into lanes, then merging | §3, §4 step 6, §6 |
| rubric F1 | §4 step 5 |
| rubric, Critic step 6 | §4 step 10 |
| rubric, the filing gate | §4 step 6 |

## 8. Where this disagrees with the adopted material

Each item is a question to raise; none is a change to make.

- **D11-1 —** Animation is recommended to keep a person engaged while work runs [11]. It meets §1.8: no animation in conversation content, two infinite animations only. *Do long tool work and streamed reasoning need more than the pulse and the tool row's description?*
- **D11-2 —** Self-starting motion lasting over five seconds beside other content needs a pause, stop or hide unless essential [40]. It meets §1.8's `.status-dot.is-pulsing`, which can last a whole run, and `REQ-SHELL-135`'s in-app setting. *Is a running pulse essential, and if not, is that setting the mechanism SC 2.2.2 asks for, reachable mid-run?*
- **D11-3 —** A measured principle set fuses low-level data into summaries and offers more than one level of detail [50]. It meets §1.11: numbers exact, never "600K+". *Does a `KpiCard` or `MeterBar` ever owe a summary level beside the exact figure?*
- **D11-4 —** One symbol with different meanings in different places confused daily users, on one anecdote [6]. It meets §1.3: teal reads running and sound, amber waiting and attention, never mixed on one surface; §7.3 records `--rt-ok` and `--rt-run` resolving alike. *Is "never on one surface" enough when one glance crosses the status strip and the delegation tree?*
- **D11-5 —** A self-withdrawing message is a time limit when it is the only way to learn or act on something [42]. It meets `REQ-NOTIFY-011`'s fixed lifetime and `PD-WORKSPACE-001`'s acknowledgement carrying "Start a new session". *Is that command reachable another way for the same workspace, and should the record say where?*
- **D11-6 —** Loading indicators wait about 150–300 ms, then hold a minimum time, against a flash [12]. It meets `REQ-SHELL-117`: the progress dialog "appears immediately". *Does that hold for a merge or checkpoint that ends within a few hundred milliseconds?*

## 9. References and further reading

[1] [Jakob Nielsen (NN/g), 10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) — broad rules of thumb; retrieved 2026-11-01
[2] [Kate Moran, Kelley Gordon (NN/g), How to Conduct a Heuristic Evaluation](https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/) — solo, then merge; trade-offs; retrieved 2026-11-01
[3] [Jakob Nielsen (NN/g), Severity Ratings for Usability Problems](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/) — composite; separate; three raters; retrieved 2026-11-01
[4] [Aurora Harley (NN/g), UX Expert Reviews](https://www.nngroup.com/articles/ux-expert-reviews/) — report parts; three levels; retrieved 2026-11-01
[5] [Kim Flaherty (NN/g), Evaluate Interface Learnability with Cognitive Walkthroughs](https://www.nngroup.com/articles/cognitive-walkthroughs/) — four questions; novelty; retrieved 2026-11-01
[6] [Kate Kaplan (NN/g), 10 Usability Heuristics Applied to Complex Applications](https://www.nngroup.com/articles/usability-heuristics-complex-applications/) — waits, dead ends, one meaning; retrieved 2026-11-01
[7] [Sarah Gibbons (NN/g), Design Critiques: Encourage a Positive Culture to Improve Products](https://www.nngroup.com/articles/design-critiques/) — objectives; retrieved 2026-11-01
[8] [Noah Levin (Figma), From Figma's design team: How to run a design critique](https://www.figma.com/blog/design-critiques-at-figma/) — not for product decisions; retrieved 2026-11-01
[9] [Kate Moran (NN/g), The Aesthetic-Usability Effect](https://www.nngroup.com/articles/aesthetic-usability-effect/) — halo; retrieved 2026-11-01
[10] [Jon Yablonski (Laws of UX), Von Restorff Effect](https://lawsofux.com/von-restorff-effect/) — not colour alone; restraint; retrieved 2026-11-01
[11] [Jon Yablonski (Laws of UX), Doherty Threshold](https://lawsofux.com/doherty-threshold/) — animation in waits; retrieved 2026-11-01
[12] [Vercel, Web Interface Guidelines](https://vercel.com/design/guidelines) — loading-indicator delay; retrieved 2026-11-01
[13] [Christian Holst (Baymard Institute), Testing ChatGPT-4 for 'UX Audits' Shows an 80% Error Rate & 14-26% Discoverability Rate](https://baymard.com/blog/gpt-ux-audit) — screenshot limits; retrieved 2026-11-01
[14] [Peitong Duan et al. (CHI 2024), Generating Automatic Feedback on UI Mockups with Large Language Models](https://arxiv.org/abs/2403.13139) — precision; failure modes; decline; retrieved 2026-11-01
[15] [Peitong Duan et al. (UIST 2024), UICrit: Enhancing Automated Design Evaluation with a UI Critique Dataset](https://arxiv.org/abs/2407.08850) — standard-gap-close; few-shot; boxes; retrieved 2026-11-01
[16] [Reuben A. Luera et al., MLLM as a UI Judge: Benchmarking Multimodal LLMs for Predicting Human Perception of User Interfaces](https://arxiv.org/abs/2510.08783) — pairwise limits, bias; retrieved 2026-11-01
[17] [Therese Fessenden (NN/g), 3 Design Processes for High Usability: Iterative Design, Parallel Design, and Competitive Testing](https://www.nngroup.com/articles/parallel-and-iterative-design/) — hill-climbing; retrieved 2026-11-01
[18] [Saleema Amershi et al. (Microsoft Research), Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/) — a domain set; retrieved 2026-11-01
[19] [Jakob Nielsen (NN/g), The Theory Behind Heuristic Evaluations](https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/theory-heuristic-evaluations/) — 35 % per evaluator; retrieved 2026-11-01
[20] [Jakob Nielsen (NN/g), Characteristics of Usability Problems Found by Heuristic Evaluation](https://www.nngroup.com/articles/usability-problems-found-by-heuristic-evaluation/) — mostly minor; retrieved 2026-11-01
[21] [Jeff Sauro (MeasuringU), How Effective are Heuristic Evaluations?](https://measuringu.com/effective-he/) — hits, false alarms; retrieved 2026-11-01
[22] [Rolf Molich (DialogDesign), CUE studies (Comparative Usability Evaluation)](https://www.dialogdesign.dk/cue-studies/) — not reproducible; task choice; retrieved 2026-11-01
[23] [Mary L. McHugh, Interrater reliability: the kappa statistic](https://pmc.ncbi.nlm.nih.gov/articles/PMC3900052/) — chance correction; 0.60; retrieved 2026-11-01
[24] [Lianmin Zheng et al., Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685) — position bias, padding; retrieved 2026-11-01
[25] [Arjun Panickssery et al., LLM Evaluators Recognize and Favor Their Own Generations](https://arxiv.org/abs/2404.13076) — self-preference; retrieved 2026-11-01
[26] [Jie Huang et al., Large Language Models Cannot Self-Correct Reasoning Yet](https://arxiv.org/abs/2310.01798) — no feedback, worse answers; retrieved 2026-11-01
[27] [Aman Madaan et al., Self-Refine: Iterative Refinement with Self-Feedback](https://arxiv.org/abs/2303.17651) — early gains; fluctuation; retrieved 2026-11-01
[28] [Jakob Nielsen (NN/g), Iterative User Interface Design](https://www.nngroup.com/articles/iterative-design/) — shrinking gains; regressions; retrieved 2026-11-01
[29] [Zhe Liu et al. (ASE 2020), Owl Eyes: Spotting UI Display Issues via Visual Understanding](https://arxiv.org/abs/2009.01417) — display defects; retrieved 2026-11-01
[30] [W3C AG Working Group, WCAG Evaluation Methodology (WCAG-EM) 2.0](https://www.w3.org/TR/WCAG-EM/) — random sample; retrieved 2026-11-01
[31] [Morten Hertzum, Niels Ebbe Jacobsen, The Evaluator Effect: A Chilling Fact About Usability Evaluation Methods](https://doi.org/10.1207/s15327590ijhc1304_05) — 5–65 % overlap; retrieved 2026-11-01
[32] [N. E. Jacobsen et al., The evaluator effect in usability tests](https://doi.org/10.1145/286498.286737) — 46 % by one; retrieved 2026-11-01
[33] [M. Hertzum et al., What you get is what you see: revisiting the evaluator effect in usability tests](https://doi.org/10.1080/0144929X.2013.783114) — severity splits; the merge; retrieved 2026-11-01
[34] [Kasper Hornbaek, Dogmas in the assessment of usability evaluation methods](https://doi.org/10.1080/01449290801939400) — effect on design; retrieved 2026-11-01
[35] [Chrome for Developers, Performance features reference](https://developer.chrome.com/docs/devtools/performance/reference) — frames, layout shifts; retrieved 2026-11-01
[36] [MDN Web Docs, Document: getAnimations() method](https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations) — running animations; retrieved 2026-11-01
[37] [Playwright, Clock](https://playwright.dev/docs/clock) — a controlled clock; retrieved 2026-11-01
[38] [Chenchen Zhang et al., ArtifactsBench: Bridging the Visual-Interactive Gap in LLM Code Generation Evaluation](https://arxiv.org/html/2507.04952) — staged frames; retrieved 2026-11-01
[39] [Page Laubheimer (NN/g), Executing UX Animations: Duration and Motion Characteristics](https://www.nngroup.com/articles/animation-duration/) — duration bands; retrieved 2026-11-01
[40] [W3C WAI, Understanding Success Criterion 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) — self-starting motion; retrieved 2026-11-01
[41] [W3C WAI, Understanding Success Criterion 2.3.3: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) — reduced motion; retrieved 2026-11-01
[42] [W3C WAI, Understanding Success Criterion 2.2.1: Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) — self-withdrawing messages; retrieved 2026-11-01
[43] [Cathleen Wharton et al., The Cognitive Walkthrough Method: A Practitioner's Guide](https://www.colorado.edu/ics/sites/default/files/attached-files/93-07.pdf) — credible story; grain; limits; retrieved 2026-11-01
[44] [Robin Jeffries et al. (CHI 1991), User interface evaluation in the real world: a comparison of four techniques](http://www.miramontes.com/writing/uievaluation/) — walkthrough yield, cost; retrieved 2026-11-01
[45] [Clayton Lewis, John Rieman, Task-Centered User Interface Design, chapter 4](http://hcibib.org/tcuid/chap-4.html) — the step list in hand; retrieved 2026-11-01
[46] [J. M. C. Bastien, D. L. Scapin, C. Leulier, The ergonomic criteria and the ISO/DIS 9241-10 dialogue principles: a pilot comparison in an evaluation task](https://academic.oup.com/iwc/article-lookup/doi/10.1016/S0953-5438(98)00038-1) — criteria over names; time; retrieved 2026-11-01
[47] [J. M. C. Bastien, D. L. Scapin, A validation of ergonomic criteria for the evaluation of human-computer interfaces](https://doi.org/10.1080/10447319209526035) — 60 % assignment; retrieved 2026-11-01
[48] [J. M. C. Bastien, D. L. Scapin, Evaluating a user interface with ergonomic criteria](https://doi.org/10.1080/10447319509526114) — criteria in a second pass; retrieved 2026-11-01
[49] [Jakob Nielsen (CHI 1992), Finding usability problems through heuristic evaluation](https://doi.org/10.1145/142750.142834) — double experts; exit and error; retrieved 2026-11-01
[50] [J. Gerhardt-Powals, Cognitive engineering principles for enhancing human-computer performance](https://doi.org/10.1080/10447319609526147) — data fusion; retrieved 2026-11-01
[51] [Saleema Amershi et al. (Microsoft Research, camera-ready), Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/uploads/prod/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf) — single-clause items; confused pairs; retrieved 2026-11-01
