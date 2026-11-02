# 10. UX writing

Labels, empty states, errors, confirmations, progress and acknowledgements in the adopted voice, with the Shell glossary as the only vocabulary.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 10 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

How to write a string the specification leaves open so that it says what happened and what to do, in §1.11's voice and `packages/ui/CONTEXT.md`'s words, and how a reviewer checks it on a built surface.

Not decided here: a string the specification fixes (§1.11: its wording wins); which views, tabs and labels exist (`REQ-SHELL-023`, `-027`, §2); the notice action vocabulary (`REQ-NOTIFY-044`); timing (guide 13); accessible names as a contract (guide 09); approval mechanics (guide 06).

## 2. Principles

- **Copy is read closely.** Developers put 13–25 % of repair fixations on error messages, and re-reading predicted a failed fix [6]. Concise, scannable, objective text more than doubled usability [42]; plain words serve experts too [43].
- **Say what happened, then what to do.** Name the problem and a constructive next step [1]; offer a known remedy [9]; say it in text, not colour alone [8]. Report what was observed, "unknown" rather than a guessed cause, and never "contact support" [2].
- **The reader's terms, not the system's.** A message worded in the machine's model was taken literally and produced the wrong edit [7]. No blame word: state the rule the value meets [3], one pattern per kind, the limit given [5]. Apology and "please" only for real loss [4].
- **Persistence follows consequence.** A transient message suits a low-consequence result of the reader's own command; a failure needing action persists, since transient ones are missed; a system-raised message needs more context [11].
- **Confirm rarely, name the action twice.** Routine confirmations become automatic [12]; undo is an equal safeguard [17]. Title and primary button share the action [13]; a destructive confirmation's dismiss is Cancel [14]; an "anyway" form slows a reflex against the operator's own choice [15]; Cancel discards, Close keeps [16].
- **A decision dialog is a lever that frequency wears out.** Wording moved warning behaviour widely, common warnings were dismissed faster, detail behind a link went unread [18]. Permission text naming the resource, not the risk, was not understood [19]. Holding back the risky option until the decisive field is read helped after habituation [20].
- **An empty state says which empty**: loading, nothing yet or failed, each with a way forward [21]; a heading, a line that adds to it, at most one action [22]. Failed-to-load content is not empty, and counts depending on it are hidden, not zero [23].
- **A wait names what it waits on**, through start, progress, success and failure [24]. Past about 10 s it needs a measure and a way to interrupt [25]; an item count beats "Loading" [26]; unknown totals get no estimate or percentage [27].
- **Agent work takes one set of plain state words and keeps proposed apart from done** [30]. Models seldom mark uncertainty and people rely on them anyway [31], so product copy states outcomes apart from agent prose.
- **Numbers are exact numerals with separators**, no K, M or B [33]; numerals catch the scanning eye [34]. Absolute time where the moment matters [35]; a relative time keeps the exact one reachable by keyboard and screen reader [36].
- **Labels: verb first, positive, sentence case, no period.** Sentence case is the default [38]; buttons and commands are imperative and a toggle names what it turns on [40]; a label or single line takes no period [39].
- **One word per concept, and the word is not self-evident.** One function keeps one name everywhere [45], held by a term list [41]; distinct names aided learning more than familiar ones [50]. Yet two people chose the same word under one time in five [48], and displayed words come back as typed input [49].
- **Each step's title is its question.** The question is the heading, the flow a caption, a count only when reliable [51]; every step is numbered against a fixed total, and the commit control is a specific verb [52].

## 3. Patterns and anti-patterns

