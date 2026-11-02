# 06. UX patterns for agent products

Streaming, tool-call rows, reasoning disclosure, approvals, trust calibration, interruptibility, long-running status, cost and multi-agent attribution.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 06 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

What does an interface owe an operator whose agents run for hours, stream, call tools, ask permission, spend money and work several at once? This guide answers inside surfaces the specification names: the transcript, the approval dialog, the question stepper, run status, cost figures, the delegation tree, persona windows. It decides no screen, tab, order or label, nor which calls need approval (`REQ-TOOLS-041`), and restates no rule of the language; an argument with §1, a requirement or a directive is a question in section 8. A toast, which this product calls an acknowledgement, and an alert, which it calls a notice, are named by field name only here.

## 2. Principles

1. **Ask less often, not more loudly.** Approving every call decays: "after the tenth prompt you start approving without reading" [2]. Human-AI pairs do worse on average than the better alone, losing on decisions and gaining where the human knows more [23]; an agent guarding only irreversible actions asked for help in about 10% of tasks and lifted completion from 30.3% to 51.9% [26]. Friction follows harm: reading free, modifying gated, standing grants for trusted routine, a reduced-oversight posture kept visible [1][3].
2. **The decisive fact before the decision, the agent's argument behind it.** Explanations raised acceptance whether the AI was right or wrong [19]; visible chains of thought often mentioned a hint they used in under 20% of cases [21]. Holding the risky option until the decisive field was looked at made informed choices two to three times likelier [25]; forcing own judgement cut overreliance and was rated worst [20]. An injected agent with safeguards off approved its own actions [26]: the approval surface is out of the run's reach.
3. **Confidence comes from the record, not the tone.** Reliance barely moved with uncertainty markers, and confident answers were wrong 47% of the time [44]. Sources and stated limits calibrate trust better than traces [6]; confidence, if shown, is a few categories with consequences, never a percentage [7]. Reviewers take the plan as a record of what was done and passing tests as proof [27].
4. **Named states, compact by default.** Each step an explicit state, detail behind a click [4]; state and tool calls inspectable [13]; awaiting approval and denied as outcomes of their own [5].
5. **Operators watch indirectly.** Developers rarely watch live; long runs and many turns signal drift, logs are skimmed, and intervening often means restarting [27]. State can be derived from the last observed activity and silence named [14].
6. **Time has thresholds.** Nothing under about a second, and a flashing loader is a defect [9]; a looping indicator to about ten seconds, then progress and a visible stop [10]. A run of unknown length counts instead: elapsed time, steps, tokens [10][27].
7. **An interruption costs what it covers and when it lands.** Breakpoint delivery lowered frustration and was no slower for relevant items (3.07 s against 4.08 s, marginal) [28]; mid-task delivery cost 3–27% more time, doubled errors and raised annoyance 31–106% [33]; well-timed ones felt more respectful [34]. Negotiating the moment performed best [35], given an announcement and a low-effort accept; an extra deliberate step can reverse that [38]. Work left visible is resumed sooner [37].
8. **Stopping is immediate, in place, and says what it kept.** Stop sits where work started; pause keeps progress where stop may lose it [11]; a disengaged agent steps back at once [13]. Shipping agents keep pushed commits and work up to an interrupt, and one documents that rewind leaves shell effects [12][2].
9. **Cost where the decision is made, exact, unit and scope named.** Beside the prompt and on starting controls, in units, by component [17]; a total folding in child agents says which readouts cover the tree [42]; delegation spends the same budget [2].
10. **Attribution travels in the data.** Messages inside a delegated agent carry its id and the delegating call's [43]; a delegation is one parent row naming the child, nesting a tree with descendant counts [41]; agent commits name agent and requester and link the session log [12]; accountability stays with the delegating human [13].
11. **The reader stays still; the log announces politely.** Position is held by anchoring to a visible node, which animated geometry silently cancels [29]; a transcript maps onto the append-only, polite log role [30]; auto-updating content needs pause, stop or hide [31].
12. **A question is small, consequential, escapable.** 1–4 questions of 2–4 options, each with a one-line consequence [39]; typed text after the options is relayed neutrally as the answer [40].

