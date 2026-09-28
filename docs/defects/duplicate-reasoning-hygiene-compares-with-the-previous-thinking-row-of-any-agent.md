## Duplicate-reasoning hygiene compares with the previous thinking row of any agent

REQ-CHAT-048's hygiene in the transcript projection drops an unstamped thinking row only when it equals the
immediately previous thinking row **of any agent** and the two carry the same name. When two agents' reasoning
interleaves — agent A's thinking row, then agent B's, then an unstamped repeat of A's — the repeat is compared with
B's row, the names differ, and A's duplicated burst is displayed twice. The requirement is stated per agent, so on
that reading the comparison should be with A's own previous thinking row. No test pins the interleaved case
against the requirement: `transcript.test.ts`'s REQ-CHAT-048 case covers two agents' equal rows side by side, and
`projector.test.ts`'s seeded walk compares the bounded projection with the whole-state one, which share the rule.
Noticed on 2026-09-28 while correcting the `hygiene` doc comment during REQ-CHAT-055's
measurement round (R-062), which said "of the same agent" where the code reads "of any agent"; the comment now says
what the code does and points here. Not repaired: it is outside that item, and the bounded projection's lookback
(`lastThinkingBefore`, `cleanCut`) would change with it.

## Specs

**REQ-CHAT-048** — "per agent, an unstamped (no duration) thinking row whose content equals the immediately previous
thinking row's content MUST project to zero rows". On the reading that "per agent" also governs "the immediately
previous thinking row", the projection keeps a repeat the requirement drops whenever another agent's thinking row
sits between the two. If the specification means the immediately previous thinking row of the whole transcript,
the code is right and only the comment was wrong; the reading is not settled here.

## Relevant files

- `packages/ui/src/transcript/project.ts` — `hygiene` and `repeatsReasoning` (the comparison), `lastThinkingBefore`
  (the lookback, any agent), the whole-state loop that carries `previousThinking` across agents, and `cleanCut`,
  which reads the same lookback for the bounded projection.
- `packages/ui/src/transcript/transcript.test.ts` — the REQ-CHAT-048 case: one agent's repeats, and two agents' equal rows adjacent.
- `packages/ui/src/transcript/projector.test.ts` — the REQ-CHAT-048 / PD-CHAT-004 cases and the seeded walk.