Anti-patterns unless marked *(pattern)*; for a pattern the tell is what its absence looks like.

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Bare outcome | failed tool row, error notice | `failed`, "An error occurred", "contact support" | what was observed, then a `REQ-NOTIFY-044` action [1][2][9] |
| Code for text | provider errors | `HTTP 429` alone | sentence first, code last in `--rt-font-mono`, payload in the detail row (`REQ-NOTIFY-037`) [3] |
| Path in the sentence | notice, approval | a full path wraps at 1000 px | basename in the sentence, path on a mono line [2] |
| OK or "sorry" | routine failures | "OK", "Sorry", "Please try again" | Close or the recovering command; §1.11, no filler [2][4] |
| Blame word | Settings, provider sign-in | "invalid key" | the rule the value meets [3][5] |
| Routine confirmation | reversible commands | a dialog per save | `Acknowledgement`; `ConfirmDialog` for loss (`REQ-NOTIFY-009`) [12][17] |
| Matched pair *(pattern)* | `ConfirmDialog` | title and button differ; default "Confirm" shown | one verb in both; Cancel is Cancel [13][14] |
| Speed bump *(pattern)* | warning against the operator's choice | the same verb clicked through | "anyway", as `REQ-SHELL-158`'s "Start anyway" [15] |
| Failure as transient | anything needing action | gone after `REQ-NOTIFY-011`'s lifetime | a notice; never leaves on a timer (`REQ-NOTIFY-040`) [11] |
| Context-free message | background agent's notice | "Run failed" seen from Git | agent, session, workspace; owning session (`REQ-NOTIFY-023`) [11] |
| Empty while loading | Library tabs, board columns | "Nothing here" before the store answers | `Spinner`, then `EmptyState`: why plus an instruction or control (`REQ-NOTIFY-006`) [21] |
| Unavailable as empty | store unreadable | `EmptyState`, `0 tok` | say unavailable; blank the count [23] |
| Static wait | backup, restore | "Loading…" by a `Spinner` | name it; `file 3 of 12` [24][26] |
| Estimate for a run | running state | "about 5 min left" | elapsed time and counts by pause and stop (`REQ-NOTIFY-043`) [25][27] |
| Synonym states | tool rows, run states | "thinking hard"; a plan worded as done | `REQ-MONITOR-105`, `REQ-NOTIFY-048` words; plan in its row category [30] |
| Rounded figure | status strip, `KpiCard` | `612K` | `612,480 tok`, mono (§1.11) [33][34] |
| Relative-only time | rows, commits | "3 h ago", no exact time | absolute for record; exact time in a focusable `Tooltip` [35][36] |
| Noun or negated label | `Button`, `ToggleSwitch` | "Info", "Disable telemetry" | imperative verb; what it turns on [40][38] |
| Sentence on a control | any control | a 393 px button with two clauses (UIR-011) | a short verb; the sentence where its requirement puts it [54] |
| Internal name | notice, `Tooltip` | a proof id, store table, channel | the glossary's word [7][43] |
| Shared step heading | question stepper | every step headed by the flow | the question as heading [51] |
| Generic commit | question stepper | "Next", "Finish", "OK" | a `Button` verb for what the answers do (D10-18) [52] |

## 4. Method

1. **Inventory.** List every visible string and accessible name; mark each **fixed** (quote its requirement or directive) or **open**. Read one machinery's requirements together: the approval dialog's undeliverable line was invented because `REQ-TOOLS-063` leaves it open, though `REQ-CHAT-103` fixes it [55].
2. **Name with the glossary**, checking each *Avoid* line [45][41]. A developer's own term (diff, commit, worktree, exit code) needs no gloss; a coined term reaching visible copy goes to section 8's questions [48][47].
3. **Classify**: result of the operator's command, system-raised, failure, wait, empty, decision. That picks the surface: `Acknowledgement` (`REQ-NOTIFY-011`, `-018`), a notice (`REQ-NOTIFY-023`, G1), or inline text [11].
4. **Write the pattern**: what was observed in the operator's terms, then what to do, the action from `REQ-NOTIFY-044`; the short name in the sentence, path or code on a mono line [1][2][3][7].
5. **A decision** puts the decisive fact in the visible body [18], words the outcome where the specification leaves room [19], shares one verb between title and confirm control [13], and asks how often it will appear [18].
6. **Numbers and time** are exact, separated, mono (§1.4) [33]; the specification's forms win (`REQ-CHAT-060`'s `ok · 3.2s`, `REQ-CHAT-062`'s `~<T> tok`). A running run states elapsed time and counts, precise to its largest unit [27].
7. **States** are `REQ-NOTIFY-048`'s members and `REQ-MONITOR-105`'s tool row status; `blocked` says which case [30].
8. **Read each string aloud alone**: kind word then title (`REQ-NOTIFY-019`), announced without moving focus [10], never leaning on the `StatusDot` beside it (`REQ-SHELL-149`).
9. **Check** against section 6 and rubric F4; open questions go to the brief's §10.

## 5. Worked example

