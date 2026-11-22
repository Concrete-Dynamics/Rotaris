# Transcript rows, run header — brief

**Status:** built 2026-11-10 on the branch `feat/r-097-ui-ux-overhaul` (not landed; the brief and its build are one pass under R-097, so no approval stands between them)
**Written:** 2026-11-10 by `design-ui` (audit; the brief's sections only where R-097 touches the surface), for [R-097](../../product/requests.md#r-097)
**Surface:** the Workspace view's run header; §7 row "Transcript rows, run header"; mockup section `WORKSPACE` → `transcript column`; nearest built code `packages/ui/src/RunHeader.tsx`; theme `rotaris-dim`

An audit of the run header alone, with the sections its item needs. The transcript rows are not audited here. Sections 2 to 7 and 9 are not written: R-097 changes no journey, state, interaction, string, accessible name or component.

## 1. Authority

- `REQ-CHAT-078`: the "Compress context" control in the run header, and its reason when disabled. `PD-CHAT-001`: the icon-led model and reasoning selectors. `REQ-LIBRARY-125`: the improvement indicator in the run header, its label in words (`REQ-SHELL-149`), never cut mid-word (live-run finding L10, recorded in `shell.css`).
- `REQ-SHELL-022`: the minimum window.
- Left open: which of the header's items gives way first, and how.

## 8. Composition intent

The header is a line with two ends. The state tag, the run's timing and the improvement indicator stand at its start; the compress control and the two selectors are one group at its end, in that order, and nothing stands between the groups but space. The end group never shrinks and no label in it breaks. When the line cannot hold both ends, the end group moves to a second line whole and stays at the end; the indicator keeps its label on one line while its own line holds it, and wraps between words, as L10 decided, only below that. *2026-11-10, while building: first written as "the indicator is what gives way". Measured, the centre column at 1440×900 is 788 px and the header's items need 871 px on one line (83, 48, 205 and 459 px, three gaps and the padding): for one line the indicator would have to give 83 of its 205 px, and what it gives it gives by breaking its label.*

Relations (published): on the header, `run-header`, `viewport-scroll` on the x axis, expected false; on the end group, `run-header-end`, `containment` in the header and `text-fit` on the x axis.

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| run header | one line; two with the indicator shown, the end group whole on the second | same | same | same | same |

## 10. Disagreements and gaps

None.

## 11. Evidence plan

Capture: `pnpm ui-audit --views=2`; drive: a scripted run to its end, `waitFor ".improvement-activity--run-header"`, `shot` while the indicator is shown, at 1440×900 and 1000×680. Rubric rows: C3, D4.

**Must move** (1440×900, indicator shown): lines of the "Compress context" label 2 → 1; rows of the selector group 2 → 1.
**Must hold:** `ui-audit` view 2 at both sizes: 0 findings; `improvement-activity.test.ts`; the indicator's label whole.

## Audit 2026-11-10

**Status:** proposed
**Pack:** `3927eda58823` (the base); `pnpm ui-audit` view 2; drive: one scripted run to completion at 1440×900; theme `rotaris-dim`; by `design-ui`
**Unaudited:** the transcript rows; a live run's header at 1000×680; `nocturne`, `high-contrast`
**Count:** rows answered 2 of 2 asked (C3, D4); no 1 (medium 1); not captured 0
**Summary:** With no indicator the header is one centred line of compact controls. When the improvement indicator appears, every item shrinks at once.

| # | Criterion | Severity | Observation (with numbers; evidence) | Cause | Bounded change | Executes | Must move (now → passes) | Must hold | Answers to |
|---|---|---|---|---|---|---|---|---|---|
| 1 | D4, C3 | medium | after a run, at 1440×900: "Compress context" breaks onto two lines, the model selector stands above the reasoning selector with their icons on two different lines, and the indicator's label wraps onto two lines (`2-workspace-run2.png`) | every item of `.run-header` may shrink, the two `.run-controls` groups each take `margin-left: auto`, and the selector group wraps | the two-ended line of §8 | debug-ui | compress label lines 2 → 1; selector rows 2 → 1 | view 2: 0 findings; the indicator's label whole | `REQ-CHAT-078`, `REQ-LIBRARY-125`, D4 |

### Taste
- "Compress context" stands alone in the middle of the header when no indicator is shown.

### Deliberately left
- The second row under the header (stash, clear, search, terminal).

### Open-question candidates
- None.

## Execution 2026-11-10

By `debug-ui`, on `feat/r-097-ui-ux-overhaul`. Evidence: `pnpm ui-audit` at both sizes (0 findings; view 2 carries 13 contracts, 10 before); a drive at 1440×900: one scripted run to completion, `waitFor ".improvement-activity--run-header"`.

| # | Must move | Before | After | Must hold |
|---|---|---|---|---|
| 1 | lines of the "Compress context" label; rows of the selector group | 2; 2 | 1 (the control is 24 px high); 1 (both selectors at y 140) | view 2: 0 findings; the indicator's label whole, on one line (22 px) — held |

The header with the indicator shown is 59 px, two lines; about 66 px before, read off the capture. With no indicator it is the one line it was, and "Compress context" stands with the selectors at the end instead of alone in the middle.

Not driven: a live run's header at 1000×680 with the indicator shown.

## Critique 2026-11-10

The critique is the independent, report-only `review-ui` reading of the pack `9401038db662/iteration-1` (18 findings: 4 high, 7 medium, 7 low; `critique.json` is not committed, `.ui-review/` being ignored). A finding repaired here is `implemented`, not `verified-resolved`: that takes a fresh pack read in a fresh context.

Checked and sound on this surface: the header is one 33 px line at both sizes with no indicator, the end group 459 px and whole; with the indicator shown, "Compress context" is one line, the selectors one row, the indicator's label one line.

| Finding | Severity | What it read | Outcome |
|---|---|---|---|
| UIR-003 | high | "No task plan" in the task plan pane drawn at the browser's `bolder`, a bare `strong` with no rule, where §1.4 stops at 500; seven more call sites; predates R-097 | implemented: one `strong` rule at `--rt-weight-medium` (500 measured) |
| UIR-016 | low | the inspector's persona menu is 28 px high, a fourth control height, where the same component is 24 px in the run header; counted baseline debt; predates R-097 | open |

## Redesign 2026-11-20 — the run and its threads ([R-109](../../product/requests.md#r-109), [`PD-CHAT-015`](../../product/directives/pd-chat-015.md#pd-chat-015))

**Status:** built on `feat/r-108-transcript-threads`; not landed. By `redesign-surface`, with Impeccable's context loaded. The owner chose concept 2 of two mocked ("Build concept 2"); concept 1 was one interleaved stream of turns with a pinned speaker and a run map.

**Measured before** (built app, real run on the owner's local model, 1440 × 900, `rotaris-dim`): transcript column 719 px; a row's text 485 px, a depth-1 agent's 469 px, a member of that agent's expanded run 246 px; prose 366 px; one small delegated task 9,955 px of transcript.
**Measured after** (same window, same kind of task): a row's text 645 px at every depth; prose 503 px; the run's own conversation 1,448 px. A block's heading is 23.4 px; a thread line 54.6 px (67.6 px starting a block).

**Composition.** Tabs at the head of the transcript (Run, one per agent, All activity — the last pinned at the strip's end while the agents' tabs scroll beneath it, so a run of many agents cannot push it out of reach). A block's first row: persona dot, role, task, and the time at the line's end; content one step (`--rt-space-5`) in. A thread line: persona dot and name, task, state and elapsed time at the end, the latest act or the report beneath, a caret. Consecutive thread lines share their rules. An activity line reads what was done; its members stand one step in with their own times at the line's end. A diff is a block inside its turn, five lines and "Show N more lines".

**Function inventory** (read-only, 2026-11-20): every row kind, control, test id and required literal of the transcript was listed before the build. Moved or displaced, each named in the directive: the scope toggle (now tabs; `scope-toggle`, `scope-task`, `scope-detail` kept as test ids, `scope-run`, `scope-all`, `scope-agent` added), "This task" and the no-agent sentence, the timestamp and role columns, the continuation bar (`row-bar`), the depth indent, the members' rule. New: `row-thread`, `thread-open`, `diff-more`.

**Deliberately left.** The "N steps · N files" figures the mock drew on a thread line (the Run panel states the tool calls). A thread line for an agent that has written no row. The system notice's 2 px left rule and the tool card's, which predate this pass. The persona window's plain list, which draws the same rows and no tabs.

**Owed.** `rows-proof` and `transcript-proof` assert the displaced structure and are to be rewritten to the new one, not deleted. The wrapped-paragraph and sixteen-segment figures of `transcript.test.ts`'s "what the built app drew" table are derived for the new measure, not measured. Captures in `nocturne` and `high-contrast`. A run of more than six agents (tab strip overflow), a failed agent's thread line, focus rings, and a search match on a thread line were not captured.

Captures: `.ui-review/transcript-redesign/` in the primary checkout (before, the two mocks) and in the branch's worktree (`build1/`); git-ignored.

### Critique 2026-11-20 (independent, report-only; two rounds)

Round 1 read the captures of `build1/` against the capture before the change, the approved mock and the diff: **not satisfied**, nine findings. Round 2 read `build2/`, a fresh real run on the repaired build: **satisfied**, with what is left bound by a requirement or older than this change. A finding repaired here is `implemented`; `verified-resolved` takes a fresh pack read in a fresh context.

| # | Finding | Round 2 |
|---|---|---|
| 1 | a thread line's text stood 8 px in from every other row's | resolved (role 425, content 425, thread 424 px measured; the last pixel closed after the capture) |
| 2 | an agent's tab opens on the delegation header's raw wording, the start marker below it, and the reader's prompt | partial: the header is one line. Its wording is REQ-CHAT-068's, the marker is drawn in the pool's first slot, and REQ-CHAT-069 keeps the run-owned rows; open |
| 3 | "Reported:" took a line, not a sentence | resolved in code; no round-2 capture shows a finished thread line |
| 4 | one call named three times on a live activity line | resolved in what was captured |
| 5 | work that had ended drawn in the run colour | resolved |
| 6 | a failed or waiting agent not coloured on its thread line or tab | resolved in code; no capture of a failed agent |
| 7 | one task under two names (slug in the heading, words on the thread line) | resolved |
| 8 | the approval row's 2 px side rule | open; predates this pass. The system notice's rule is the same pattern and is now the only ruled row in the column |
| 9 | "All activity" between the run and its agents; no sign of overflow | order resolved; the pinned tab's fade was not seen overflowing |

New in round 2, open: a running call with a derived description still draws its raw input on the `⤷` line (`{"task_ids":[…]}` under "Waits for 2 children"); REQ-CHAT-061 gives that line, so leaving it out is a narrowing to classify, not a repair.

## Brief 2026-11-22 — the configuration change row and its Undo ([R-121](../../product/requests.md#r-121), [`PD-CONFIG-014`](../../product/directives/pd-config-014.md#pd-config-014) clause 7)

**Status:** proposed. A brief for one addition to the built tool row (`packages/ui/src/transcript/Row.tsx`, mockup `WORKSPACE` → `transcript column`): the settled row of a `configure` set.

### 1. Authority

- `REQ-CHAT-046`: the tool row and its fields; `input` and `output` untruncated in the record.
- `REQ-CHAT-060`: the four statuses.
- `PD-CHAT-004`: the activity line.
- `PD-CONFIG-014`:
  - clause 7: the row carries the change and an Undo that writes the value before back through the same path;
  - clause 2: the one writer;
  - clause 5: a change applies at the next run.
- `REQ-SHELL-149`: no state by colour alone.
- Departures from the mockup: none. The mockup draws no row action of this kind.
- Left open, and settled below:
  - where the value before comes from on a paged-in row;
  - what Undo does when the setting has changed since;
  - what the row shows after Undo.

### 2. Journeys that cross it

- **When an agent has changed a setting I did not want changed, I want to put it back from the row that shows the change, so that I need not find the setting in Settings or the file.**
  - Entry: a settled `ok` `configure` set row.
  - Steps: press Undo.
  - Exit: the row says the setting is back.
  - Trust point: the row names the setting, both values and the scope before the press.
  - Recover: if Undo is refused because the setting changed since, the row says what it holds now and points to Settings.
- **The several-agents journey:** each row undoes its own change, and only while the setting still holds the value that row wrote (§5).
- Ruled out: `read` and `explain` rows, failed and blocked rows. They changed nothing.

### 3. Content model and hierarchy

- The row stays a tool row.
- Its preview line (`tool__preview`) reads the change: `<setting>: <before> → <after> · <scope>`.
- Its one action, Undo, stands at the row's end, as `row__trailer` does.
- **The change's data** is the observation's own: the `configure` result ends with a one-line machine record (`configure-change: {...}`, JSON, carrying setting, scope, stated, before and after). The renderer reads it from `output`, so a row paged in after a relaunch has it, and no store column is added (§10 item 1).
- Disclosure: the expanded row shows the result text as today.

### 4. States

| Region | ideal | empty: first use | empty: cleared | empty: no results | filtered | cannot-show | loading | streaming / partial | error | success | disabled | permission-needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| change preview | `<setting>: <before> → <after> · <scope>` | before unstated: `<setting>: not set → <after> · <scope>` | n/a | n/a | n/a | no machine record (a row from before this build): the preview is the first line of `output`, as today, and no Undo | n/a — settled rows only | n/a — a running row has no result | failed or blocked: unchanged, no Undo | — | n/a | n/a |
| Undo | `Undo` (text button) | same | n/a | n/a | n/a | absent | pressed: `Undoing…`, disabled | n/a | refused: the row's line becomes `Not undone — <setting> was changed since; it holds <value> now.` | `Undone — <setting> is <before> again.` and the button leaves | n/a | n/a — the press is the user's own, no dialog (§5) |

### 5. Interaction

- Undo is a text button (`Button`, the `row__trailer` variant), reached by Tab after the row header, with no palette entry.
- The press sends the renderer command `config.undoAgentChange`, carrying setting, scope, stated, before and after. Main asks the workspace service to compare and set: the write goes through only while the file's value of the setting equals `after`.
  - `stated: false` removes the key.
  - Otherwise the key is written back to `before`.
  - Either way the scoped per-field path is used, and the load follows, as clause 2 requires.
- No `ConfirmDialog`: Undo is itself reversible, since the agent or the user can set the value again. The press is the user's, in the user's own window (`REQ-TOOLS-059`'s rule that only the host UI answers is met, not crossed).
- Focus after the press stays on the row. The result line is announced (§7).
- The "Undone" state is the window's, not recorded. After a relaunch the button shows again, and a second press is refused by the compare-and-set, since the setting no longer holds `after`. The record never claims an undo it did not make.

### 6. Copy

| Where | String |
|---|---|
| button | `Undo` |
| busy | `Undoing…` |
| success | `Undone — <setting> is <before> again.`; unstated before: `Undone — <setting> is no longer set in the <scope> file.` |
| refused, changed since | `Not undone — <setting> was changed since; it holds <value> now.` |
| refused, other | `Not undone — <the service's reason>` |
| button's accessible name | `Undo the change to <setting>` |

Bound: values clipped at 80 characters with `…` in the preview line. The expanded result holds them whole.

### 7. Accessibility obligations

- `REQ-SHELL-149`: the arrow is read as "changed to" in the preview's accessible description, so it is never a glyph alone.
- The result line is `role="status"`, polite.
- The button's name says which setting it undoes, so a list of rows read by name is unambiguous.

### 8. Composition intent

- Density as the tool row's. Earned surfaces: none new.
- The Undo button aligns with `row__trailer`'s end edge.
- Relations: `config-undo` `containment` in `row__main`; `text-fit` on the x axis for the preview, which clips with `…` and never wraps.

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| change preview + Undo | one line, Undo at the end | same | same | same | the preview clips first; Undo holds whole |

### 9. Components

- `Button` (design-system), the existing `row__trailer` class, the existing `tool__preview` class. No §4.2 gap.

### 10. Disagreements and gaps

1. **The value before is not a row field.**
   - It meets: `REQ-CHAT-046`'s row fields, and the store's append-only migrations.
   - Settled: the machine record in `output` (§3). A store column was declined, because the output is already recorded untruncated.
2. **Compare-and-set** is behaviour clause 7 does not state ("writes the value before back").
   - Settled here as the guard that makes an Undo of a stale row harmless.
   - Built under `PD-CONFIG-014` revision 3, which names it.

### 11. Evidence plan

- Capture: `pnpm app:drive`, the scripted dialect, `ROTARIS_SCRIPT=configure:display.show_tool_inputs=false,done` under `autonomous`.
  - Steps: `waitFor` the row's `[data-action="config-undo"]`; `shot` at 1400×900 and 1000×680; `click --settle`; `waitFor` the status line; read the file.
  - A second run edits the file between set and Undo, for the refused cell.
- Rubric rows: F2, F3, F4, C1, D3.
- **Must move:** the file holds the value before after Undo, and a stale Undo leaves the file unchanged.
- **Must hold:**
  - Every other tool row unchanged (`rows-proof`'s 52, 112 and 30 px).
  - The tool row's statuses (`tool-shapes-proof`).
