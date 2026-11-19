# Workspace — the redesign of 2026-11-18, and its critiques

**Status:** built 2026-11-18 on `feat/workspace-run-panel` (revision 2 of the directive, section 5), not landed. **Request:** [R-107](../../product/requests.md#r-107).
**Directive:** [`PD-SHELL-017`](../../product/directives/pd-shell-017.md#pd-shell-017), which holds the structure; this file holds how
it was reached and what the critiques found. The method is `.agents/skills/redesign-surface`, written from this round.

## 1. The surface as it stood

Measured on the built application at `131d02cb`, 1440×900, a scripted run with three delegated agents:

| Fact | Figure |
|---|---|
| The transcript column | 800 px of 1440, between an agents column of 260 px and an inspector of 300 px |
| Bands above the first transcript row | three (run header, toolbar, intent line); four at 1000×680, with the drawer bar |
| The transcript's height at 1000×680 | 386 px of 680 |
| Places the live run's model and reasoning could be set | three (run header, inspector, and the composer's chips for the next run) |
| Lines the inspector spent on tools the agent had not used | one each: ten for the orchestrator |
| A pending approval | a transcript row, which scrolls out of view |

## 2. Two concepts, and the choice

Both were drawn as static pages in the product's tokens and shown at 1440×900 and 1000×680. They shared one header band, a
transcript without a frame at a reading measure, the composer on the ground plane, the unused tools folded, and the pending
approval above the field.

- **Concept 1, the Run panel** (chosen): one column on the right holds the live-run controls, the agents, the task plan and
  the inspector; below 1180 px it is one drawer.
- **Concept 2, agent lanes** (not taken): no side column; the agents are a strip of tabs above the transcript that also
  scopes it, the plan is one line above the composer, the detail a sheet on demand. Not taken because delegation goes three
  levels deep with four children each and a strip does not hold a tree.

## 3. What every function became

The inventory taken before the build listed sixteen regions. Each is where it was, or here:

| Was | Is |
|---|---|
| The run header's "Compress context" and the live model and reasoning selectors | the head of the Run panel and its first row |
| The transcript toolbar's own row | the header band, after the timing and the intent status |
| The intent line's own row | the header band; hidden visually below a 900 px band, said to assistive technology and as a tooltip |
| The agents column (tree, "Steer"/"Cancel" for a selection, task plan, project section) | sections of the Run panel, the two acts under the tree |
| The inspector column | a section of the Run panel, under the task plan |
| Three drawer buttons and two drawers below 1180 px | one toggle at the end of the band, one drawer, a scrim that closes it |
| The transcript's frame while following (REQ-CHAT-070) | the transcript's lower edge, in the accent, at the reading measure |
| The approval trailer row | unchanged, and repeated as one line above the field with "Review" |

## 4. The critiques

An independent reviewer read the captures before the change, the approved page and the build, three times, and changed
nothing itself.

| Round | Verdict | Found | Answered |
|---|---|---|---|
| 1 | not satisfied | ten: the band wrapped to two lines below wide windows; the panel's head stood 27 px off the band's rule; the drawer covered its own toggle and had no scrim; the inspector repeated a name three times and its ring was heavy; the agents' two acts floated above the tree and "Cancel" had lost its tone; the scope switch clipped its detail; the two switches looked different; zero counters and a second uppercase label; the composer's estimate was loud; the transcript's accent rule | eight built. Declined: the orchestrator as the tree's root (REQ-MONITOR-043 forbids it), merging the two "Steer"/"Cancel" pairs (they act through different paths), and the accent rule (the rows' own brief) |
| 2 | not satisfied | six: an edge above the composer; the scope switch still the tallest control; the stash count lost where labels are icons; the name still three times while following; the switches still two looks; the scrim too faint | all six; the edge was REQ-CHAT-070's treatment and was moved to the field's own upper edge |
| 3 | not satisfied, one finding | the following edge on the composer's field read as that field's focus, and was no longer the transcript's | put back on the transcript's lower edge, in the accent, the field's border neutral; built after the round and read by no reviewer |

**Not judged by any round:** the line above the field for a pending approval, which no scripted step in the capture harness
produces.

## 5. Revision 2 — the owner on the first build

The owner, shown revision 1 built: "id like the inspector to be on the right side like it was and the agent tree you
designed on the left. all collapsible (remembered globally). also redesign the inspector.", and "also fix the spacing of the
input card at the bottom. looks off."

| Asked | Built |
|---|---|
| The inspector on the right, the agents on the left | two panels: the Run panel (280 px: the live-run controls, the agents, the task plan, the project section) and the inspector (320 px) |
| All collapsible, remembered globally | each folds by its toggle in the band; from 1180 px the choice is stored per user as two more panes of the view's layout (REQ-SHELL-069), 0 for a folded panel |
| The inspector redesigned | a head the band's height; a scrolling body of mode, persona and instances on one line, identity, and four ruled sections (Context, Model and reasoning, Tools with its count and the names in use, Artifacts); the cascade note and the three acts held at the foot, "Cancel" at the far end |
| The input card's spacing | measured 104 px in a 150 px row, 8 px above and 46 px below, its text 10 px right of the strip's first control; it now fills the row with 12 px above and below and one left edge |

The same reviewer read the revision. Round 1, not satisfied, six findings: both panels docked left the work column 480 px at
1180 to 1320 px; the name hidden while following left the inspector with no heading; the cascade note stood under Artifacts,
150 px from "Cancel"; the Agents heading stepped 8 px off the section's edge; the inspector's two selectors were two
controls; "None used yet." repeated the count. All six were built: below a 1400 px window the inspector is the drawer on its
side and the Run panel docks. Round 2: satisfied, all six seen fixed and nothing from the earlier rounds regressed.

## 6. Left open

- The agents' "Steer" and "Cancel" and the inspector's carry the same words for two paths (the steer dialog, the persona window).
- The transcript's accent rule is one segment per row and stands off the text it marks; it belongs to
  [`transcript-rows.md`](transcript-rows.md).
- With the Run panel folded, the live-run controls are one act away.

## 7. Verification, as run

- **Before the rebase** (2026-11-18, an idle desktop): the gate green but for the two `SIGINT` cases of
  `packages/agent-tools/src/terminal/background.test.ts`, which fail alone on this host; the twenty-eight suites the
  verification plan named green, `theme-proof` excepted (red on `main` alike).
- **After the rebase onto `e425c5a7`** (2026-11-19): `pnpm check` green, 8397 tests. `mcp-proof` had found a real defect —
  an empty native grant left the inspector without its tools field — repaired in the branch's second commit and green
  since. Seventeen suites green; ten red or changing colour, each of them red on `main` in the same hour or green when
  run alone: `docs/defects/nine-surface-proofs-are-red-on-main-and-on-a-branch-alike-while-the-desktop-is-in-use.md`.
- **Captures of the final head:** `.ui-review/workspace-run-panel/final/` (git-ignored), empty and running at 1440, 1920 and 1000 px.