**Surface:** §7's "Approval card" row — mockup `WORKSPACE` → `approvalOn`; nearest built code `packages/ui/src/ApprovalDialog.tsx`; gap G2. It arrives while the operator reads another agent's rows or primary view.

**Inventory.** Fixed by `REQ-TOOLS-063`: "Permission required", `Allow <agent> to run <tool>?`, `Requested by <agent> (<persona> persona).`, "No arguments were reported for this call.", `Matched rule: <rule_id>`, Deny, Approve for this session, Approve once. Fixed by `REQ-CHAT-103`: "Could not deliver the decision. The waiting agent is no longer available." Open: the waiting-count line, and the detail box's accessible name and description, which must say credentials are masked; the reason is the payload's. Nine fixed, three written. The built file keeps its first, falsified sentence beside the fixed one [55].

**Glossary and class.** Request, agent and persona are the specification's words; nothing on an *Avoid* line. A system-raised decision needs context: the requester line names agent and persona, and the dialog takes focus in the window it concerns [11].

**The decision.** The redacted command sits in the visible body in `--rt-font-mono`, where detail was read [18]. The headline names the tool, not the outcome, and its verb (Allow) differs from the buttons' (Approve) [19][13]; both are fixed, so they go to section 8 (D10-13). No default action and focus on Deny is the non-motion relative of holding back the risky option [20]; `PD-TOOLS-005` already bounds how often a run asks after one unanswered approval [18].

**Numbers and announcement.** The built `{n} other request(s) waiting.` uses a numeral and agrees in number, but in body text where §1.4 sets numbers in mono: a reviewer's observation. The undeliverable line carries `role="status"` [10]; the waiting count changes while open, outside the description, so whether it is announced is the check to run [10]. Where the specification wrote the surface, the defect paid for came from the inventory, not style.

## 6. Checks

Rubric ids where the rubric carries the criterion; *proposed* where it does not.

- **F4** — zero *Avoid* words (toast, snackbar, banner, alert, chat log, input box, wizard) in visible text or accessible names outside fixed strings; count from the DOM [45].
- **F4** — every element whose text holds a digit renders in `--rt-font-mono` (`styles.json`); zero K, M, B; separators at four digits [33].
- **F4** — zero "OK", "Sorry", "please", "contact support" on failure surfaces [2][4].
- **F4** — every `Button` label and command starts with a verb, sentence case; `text-transform: uppercase` only on `SectionLabel` [40][38].
- **F4, proposed** — every error notice and `fail` acknowledgement states what was observed and carries an action or next step; report the count without [1][9].
- **F4, proposed** — every `ConfirmDialog` confirm label is a verb found in its title; none shows the default "Confirm"; dismiss is Cancel [13][14].
- **F4, proposed** — run-state and tool row words in the DOM are `REQ-NOTIFY-048` and `REQ-MONITOR-105` members [30].
- **F2** — no `EmptyState` captured before the store answered; each has a why sentence and at least one instruction or control (`REQ-NOTIFY-006`) [21].
- **F2, proposed** — with the store unreadable, no `EmptyState` and no `0 tok` [23].
- **F2** — every `Spinner` is named for its wait; `REQ-SHELL-137`'s "Working" only where nothing is nameable [24].
- **F2, proposed** — a running run shows elapsed time and counts, no time to finish; a percentage only where `REQ-NOTIFY-043` knows one [27].
- **F3** — every acknowledgement, status line and run-state change is in a live region or `role="status"` and reads alone [10].
- **F3** — no field marked `--rt-fail` without text naming the field and the problem [8].
- **F3, proposed** — every relative time's exact time is reachable by Tab and by a screen reader [36].
- **C7** — prose within `--rt-prose-measure`; `Tag`, `SectionLabel` and button text end with no period [39].
- *Proposed* — each question stepper step is titled by its question, numbered against one total; the commit label is a verb (`PD-CHAT-002`) [51][52].

## 7. How this applies here

**Requirements.** `REQ-SHELL-023`, `-027` (never touched); `REQ-SHELL-036`, `-051`–`-053`, `-137`, `-144`, `-149`, `-155`, `-158`; `REQ-NOTIFY-006`, `-008`, `-009`, `-011`, `-014`, `-018`, `-019`, `-023`, `-035`, `-037`, `-040`, `-041`, `-043`, `-044`, `-048`; `REQ-CHAT-018`, `-046`, `-060`, `-062`, `-092`, `-100`–`-103`, `-175`; `REQ-TOOLS-063`, `-158`; `REQ-MONITOR-105`.