## 3. Patterns and anti-patterns

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Tiered approval [1][3] | a call changes files or systems | absent: every call prompts alike | presets (`REQ-TOOLS-041`), `mode: <preset>` in the strip (`REQ-TOOLS-184`); Approve once or for this session (`REQ-TOOLS-063`) |
| Rubber-stamp queue (anti) [2][35] | long runs, many agents | approvals in under a second each | fewer calls routed; the queue line (`REQ-TOOLS-063`) |
| Decisive field first [25][18] | every approval | absent: rationale above the command | the mono detail box, `Matched rule:`, focus on Deny (`REQ-TOOLS-063`) |
| Rationale as evidence (anti) [19][21] | reasoning beside a request | the agent's reason quoted, not the command | `▸ reasoning · <N>s · ~<T> tok` collapsed (`REQ-CHAT-062`) |
| Named step states [4][5] | every call and agent | absent: a spinner with no word | tool row status (`REQ-MONITOR-105`); `StatusDot` plus word (§1.3, `REQ-SHELL-149`) |
| Generic disclaimer (anti) [8] | uncertain output | a permanent "may be wrong" line | a notice with an owning session and action; §1.11 "no filler" |
| Confidence percentage (anti) [7][44] | self-assessment | `87% confident` | exact figures for measured quantities (§1.11); evidence indicator (G4) |
| Flash loader (anti) [9] | sub-second waits | a `Spinner` gone inside a second | `Spinner` "Working" (`REQ-SHELL-137`) only past a threshold [9] |
| Counted progress [10][27] | runs of hours | absent: a pulse, no count | seconds and tokens (`REQ-CHAT-060`, `REQ-CHAT-062`); strip tokens (`REQ-SHELL-038`) |
| Stall from silence [14] | provider silent | a live row unchanged for minutes | the stalled indicator at 10 s (`REQ-CHAT-164`) |
| Stop that says what it kept [11][12] | stop, pause, crash | absent: no word on what stayed | `paused`, `stopped` (`REQ-NOTIFY-048`); the continue action (`PD-ORCH-005`) |
| Cost at the decision [17] | before, during a run | absent: tokens only afterwards | `612,480 tok` (§1.11); `ContextRing`, `MeterBar`; "Start anyway" (`REQ-SHELL-158`) |
| Unscoped total (anti) [42] | delegation | a root figure read as the run's | every figure names its scope |
| Implicit hand-off (anti) [41][43] | delegation | child rows unmarked among the parent's | delegation-context header (`REQ-CHAT-046`); colour and indent (`PD-CHAT-005`); G3 |
| Scroll yank (anti) [29] | streaming, expanding | the row being read jumps | anchor to a visible row; no animation in content (§1.8) |
| Question escape [40][39] | structured questions | absent: options only | the freeform editor (`REQ-CHAT-100`) |
| Glowing AI marker (anti) [15] | marking AI output | glow or gradient edges | flat elevation, glow forbidden (§1.7) |

## 4. Method

1. **Place the surface in the run** — before, watching, waiting on the operator, intervening, reviewing — and note which moments are met indirectly [27]; journeys are guide 04's.
2. **Sort each decision by reversibility**: reversible calls become recorded tool rows, irreversible ones reach the operator [1][26]. Routing is the permission configuration's (`REQ-TOOLS-041`); the surface decides how a request reads.
3. **Lead with the decisive fact** in mono, what it touches stated first [18], any rationale below it [19]. Read the requirement's fixed contents before adding anything.
4. **Name states from the specification's vocabularies**, dot-plus-word [4]; a missing state is an open question.
5. **Set the time behaviour**: nothing under a second, a status word to ten, then counts and a reachable stop, silence named [9][10][14].
6. **Record what an interruption covers and when it lands** [37]; where timing is open, prefer the next breakpoint, announced [28][38].
7. **Attribute and price**: every row and figure names its agent and scope [43][42].
8. **Hold the reading position** while rows above grow or expand [29].
9. **Judge by decisions**: a driven run (`pnpm app:drive`, scripted dialect) with a known-bad request queued, counting approvals; ratings can move the other way [20].
10. **File disagreements** in section 8, then `docs/architecture/open-questions.md`.

