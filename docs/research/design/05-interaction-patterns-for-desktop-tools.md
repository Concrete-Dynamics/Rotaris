# 05. Interaction patterns for desktop tools

Command palette, keyboard-first operation, panes and inspectors, dense lists with detail, selection, inline edit and undo, as patterns and never as another product's structure.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 05 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

How does the operator reach a surface's commands, move through dense content, select, change and take back, fast and without surprise? Covered: the command vocabulary and palette, shortcuts, focus and tab order, composites (lists, tables, trees, tab strips), selection, row and bulk commands, context menus, inline edit and saving, confirmation against undo, panes, drag, Escape.

Not decided here: which primary views, tabs, labels or orders exist (`REQ-SHELL-023` and the authorities §2 names), nor any string the specification fixes. Streaming and approvals are guide 06's, states 13's, chrome 08's, accessibility floors 09's, giving way 14's. Field names appear once: what other tools call a toast is an **acknowledgement** here, a persistent banner a **notice**, a chat box the **composer**.

## 2. Principles

1. **The fast path is the same command, reached faster.** Shortcuts and the palette are alternate routes to commands the interface shows [13]. Switching costs a dip; typed commands mapped one-to-one onto visible ones kept it small and ended 17 % faster than pointing [14]. Showing shortcuts on a held modifier raised hotkey use to 94 %, against 35 % with tooltips [15]. Stable positions turn selection from search into decision [16]; commands behind tabs cost experts extra switches in 28 % of trials [17]. The tabs are fixed [55], so the palette, reaching across them, absorbs that cost.
2. **Return trips are much of the work.** IDE users spent 35 % of non-interrupted time on navigation mechanics, and lost working sets kept in tabs, scroll positions and tree nodes once those were reused [18].
3. **Focus is one deliberate place.** A composite is one Tab stop with arrows inside [19][20]; focus never falls to the body when a dialog closes or an item goes, and re-enters at the last cell of a grid or the selected item of a list [19]; focus and selection look different [21][23]. A navigating shortcut carries focus, an acting one leaves it [19]; initial focus is the likely first step, never a destructive one, and Escape cancels what floats without navigating [20].
4. **Detail beside the list, not over it.** A side panel keeps neighbouring records readable where a modal hides them [30]; list and detail sit side by side when wide and stack when narrow [34]; overview with detail is preferred, at a cost in space [36]. Panes need bounds and a second route back once hidden [35].
5. **Interruption is paid in minutes.** A modal is justified for critical warnings, required input and irreversible errors [5]. After an incoming message, resumption averaged 10 to 16.5 minutes; work left visible was resumed sooner [6].
6. **A confirmation protects only while it is rare.** Frequent prompts are answered by habit [1][2]; habituated people stop reading decision dialogs [4]. Undo is the alternative where a command reverses and its outcome is visible [2]; reversible, checked or confirmed are equal safeguards [3]. A confirmation names what happens to which items, labels buttons by outcome and has no default on the affirmative [1].
7. **Undo is a model, not a key.** Linear undo cannot remove an earlier step and keep later ones [45]; a selective tool halved programmers' backtracking time [44]. Selective undo appends an inverse or replays history without the step, expectations differ by case, and only ambiguous conflicts are raised [45]. Undo can be scoped by origin [47] and shows what it reversed [46].
8. **Dragging is the costly path**: 916 ms against 674 ms for pointing, at about three times the errors [40]. Every drag needs a path without dragging [41], a handle, a lifted look and drop zones that signal [42].