**Directives.** `PD-CHAT-002` (the docked question stepper; supersedes `REQ-CHAT-098`, `-099`; narrows `-101`, `-103`); `PD-TOOLS-005` (approval frequency); `PD-ORCH-005` (the continue action's words); `PD-WORKSPACE-001` (the acknowledgement's one action).

**Tokens.** `--rt-font-mono`, `--rt-text-secondary`, `--rt-text-tertiary`, `--rt-fail`, `--rt-wait`, `--rt-run`, `--rt-done`, `--rt-danger-500`, `--rt-info-500`, `--rt-focus`, `--rt-prose-measure`, `--rt-notice-rule-width`.

**Components.** `Button`, `Dialog`, `ConfirmDialog`, `EmptyState`, `Spinner`, `Tooltip`, `Acknowledgement`, `Tag`, `StatusDot`, `SectionLabel`, `Input`, `ToggleSwitch`, `KpiCard`, `MeterBar`, `LogPanel`, `CommandPalette`; gaps G1, G2, G7, G14. Built: `ApprovalDialog.tsx`, `QuestionStepper.tsx`, `Notice.tsx`, `Acknowledgements.tsx` in `packages/ui/src/`.

**The record's lessons.** "The tokens hold but composition breaks" [53]; UIR-011's two-clause button, UIR-007's oversized empty state [54]; the falsified sentence kept beside its replacement [55]; "bound the box, not only the child" for any label that elides (`.agents/skills/build-ui/SKILL.md` step 8, `SHRUNK`).

| Reader | Reads |
|---|---|
| `design-ui` brief §6 (copy), §10 | sections 2–4; section 8 |
| `design-ui` audit step 2 | sections 3, 6 |
| rubric F4 | section 6; section 4 steps 1–2 |
| rubric F2, F3, C7 | section 6, rows so marked |
| `build-ui` step 6, while building | section 6 |
| `review-ui` step 4 | section 6; section 5 as an observation's shape |

## 8. Where this disagrees with the adopted material

Each item is a question to raise; none is a change to make.

