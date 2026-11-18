---
name: redesign-surface
description: 'Redesign a whole Rotaris surface end to end with a free hand over its information architecture, interaction and drawing, functionality preserved: inventory every function, measure the built surface, show the owner two structurally different concepts mocked in the product''s tokens, build the chosen one on a branch, and iterate against an independent reviewer before any test runs. Use when the owner asks to redesign, overhaul or improve a view or area and to be shown options first. Use design-ui for a brief or an audit alone, build-ui to draw a decided surface, debug-ui for a bounded defect, review-ui for a read-only critique.'
argument-hint: '[surface or view to redesign]'
---

# Redesign a Rotaris surface

The method the Workspace was redesigned by on 2026-11-18. It strings the other UI skills together and adds what they leave out: the function inventory, the two concepts, the owner's choice, and the order of the checks. Run the phases in order; **phase 5 is a stop**.

## Before starting

- **The owner asked for it.** A redesign changes screens, order or placements the specification fixes, so it needs the owner's request, logged in `docs/product/requests.md`. Without one, this is `design-ui`'s audit.
- **Ask what is in scope once**, if the request leaves it open: layout only, or structure, interaction and drawing. A layout-only pair of mocks was thrown away here because the owner meant all three.
- The design language is not in scope: tokens, planes and type are `docs/design/README.md` §1. A redesign moves structure inside it.
- If the Impeccable plugin is installed, run its `context --target <file>` once for `PRODUCT.md`, `DESIGN.md` and the surface brief; otherwise read those files.

## Phases

1. **Inventory every function.** Delegate it read-only, with an explicit model and effort, and tell the agent to launch nothing (one started the driven app here and replaced the session being captured). Ask for, per region: every datum shown, every control with when it is shown and enabled, every conditional state, the `data-testid`s and classes proofs may hold, the keyboard chords, and each required literal with its `REQ`/`PD` id. Nothing in this list may be lost by the redesign; a thing that moves is named in the directive.
2. **Capture the surface as built.** [`references/capture.sh`](references/capture.sh) rebuilds, starts `pnpm app:drive` on a scratch workspace with a scripted run and shoots each state at 1440×900, 1920×1080 and 1000×680. Edit its STATES block for the surface. Read the PNGs, and measure with `app:drive eval` (widths of columns, heights of bands).
3. **Diagnose in figures, against the operator's journeys** (`docs/research/design/04-the-agent-operator-journeys.md`): how much of the window the content gets, how many bands stand above it, what is said or settable in more than one place, what the operator needs on return and has to scroll for. Every claim carries a number or a capture.
4. **Draw two concepts that differ in structure**, not in styling. State what both share separately, so the choice is about the difference. Mock each in the product's tokens as static HTML under `.ui-review/<slug>-redesign/` (git-ignored), from [`references/mock.css`](references/mock.css), [`references/mock-shared.js`](references/mock-shared.js) and [`references/mock-concept.html`](references/mock-concept.html), and render with headless Chrome at the sizes the product ships at:
   `google-chrome --headless=new --hide-scrollbars --allow-file-access-from-files --window-size=1440,900 --screenshot=out.png "file://$PWD/concept-1.html?f=1"`
   Show the main state, the narrow window and the empty state. Sample content is invented and said to be. Re-copy the token values from `packages/contracts/src/theme/themes.ts` if they moved.
5. **Stop: the owner chooses.** Send the PNGs. For each concept say what changes, what it costs, and what does not scale; recommend one and say why. Build nothing until the answer.
6. **Build the chosen concept** in a worktree (`pnpm worktree:new`), following `build-ui`. Rules this method adds:
   - Keep every `data-testid`, accessible name and required string. Before moving a control, `grep` `apps/desktop/scripts` and the tests for it.
   - The driver clicks by coordinates: a control moved into a menu or hidden behind a disclosure breaks every proof that presses it. Keep it visible, or change the proof in the same change.
   - Read the text of each requirement the surface cites before removing anything it draws (the transcript's frame turned out to be REQ-CHAT-070's "border treatment").
   - Prefer moving existing components between containers over rewriting them.
7. **Write the record with the build**: the request row, a `PD-<DOMAIN>-<NNN>` whose clauses are the new structure and whose "Narrows" line names each requirement, a back-pointer under each of those requirements, and the two counts. Check open worktrees and pull requests for a request or directive number already taken.
8. **Iterate against an independent reviewer, before any test.** Capture the build with the same script. Give a report-only agent (explicit model and effort; `review-ui`, or Impeccable's finish reviewer) the capture before the change, the approved mock, the build's captures and the diff, and ask for a verdict line, `SATISFIED` or `NOT SATISFIED`, and an ordered list of material fixes. Say which states have no capture. Fix, recapture, ask again; three rounds at most, then report what stands.
9. **Only then verify.** `pnpm verify:plan`, the gate, and every proof suite it names. A proof that asserted the old structure is rewritten to assert the new one, never deleted; a red that is not about the structure is a defect. Update the surface's brief under `docs/design/briefs/`, `docs/design/information-architecture.md`, and the architecture view if a seam moved.
10. **Open a pull request**, not a landing, with the before, the mock and the after.

## Done when

- The inventory's every item is present in the build or named as moved in the directive.
- The owner chose the concept that was built.
- The reviewer's last verdict and what it left open are in the pull request.
- The gate and the planned proofs ran on the final head, and their result is reported as it was.