## 3. Patterns and anti-patterns

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| One vocabulary, one palette key [11][12][14] | every command | a command on one control only; a palette label unlike the control's | `CommandPalette`; `REQ-SHELL-048`, `-052` [55] |
| Shortcut beside its command [13][15] | a command with a chord | chords learnable only from keyboard help | `Kbd` after the label (`REQ-SHELL-053`) [55] |
| *Anti:* bare character key, window-wide [28] | row and card commands | a letter fires in the composer | scope to the component's focus; `REQ-SHELL-049` binds modified keys and F1 [55] |
| One Tab stop per composite [19][20] | transcript rows, delegation tree, `Table` | Tab walks every row | `REQ-SHELL-152`, `-153`; G3's keys [55][56] |
| Focus apart from selection [21][23] | multi-select lists, trees | a focused row drawn selected; arrows load what they pass | `--rt-focus` ring (§1.7) against `--rt-accent-tint-10` and `--rt-accent-300` (§1.2) [56] |
| *Anti:* focus lost to the body [19][25] | row deleted, dialog closed | `document.activeElement` is `body` | the opener, else the next row; `REQ-TRACE-320` as precedent [55] |
| Escape closes only what floats [20][25] | palette, dialogs, drawers | Escape leaves a primary view | `REQ-SHELL-055` [55] |
| Detail in a pane [30][34][36] | one record of a dense list | a `Dialog` opened to read a row | a pane (G8); an overlay drawer when compact (G9) [55] |
| Bounded keyboard divider [35][27] | multi-pane views | a pane dragged to nothing; a pointer-only divider | `REQ-SHELL-066`, `-068`; hairline `--rt-border-panel` [55][56] |
| Two inline row commands, then a menu [30][31] | rows with many commands | three buttons per row; hover-only commands | `PopoverMenu`; one coloured icon per row (§1.9) [56] |
| Bulk command on the selection [31][21] | multi-select tables | a row command repeated N times; no count | exact count in `--rt-font-mono` (§1.11); `REQ-GIT-077` [55][56] |
| Context menu as accelerator [32] | rows, cards, files | a command only on right-click | the same command as a `CommandPalette` row or a control (`REQ-SHELL-048`) [55] |
| Inline edit unchanged in form [38] | renaming a session or artifact | size or weight changes in edit | three weights (§1.4); the `Input` boundary and ring [56] |
| Save by control kind [10] | Settings categories | a `ToggleSwitch` awaiting Save; mixed modes | `ToggleSwitch`, `SegmentedControl` apply at once; fields pass `REQ-SHELL-124` [55] |
| *Anti:* confirming the reversible [1][2][3] | undoable commands | `ConfirmDialog` where undo would do | `ConfirmDialog` for what is lost (`REQ-NOTIFY-009`); `REQ-SHELL-070` asks nothing [55] |
| One event transient, a condition persistent [7][8][9] | feedback without focus | a standing condition as an `Acknowledgement` | a notice (G1, `REQ-SHELL-114`) [55] |
| Drag with a second path [40][41][42] | board cards, ordered lists | a card movable only by drag | a move command; the lifted card in `--rt-shadow-md` (§1.7) [56] |

## 4. Method

1. **Inventory the commands**: label, palette row, shortcut where `REQ-SHELL-049` gives one, visible control; one missing is a finding against `REQ-SHELL-048` [13][14][55].
2. **Draw the Tab sequence**: one stop per composite [19][20] unless the specification says otherwise — the rail is seven stops on purpose (`REQ-SHELL-028`, `-032`) [55].
3. **Give each composite its keyboard model**: listbox [21], grid where cells act [22], treegrid for folding rows [23], combobox where the field keeps focus [24], tabs [26], splitter [27]; write entry and re-entry focus [19].
4. **Separate focus from selection**: what arrows, Space, Shift, Ctrl and Enter do; moving focus selects nothing where selecting loads content [21][26].
5. **Classify each command by reversibility.** Reversible: perform, report in an acknowledgement with at most one control, offer undo [7][2]. Irreversible: a `ConfirmDialog` naming what is lost [1][2]; a dialog the specification fixes keeps its wording (§1.11) [56].
6. **Place focus after every change** — dialog open and close, row deleted, refresh, view switch [19][25].
7. **Bound Escape** to what floats, in `REQ-SHELL-055`'s order [20][55].
8. **Give every drag a path without dragging**, and the drag its handle and lifted look [41][42].
9. **Bound every pane**: minimum, maximum, keyboard divider, compact form, a second route back [35][27].
10. **Keep the operator's place**: no command reuses a pane's selection or scroll [18][19].
11. **Write each conflict between a source and a requirement as a section-8 question**, never a redesign [55].
12. **Plan the evidence**: which section-6 check the ui-review pack, the DOM or `pnpm app:drive` answers [59].

## 5. Worked example — the Git view

Row *Git worktrees, commits, diffs*: mockup section `GIT`, nearest built code `packages/ui/src/GitView.tsx`, read 2026-11-02 [57].