- **D10-1 —** Pair a total failure's apology with something novel [1]. Meets §1.11 (no filler), §1.10. *Does any failure here, a crash that leaves a session to continue, warrant more than plain words?*
- **D10-2 —** Avoid "you" in instructing sentences; use the imperative [40]. Meets §1.11 (second person). *Does the imperative satisfy §1.11, and where does a "you" sentence such as a waiting count stand?*
- **D10-3 —** macOS and Linux title-case button labels [14]. Meets §1.11 (sentence case). *Is one casing across three platforms a recorded choice against two conventions?*
- **D10-4 —** Keep the voice, vary the tone by context [44]. Meets §1.11. *Is tone meant to be the same on the Overview and the approval dialog?*
- **D10-5 —** Abbreviations should be expandable at AAA [46]. Meets §1.11 (`612,480 tok`). *Should `tok` carry an expanded accessible name?*
- **D10-6 —** Progress reported slow early and fast late feels faster [28]. Meets §1.11 (exact numbers). *Is any progress figure here a presentation rather than a count?*
- **D10-7 —** Remaining-time estimates should be general and generous [26]. Meets §1.11; `REQ-CHAT-062` marks an estimate with `~`, `REQ-NOTIFY-043` omits an unknown percentage. *Does the exact-number rule bind forecasts, or only counts?*
- **D10-8 —** Animated texture made a bar feel about 11 % faster [29]. Meets §1.8 (two infinite animations). *Is a bounded wait's `MeterBar` a status indicator?*
- **D10-9 —** The strongest attention devices in security dialogs moved [20]. Meets §1.8. *Are only the non-motion variants open to the approval dialog?*
- **D10-10 —** First-person uncertainty reduced overreliance; impersonal hedging did not significantly [32]. Meets §1.11 (unadorned). *Where does product copy end and agent text begin, so calibrated hedges are not read as filler?*
- **D10-11 —** For typed input, accepting many words per target beats one canonical word [48][49]. Meets the glossary as the only vocabulary; `REQ-SHELL-053`'s hidden keywords already do it. *Does the glossary bind what slash-command matching (`REQ-CHAT-018`) accepts, or only what labels show?*
- **D10-12 —** "Do not invent new words or give words new meanings in your application." [47] Meets the glossary's coined terms (persona window, question stepper) and narrowed ordinary words. *Which reach visible copy, and is each explained where first met?*
- **D10-13 —** Name the risk, not the resource [19]; title and button share a verb [13]. Meets `REQ-TOOLS-063`'s `Allow <agent> to run <tool>?` beside Approve once. *Is `<tool>` the tool's name or its description (`REQ-CHAT-175`), and is Allow against Approve intended?*
- **D10-14 —** A transient message is a poor carrier for an error [11]. Meets `REQ-NOTIFY-018`'s `fail` kind and `REQ-SHELL-155`. *Is a `fail` acknowledgement confined to a refusal that leaves nothing to act on?*
- **D10-15 —** One function, one name [45]; distinct concepts, distinct names [50]. Meets `REQ-NOTIFY-019`'s kind word `Notice` for an acknowledgement and `REQ-SHELL-051`'s "Type an action…", words the glossary assigns elsewhere. *Do these stand under §1.11's precedence as the glossary's exceptions?*
- **D10-16 —** Sentence case for titles [38]. Meets `PD-CHAT-002`, which fixes step number, title and description but no overall heading; the built stepper keeps superseded `REQ-CHAT-099`'s "Agent Questions" (`QuestionStepper.tsx`). *Does the stepper carry a heading, in which case?*
- **D10-17 —** One question per step, no all-steps indicator [51]. Meets `PD-CHAT-002`, whose stepper shows every step at once and retires step pills. *Is the step number the only position cue, and does the built pill row stand?*
- **D10-18 —** The commit control is a specific verb, never Next or a generic word [52]. Meets `PD-CHAT-002`'s single Submit, built "Submit answers". *Is Submit a fixed label, and does it say where the answers go?*
- **D10-19 —** One abbreviation per unit: `sec`, `min` [37]. Meets `REQ-CHAT-060`'s `3.2s`, `REQ-CHAT-062`'s `<N>s`. *Is `s` the product's form wherever the unit is left open?*
- **D10-20 —** A single line ends without a period [39]. Meets the specification's one-sentence strings, which end with one. *Which rule does an open one-sentence status line follow?*
- **D10-21 —** One fixed set of plain state words [30]. Meets §1.11's `waiting` and `done`, not members of `REQ-NOTIFY-048` (`paused`, `completed`). *Are §1.11's words §1.3's axis meanings, with `REQ-NOTIFY-048` the words on screen?*
- **D10-22 —** A failure gives a next step [1]. Meets `REQ-CHAT-102`'s and `REQ-CHAT-103`'s undeliverable sentences, which give the cause only. *Is closing the dialog or stepper the assumed next step, and need it be said?*
- **D10-23 —** At most one action in an empty state [22]. Meets `REQ-NOTIFY-006`, which sets no upper bound. *Is a second control ever wanted?*

## 9. References and further reading

