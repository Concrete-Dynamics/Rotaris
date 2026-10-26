# Design Brief — Rotaris Desktop Interface — 7. Fidelity — consult before, maintain after

Part 7 of 7 of [the design README](../README.md), which indexes every part.

## 7. Fidelity — consult before, maintain after

> **Adopting the language is not the same as using it. Section 2 said what is adopted; this section says
> what a change to the interface has to do about it.**

Two obligations bind every change that draws, redraws or restyles a surface. They are stated in `CLAUDE.md`
beside the architecture views' pair, and they are read the same way.

1. **Consult before drawing.** Before writing or changing a component, look at the surface in the mockup.
   `pnpm mockup` serves `mockup/rotaris-ui-mockup.dc.html` at `http://localhost:8791` with the icon font, the
   two text faces and a picker that shows one screen at a time — the export's own runtime is not in this
   repository, so without that shim every modal stacks on every screen and the glyphs come out as tofu. Read
   what the language does with the thing you are about to draw: how much air it gets, whether it is a card or
   a line, where the mono face is used and where it is not, what carries colour and what carries only text.
2. **Match after drawing.** A surface that could have followed the design material and did not is a defect of
   the change that drew it, on the same terms as a view that disagrees with the code. Where the specification
   fixes the structure the design material may not have it (§2); where it fixes nothing, the design material
   decides, and "I wrote a plausible box" is not a third option.

**Where to look.** The screens sit in the second half of the file, each behind an `<!-- ═══ NAME ═══ -->`
banner; the first half is the design system's own specimen cards, which are the same material as
`system/guidelines/`.

| Surface | Mockup section | Nearest built code |
|---|---|---|
| Title bar, nav rail | `title bar`, `nav rail` | `AppShell.tsx`, `NavRail.tsx`, `WorkspaceChip.tsx` — the **workspace chip drawn 2026-09-12** (Stage B) from that block's own pill: `--rt-radius-pill`, a `--rt-border-strong` hairline, the mono face, `ph-folder-open` a step quieter than the text, and its 6 px gap and 3 px by 9 px padding. Three departures, each because the specification fixes what the mockup only suggests: the text scale is the smallest the scale has (`REQ-WORKSPACE-017`, where the mockup draws `--rt-text-xs`), the chip sits in a **centred** region (`REQ-SHELL-033`, where the mockup puts it hard left after the wordmark), and it carries no caret glyph — `REQ-WORKSPACE-017` enumerates its parts as icon, path, `·`, session name, and a dropdown affordance in front of a native folder chooser would promise a menu that does not exist. **The transient acknowledgement's one action** (`PD-WORKSPACE-001`, `Acknowledgements.tsx`) has no counterpart to consult — §3.2 lists that surface among the undrawn and the mockup's picker holds no toast at all — so it follows the language alone: a quiet text action in the accent, no filled background (G1), at the body's own scale, under the text rather than beside the close control so a row with no action keeps its shape |
| Overview | `HOME`, `expanded overview strip` | `OverviewView.tsx` |
| Transcript rows, run header | `WORKSPACE` → `transcript column` | `transcript/Row.tsx`, `TranscriptSurface.tsx` |
| Queue, composer, slash catalogue | `WORKSPACE` → `queue + composer` | `WorkspaceView.tsx`, `composer.ts`, `slash/SlashPopup.tsx`, `RunHeader.tsx` |
| Agent list, context rings, inspector | `WORKSPACE` → `agents panel`, `inspector` | `AgentTree.tsx`, `ContextRing.tsx`, `Inspector.tsx` |
| Approval card | `WORKSPACE` → the `approvalOn` block | `ApprovalDialog.tsx` |
| Structured questions | `question stepper modal` | `QuestionStepper.tsx` |
| Git worktrees, commits, diffs | `GIT` | `GitView.tsx` |
| Library tabs and cards | `LIBRARY` | `library/LibraryView.tsx` |
| Settings panes and save bar | `SETTINGS` | `SettingsView.tsx`, `settings/` |
| Provider auth | `provider auth modal` | `ProviderDialog.tsx` |
| Terminal window and transcript preview | — (no window mockup, §3.2); `WORKSPACE` → the live terminal preview block for the preview | `terminal/TerminalWindow.tsx`, `terminal/TerminalPreviewBlock.tsx` — **drawn and wired 2026-09-10** (Parts AM, AL′): the window has no design and is built from the language alone; the preview follows the mockup's block. **Closed 2026-09-11** (Part T″): the three surfaces are measured equal on a live stream (`REQ-SHELL-102`), and the drawing is unchanged — what wave 3 added is evidence, not craft |
| Requirements board, review, new requirement | `REQUIREMENTS`, `Review view` modal, `New requirement` dialog | **drawn 2026-09-10**: `requirements/` (Part AK′) and `requirements/panes/` (Part AP), **hosted and closed 2026-09-11** (Part R″: the five panes reachable through the board's own registry with the host drawing its chrome, and the relationship graph drawn as a presentation centred on ONE requirement). The Kanban/List/Graph tabs are craft; the axes, the columns and the detail's five sections are `REQ-TRACE`'s and govern where they differ — and the graph is centred rather than an axis, which no tab can be (`REQ-TRACE-322`) |
| First launch | `first-launch guide` | — not drawn |

Mission has no counterpart to consult; §3.2 is why. Requirements has one (§3.1 calls its coverage good) and the board is drawn against it — an earlier version of this line said otherwise and was wrong.

### 7.1 What the first reading of this obligation found — 2026-09-08

*Recorded under GD-10 against §2, which has stood since 2026-09-01 and had never been measured against the
built interface. The finding is that §2 is being kept at the level of tokens and broken at the level of
composition, and that the two are not the same promise.*

**The tokens hold.** `tools/check-theme-colours.mjs` fails the lint on a literal colour and no source file
carries one; the renderer imports `@design/base.css`, `@design/components.css` and `@design/motif.css`; 59 of
the 96 class names the design system's component CSS defines are named in a `className` in `packages/ui` or the
renderer, and most of the 37 that are not belong to components no screen has needed yet (`toast`, `spinner`,
`log-panel`, the diff washes). Nothing here is the drift.

**The transcript is where it breaks, and the cause is not what it looks like.** The specification is *more*
specific than the design material about the transcript, and where both speak they agree:
`REQ-CHAT-060`'s monospace `▸ toolname args … ok · 3.2s` header, `REQ-CHAT-061`'s expansion into a card
captioned `INPUT` and `OUTPUT`, and `REQ-CHAT-062`'s `▸ reasoning · <N>s · ~<T> tok` are the mockup's own
one-liners, written as requirements, and `transcript/Row.tsx` implements them. `REQ-CHAT-057` then fixes a
geometry the mockup does not draw — a 52 px timestamp column, a 112 px role column, attribution on the first
row of a block and a 2 px persona bar on continuations — and by §2 it governs, so the mockup's right-aligned
user bubble and its card-less assistant prose are **correctly** not built. That much is the rule working.

**What neither source asked for is the container.** `shell.css`'s `.row` gives *every* row —
user, agent, tool, system alike — `background: var(--rt-surface)`, a 1 px border and a radius, so the
transcript reads as a stack of identical boxes. `REQ-CHAT-057` fixes columns, heights and margins and says
nothing about a card, and in the mockup a bordered surface is *earned*: the user's own message (an
accent-tinted bubble), an expanded tool call, an artifact preview, the live terminal block and the approval
card have one, and nothing else does — an agent's prose and every one-liner sit directly on the background.
`.row--user` then changes only the border colour, where that one tinted fill is what makes a person's own
words findable while scrolling. This is the drift the owner reported, it is the only part of it that no
requirement mandates, and it is a change to about six declarations.