**Commands (step 1).** Refresh (`REQ-GIT-081`); New worktree, its disabled reason in the tooltip (`REQ-GIT-080`, `REQ-NOTIFY-008`); Merge selected (`REQ-GIT-083`); a per-row Delete (`REQ-GIT-079`); Restore checkpoint (`REQ-GIT-086`); the session picker. Which are palette rows follows `REQ-SHELL-048`; none is invented.

**Composites (steps 2–4).** The worktrees `Table` carries `aria-multiselectable="true"`; `selectRow` gives click, Ctrl+click to toggle and Shift+click to extend from an anchor — the pointer half of the listbox model [21]. Its rows carry no `tabIndex` or key handler in this file, so where the keyboard half lives is the first thing a reviewer establishes. A selected row draws §1.2's tint plus accent ink (`--rt-accent-tint-10`, `--rt-accent-300`), leaving the focus ring distinct.

**Reversibility (step 5).** Deleting a worktree removes a directory, so a `ConfirmDialog` is right [2]; `REQ-GIT-117` makes Cancel the default, no default on the affirmative [1], and its label meets [1] in D05-14. Whether Delete stays live while several rows are selected is the brief's decision [31].

**Focus and panes (steps 6, 9).** Deleting a row removes the focused Delete, so focus goes to the next row [19]. `REQ-GIT-084`'s request, selecting and scrolling to a named branch or commit, is the return trip done right [18]. Commit history sits beside the worktrees [34] behind a `role="separator"` named "Resize the commit history column" with value bounds, [27]'s contract.

**What the record paid for here.** UIR-002 (a branch across six lines) and UIR-012 (a 1400.44 px extent in a 1400 px window) were this view, and fitting its table to the card cost a `SHRUNK` box [58] — "bound the box, not only the child" [59]. §7.1's finding, tokens kept and composition broken, is why `GIT` is read before a control is added [57].

## 6. Checks

Brackets: rubric ids; *new*: a proposed row.

- **K1** [F3, F4] Every command shown is a `CommandPalette` row under the same label, its shortcut beside it [12][14][55].
- **K2** [F3] One Tab press crosses one composite; the rail's seven stops are the specified exception [19][20][55].
- **K3** [F3] After a `Dialog` or `ConfirmDialog` closes, `document.activeElement` is the opener or its successor; after a row is deleted, never `body` [19][25].
- **K4** [F3, D3] A focused, unselected row computes the 2 px `--rt-focus` ring and no tint; a selected, unfocused row a `--rt-accent-tint-*` wash and no ring [21][23][56].
- **K5** [D3] One filled control per dense view; hover is a wash, never a `transform` [56].
- **K6** [C6; *new* count] At most two inline commands and one coloured icon per row [30][31][56].
- **K7** [F3] Escape off Workspace with nothing floating changes nothing (`REQ-SHELL-055`) [20][55].
- **K8** [*new*] A printable key in the composer or on a row fires no command outside the focused composite [28].
- **K9** [*new*] Every draggable element has a keyboard path without dragging [41].
- **K10** [F3] Every divider is a focusable separator named "Resize …", 16 px per arrow, restored on Home (`REQ-SHELL-068`) [27][55].
- **K11** [D4] At 1000×680 no pane is below its minimum and no box is `SHRUNK` [35][58].
- **K12** [*new*] No `ConfirmDialog` guards a reversible command; each names the items affected [1][2][3].
- **K13** [F3; *new* trace] An `Acknowledgement` leaves focus where it was and has a `status` or `alert` role; what is needed after it withdraws is in a notice or the transcript [8][9].
- **K14** [F3] A dialog guarding an irreversible command opens on the declining choice; Enter activates nothing where `REQ-TOOLS-063` says so [25][1][55].
- **K15** [C1; *new*] Inline edit keeps `font-size` and `font-weight` equal in both states [38].
- **K16** [*new*] An Enter ending an input-method composition (`isComposing`, `keyCode` 229) neither submits nor completes a slash command [52].
- **K17** [C9; *new*] A `Spinner` stays hidden for a write settling within about 150 ms, and once shown stays about 300 ms [39].
- **K18** [C2; record] Controls take few heights; UIR-006 brought eleven down to 24, 32 and the composer's 80 [58].
- **K19** [F3; *new*] After Ctrl+1 … Ctrl+7, focus is inside the arriving view on a compact element [19][29].