[1] [Nielsen Norman Group, Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) — problem plus remedy; delight; retrieved 2026-11-01
[2] [Microsoft, Error Messages (Windows 7 desktop UX guidelines)](https://learn.microsoft.com/en-us/windows/win32/uxguide/mess-error) — no OK, no guess, short names, no support; retrieved 2026-11-01
[3] [Adobe Spectrum, Writing for errors](https://spectrum.adobe.com/page/writing-for-errors/) — codes last; no blame; retrieved 2026-11-01
[4] [Atlassian Design System, Error messages](https://atlassian.design/foundations/content/designing-messages/error-messages) — sorry, please; retrieved 2026-11-01
[5] [GitLab Pajamas Design System, Error messages](https://design.gitlab.com/content/error-messages) — one pattern, limits; retrieved 2026-11-01
[6] [Barik et al., Do Developers Read Compiler Error Messages?](http://static.barik.net/barik/publications/icse2017/PID4655707.pdf) — fixations; re-reading; retrieved 2026-11-01
[7] [Marceau, Fisler, Krishnamurthi, Measuring the Effectiveness of Error Messages Designed for Novice Programmers](https://cs.brown.edu/~sk/Publications/Papers/Published/mfk-measur-effect-error-msg-novice-sigcse/paper.pdf) — literal readings; retrieved 2026-11-01
[8] [W3C WAI, Understanding Success Criterion 3.3.1: Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) — text; retrieved 2026-11-01
[9] [W3C WAI, Understanding Success Criterion 3.3.3: Error Suggestion](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html) — remedy; retrieved 2026-11-01
[10] [W3C WAI, Understanding Success Criterion 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — announcement; retrieved 2026-11-01
[11] [Nielsen Norman Group, Indicators, Validations, and Notifications](https://www.nngroup.com/articles/indicators-validations-notifications/) — persistence; context; retrieved 2026-11-01
[12] [Nielsen Norman Group, Confirmation Dialogs Can Prevent User Errors (If Not Overused)](https://www.nngroup.com/articles/confirmation-dialog/) — rare confirmations; retrieved 2026-11-01
[13] [IBM Carbon Design System, Dialog pattern](https://carbondesignsystem.com/patterns/dialog-pattern/) — shared action; retrieved 2026-11-01
[14] [Apple, Alerts (Human Interface Guidelines)](https://developer.apple.com/design/human-interface-guidelines/alerts) — Cancel; title style; retrieved 2026-11-01
[15] [Microsoft, Confirmations (Windows 7 desktop UX guidelines)](https://learn.microsoft.com/en-us/windows/win32/uxguide/mess-confirm) — "anyway"; retrieved 2026-11-01
[16] [Nielsen Norman Group, Cancel vs Close: Design to Distinguish the Difference](https://www.nngroup.com/articles/cancel-vs-close/) — discard, keep; retrieved 2026-11-01
[17] [W3C WAI, Understanding Success Criterion 3.3.4: Error Prevention (Legal, Financial, Data)](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html) — undo; retrieved 2026-11-01
[18] [Akhawe and Felt, Alice in Warningland (full paper)](https://www.usenix.org/system/files/conference/usenixsecurity13/sec13-paper_akhawe.pdf) — wording, fatigue, hidden detail; retrieved 2026-11-01
[19] [Felt et al., Android Permissions: User Attention, Comprehension, and Behavior](https://cups.cs.cmu.edu/soups/2012/proceedings/a3_Felt.pdf) — risks, not resources; retrieved 2026-11-01
[20] [Bravo-Lillo et al., Your Attention Please](https://cups.cs.cmu.edu/soups/2013/proceedings/a6_Bravo-Lillo.pdf) — inhibitive attractors; retrieved 2026-11-01
[21] [Nielsen Norman Group, Designing Empty States in Complex Applications: 3 Guidelines](https://www.nngroup.com/articles/empty-state-interface-design/) — which empty; retrieved 2026-11-01
[22] [GitHub Primer, Empty states](https://primer.style/product/ui-patterns/empty-states/) — heading, line, one action; retrieved 2026-11-01
[23] [GitHub Primer, Degraded experiences](https://primer.style/product/ui-patterns/degraded-experiences/) — unavailable, hidden counts; retrieved 2026-11-01
[24] [GitHub Primer, Loading](https://primer.style/product/ui-patterns/loading/) — named waits; retrieved 2026-11-01
[25] [Jakob Nielsen, Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) — 10 s, interrupt; retrieved 2026-11-01
[26] [Katie Sherwin, Progress Indicators Make a Slow System Less Insufferable](https://www.nngroup.com/articles/progress-indicators/) — counts; estimates; retrieved 2026-11-01
[27] [Microsoft, Progress Bars (Windows desktop UX guidelines)](https://learn.microsoft.com/en-us/windows/win32/uxguide/progress-bars) — unknown totals; precision; retrieved 2026-11-01
[28] [Harrison et al., Rethinking the Progress Bar](https://www.chrisharrison.net/projects/progressbars/ProgBarHarrison.pdf) — shape of a wait; retrieved 2026-11-01
[29] [Harrison, Yeo, Hudson, Faster Progress Bars](https://chrisharrison.net/projects/progressbars2/ProgressBarsHarrison.pdf) — animated texture; retrieved 2026-11-01
[30] [The Shape of AI (Emily Campbell), Stream of Thought](https://www.shapeof.ai/patterns/stream-of-thought) — step states; proposed, done; retrieved 2026-11-01
[31] [Zhou et al., Relying on the Unreliable](https://arxiv.org/abs/2401.06730) — unhedged models; retrieved 2026-11-01
[32] [Kim et al., "I'm Not Sure, But..."](https://arxiv.org/abs/2405.00623) — first-person hedging; retrieved 2026-11-01
[33] [Microsoft Writing Style Guide, Numbers](https://learn.microsoft.com/en-us/style-guide/numbers) — separators; no K, M, B; retrieved 2026-11-01
[34] [Jakob Nielsen, Show Numbers as Numerals When Writing for Online Readers](https://www.nngroup.com/articles/web-writing-show-numbers-as-numerals/) — numerals; retrieved 2026-11-01
[35] [GitLab Pajamas Design System, Date and time](https://design.gitlab.com/content/date-and-time) — absolute for record; retrieved 2026-11-01
[36] [GitHub Primer, RelativeTime: accessibility](https://primer.style/components/relative-time/accessibility) — reachable exact time; retrieved 2026-11-01
[37] [Microsoft Writing Style Guide, Date and time terms](https://learn.microsoft.com/en-us/style-guide/a-z-word-list-term-collections/term-collections/date-time-terms) — unit abbreviations; retrieved 2026-11-01
[38] [Microsoft Writing Style Guide, Capitalization](https://learn.microsoft.com/en-us/style-guide/capitalization) — sentence case; retrieved 2026-11-01
[39] [GNOME Project, Writing Style](https://developer.gnome.org/hig/guidelines/writing-style.html) — no period; retrieved 2026-11-01
[40] [KDE Community, Text and labels](https://develop.kde.org/hig/text_and_labels/) — imperative; positive toggles; "you"; retrieved 2026-11-01
[41] [Apple, Writing (Human Interface Guidelines)](https://developer.apple.com/design/human-interface-guidelines/writing) — term list, patterns; retrieved 2026-11-01
[42] [John Morkes and Jakob Nielsen, Concise, SCANNABLE, and Objective](https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/) — 124 % combined; retrieved 2026-11-01
[43] [Hoa Loranger, Plain Language Is for Everyone, Even Experts](https://www.nngroup.com/articles/plain-language-experts/) — plain for experts; retrieved 2026-11-01
[44] [Mailchimp Content Style Guide, Voice and Tone](https://styleguide.mailchimp.com/voice-and-tone/) — tone varies; retrieved 2026-11-01
[45] [W3C WAI, Understanding Success Criterion 3.2.4: Consistent Identification](https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html) — one name; retrieved 2026-11-01
[46] [W3C WAI, Understanding Success Criterion 3.1.4: Abbreviations](https://www.w3.org/WAI/WCAG22/Understanding/abbreviations.html) — expansion; retrieved 2026-11-01
[47] [W3C AGWG and COGA Task Force, Making Content Usable for People with Cognitive and Learning Disabilities, 4.4.1 Use Clear Words](https://www.w3.org/TR/coga-usable/#use-clear-words-pattern) — no invented words; retrieved 2026-11-01
[48] [Furnas et al., The vocabulary problem in human-system communication](https://doi.org/10.1145/32206.32212) — agreement below 0.20; aliasing; retrieved 2026-11-01
[49] [Good et al., Building a user-derived interface](https://michaelgood.info/publications/usability/building-a-user-derived-interface/) — logged words; 26 %; mimicry; retrieved 2026-11-01
[50] [Landauer, Galotti, Hartwell, Natural command names and initial learning](https://doi.org/10.1145/358150.358157) — distinct names; retrieved 2026-11-01
[51] [GOV.UK Design System, Question pages](https://design-system.service.gov.uk/patterns/question-pages/) — one question; counts; retrieved 2026-11-01
[52] [Microsoft Learn, Wizards - Win32 apps](https://learn.microsoft.com/en-us/windows/win32/uxguide/win-wizards) — fixed totals; Back; commit verbs; retrieved 2026-11-01
[53] [Rotaris record, Fidelity §7.1–7.2](../../design/README/07-7-fidelity-consult-before-maintain-after.md) — composition breaks; retrieved 2026-11-02
[54] [Rotaris record, all twelve critic findings repaired](../../architecture/codebase/17-all-twelve-critic-findings-repaired-and.md) — UIR-007, UIR-011; retrieved 2026-11-02
[55] [Rotaris record, ApprovalDialog.tsx](../../../packages/ui/src/ApprovalDialog.tsx) — the falsified sentence; retrieved 2026-11-02
