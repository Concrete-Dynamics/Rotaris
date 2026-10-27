# Seams — what to touch, in what order, to add one of the things this product adds most often — 8. A drawn surface

Part 8 of 8 of [the seams](../04-seams.md), which indexes every part.

## 8. A drawn surface

The design language's pair — consult before, match after (`docs/design/README.md` §7).

| # | Step | Why it is mandatory |
|---|---|---|
| 1 | `pnpm mockup`, read the surface | craft, **never** structure; structure is `docs/spec/` (`REQ-SHELL-023` governs) |
| 2 | Build from `packages/ui/src/design-system/` | `tools/check-ui-language.mjs` refuses a design-equivalent control written anywhere else in `packages/ui/src` or `apps/desktop/src/renderer` |
| 3 | Cite tokens by name | never a literal colour or pixel value |
| 4 | Publish a contract on the root — `layoutContractAttributes` from `design-system/layout-contract.ts` | it marks the box with `data-ui` / `data-ui-contract` (the relations **array**), which is what `pnpm ui-audit` evaluates against live geometry after layout settles. It is the only publisher: `tools/check-ui-language.mjs` (`tools/ui-contract-publisher.mjs`) fails `pnpm lint` on a `data-ui-contract` written anywhere else in the drawing roots, the design system included — a hand-written object on the window controls once made the audit throw on every view |
| 5 | `pnpm build`, then `pnpm app:drive shot` | a PNG an agent can read is the cheapest way to meet "match after drawing" |
| 6 | `pnpm ui-audit`, then `pnpm ui-review` | `shrunkBoxes` (`apps/desktop/scripts/lib/layout-relations.mjs`) is the deterministic guard for UIR-014's whole class — a box standing smaller than its content on an axis that does not scroll — and it asks that of **every marked box**, not only of one that published a relation. An audit expression that throws in the renderer is reported as an **`AUDIT-ERROR`** finding naming the view, the size and the expression (`lib/audit-answer.mjs`), and the sweep goes on, so `report.json` is written for every view; a contract that is not a relations array is a `schema` finding for its own box. Every failing contract is filed under `CONTRACT` with the relation that failed under `relation` (`lib/audit-finding.mjs`), so `report.json`, the summary line and `manifest.json`'s `byKind` never read a failing `containment` contract as the whole-document `CONTAINMENT` sweep; the manifest counts contract failures per relation in `contractsByRelation`. The critic is report-only, at most three iterations |

Tokens alone are not compliance, and a plausible invention is not a third option where the design material
decides.

**A fact one agent surface shows, all of them show** (worked example: PD-CONFIG-003 revision 3's per-agent timeout, OQ-234,
2026-10-07). The fact rides on `AgentRecord` (`packages/contracts/src/children.ts`), filled by `toAgentRecord`
(`packages/engine/src/sessions.ts`) from what the store already holds — here the stored report, through a parser that sits
beside the one formatter that writes the text it reads (`timedOutOf` beside `childTimedOutMessage`, round-tripped in
`cut-off.test.ts`) — and `runLevelAgent` (`packages/ui/src/agents.ts`) states it for the synthetic agent; every fixture that
builds an `AgentRecord` gains the field. The words are written once in `agents.ts` (`TIMED_OUT_TAG`, `timeoutLine`), and a
path to a control is built from the labels Settings itself renders, never typed again (`perAgentTimeoutPath`). The four
surfaces draw it where the design gives a qualifier: a row's closes its meta label with a design `Tag` in the slot the stalled
tag uses (`AgentTree.tsx`, `AgentTable.tsx`) — on a line of its own under the state, because beside it the tag took its width
from the persona column (112 → 35 px in the 235 px sidebar) and scrolled the Mission card sideways; the stalled tag takes the
same line of its own since fin35, for the same measured reason (`pnpm mission-proof` item 1f), and since fin36 the table's
persona cell does not wrap (`.agent-table__persona`, `white-space: nowrap`), since the table's automatic layout broke
"coding-agent" at its hyphen in a 71 px column with or without a tag, and since fin38 it is bounded (`max-width: 24ch`,
cut with an ellipsis, the whole name its `title`) so a long configured persona cannot widen the table past its card — and the
inspector and a
persona window's instance tab a sentence of their own under the line the specification fixes (`TimeoutLine.tsx` in
`Inspector.tsx` and `PersonaWindow.tsx`), so REQ-MONITOR-052's meta-line form is kept. `agent-timeout.test.ts` renders all
four; `pnpm mission-proof` item 1d reads them and their geometry in the built app.