## 7. How this applies here

**Requirements.** `REQ-SHELL-023`, `-025`, `-028`, `-032`, `-048`, `-049`, `-051` – `-055`, `-059`, `-066` – `-070`, `-112`, `-114`, `-124`, `-152`, `-153`; `REQ-CHAT-001`, `-024`, `-026`; `REQ-TOOLS-063`; `REQ-NOTIFY-008`, `-009`, `-011`; `REQ-GIT-077`, `-079` – `-081`, `-083`, `-084`, `-086`, `-117`; `REQ-LIBRARY-115`, `-116`; `REQ-TRACE-320`, `-326`, `-327`. **Directive:** `PD-WORKSPACE-001` (one control, no focus taken).

**Tokens:** `--rt-focus`, `--rt-accent-tint-10`, `--rt-accent-300`, `--rt-border-panel`, `--rt-shadow-md`, `--rt-font-mono`. **Components:** `CommandPalette`, `Kbd`, `Table`, `Tabs`, `NavRail`, `Dialog`, `ConfirmDialog`, `Acknowledgement`, `PopoverMenu` (`overlays.tsx`, not in the inventory), `Input`, `ToggleSwitch`, `SegmentedControl`, `Spinner`. **Gaps (§4.2):** G1, G3, G8, G9, G15, G16.

**Who reads what.**

| Derivative | Reads |
|---|---|
| `design-ui` brief §5 | §3, §4 steps 1–10 |
| `design-ui` brief §10 | §8 |
| `design-ui` audit step 4, the tells walk | §3 |
| rubric F3, C2, D3 | §6 |
| rubric C4 | §3 |

The rubric may lift section 6's *new* checks.

**A gap, not a disagreement:** `REQ-SHELL-025` states no focus after a view switch, and [19], [20], [29] differ.

## 8. Where this disagrees with the adopted material

- **D05-1 —** Reorder feedback animates neighbours aside for about 100 ms [42]. §1.8: animation belongs to status indicators only. *Is reorder feedback on the Requirements board a status indication §1.8 admits?* — [OQ-496](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-496)
- **D05-2 —** Smooth zoom preserves the sense of position [53]. §1.8, with `REQ-TRACE-327`'s re-centring. *Must Graph mode re-centre instantly, and what static cue keeps the operator's place?* — [OQ-496](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-496)
- **D05-3 —** Animated aids were among those restoring attention to a habituated dialog, still ones as well [4]. §1.8: never in conversation content. *Is any motion admissible on a decision dialog?* — [OQ-517](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-517)
- **D05-4 —** A custom focus style may echo hover [43]. §1.7: the 2 px ring is the only focus treatment. *Is the ring alone legible on a row both hovered and focused?* — none filed; already-ruled: REQ-SHELL-145, REQ-SHELL-160 (c)
- **D05-5 —** One design system avoids transient messages for now on accessibility grounds [10]; auto-dismissal is a time limit unless the content is reachable elsewhere [9]. `REQ-NOTIFY-011`'s fixed lifetime; `REQ-SHELL-112`. *Is every acknowledgement's content reachable after it withdraws?* — [OQ-498](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-498)
- **D05-6 —** Unavailable commands show disabled, not hidden [33]; a palette may hide irrelevant ones [11]. `REQ-SHELL-048`: no surface presents an action the window cannot carry out; `REQ-NOTIFY-008`. *Is a command unavailable now omitted from the palette, or shown disabled with its reason?* — [OQ-509](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-509)
- **D05-7 —** Reflow on resize cost over a second per selection, stable scaling a few hundred milliseconds [37]. `REQ-SHELL-059`'s compact mode. *Which positions stay predictable as panes become overlay drawers?* — none filed; already-ruled: REQ-SHELL-059
- **D05-8 —** List-like groups take one Tab stop, buttons a stop each [20]. `REQ-SHELL-028`, `-032`: a stop per rail button. *Is seven stops before a view's content the accepted cost?* — [OQ-505](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-505)
- **D05-9 —** The most-cited precedent makes Enter's meaning a preference [50]. `REQ-CHAT-001`: Enter submits, no preference key. *Is a fixed Enter the settled answer?* — none filed; request
- **D05-10 —** One precedent moves submit to Ctrl+Enter in an expanded compose box [51]. `REQ-CHAT-001`. *Does a long draft change what Enter does?* — none filed; request
- **D05-11 —** Modifier plus Enter conflicts with system key assignments [19]. `REQ-CHAT-001`'s Ctrl+Return from anywhere. *What happens when the focused control or the terminal window answers Ctrl+Enter itself?* — none filed; already-ruled: REQ-CHAT-001
- **D05-12 —** Platform popups cycle, the first Up reaching the last item [20]; the authoring practices stop [24]. `REQ-CHAT-026`: no wrap. *Which row does the first Up reach in a popup above the composer (`REQ-CHAT-024`)?* — none filed; already-ruled: REQ-CHAT-026
- **D05-13 —** Graph viewers keep selecting a node apart from navigating from it [54]. `REQ-TRACE-326`, `-327`: selection re-centres. *How does focus cross nodes without re-centring?* — [OQ-512](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-512)
- **D05-14 —** Buttons name their outcome, not Yes [1]. `REQ-GIT-117`, `REQ-LIBRARY-115`: Yes and Cancel; §4.1: `ConfirmDialog`'s verb-first label. *Which governs these two confirm buttons?* — [OQ-510](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-510)
- **D05-15 —** Where undo exists it replaces confirmation [2]. `REQ-LIBRARY-115` confirms what `REQ-LIBRARY-116` makes undoable. *Does an undoable decision still need its confirmation?* — [OQ-533](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-533)
- **D05-16 —** Grouped proposals were accepted faster than sequential ones [49]; bulk confirmations may apply to all [2]. `REQ-TOOLS-063`: one at a time with a counter; grouping hides the differing call [4]. *Is one at a time settled for one agent's queue?* — [OQ-516](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-516)
- **D05-17 —** Checking an agent's tool call after it runs, with undo, is argued easier than vetting it before [48]. `REQ-TOOLS-063` gates a call before it runs. *Does the record state how the approval dialog and Git view review divide the safeguard?* — none filed; not-a-question

