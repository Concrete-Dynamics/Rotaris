## A folded tool group puts its family word in the role gutter, so attribution alternates between the agent and the activity

`placements()` computes each displayed row's "role" for REQ-CHAT-057's block rule. For a
`shape: 'group'` row it uses the group's **family** — `reading`, `editing`, `searching`, `running` —
rather than the agent the group belongs to, and `Row` then draws that family in the role column.

The consequence is visible in any ordinary run. One agent that thinks, reads, thinks, reads draws:

```text
18:09:08  ORCHESTRATOR   ▸ reasoning · 16s · ~554 tok
18:09:25  READING        ▸ reading ×2 · 2 ok
18:09:26  ORCHESTRATOR   ▸ reasoning · 1s · ~33 tok
18:09:27  READING        ▸ reading ×2 · 2 ok
```

Two things follow, and both are wrong:

1. **The role column stops naming a speaker.** A reader scanning the gutter sees two participants
   alternating where there is one agent doing one continuous piece of work. `reading` is not a role;
   REQ-CHAT-047's vocabulary is roles, and the family word is not in it.
2. **Every group starts a new block.** `blockStart` is `i === 0 || roles[i] !== roles[i - 1] ||
   d.shape !== 'row'` — the third disjunct forces a block start on every group and trailer whatever
   its role is. With PD-CHAT-003's 12 px between blocks and at most 4 px within one, a run of one
   agent's work is drawn as N blocks at full separation instead of one, and the persona bar of
   REQ-CHAT-057 is never drawn for the rows that should be continuations.

Neither effect is stated by any requirement. Both fall out of the family standing in for a role.

## Specs

- **REQ-CHAT-057** — "Attribution — the role line … MUST be drawn only on the first row of a block, a
  block beginning at every row whose role differs from the row above it." A group whose members all
  belong to one agent does not have a role that differs from that agent's; the code makes one up.
  The continuation bar the requirement then asks for is consequently never drawn in this case.
- **REQ-CHAT-064** — "a run of at least 2 consecutive tool rows **that belong to the same agent** …
  MUST collapse into a single group header row **labelled with that family's activity word**." The
  requirement gives the family as the header's **label**, and it is already drawn as one, in
  `tool__name` ("reading ×2 · 2 ok"). Putting it in the role gutter as well states it twice and
  displaces the agent the same sentence says every member belongs to.
- **PD-CHAT-003** — the vertical rhythm (12 px between blocks, ≤ 4 px within one) is applied against
  block boundaries this defect invents, so the directive's density is not reached on any transcript
  that folds groups.

Nothing in the corpus asks for the family in the role column, so this is a defect of the
implementation rather than a disagreement between requirements.

## Relevant files

- `packages/ui/src/transcript/Row.tsx` — `placements()` (the `d.shape === 'row' ? rowRole(d.row) :
  d.shape === 'group' ? d.family : …` expression, and the `|| d.shape !== 'row'` disjunct that
  follows it); the group arm of `Row` that renders `<span class="row__role">{display.family}</span>`
  while `tool__name` already carries `groupSummary(...)`.
- `packages/ui/src/transcript/project.ts` — `foldRuns()` builds the `DisplayRow` for a group and
  carries `family` but not the agent, so the fix needs the members' `name`/`persona` (every member
  has the same one, by `canFoldTogether`).
- `packages/ui/src/shell.css` — `.row--block-start` (PD-CHAT-003's 12 px) and `.row__bar`
  (REQ-CHAT-057's continuation bar), the two treatments this defect switches on.
- `packages/ui/src/transcript/transcript.test.ts` — where a regression for the block rule belongs.
- `apps/desktop/scripts/rows-proof.mjs` — the proof that measures REQ-CHAT-057's attribution and the
  persona bar; its `proof-groups` surface draws a group in isolation, which is why no existing
  evidence shows the alternation.

*Noticed 2026-09-15 while answering a request about transcript turn grouping ([R-017](../product/requests.md#r-017)).
Recorded, not repaired.*
