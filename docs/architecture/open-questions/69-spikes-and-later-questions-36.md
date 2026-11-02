# Open questions — Spikes, and the questions raised since (36 of 36)

Part 69 of 69 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-468, OQ-477, OQ-487, OQ-490, OQ-491, OQ-493 – OQ-503; OQ-460 – OQ-467 archived in [the archive](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md).

- OQ-460 — May clause (4)'s second hand-over wait an interval of its own?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-460)
- OQ-461 — What does a launch end as when the holder is live and never answers?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-461)
- OQ-462 — What is the person told when a utility process is lost or never reports ready, and is it forked again?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-462)
- OQ-463 — Should a credential at rest be encrypted under the platform's user-bound key, beyond the mode bits and the access-control list …; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-463)
- OQ-464 — Does the workspace write boundary bind the terminal, git and MCP tools, or the file tools alone?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-464)
- OQ-465 — May the per-session log be bounded in size, and by what shape?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-465)
- OQ-466 — Does the renderer stay on the `file:` scheme, or move to a privileged custom scheme?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-466)
- OQ-467 — What bounds the size of what a renderer command carries?; ruled 2026-11-01; [archived](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-467)

<a id="oq-468"></a>

**OQ-468 — Do the workspace-boundary sentences the user reads overclaim where OS confinement is inactive?** *(REQ-WORKSPACE-022, REQ-TOOLS-131, REQ-CONFIG-327, REQ-TOOLS-129, ADR-0022, IC-8. Raised 2026-11-01 by the ruling of OQ-464, which asked for it and did not rule it.)*

**What is open.** OQ-464 ruled the boundary per tool: the fence binds every first-party tool that takes a path, the gate's key scoping binds a tool call carrying a path key, and the terminal and MCP are bounded by OS confinement where it exists and by nothing on native Windows (IC-8). Three sentences the user reads say more. REQ-WORKSPACE-022 and REQ-TOOLS-131 state, verbatim, "File access: agents may read and write inside this workspace folder only." REQ-CONFIG-327 states that "any call reaching a path outside the workspace continues to require approval". Where confinement is inactive a shell command reaches any path the operating system allows, and the sentences promise what the mechanism does not hold.

**What the build proceeds under.** The sentences stay as the requirements state them; a change to those strings needs a directive, which OQ-464's ruling did not mint. The hardening plan hardens the fence (bundle `fence-hardening`) and adds OQ-464's invariant test, and changes no user-facing wording.

**What decides it.** A ruling on whether the wording is narrowed where confinement is inactive (a directive over the three requirements, stating the terminal's and MCP's boundary as it is), or left as the target's own words with the gap recorded in `docs/architecture/hardening.md`.

<a id="oq-477"></a>