## 9. References and further reading

[1] [NN/g (Jakob Nielsen), Confirmation Dialogs Can Prevent User Errors (If Not Overused)](https://www.nngroup.com/articles/confirmation-dialog/) — rarity, outcome labels; retrieved 2026-11-01
[2] [Microsoft Learn, Confirmations (Windows desktop UX guidelines)](https://learn.microsoft.com/en-us/windows/win32/uxguide/mess-confirm) — undo over confirming; retrieved 2026-11-01
[3] [W3C WAI, Understanding Success Criterion 3.3.4: Error Prevention (Legal, Financial, Data)](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html) — three safeguards; retrieved 2026-11-01
[4] [Bravo-Lillo et al., Your Attention Please: Designing security-decision UIs to make genuine risks harder to ignore](https://cups.cs.cmu.edu/soups/2013/proceedings/a6_Bravo-Lillo.pdf) — habituation; retrieved 2026-11-01
[5] [NN/g (Therese Fessenden), Modal & Nonmodal Dialogs: When (& When Not) to Use Them](https://www.nngroup.com/articles/modal-nonmodal-dialog/) — when a modal fits; retrieved 2026-11-01
[6] [Iqbal and Horvitz, Disruption and Recovery of Computing Tasks: Field Study, Analysis, and Directions](https://erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf) — resumption cost; retrieved 2026-11-01
[7] [GNOME Human Interface Guidelines, Toasts](https://developer.gnome.org/hig/patterns/feedback/toasts.html) — one event, one button; retrieved 2026-11-01
[8] [W3C WAI, Understanding Success Criterion 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — status roles; retrieved 2026-11-01
[9] [W3C WAI, Understanding Success Criterion 2.2.1: Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) — auto-dismissal; retrieved 2026-11-01
[10] [GitHub Primer, Saving](https://primer.style/product/ui-patterns/saving/) — save modes; transient messages avoided; retrieved 2026-11-01
[11] [Superhuman (Tim Boucher), How to build a remarkable command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/) — one key, everywhere; retrieved 2026-11-01
[12] [Microsoft Visual Studio Code, Command Palette (UX Guidelines)](https://code.visualstudio.com/api/ux-guidelines/command-palette) — command names; retrieved 2026-11-01
[13] [NN/g (Rachel Krause, Aurora Harley), UI Accelerators](https://www.nngroup.com/articles/ui-accelerators/) — alternate routes; retrieved 2026-11-01
[14] [Scarr et al., Dips and Ceilings: Understanding and Supporting Transitions to Expertise in User Interfaces](https://www.csse.canterbury.ac.nz/~andy/papers/blur.pdf) — one-to-one commands; retrieved 2026-11-01
[15] [Malacria et al., Promoting Hotkey Use through Rehearsal with ExposeHK](https://www.csse.canterbury.ac.nz/~andy/papers/ehk.pdf) — shortcut overlay; retrieved 2026-11-01
[16] [Cockburn, Gutwin, Greenberg, A Predictive Model of Menu Performance](https://www.csse.canterbury.ac.nz/~andy/papers/paper191-cockburn.pdf) — stable positions; retrieved 2026-11-01
[17] [Scarr et al., Improving Command Selection with CommandMaps](https://www.csse.canterbury.ac.nz/~andy/papers/commandMap-finalCamera.pdf) — commands behind tabs; retrieved 2026-11-01
[18] [Ko et al., An Exploratory Study of How Developers Seek, Relate, and Collect Relevant Information during Software Maintenance Tasks](https://faculty.washington.edu/ajko/papers/Ko2006SeekRelateCollect.pdf) — navigation cost; retrieved 2026-11-01
[19] [W3C WAI APG, Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) — Tab stops, focus, key conflicts; retrieved 2026-11-01
[20] [Microsoft Learn, Keyboard interactions](https://learn.microsoft.com/en-us/windows/apps/develop/input/keyboard-interactions) — tab stops, Escape, popups; retrieved 2026-11-01
[21] [W3C WAI APG, Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) — multi-select model; retrieved 2026-11-01
[22] [W3C WAI APG, Grid (Interactive Tabular Data and Layout Containers) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) — edit cycle; retrieved 2026-11-01
[23] [W3C WAI APG, Treegrid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/) — expand, collapse; retrieved 2026-11-01
[24] [W3C WAI APG, Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) — focus kept in the field; retrieved 2026-11-01
[25] [W3C WAI APG, Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) — initial and return focus; retrieved 2026-11-01
[26] [W3C WAI APG, Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) — activation; retrieved 2026-11-01
[27] [W3C WAI APG, Window Splitter Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/) — divider keys; retrieved 2026-11-01
[28] [W3C WAI, Understanding Success Criterion 2.1.4: Character Key Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html) — single keys; retrieved 2026-11-01
[29] [Marcy Sutton (Gatsby), What we learned from user testing of accessible client-side routing techniques with Fable Tech Labs](https://www.gatsbyjs.com/blog/2019-07-11-user-testing-accessible-client-routing/) — focus after a swap; retrieved 2026-11-01
[30] [NN/g (Page Laubheimer), Data Tables: Four Major User Tasks](https://www.nngroup.com/articles/data-tables/) — row commands, side panel; retrieved 2026-11-01
[31] [IBM Carbon Design System, Data table: usage](https://carbondesignsystem.com/components/data-table/usage/) — batch bar; retrieved 2026-11-01
[32] [NN/g (Anna Kaley), Contextual Menus: Delivering Relevant Tools for Tasks](https://www.nngroup.com/articles/contextual-menus/) — a visible route besides; retrieved 2026-11-01
[33] [Apple Human Interface Guidelines, The menu bar](https://developer.apple.com/design/human-interface-guidelines/the-menu-bar) — disable, not hide; retrieved 2026-11-01
[34] [Microsoft Learn, List/details](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/list-details) — side by side or stacked; retrieved 2026-11-01
[35] [Apple Human Interface Guidelines, Split views](https://developer.apple.com/design/human-interface-guidelines/split-views) — pane bounds; retrieved 2026-11-01
[36] [Cockburn, Karlson, Bederson, A Review of Overview+Detail, Zooming, and Focus+Context Interfaces](https://www.csse.canterbury.ac.nz/~andy/papers/fc.pdf) — overview with detail; retrieved 2026-11-01
[37] [Scarr et al., Testing the Robustness and Performance of Spatially Consistent Interfaces](https://www.csse.canterbury.ac.nz/~andy/papers/transforms.pdf) — reflow cost; retrieved 2026-11-01
[38] [Atlassian Design System, Inline edit: usage](https://atlassian.design/components/inline-edit/usage) — one look, two states; retrieved 2026-11-01
[39] [Vercel, Web Interface Guidelines](https://vercel.com/design/guidelines) — spinner timing; retrieved 2026-11-01
[40] [MacKenzie, Sellen, Buxton, A Comparison of Input Devices in Elemental Pointing and Dragging Tasks](https://www.yorku.ca/mack/CHI91.html) — dragging cost; retrieved 2026-11-01
[41] [W3C WAI, Understanding Success Criterion 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) — no-drag path; retrieved 2026-11-01
[42] [NN/g (Page Laubheimer), Drag-and-Drop: How to Design for Ease of Use](https://www.nngroup.com/articles/drag-drop/) — signifiers, reorder motion; retrieved 2026-11-01
[43] [NN/g (Marieke McCloskey), Keyboard-Only Navigation for Improved Accessibility](https://www.nngroup.com/articles/keyboard-accessibility/) — focus styles; retrieved 2026-11-01
[44] [Yoon and Myers, Supporting Selective Undo in a Code Editor](http://www.cs.cmu.edu/~NatProg/papers/ICSE15-Azurite-v12-CameraReady.pdf) — selective undo time; retrieved 2026-11-01
[45] [Myers et al., Selective Undo Support for Painting Applications](https://www.cs.cmu.edu/~NatProg/papers/p4227-Myers-Aquamarine.pdf) — undo models, conflicts; retrieved 2026-11-01
[46] [Apple Human Interface Guidelines, Undo and redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo) — visible undo; retrieved 2026-11-01
[47] [Yjs documentation, Y.UndoManager](https://docs.yjs.dev/api/undo-manager) — undo by origin; retrieved 2026-11-01
[48] [Patil et al., GoEX: Perspectives and Designs Towards a Runtime for Autonomous LLM Applications](https://arxiv.org/abs/2404.06921) — review after the fact; retrieved 2026-11-01
[49] [Lafreniere et al., Investigating Aggregated vs. Sequential Command Recommendation in Graphical User Interfaces](https://www.benlafreniere.ca/assets/papers/Lafreniere_-_Aggregated_vs_Sequential_Command_Recommendation_in_GUIs.pdf) — grouped acceptance; retrieved 2026-11-01
[50] [Slack Technologies, Set your Enter key preference](https://slack.com/help/articles/115005523006-Set-your-Enter-key-preference) — Enter as a preference; retrieved 2026-11-01
[51] [Microsoft Support, Keyboard shortcuts for Microsoft Teams](https://support.microsoft.com/en-us/office/keyboard-shortcuts-for-microsoft-teams-2e8e2a70-e8d8-4a19-949b-4c36dd5292d2) — expanded send; retrieved 2026-11-01
[52] [MDN Web Docs, Element: keydown event](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event) — composition keydown; retrieved 2026-11-01
[53] [Ben Shneiderman, The Eyes Have It: A Task by Data Type Taxonomy for Information Visualizations (CS-TR-3665)](https://drum.lib.umd.edu/handle/1903/466) — smooth zoom; retrieved 2026-11-01
[54] [Microsoft Learn, Browse and rearrange code maps - Visual Studio (Windows)](https://learn.microsoft.com/en-us/visualstudio/modeling/browse-and-rearrange-code-maps) — select apart from navigate; retrieved 2026-11-01
[55] [Rotaris, `docs/spec/`](../../spec/) — requirements by id; retrieved 2026-11-02
[56] [Rotaris, `docs/design/README.md` §1](../../design/README/01-1-the-design-language.md) — rules and tokens; retrieved 2026-11-02
[57] [Rotaris, `docs/design/README.md` §7](../../design/README/07-7-fidelity-consult-before-maintain-after.md) — surface table, §7.1; retrieved 2026-11-02
[58] [Rotaris, all twelve critic findings repaired](../../architecture/codebase/17-all-twelve-critic-findings-repaired-and.md) — UIR-002, -006, -012; retrieved 2026-11-02
[59] [Rotaris, `build-ui` skill](../../../.agents/skills/build-ui/SKILL.md) — step 8; retrieved 2026-11-02