## 5. Worked example

**Surface:** §7's row *Approval card* — mockup `WORKSPACE` → `approvalOn`; nearest built code `packages/ui/src/ApprovalDialog.tsx`, the trailer row in `packages/ui/src/transcript/Row.tsx`. Structure `REQ-TOOLS-063`, timing `REQ-CHAT-103` as narrowed by `PD-CHAT-002`, trailer `REQ-SESSION-157`.

1. *Place.* The one moment a run waits on permission, landing while the operator drafts, reads a diff or watches a persona window.
2. *Sort.* The preset sorted what arrives. Approve once grants one call, Approve for this session the standing grant; `Matched rule: <rule_id>` says why this call was not routed past.
3. *Decisive fact.* `Allow <agent> to run <tool>?`, then the redacted command in the mono detail box. Focus on Deny and no default action mean a keystroke meant for the composer approves nothing. Whether the call can be undone is not among the fixed contents (D06-6).
4. *States.* The trailer `Approval needed — <command or tool>` sits on a panel with a 2 px `--rt-wait` rail, the one surface its neighbourhood earns (§7.2, after §7.1's "every row a card"); undeliverable disables all three buttons. Deny is a hairline `.btn-danger`, Approve once the one filled control (§1.7).
5. *Time.* The next request follows within 100 ms (`REQ-TOOLS-184`); nothing is drawn in between.
6. *Interruption.* It opens itself (`REQ-CHAT-103`, D06-1) and presents the next at once (D06-2); the `--rt-overlay` backdrop dims the draft rather than hiding it, the cue tied to faster resumption [37].
7. *Attribute.* `Requested by <agent> (<persona> persona).` names the asker anywhere in the delegation tree [40]; the queue line reads `{n} other requests waiting.`
8. *Reading position.* The transcript row behind it stays put across open and close [29].
9. *Judge.* Seed one bad request in a queue of ten and count denies, not seconds [20].

## 6. Checks

Rubric ids mark rows `.agents/skills/review-ui/references/critique-rubric.md` carries; **New** is a proposal.

- **F2, C6** — every tool row's outcome is a `REQ-MONITOR-105` word beside its colour; colour-only rows: 0 [4].
- **C9** — mid-stream, `document.getAnimations()` on the transcript holds only `.status-dot.is-pulsing` and `.spinner`; expanding a folded tool group adds none [29].
- **New: anchor** — scrolled up, the top visible row's `getBoundingClientRect().top` moves at most 1 px when a row above grows or expands [29].
- **New: release** — after one wheel step up mid-stream, `scrollTop` holds while rows arrive [29].
- **D3** — filled controls per dense view, the approval dialog included: at most 1 (§1.7).
- **F3** — on each presentation focus is on Deny, Enter answers nothing, Escape answers Deny (`REQ-TOOLS-063`).
- **F4, C7** — every token or cost figure is `--rt-font-mono`, digit-grouped, with its unit, no `K` or `M` [17].
- **New: scope** — every such figure's label or accessible description names this agent, with descendants, or the run [42].
- **New: flash** — no `Spinner` mounted for under 1000 ms in a driven run [9].
- **F2** — 10 s of provider silence shows the stalled indicator with seconds, reverting on output (`REQ-CHAT-164`) [14].
- **New: kept** — after stop, pause or crash, a row or notice states what stayed before the operator continues [12][2].
- **C6** — role labels use only `--rt-viz-1` … `--rt-viz-6`, never a state token (`PD-CHAT-005`).
- **New: attribution** — a persona window holds zero rows of another persona's agents [43].
- **C5** — only the user row, approval and diff rows and an expanded tool card carry a surface (§7.2); others: 0.
- **New: log** — the transcript exposes the log role or an equivalent polite region, the streaming row `aria-busy` until settled [30]; unstated in the specification, so a red is a question for `REQ-SHELL-144..168`.
- **New: pause, stop, hide** — name what stops the transcript moving while read [31].
- **F1** — the stepper shows the freeform editor whenever a step allows it and no option is chosen (`REQ-CHAT-100`) [40].

## 7. How this applies here

**Requirements:** `REQ-TOOLS-041`, `REQ-TOOLS-063`, `REQ-TOOLS-184`; `REQ-CHAT-005`, `REQ-CHAT-046`, `REQ-CHAT-057`, `REQ-CHAT-060` – `REQ-CHAT-063`, `REQ-CHAT-092` – `REQ-CHAT-103`, `REQ-CHAT-164`, `REQ-CHAT-175` – `REQ-CHAT-178`; `REQ-MONITOR-105`; `REQ-SESSION-157`; `REQ-NOTIFY-048`; `REQ-SHELL-038`, `REQ-SHELL-137`, `REQ-SHELL-151`, `REQ-SHELL-158`, and `REQ-SHELL-144` – `REQ-SHELL-168`. **Directives:** `PD-CHAT-002`, `PD-CHAT-004`, `PD-CHAT-005`, `PD-CHAT-006`, `PD-CHAT-010`, `PD-ORCH-005`. **Tokens:** `--rt-wait`, `--rt-run`, `--rt-done`, `--rt-fail`, `--rt-viz-1` … `--rt-viz-6`, `--rt-font-mono`, `--rt-overlay`. **Components:** `StatusDot`, `Spinner`, `Tag`, `ContextRing`, `MeterBar`, `Dialog`, `Button`; gaps G2, G3, G4, G7, G10, G14 (§4.2). **Code:** `ApprovalDialog.tsx`, `transcript/Row.tsx`, `TranscriptSurface.tsx`, `QuestionStepper.tsx`, `AgentTree.tsx`, `RunHeader.tsx` in `packages/ui/src/`.

**Readers.**

| Derivative | Reads |
|---|---|
| `design-ui` brief §2 | §2, §4 steps 1–2 |
| `design-ui` brief §4 | §4 steps 4–5 |
| `design-ui` brief §5 | §4 steps 6–8 |
| `design-ui` brief §10 | §8 |
| `design-ui` audit step 4, the tells walk | §3 |
| rubric F1 | §2, §6 |

A **New** check binds only once a rubric version adopts it.

**Paid for already.** "The tokens hold but composition breaks", every transcript row a card (`docs/design/README/07-7-fidelity-consult-before-maintain-after.md` §7.1, repaired §7.2), is why only the approval row earns a panel; §7.3 and §7.4 took agent identity and the tool description from the material. UIR-001..012 were each a measured number, three a requirement or missing declaration rather than taste (`docs/architecture/codebase/17-all-twelve-critic-findings-repaired-and.md`). "Bound the box, not only the child" (`.agents/skills/build-ui/SKILL.md` step 8) binds the ellipsized tool description and any queue or cost line. A critic once filed an adopted token as an invention (`.agents/skills/review-ui/SKILL.md` step 6).

## 8. Where this disagrees with the adopted material

- **D06-1 —** Breakpoint delivery lowered frustration and annoyance without slowing relevant answers [28][33][34]; immediate handling wins only where seconds are critical [35]; an announced lag helped resumption once [36]; deferral helps only if taking the item costs one keystroke [38]. Meets `REQ-CHAT-103`, "the first pending approval auto-opens its modal", kept by `PD-CHAT-002`. *Are seconds critical while a run simply waits, and if not, should the first approval be announced and opened by one command at the operator's next breakpoint?*
- **D06-2 —** When finishing one queued item reveals the next, some people drain the queue and neglect their main task [35]. Meets `REQ-TOOLS-063`: the next request is presented as soon as the dialog closes. *Should it be, while other agents in the delegation tree go unwatched?*
- **D06-3 —** Warnings that vary in appearance resisted habituation over a working week [24] (security warnings, not approvals). Meets `REQ-TOOLS-063`'s one fixed dialog and §1's one treatment per component. *Does a high-impact request warrant a distinct presentation within §1's tokens, or is asking less often the whole answer?*
- **D06-4 —** A shipping agent keeps a question open until answered; its timeout is opt-in, off for screen readers and background sessions [40]. Meets `REQ-CHAT-093`'s 300-second default. *Should an operator who steps away return to a question already timed out, and does a hidden limit meet `REQ-SHELL-144..168`?*
- **D06-5 —** A shipping agent caps questions at 1–4 of 2–4 options [39]. Meets `REQ-CHAT-092` (1–10 steps, up to 8 options), all shown at once in the question stepper `PD-CHAT-002` docks. *Should the bounds stand when up to 80 options can sit above the composer?*
- **D06-6 —** Stating a consequence before acting is distinct from confirming after [18], and a vendor documents what its undo does not restore [2]. Meets `REQ-TOOLS-063`'s fixed contents, with no word on reversibility. *Should the approval dialog say whether a call can be undone, and from which recorded fact?*
- **D06-7 —** A shipping agent lets the person dismiss the questions and type one general reply [39]. Meets `PD-CHAT-002`'s narrowing of `REQ-CHAT-101`: Submit with every step answered, or Escape. *Should an operator who thinks the questions wrong have a reply the agent can read, not only a cancellation?*
- **D06-8 —** The control that starts work becomes stop in the same place [11]. Meets `REQ-CHAT-005`: the composer's primary button reads `Queue` during a run. *Where is stopping reached from the composer, and should it be where the run started?*
- **D06-9 —** A wait beyond a second warrants an indicator with text, and a request is acknowledged at once [9][10][13]. Meets `PD-CHAT-006`: a live agent-message row draws no mark until `REQ-CHAT-164`'s ten-second stall, a cost it names. *Does the run header's pulsing state tag cover that window for an operator reading the transcript?*
- **D06-10 —** A widely used library opens completed tool calls by default [5]. Meets `REQ-CHAT-061` (expand on click) and `PD-CHAT-010`'s default, Standard. *Is Standard the right default for reviewing a finished run?*
- **D06-11 —** A chat library fades and slides reasoning open and shut [16]. Meets §1.8, "No animation in conversation content". *Is instant expansion of a reasoning row or folded tool group the settled reading, given animated geometry also cancels anchoring [29]?*
- **D06-12 —** Text faster than reading adds nothing, so a client can pace tokens at about 4.8 per second [32]. Meets §1.8. *Is paced release of streamed text animation of content, and would pacing stop for a hidden persona window (`REQ-SHELL-151`)?*
- **D06-13 —** An enterprise system marks AI content with glow, brightness and gradient edges [15]. Meets §1.7, glow and gradient fills forbidden. *Where nearly every row is agent output, does any content need its origin marked, and by what?*
- **D06-14 —** Practitioner advice splits on first-person hedges, which a study found lowered agreement and raised accuracy [8][22], against neutral phrasing [6]. Meets §1.11: direct, second person. *May a product-authored notice about uncertain output speak in the agent's first person?*
- **D06-15 —** A shipping agent gives each agent one of eight hues overlapping state hues [41]. Meets §1.3 and `PD-CHAT-005` ("No persona colour SHALL be a state colour"); the persona ramp's first stops are `--rt-accent-400`, `--rt-axis-y-400`, `--rt-axis-x-400` (`docs/design/system/tokens/colors.css`), the done, running and waiting hues one stop lighter. *On a row carrying both, is a `--rt-viz-2` label told from a `--rt-run` dot without reading the word?*

## 9. References and further reading

- [1] [Emily Campbell, The Shape of AI, Verification](https://www.shapeof.ai/patterns/verification) — friction by harm; opt-out visible; retrieved 2026-11-01
- [2] [Anthropic, Best practices for Claude Code](https://code.claude.com/docs/en/best-practices) — approval decay; interrupt; rewind; subagent cost; retrieved 2026-11-01
- [3] [Anthropic, Our framework for developing safe and trustworthy agents](https://www.anthropic.com/news/our-framework-for-developing-safe-and-trustworthy-agents) — gated modification, standing grants; retrieved 2026-11-01
- [4] [Emily Campbell, The Shape of AI, Stream of Thought](https://www.shapeof.ai/patterns/stream-of-thought) — explicit step states; retrieved 2026-11-01
- [5] [Vercel, AI Elements, Tool](https://elements.ai-sdk.dev/components/tool) — tool states; open by default; retrieved 2026-11-01
- [6] [Megan Chan, Nielsen Norman Group, Explainable AI in Chat Interfaces](https://www.nngroup.com/articles/explainable-ai/) — sources over traces; neutral voice; retrieved 2026-11-01
- [7] [Google PAIR, People + AI Guidebook, Explainability + Trust](https://pair.withgoogle.com/chapter/explainability-trust/) — categorical confidence; retrieved 2026-11-01
- [8] [Page Laubheimer, Nielsen Norman Group, AI Hallucinations: What Designers Need to Know](https://www.nngroup.com/articles/ai-hallucinations/) — warnings in place; hedges; retrieved 2026-11-01
- [9] [Amazon Web Services, Cloudscape Design System, Generative AI loading states](https://cloudscape.design/patterns/genai/genai-loading-states/) — one-second floor; retrieved 2026-11-01
- [10] [Katie Sherwin, Nielsen Norman Group, Progress Indicators Make a Slow System Less Insufferable](https://www.nngroup.com/articles/progress-indicators/) — wait thresholds; retrieved 2026-11-01
- [11] [Emily Campbell, The Shape of AI, Controls](https://www.shapeof.ai/patterns/controls) — stop in place; pause; retrieved 2026-11-01
- [12] [GitHub Docs, Managing agent sessions](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions) — kept commits; authorship; retrieved 2026-11-01
- [13] [Linear, Agent Interaction Guidelines (AIG)](https://linear.app/developers/aig) — state, feedback, disengagement; retrieved 2026-11-01
- [14] [Linear, Agent interaction](https://linear.app/developers/agent-interaction) — state from activity; retrieved 2026-11-01
- [15] [IBM, Carbon Design System, Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/) — light-effect AI marking; retrieved 2026-11-01
- [16] [Vercel, AI Elements, Chain of Thought](https://elements.ai-sdk.dev/components/chain-of-thought) — animated disclosure; retrieved 2026-11-01
- [17] [Emily Campbell, The Shape of AI, Cost estimates](https://www.shapeof.ai/patterns/cost-estimates) — cost at the decision; retrieved 2026-11-01
- [18] [Microsoft HAX Toolkit, Guideline 16: Convey the consequences of user actions](https://www.microsoft.com/en-us/haxtoolkit/guideline/convey-the-consequences-of-user-actions/) — feedforward; retrieved 2026-11-01
- [19] [Bansal et al., Does the Whole Exceed its Parts? The Effect of AI Explanations on Complementary Team Performance](https://arxiv.org/abs/2006.14779) — acceptance either way; retrieved 2026-11-01
- [20] [Bucinca et al., To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-assisted Decision-making](https://arxiv.org/abs/2102.09692) — forcing, rated worst; retrieved 2026-11-01
- [21] [Chen et al., Reasoning Models Don't Always Say What They Think](https://arxiv.org/abs/2505.05410) — trace faithfulness; retrieved 2026-11-01
- [22] [Kim et al., "I'm Not Sure, But...": Examining the Impact of Large Language Models' Uncertainty Expression on User Reliance and Trust](https://arxiv.org/abs/2405.00623) — first-person hedges; retrieved 2026-11-01
- [23] [Vaccaro et al., When combinations of humans and AI are useful: A systematic review and meta-analysis](https://arxiv.org/abs/2405.06087) — combination losses; retrieved 2026-11-01
- [24] [Vance et al., What Do We Really Know about How Habituation to Warnings Occurs Over Time? A Longitudinal fMRI Study of Habituation and Polymorphic Warnings](https://doi.org/10.1145/3025453.3025896) — polymorphic warnings; retrieved 2026-11-01
- [25] [Bravo-Lillo et al., Your Attention Please: Designing security-decision UIs to make genuine risks harder to ignore](https://cups.cs.cmu.edu/soups/2013/proceedings/a6_Bravo-Lillo.pdf) — attractors; retrieved 2026-11-01
- [26] [Mozannar et al., Magentic-UI: Towards Human-in-the-loop Agentic Systems](https://arxiv.org/abs/2507.22358) — action guards; self-approval; retrieved 2026-11-01
- [27] [Dhanorkar et al., Human oversight of agentic systems in practice: Examining the oversight work, challenges, and heuristics of developers using software agents](https://arxiv.org/abs/2606.05391) — oversight heuristics; retrieved 2026-11-01
- [28] [Iqbal and Bailey, Effects of intelligent notification management on users and their tasks](https://doi.org/10.1145/1357054.1357070) — breakpoint delivery; retrieved 2026-11-01
- [29] [W3C CSS Working Group, CSS Scroll Anchoring Module Level 1](https://www.w3.org/TR/css-scroll-anchoring-1/) — anchoring, suppression; retrieved 2026-11-01
- [30] [W3C, Accessible Rich Internet Applications (WAI-ARIA) 1.2](https://www.w3.org/TR/wai-aria-1.2/) — the log role; retrieved 2026-11-01
- [31] [W3C Web Accessibility Initiative, Understanding Success Criterion 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) — pausing updates; retrieved 2026-11-01
- [32] [Liu et al., Andes: Defining and Enhancing Quality-of-Experience in LLM-Based Text Streaming Services](https://arxiv.org/abs/2404.16283) — reading-pace release; retrieved 2026-11-01
- [33] [Bailey and Konstan, On the need for attention-aware systems: Measuring effects of interruption on task performance, error rate, and affective state](https://doi.org/10.1016/j.chb.2005.12.009) — mid-task costs; retrieved 2026-11-01
- [34] [Adamczyk and Bailey, If Not Now, When? The Effects of Interruption at Different Moments Within Task Execution](https://interruptions.net/literature/Adamczyk-CHI04-p271-adamczyk.pdf) — timing and respect; retrieved 2026-11-01
- [35] [McFarlane, Comparison of Four Primary Methods for Coordinating the Interruption of People in Human-Computer Interaction](https://interruptions.net/literature/McFarlane-HCI02_2.pdf) — negotiation; queue draining; retrieved 2026-11-01
- [36] [Trafton et al., Preparing to resume an interrupted task: effects of prospective goal encoding and retrospective rehearsal](https://doi.org/10.1016/S1071-5819(03)00023-5) — warning lag; retrieved 2026-11-01
- [37] [Iqbal and Horvitz, Disruption and Recovery of Computing Tasks: Field Study, Analysis, and Directions](https://interruptions.net/literature/Iqbal-CHI07.pdf) — visible work resumed; retrieved 2026-11-01
- [38] [McFarlane and Latorella, The Scope and Importance of Human Interruption in Human-Computer Interaction Design](https://interruptions.net/literature/McFarlane-HCI02_1.pdf) — announcement; its cost; retrieved 2026-11-01
- [39] [Anthropic, Handle approvals and user input](https://code.claude.com/docs/en/agent-sdk/user-input) — question shape; general reply; retrieved 2026-11-01
- [40] [Anthropic, Tools reference](https://code.claude.com/docs/en/tools-reference) — typed answers; timeout; named requests; retrieved 2026-11-01
- [41] [Anthropic, Create custom subagents](https://code.claude.com/docs/en/sub-agents) — delegation row; tree; colours; retrieved 2026-11-01
- [42] [Anthropic, Manage costs effectively](https://code.claude.com/docs/en/costs) — readout scope; retrieved 2026-11-01
- [43] [Anthropic, Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents) — ids on messages; retrieved 2026-11-01
- [44] [Zhou et al., Relying on the Unreliable: The Impact of Language Models' Reluctance to Express Uncertainty](https://arxiv.org/abs/2401.06730) — reliance; confident errors; retrieved 2026-11-01
