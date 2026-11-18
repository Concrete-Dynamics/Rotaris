[Settings — brief](../settings.md) › part 1

# Settings: the audit and execution of 2026-11-18 (R-105)

**Status:** implemented on the branch `feat/r-105-settings-pass`, not landed; not verified by an independent critique
**Written:** 2026-11-18 by the model (`claude-fable-5-2`) for [R-105](../../../product/requests.md#r-105), working through the Impeccable design skill and this repository's `design-ui` audit and `build-ui` steps in one pass
**Pack:** drives of the built app on `131d02cb` (before) and on the branch (after): all thirteen categories at 1400×900 and 1000×680, each scrolled through, theme `rotaris-dim`. The captures are in `.ui-review/r-105/`, which git ignores; every number below is in this file for that reason.
**Unaudited:** `nocturne` and `high-contrast`; any state that needs a provider, a stored key, a declared hook or a run (the drive used the scripted dialect on a workspace with no hooks and no instruction files); a screen reader.

## What the owner asked, and what was decided

The request was first read as a layout pass and then widened by the owner to "information architecture, ux, ui", with functionality preserved and the decisions left to the model.

**The category list is kept.** Thirteen categories under four headings (REQ-CONFIG-268, REQ-CONFIG-269, `PD-CONFIG-008`). Notices, commands and the unattended-run advisory address a category by its identifier (REQ-NOTIFY-044, REQ-TOOLS-192, REQ-MCP-108), so a merged or removed category breaks an address somewhere else. The audit also found no fault between categories: every finding below is inside one. Merging Interface with Display and hiding the Plugins placeholder were weighed and left; see "Deliberately left".

**The structure inside four categories changes**, by [`PD-CONFIG-011`](../../../product/directives/pd-config-011.md#pd-config-011): providers before model slots, the role named once, the playbook catalogue closed, a skill as one entry.

## Findings and what was built

| # | Category | Observation (before, measured) | Change | After |
|---|---|---|---|---|
| 1 | Skills | at 1000×680 the body scrolled sideways: `scrollWidth` 862 against `clientWidth` 645; body height 4 537 px. At 1400×900 a description ran eight lines beside a path cut mid-word | the entry cell of `PD-CONFIG-011` clause 4 | 645/645; height 1 165 px (1 776 → 1 052 at 1400×900) |
| 2 | Personas | at 1000×680 `scrollWidth` 683 against 645; "Persona" and "Role" printed one identifier twice | clause 2, one name column | 645/645 |
| 3 | Personas | eight slot headings in the mono face at 24 px, over the view's 20 px title; the catalogue 1 300 px tall | clause 3, closed disclosures | body 2 057 → 1 284 px at 1400×900 |
| 4 | Runtime | two control edges: 252 px for the rows outside a card, 231 px inside one | the card no longer gives back an inset it lost on 2026-11-14 | one edge, 252 px, for all 21 rows |
| 5 | Models, About | "Model source", "Capture level" and "Output folder" stood label over control; the select and the path field 1 042 px wide (UIR-009) | the fields are rows on the category's axis; a field holds one measure, a read-only path two | controls begin on the axis |
| 6 | Models | the providers began 470 px down, under seven slot rows, while the standing notice is about providers | clause 1 | providers first; "Model slots" heads the grid |
| 7 | every category | `text-tertiary` had no rule: captions carrying it computed to the primary ink (94 % lightness at 11 px) | the class takes `--rt-text-tertiary` | captions recede under their labels |
| 8 | MCP Servers | step 1's provider names on three edges, captions on three more (the defect note of 2026-11-10); the stanza at 14 px, the card's largest text; step 3's two fields on two edges | a name column, the caption on one edge; the stanza at `--rt-text-xs`; step 3's labels take `--rt-label-column` | one edge each |
| 9 | Hooks | two empty states centred in a body that reads from the left | the rule sections already use | left edge |
| 10 | MCP Servers, Plugins | a step's title and the Plugins title in the display face, which the 2026-11-14 revision reserves for the wordmark; the Plugins title inset 24 px from the other titles' edge | the interface face; no inset | on the edge |

Finding 7 reaches beyond Settings: about sixty elements in other views carry the class and now take the tertiary ink they were written to take. Those views were not captured in this pass.

## Deliberately left

- **Merging Interface and Display.** Four rows and seven. One category would be shorter to reach, and it would retire an identifier notices may name; the gain did not pay for that.
- **Hiding Plugins** until REQ-TOOLS-161's loader exists. It is a category with one sentence. Its identifier is in REQ-CONFIG-269's vocabulary and the sentence says why nothing is listed.
- **Diagnostics under About**, a setting inside a page of facts (REQ-SHELL-138 to -143 place it).
- **The save status above every category**, including the four that hold nothing to save (REQ-CONFIG-270).
- **The Tools table's Description column**, which prints the runtime target (`artifactListTool`) because the requirement says so.
- **The captions' wording.** Several run to three sentences; the requirements own the facts they state.
- **The Personas Scope column**, which repeats "model: default, reasoning: default" on every row until something is overridden.
- **Two select faces** in one row (the searchable model picker's chevron beside the native select's caret).

## Not verified

No test, lint or proof was run on this machine: by the owner's word the gate is the hosted runner's on the pull request. `layout-regression.test.ts` and `web-search-measure.test.ts` read `shell.css` by selector; the selectors they name were kept, by reading, not by running them. No independent `review-ui` critique was taken.