**A status-strip item** (worked examples: REQ-SANDBOX-121's sandbox indicator, 2026-10-02; the strip rebuilt to
REQ-SHELL-038's list, fin10, the same day). The strip's items are **values**: `stripItems(width, facts)` in
`packages/ui/src/composer.ts` answers them left to right in REQ-SHELL-038's order — the workspace path (the one `link`,
REQ-SHELL-039/040), the branch, a `spacer`, REQ-SHELL-041's safety flags in their fixed order (`statusStripSafetyFlags`;
the sandbox indicator right after the file-access flag, OQ-184's build reading, confirmed 2026-10-06 by R-071), the model, the tokens, the cost when there
is one, the background count — each with REQ-SHELL-038's accessible name (`STRIP_NAMES`), its tooltip as its accessible
description, and REQ-SHELL-047's two thresholds (`STRIP_PATH_MIN_WIDTH` 1180, `STRIP_BACKGROUND_MIN_WIDTH` 1080) applied to
the window's own width. `AppShell` (`packages/ui/src/AppShell.tsx`) only draws them, each through `StatusStripItem`
(`packages/ui/src/StatusStripItem.tsx`): a link as the design system's `Button`, text as a `span`, the spacer taking the
slack and giving it back first. An item that is a workspace path or a branch name carries `middle` (the path link and the
branch item, 2026-10-03): its label is shortened from the middle against the width the row gives it (REQ-WORKSPACE-149
rule 2 — `rowLabel` in `workspace-label.ts`, the canvas measurer in `label-measure.ts`, shared with the title-bar chip), the
box asking the row for its whole label as a flex basis and re-eliding on every ResizeObserver change (and on
`document.fonts`' `loadingdone`), and fixed text after it (the branch's ` ↑{n}`) rides as `suffix`, never shortened; every
other item keeps REQ-SHELL-038's end ellipsis. The path link gives up its width **first** (`flex-shrink: 1000000` on
`.status-strip__link[data-middle='1']`; equal factors let a long path squeeze `main` to `m…` or nothing), and a link whose
label rule 2 hid is hidden whole (`data-label-hidden`), no empty focus stop. The branch item is `middle` only while it shows
a branch name: its detached, non-repository and unread words are never shortened (REQ-GIT-161, OQ-193), and an unborn or
unreadable branch is the empty item (state `empty`: no text, no icon, and `StatusStripItem` draws no `title` and no
`aria-description` for an empty string; REQ-WORKSPACE-020, fin22). A glyph
before the label rides as `icon` (the branch item's `ph-git-branch`, REQ-SHELL-042), coloured by a token in
`.status-strip__icon` so a theme change redraws it. An accessible description that is not the tooltip rides as
`description` — only the branch item's while it names an isolated worktree's branch (REQ-WORKSPACE-020: the base sentence as
the tooltip, the worktree added to the description alone; `branchStripItem`, the ahead count from the snapshot row's
`upstreamAhead`); every other item's description is its `title`. An item is text in the strip's own
craft — the mockup's strip is plain tertiary text at `--rt-text-xs`, mono only for figures — so a new item takes no new
control and no new token. The path, in order: the fact on the record the renderer already receives (`SessionRecord` in
`packages/contracts/src/channels.ts`, filled by `toSessionRecord` in `packages/engine/src/sessions.ts`; a store column
first if no stored fact carries it, §3 — the sandbox item's was v31's `sandbox_backend`), or a command the run host
answers where the fact is the workspace's rather than a session's (`workspace.usage`, §1, for the tokens and cost); a
field on `StripFacts` and its place in `stripItems`, pinned in `composer.test.ts` for every state that shows or hides it
and in `layout-regression.test.ts` for the order at each threshold; then the renderer's `status` memo in
`apps/desktop/src/renderer/main.tsx`, which fills `StripFacts` from the **focused** session's record (so an item re-binds
with focus, REQ-MONITOR-257), the configuration snapshot — every flag a setting decides reads it there, never a boot
answer (`● CB armed` through `stripCircuitBreakerArmed` since 2026-10-03, when a breaker turned off in Settings still read
armed), and main announces each main window and its persona and terminal windows their own workspace's snapshot
(`announceConfig`, `configFamily`, `apps/desktop/src/main/config-broadcast.ts`) — the window's width (`useWindowWidth`,
`apps/desktop/src/renderer/strip-facts.ts`) and the workspace's usage, and memoises on what it shows (REQ-TOOLS-184's
"never redraws when nothing it displays has changed"). Read it in the built app with `pnpm app:drive` at 1000, 1079, 1179
and 1400 px wide (`resize`, then `scrollWidth` against `clientWidth` on `.status-strip`): REQ-SHELL-047 owns the widths at
which an item stops being shown, and an item added without a threshold there is shown at every width, so it must fit
beside the others at REQ-MONITOR-051's 1000 px floor.