**OQ-477 — How is a store refused as corrupt resolved?** *(REQ-SESSION-089, REQ-SESSION-201, REQ-SESSION-202, ADR-0058's recovery ladder, OQ-281. Raised 2026-11-01 by hardening C1, which built the refusal.)*

**What is open.** The workspace service's open now runs `PRAGMA quick_check` before it migrates, and a store that fails it is refused as `workspace.store-corrupt`, naming the store and SQLite's report, held by main beside the other store refusals (`main/store-notice.ts`). Nothing resolves it. ADR-0058's ladder (salvage into a fresh store, the exports of what it recovered, moving the damaged store aside and starting an empty one, and naming the restore as a remedy the user may take) is unbuilt. REQ-SESSION-201's restore is refused for a window with no workspace identifier unless the held refusal is `workspace.store-missing` (`main/store-resolution.ts`, `placeOf`), and Settings › Project disables it the same way. Admitting it here leaves open what the assessment says about a target it cannot read: its sessions and its lock rows may sit on the damaged pages, and REQ-SESSION-201's first dialog states how many sessions the replaced store holds. It also leaves open whether the inspection may open the target read-write, whose close checkpoints the log the refusal kept. Whether the notice should carry an action, and which, follows from that.

**What the build proceeds under.** The refusal is held and raised as an error notice with no action. Its detail says the store was left as it was found, its write-ahead log included, and that no session starts until it is resolved. It names no remedy the product cannot perform. The person resolves it by hand. A copy may be taken and repaired outside the product; and once the store is moved out of its place by hand, the place reads as REQ-SESSION-202's empty place, where Settings › Project admits the restore and the new store (OQ-281).

**What decides it.** A ruling on which of the ladder's steps, and whether the restore, are offered while the refusal is held; what the restore's assessment reports for a target that fails the check; and the notice's action.

<a id="oq-490"></a>

**OQ-490 — Does R-092's "superseded requirements" ask for more than the text beyond a definition line, which is none?** *(R-092, REQ-TRACE-181, `docs/architecture/hardening.md` §6 row 6, `AGENTS.md` "When the owner asks for something". Raised 2026-11-02 by hrd2's bundle I3, building the archive's specification kind.)*

**What is open.** R-092 named superseded requirements among the history to archive, and its classification fixed what stays: "a superseded or withdrawn requirement keeps its identifier, its anchor and its definition line in `docs/spec/`, and its text moves verbatim to the archive". The kind (`tools/archive/spec.mjs`) moves the lines beyond a definition's first paragraph, leaving the directive's back-pointer. Its first run over the 275 requirements that qualify (268 withdrawn in place, 7 superseded by a directive) moved nothing: every one of them is wholly its definition line, and the 7 superseded ones are that line and their back-pointer blockquote. The withdrawn ones' reasons (`*Withdrawn.* Its only surface was a terminal-interface modal … carried by REQ-…`) are written on the definition line itself, so the 88,622 bytes those 275 lines hold (2.1% of `docs/spec/`'s 4,167,448) stay where an agent reading a part loads them. Moving a withdrawal's reason would cut a definition line, which edits the specification in place.

**What the build proceeds under.** The kind is built, in `pnpm archive:migrate` and its `--check`: text written under a withdrawn or superseded definition from now on moves on the next run. No line of `docs/spec/` was changed, and the generated artifact is identical.

**What decides it.** A ruling on whether R-092 is met by the guard as built, or wants the withdrawn definition lines shortened to the identifier, the marker and the requirement that carries the capability, the reasoning archived. The second edits `docs/spec/` in place, against the rule `AGENTS.md` states, so it would be the owner's to allow (an escalation), not a ruling under R-072.

<a id="oq-491"></a>