**Deferred, then directed.** This section first said the repair belonged to a change of its own, so the finding
would not be absorbed into the fix. The owner set compliance as the goal the same day and the repair followed
immediately; the deferral is kept here rather than deleted, because the finding above is what the repair is
answerable to and a section that only describes its own outcome cannot be checked against anything.

### 7.2 The repair — 2026-09-09 (Part AI)

Six changes, each traceable to a line of §7.1 or to the material it cites. Nothing in `docs/spec/` moved, and
where a requirement fixes a geometry the geometry is untouched — `rows-proof` still measures 52 px, 112 px and
30 px from the live layout.

1. **`.row` gave up the card.** The universal `--rt-surface` background and 1 px border are gone; the border stays
   declared at `transparent` so the box model `rows-proof` measures is unchanged and a variant that earns a border
   adds no shift. Hover became a wash rather than an outline, since there is no longer a border to darken.
2. **A surface is now earned.** `.row--user` takes the mockup's accent-tinted fill and accent border, which is what
   makes a person's own words findable while scrolling; `.row--approval` and `.row--diff` take a panel with a 2 px
   rail (`--rt-wait`, `--rt-border-strong`); `.tool__card` — REQ-CHAT-061's expansion — takes the surface the row
   gave up, with the rail in the tool axis and the 620 px cap the material draws. Everything else sits on the
   background: an agent's prose, every one-liner, and a group's members, which are marked by the divider they hang
   from instead of a nested box.
3. **`.row--system` took the notice pattern** the design already fixed (§1, G1: a rule and a glyph, never a filled
   background) instead of a dashed box, and `.row--agent`'s border rule went away with nothing to replace it —
   an agent message is the transcript's ground state.