**OQ-491 — Does `PD-ORCH-002` supersede `REQ-ORCH-153` whole, or narrow its presentation clause?** *(REQ-ORCH-153, PD-ORCH-002, REQ-ORCH-154, OQ-237, R-092. Raised 2026-11-01 by hrd2's bundle H1, building `rotaris/requirement-citations-resolve`.)*

**What is open.** `PD-ORCH-002`'s disposition reads `> **Supersedes:** REQ-ORCH-153`, so `pnpm symbols` writes `SUPERSEDED_BY['REQ-ORCH-153'] = 'PD-ORCH-002'`, marks the requirement `@deprecated` ("Cite the directive, not this"), and `pnpm req-coverage` leaves it out of the live shipping total; `PD-ORCH-003` and OQ-237's ruling reason from that supersession. The directive's own rule says something narrower: "`REQ-ORCH-153`'s presentation clause … is narrowed", and its text restates none of the requirement's other clauses — the planning grants withheld at dispatch, no child holding a writing tool and no hook or check suite while the gate is held, the three answers, `awaiting_plan_decision`, the hold surviving a restart and raising no terminal status. The code cites `REQ-ORCH-153` for exactly those clauses: 151 lines in 57 files under `packages/`, `apps/` and `tools/` name it without a word of supersession. Read as the disposition states it, those clauses no longer govern and nothing replaces them; read as the rule states it, the requirement still governs outside its presentation clause and the disposition, the artifact and the coverage denominator say otherwise.

**What the build proceeds under.** `rotaris/requirement-citations-resolve` holds `REQ-ORCH-153` in its `pending` option, citing this entry (`eslint.config.js`): the rule still fails a citation of an identifier that does not exist, and suspends the superseded check for this one identifier only. No citation was rewritten, and nothing `pnpm symbols` generates was changed (bundle I3 reads the superseded set as it stands).

**What decides it.** A ruling on which reading governs. If the rule's: a revision of `PD-ORCH-002` whose disposition narrows `REQ-ORCH-153` (`SUPERSEDED_BY` then loses one key and the live total gains one), and the `pending` entry leaves. If the disposition's: the clauses the code relies on are restated where they govern (a directive), each citation moves to it, and the `pending` entry leaves.

<a id="oq-493"></a>

**OQ-493 — Does the accessibility contract REQ-SHELL-144..168 aim at a WCAG 2.2 conformance level, so that a success criterion it does not restate is owed, or is it the whole contract?** *(REQ-SHELL-144, REQ-SHELL-148, REQ-SHELL-160, REQ-SHELL-066, REQ-SHELL-068, REQ-SHELL-070, §1.11. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 08 §8 items 21 and 9 ([the guide](../../research/design/08-platform-conventions-for-electron.md)), guide 09 §8 item 2 ([the guide](../../research/design/09-accessibility-for-a-dense-desktop-tool.md)) and guide 10 §8 item 5 ([the guide](../../research/design/10-ux-writing.md)) of the design research corpus and backlog rows 19, 46 and 102 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** No desktop requirement names WCAG: in `docs/spec/` the word occurs only in `17-terminal-ui.md`. REQ-SHELL-144 states its own thresholds (“4.5:1 for normal text, and 3:1 for large text … and for non-text boundaries”) and its own naming rule. REQ-SHELL-148 and REQ-SHELL-160 (c) draw the ring “wholly within the control's own bounds” at the theme's width. REQ-SHELL-066 to REQ-SHELL-070 move a divider by drag, by keys and by reset. §1.11 writes `612,480 tok`. Read against WCAG 2.2, guide 08 §8 D08-21 finds SC 2.5.7 (Dragging Movements, AA) unmet by a keyboard route alone. Guides 08 §8 D08-9 and 09 §8 D09-2 find a 2 px inset ring failing SC 2.4.13's area test (AAA). Guide 10 §8 D10-5 finds `tok` unexpanded under SC 3.1.4 (AAA). The guides argue SC 2.2.1, 2.2.2, 1.4.4 and 1.4.10 under OQ-498, OQ-497 and OQ-495. Whether any of these criteria binds depends on a conformance target the record never names.

**What the build proceeds under.** REQ-SHELL-144..168 as written, read as the whole contract: no WCAG success criterion binds unless a requirement restates it.

**What decides it.** One ruling naming the target: the contract as written; WCAG 2.2 AA, which makes each unmet AA criterion (2.5.7 now, and 2.2.1, 2.2.2, 1.4.4 and 1.4.10 where OQ-498, OQ-497 and OQ-495 find them unmet) a directive over the requirement it meets; or AA plus named AAA criteria (2.4.13 through a theme token under REQ-SHELL-129, 3.1.4 through an accessible expansion). The ruling also sets the weight OQ-498, OQ-497 and OQ-495 give their WCAG arguments.

<a id="oq-494"></a>

**OQ-494 — Under an active OS forced-colours palette, does the shell defer to it or switch to `high-contrast`, and what then marks a floating surface and governs REQ-SHELL-160 (b)?** *(REQ-SHELL-128, REQ-SHELL-160, §1.7. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 08 §8 item 12 ([the guide](../../research/design/08-platform-conventions-for-electron.md)) and guide 09 §8 item 11 ([the guide](../../research/design/09-accessibility-for-a-dense-desktop-tool.md)) of the design research corpus and backlog row 24 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-128 offers three app themes, “rotaris-dim” (the default), “nocturne” and “high-contrast”. REQ-SHELL-160 (b) requires that “no native surface presents a light background while a dark theme is active, or the reverse”. §1.7 says “a shadow only ever means *this floats*”. Guides 08 §8 D08-12 and 09 §8 D09-11 note three effects of an OS forced-colours palette: it overrides every token, it may be light, and it removes shadows, so a transitory surface needs a 2 px border to read as floating. OQ-29's ruling read REQ-SHELL-160 (b) as covering only the surfaces the application tints, never an OS palette. The record says nothing of forced colours.

**What the build proceeds under.** The three app themes of REQ-SHELL-128, with no forced-colours handling stated.

**What decides it.** One ruling on the forced-colours stance: defer to the OS palette (forced-colors styles, a border on every floating surface, REQ-SHELL-160 (b) read for a light OS palette), or switch to `high-contrast` while one is active. Deferring widens the theme-proof matrix.

<a id="oq-495"></a>

**OQ-495 — Are renderer zoom and OS text enlargement supported inputs, when under them a 1000×680 window lays out below every compact threshold?** *(REQ-SHELL-022, REQ-SHELL-030, REQ-SHELL-160, PD-SHELL-003. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 09 §8 item 12 ([the guide](../../research/design/09-accessibility-for-a-dense-desktop-tool.md)) and guide 14 §8 item 6 ([the guide](../../research/design/14-how-a-surface-gives-way.md)) of the design research corpus and backlog row 5 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-SHELL-022 guarantees every view at “1000×680 logical pixels”. REQ-SHELL-160 (d) and REQ-SHELL-030 measure scaling only as “100%, 125%, 150%, 175% and 200% OS display scaling”, a change that leaves the logical width unchanged. Guides 09 §8 D09-12 and 14 §8 D14-6 read WCAG 1.4.4 and 1.4.10 as asking for text enlarged to 200 % and reflow under zoom. Renderer zoom at 200 % would lay a 1000 px window out at 500 CSS px, below REQ-SHELL-059's 1180 and REQ-SHELL-047's 1080. The record says neither whether zoom is reachable nor what it owes. PD-SHELL-003 revision 2 removed Electron's default application menu, and no code under `apps/desktop/src/` sets or limits a zoom factor.

**What the build proceeds under.** REQ-SHELL-022's 1000×680 guarantee under OS display scaling only, and REQ-SHELL-160 (d) as written.

**What decides it.** One ruling on whether renderer zoom and OS text enlargement are supported inputs. Yes owes a layout below 1000 CSS px (a directive over REQ-SHELL-022) and audits at those widths. No records both as outside the contract, and renderer zoom is then bounded or disabled.

<a id="oq-496"></a>

**OQ-496 — Which non-status transitions does §1.8 admit: a rearranged structure, a pane becoming an overlay drawer, the palette's listing appearing, a primary view arriving?** *(§1.8, REQ-SHELL-135, REQ-TRACE-318, REQ-TRACE-327, REQ-SHELL-059, REQ-SHELL-051, REQ-NOTIFY-022. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 03 §8 items 8 and 7 ([the guide](../../research/design/03-information-architecture-within-a-fixed-structure.md)), guide 05 §8 items 1 and 2 ([the guide](../../research/design/05-interaction-patterns-for-desktop-tools.md)), guide 07 §8 item 11 ([the guide](../../research/design/07-visual-composition-beyond-tokens.md)), guide 14 §8 item 1 ([the guide](../../research/design/14-how-a-surface-gives-way.md)), guide 01 §8 item 4 ([the guide](../../research/design/01-how-ai-design-tools-design.md)) and guide 02 §8 item 5 ([the guide](../../research/design/02-the-generated-look-and-its-counter-moves.md)) of the design research corpus and backlog rows 91, 92, 112 and 145 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.8 says “Animation belongs to status indicators only”. It also ships `--rt-ease-out` “for entrances” and `--rt-duration-slow` for “enter-and-exit”, and REQ-NOTIFY-022 animates an acknowledgement's entrance and exit. Which surfaces may enter or move is therefore not stated. REQ-TRACE-318 says the rail's drag widening “SHALL NOT be animated”, and REQ-TRACE-327 re-centres the graph on selection without stating motion. Guides 03 §8 D03-8, 05 §8 D05-1 and D05-2, and 07 §8 D07-11 cite studies in which animated reordering and re-centring reduced reorientation. Guide 14 §8 D14-1 asks that nothing jump or vanish unanimated on resize (REQ-SHELL-059's drawer switch). Guide 03 §8 D03-7 cites a faded-in menu remainder that sped selection, which bears on REQ-SHELL-051's palette. Guides 01 §8 D01-4 and 02 §8 D02-5 cite vendor advice for an orchestrated load animation of a view.

**What the build proceeds under.** §1.8 as adopted: no motion outside status indicators and surfaces that enter, so reorder, re-centring, the drawer switch, the palette listing and a view's arrival are instant, and REQ-TRACE-318's widening unanimated.

**What decides it.** One ruling on §1.8's scope. Either it already excludes every such transition (a reading), or an amendment of §1.8 names the transitions it admits, each honouring REQ-SHELL-135, with REQ-TRACE-318's unanimated widening left standing unless a directive reverses it.

<a id="oq-497"></a>

**OQ-497 — Does flipping the in-app reduced-motion setting stop a pulse or spinner that is already running, or only the next one to start?** *(REQ-SHELL-135, §1.8. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 11 §8 item 2 ([the guide](../../research/design/11-design-critique-and-evaluation.md)) and guide 13 §8 item 8 ([the guide](../../research/design/13-states-feedback-and-time.md)) of the design research corpus and backlog row 4 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.8 permits `.status-dot.is-pulsing`, “used only while a state is actively running”, and the 0.8 s `.spinner`. REQ-SHELL-135 says the value “is read at each animation start rather than cached, so flipping the in-app setting … takes effect without relaunch”. An infinite animation that started before the flip has no later start at which to read it. Guides 11 §8 D11-2 and 13 §8 D13-8 read WCAG SC 2.2.2 as asking that self-starting motion running past 5 s beside other content can be paused, stopped or hidden, and a pulse may last a whole run.

**What the build proceeds under.** REQ-SHELL-135's resolution order, read at each animation's start.

**What decides it.** A reading of REQ-SHELL-135's “takes effect without relaunch”. Either a running pulse or spinner stops when the setting changes, so every StatusDot and Spinner re-reads it on change, or the change waits for each animation's next start. OQ-493's target sets the weight of the SC 2.2.2 argument.

<a id="oq-498"></a>

**OQ-498 — Does an acknowledgement's 4200 ms lifetime pause while the pointer rests on it?** *(REQ-NOTIFY-011, REQ-NOTIFY-003, REQ-NOTIFY-015, REQ-NOTIFY-020, PD-WORKSPACE-001. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 05 §8 item 5 ([the guide](../../research/design/05-interaction-patterns-for-desktop-tools.md)), guide 09 §8 item 5 ([the guide](../../research/design/09-accessibility-for-a-dense-desktop-tool.md)), guide 11 §8 item 5 ([the guide](../../research/design/11-design-critique-and-evaluation.md)) and guide 13 §8 items 1, 2 and 3 ([the guide](../../research/design/13-states-feedback-and-time.md)) of the design research corpus and backlog row 1 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** REQ-NOTIFY-011: an acknowledgement “takes itself off screen 4200 ms after it becomes visible … No surface declares a transient lifetime of its own”, and REQ-NOTIFY-020's non-expiring case is the only exception. REQ-NOTIFY-015 gives it no focus, so it has no focus to pause on. REQ-NOTIFY-003 already makes a failure, a refusal or an outcome with a recovery action a persistent notice as well. PD-WORKSPACE-001, the owner's, puts “Start a new session” on an acknowledgement and accepts that it is “ignored until it withdraws”. Guides 05 §8 D05-5, 09 §8 D09-5, 11 §8 D11-5 and 13 §8 D13-1 to D13-3 read SC 2.2.1 and design-system practice as asking for a 5 s floor and a pause on hover and focus for a self-withdrawing message.

**What the build proceeds under.** REQ-NOTIFY-011's fixed 4200 ms, REQ-NOTIFY-015's no focus, and PD-WORKSPACE-001 as the owner wrote it.

**What decides it.** One ruling: the lifetime pauses while the pointer rests on an acknowledgement (a directive over REQ-NOTIFY-011), or it stands because REQ-NOTIFY-003 already gives every consequential event a notice. PD-WORKSPACE-001 is the owner's and stays as written either way.

<a id="oq-499"></a>

**OQ-499 — May a literal pixel value stand off the token scale, as an optical correction or as the metric debt the ui-language baseline tolerates, and how does §1 say so?** *(§1, §1.5, AGENTS.md (design material). Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 07 §8 item 4 ([the guide](../../research/design/07-visual-composition-beyond-tokens.md)) and guide 12 §8 items 8 and 9 ([the guide](../../research/design/12-design-system-governance-and-drift.md)) of the design research corpus and backlog rows 131 and 150 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1 says “Token names are normative — cite the token, never a literal colour or pixel value”, and `AGENTS.md` repeats it. `tools/ui-language-baseline.json` holds the metric half of that rule on a baseline of standing occurrences, while colour is graded exactly. Guide 07 §8 D07-4 cites token systems that admit recorded optical corrections. Guide 12 §8 D12-8 and D12-9 cite graded enforcement, and a blocking check enabled only once every violation is fixed. The adopted sentence admits no exception, yet the tooling holds one.

**What the build proceeds under.** §1's tokens only, with the metric check held at its baseline in `tools/ui-language-baseline.json`.

**What decides it.** One ruling, recorded in §1 by amendment: no literal stands and the baseline is debt to burn down, or a recorded off-scale value is admitted with the form `ui-audit` and `check-ui-language` accept.

<a id="oq-500"></a>

**OQ-500 — Does §1.4's type system, three faces and three weights with “never weight” for hierarchy, keep row headers, Table group headers and the approval dialog's tool name distinct on dense surfaces?** *(§1.4. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 03 §8 item 3 ([the guide](../../research/design/03-information-architecture-within-a-fixed-structure.md)), guide 07 §8 items 1 and 2 ([the guide](../../research/design/07-visual-composition-beyond-tokens.md)), guide 01 §8 item 2 ([the guide](../../research/design/01-how-ai-design-tools-design.md)) and guide 02 §8 item 3 ([the guide](../../research/design/02-the-generated-look-and-its-counter-moves.md)) of the design research corpus and backlog rows 49 and 141 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.4: “Three weights, and only three … Nothing in the system goes above 500. Hierarchy is size, colour and space — never weight.” It also sets three faces: Space Grotesk, Manrope and JetBrains Mono. Guides 03 §8 D03-3 and 07 §8 D07-1 cite platform guidance that ranks a row's texts, and a confined title at body size, by weight. Guide 07 §8 D07-2 cites advice to use one interface face or as few as possible. The precedence question of guides 01 §8 D01-2 and 02 §8 D02-3, about an installed skill advising extreme weight contrast, is already answered: §2 makes the language “Adopted, and authoritative”, and `AGENTS.md`'s approved inputs include no agent skill.

**What the build proceeds under.** §1.4's three faces and three weights.

**What decides it.** After a measurement on the named surfaces, one ruling: §1.4 stands, or a weight or a face changes by §1.4 amendment.

<a id="oq-501"></a>

**OQ-501 — Does §1.3's “never mixed on one surface” mean one window or one component, when a glance crosses the status strip and the delegation tree?** *(§1.3, §7.3. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 11 §8 item 4 ([the guide](../../research/design/11-design-critique-and-evaluation.md)) of the design research corpus and backlog row 99 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.3 lets the same hues read twice: running and `--rt-ok` (sound) on axis Y, waiting and `--rt-warn` (attention) on axis X. It says “the two families are never mixed on one surface”, and `--rt-ok` resolves with `--rt-run` (§7.3). Guide 11 §8 D11-4 cites, on one anecdote, daily users confused by one symbol meaning different things in different places. The status strip and the delegation tree share one window, and §1.3 does not say whether “surface” is that window or each component.

**What the build proceeds under.** §1.3 as adopted, with “surface” undefined.

**What decides it.** A reading of “surface” in §1.3, recorded as a note there. If it means the window, every surface drawing both families is a defect to find.

<a id="oq-502"></a>

**OQ-502 — Should the pulse mark what needs the operator rather than what is running, and may a long wait grow in emphasis?** *(§1.8, REQ-MONITOR-171. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 02 §8 item 7 ([the guide](../../research/design/02-the-generated-look-and-its-counter-moves.md)), guide 03 §8 item 10 ([the guide](../../research/design/03-information-architecture-within-a-fixed-structure.md)) and guide 04 §8 item 4 ([the guide](../../research/design/04-the-agent-operator-journeys.md)) of the design research corpus and backlog row 51 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.8 reserves `.status-dot.is-pulsing` for a state “actively running”. REQ-MONITOR-171 has “other busy states pulse in the run color” on the sessions card. Guide 03 §8 D03-10 cites attention-encoding guidance that keeps pulsing for conditions needing a response. Guide 04 §8 D04-4 suggests a cue whose salience grows with time since last attention. Guide 02 §8 D02-7 lists a pulsing dot as a generated tell.

**What the build proceeds under.** §1.8 and REQ-MONITOR-171 as written: the pulse marks running.

**What decides it.** One ruling: the pulse moves to waiting, with any growth of emphasis over time (a §1.8 amendment and a directive over REQ-MONITOR-171), or the state word and its elapsed figure stay the whole signal.

<a id="oq-503"></a>

**OQ-503 — Do secondary Buttons and icon controls read as controls under §1.7's flat styling?** *(§1.7. Raised 2026-11-03 by [R-093](../../product/requests.md#r-093), guide 02 §8 item 10 ([the guide](../../research/design/02-the-generated-look-and-its-counter-moves.md)) and guide 07 §8 item 6 ([the guide](../../research/design/07-visual-composition-beyond-tokens.md)) of the design research corpus and backlog row 50 ([the backlog](../../research/design/backlog.md)); numbered from OQ-493: OQ-462 to OQ-492 are the hardening orchestration's.)*

**What is open.** §1.7 forbids “bevels” and says “every other control is a hairline or bare text”, the primary button being “the only filled surface”. Guides 02 §8 D02-10 and 07 §8 D07-6 cite measurement in which flat interactive styling raised missed and false clicks.

**What the build proceeds under.** §1.7's flat controls.

**What decides it.** A journey walk or click study first, then one ruling: secondary controls gain a resting cue within §1.7's tokens (a reading), or §1.7 is amended.
<a id="oq-487"></a>

**OQ-487 — May a release publish its Software Bill of Materials beside the artifacts of REQ-STARTUP-031?** *(REQ-STARTUP-031, REQ-STARTUP-032, REQ-STARTUP-035, REQ-STARTUP-036, REQ-STARTUP-152, REQ-STARTUP-156; R-091. Raised 2026-11-02 by bundle G2 of [`hardening.md`](../hardening.md) §5, which was asked to attach a CycloneDX SBOM to the release draft and found the asset set closed.)*

**What is open.** R-091 asks for an SBOM on the release, the OpenSSF Scorecard's SBOM check among its reasons, and the Scorecard reads one from a release's assets. The specification closes those assets. REQ-STARTUP-031 names the artifact shapes, one authority shared with the updater; REQ-STARTUP-036 says the artifacts a release publishes are "exactly those of REQ-STARTUP-031"; REQ-STARTUP-152 requires every filename a release publishes as an asset, and every filename its `SHA256SUMS.txt` lists, to be a value of that one naming scheme; REQ-STARTUP-035's body carries one table row per published asset; and REQ-STARTUP-032 has the manifest list every published asset. A file `Rotaris-<v>-sbom.cdx.json` beside the installer is none of the four kinds, so publishing it contradicts REQ-STARTUP-036 and REQ-STARTUP-152 as written, and `tools/release-pipeline` refuses it today (`writeChecksumManifest`: "is not an artifact name tools/release-naming renders").

**What the build proceeds under.** The release workflow's `build` job writes the SBOM after `pnpm package` (`pnpm sbom:write`, `tools/sbom/`: pnpm's own CycloneDX 1.6 reading of the production tree, Electron added) and uploads it as a workflow artifact of its own, `sbom-<platform>`, kept 90 days. It is not copied into the release directory, not listed in `SHA256SUMS.txt`, not signed and not attached to the draft. `tools/workflows.test.ts` holds both halves, so the day this is ruled the test is the one place that changes beside the workflow.

**What decides it.** A ruling between: (a) a directive over REQ-STARTUP-036 and REQ-STARTUP-152 (and REQ-STARTUP-035's table, REQ-STARTUP-032's list) admitting one non-artifact asset per release, the SBOM, named by `tools/release-naming` beside the artifacts, listed in and signed with `SHA256SUMS.txt`, and never something the updater asks for; (b) the SBOM stays a workflow artifact, the Scorecard's SBOM check stays unmet, and `hardening.md` §3.5 says so; or (c) the SBOM is published somewhere other than the release's assets (a file committed per release under `docs/`, which the Scorecard also reads). Whichever is ruled, an SBOM that is published is listed in the manifest the release signs, so that it is established by the same signature as the installer.