4. **Prose got a measure.** Nothing in the material's transcript runs the full width of a wide window; it caps a
   message at 78 % and a revealed block at 560–620 px. Diffs, tables and code fences opt out, because they are read
   by their columns and wrapping them is what the cap exists to prevent.
5. **A tool one-liner moved to axis Y.** `REQ-CHAT-060` says "the tool accent colour" and names no colour; the
   material names it, and it is not the product accent — a tool call sits on axis Y while reasoning and delegation
   keep the accent, so the three kinds of one-liner differ by hue as well as by wording. `blocked` and `failed`
   still win, at equal specificity and later in the file.
6. **Two components stopped being hand-drawn.** The run header's state was coloured text with four per-state
   overrides; it is now the design's `Tag` with a status dot, toned by `RUN_STATE_TAGS` and pulsing on exactly the
   states where work is in flight. The command palette gained the `.cmdk-foot` the material draws, stating the
   three keys the dialog answers to.

**What was looked at and deliberately left.** `.agent-row__dot` duplicates the design's `.status-dot` in six call
sites and renders identically to it; changing it is a refactor with no visible effect, and the obligation in §7 is
about what the interface looks like, not about which class name reaches it. `REQ-CHAT-057`'s columns still win over
the mockup's right-aligned user bubble and card-less assistant prose, exactly as §2 requires — the repair changed
what neither source asked for and nothing that either one did.

### 7.3 Telling two working agents apart — 2026-09-16 (`PD-CHAT-004` rev. 2, `PD-CHAT-005`)

The owner read a live transcript in which an orchestrator and a code analyst worked at the same time, and could
not tell whose row was whose. Three things the material already decides were being ignored, and the repair takes
each from the material rather than inventing one.

1. **The collapsed line states totals, not a sequence.** The WORKSPACE artboard writes an agent's finished work
   as `▸ reading · searching · 6 calls · ok · 8.4s` — one word per kind of work, then what it came to. That is
   the craft source for the one-segment-per-family line. The alternating `reasoning ×1 · reading ×2 · reasoning
   ×1 · …` the code drew instead is nowhere in the material, and it grows without bound while the agent works.
2. **The role line takes the persona's own colour.** The design language declares `--rt-viz-1` … `--rt-viz-6` a
   **categorical** ramp — "use in order; never invent chart colours outside this set" — which is exactly the job
   a persona palette does. The status tokens are not available for it: `--rt-ok` and `--rt-run` resolve to the
   same value, so a persona bar drawn from them reads as an outcome. Contrast was checked rather than assumed —
   the worst pair in the ramp on the row hover wash is 5.28:1, above the 4.54:1 `--rt-warn` already carries.
3. **A delegated agent's rows indent.** The agents panel already draws the delegation tree by indentation; the
   transcript drew the same tree flat. The indent is `var(--rt-space-4)` per level, capped at two, applied as
   padding inside the row box — `REQ-CHAT-057`'s 52 px and 112 px columns and its margins are untouched, which
   is why `PD-CHAT-005` extends that requirement rather than narrowing it.

### 7.4 A tool row says what it is doing — 2026-10-24 (`REQ-CHAT-175` – `REQ-CHAT-178`)

The header of a tool row read `▸ read_file` — the mechanism's name and nothing about the work, so a reader
following a long transcript had to open each row to learn what the agent was doing. The header is now the call's
**description**: `▸ Reads src/app.ts`, `▸ Runs npm test`, `▸ Searches for release.yml`, and the tool's own name
where the build derives no line. The change follows the material rather than adding to it:

1. **The one-liner stays a one-liner.** The description takes the place the tool's name held in the same
   `▸`-prefixed header, in the same tool-axis colour, at the same scale, with the outcome still pushed to the
   right of the same line — `REQ-CHAT-060`'s drawing, with a sentence where a name was. It is drawn at every stop
   of the transcript's verbosity slider (`REQ-CHAT-177`), so no stop is a stop at which the row goes back to a
   bare tool name.
2. **One line, ellipsized.** The description is capped at 120 code points in the derivation and drawn
   `nowrap` with an ellipsis in a narrow window, so a long command cannot turn a 30 px row into a paragraph. The
   untruncated arguments remain where the material puts them: in the card `REQ-CHAT-061` opens, under `INPUT`.
   The rule is scoped to `.tool__description` so the activity line's and the thinking row's own `.tool__name`
   keep the wrapping they had.
3. **Nothing else moved.** The chevron, the timestamp and role columns, the persona bar, the row margins, the
   preview line and the card are untouched; `rows-proof`'s 52 px, 112 px and 30 px still measure from the live
   layout. What the reader gained is a line of text the material always had room for, and what the change cost
   is that a header can now be cut — which is why the card is still the place a call is read in full.
