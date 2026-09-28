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

## Reading taken

**"Per agent" scopes the whole rule**: the comparison is with that agent's own immediately previous thinking row, so
another agent's reasoning between two equal bursts does not keep the second, and one agent's burst is never compared
with another's. The purpose clause ("display each burst once") holds under it for every interleaving. The other
reading — the whole transcript's immediately previous thinking row, which the code implemented — is raised as
**OQ-90** in `docs/architecture/open-questions.md` so the owner can overrule it; nothing else depends on the choice.

## Outcome

**Repaired 2026-09-28 under R-062.** `packages/ui/src/transcript/project.ts`: `previousThinkingByAgent` keeps, per
agent (the row's `name`, the identity the comparison always used), the immediately previous thinking row as a walk
forward meets it, and looks each agent's row up below the walk's start lazily — only for an agent whose unstamped
thinking row the walk asks about — through `lastThinkingOf`, which replaces the any-agent `lastThinkingBefore`. The
whole-state loop and the bounded projection's suffix take it from `startRow`; `cleanCut`'s forward pass takes it from
`b` and its backward walk looks up the row's own agent. `repeatsReasoning` still compares the names, so a caller can only
keep a row by handing the wrong agent's, never drop one.

Pinned by `packages/ui/src/transcript/transcript.test.ts`, "REQ-CHAT-048 per agent, with two agents' reasoning
interleaved": A, B, A-repeat drops the repeat; a repeat with another agent's different reasoning between (one or several
rows) is still dropped; an agent's differing burst is kept, also where it equals another agent's, and a stamped repeat
is kept; the bounded projection equals the whole-state one at every append of a ten-row interleaved fixture, grouped
and not — three of the four fail on the previous rule. `projector.test.ts` adds the same case through the projector's
bounded form (an append of X's repeat after Y's reasoning is not drawn; a differing one is), failing on the previous
rule, and its seeded walk (three agents, two reasoning bodies, eight switch combinations over seven seeds) still agrees.

Cost: `append-cost.test.ts` green three runs of three. The bounded projection at 1,200 rows, measured by a scratch
harness before and after on this host (medians of 41, milliseconds): no reasoning 0.118–0.167 before, 0.133–0.148
after (the suffix now looks nothing up where the old lookback scanned to the window's start); an unstamped append by an
agent whose last thinking row is near 0.159–0.191 / 0.152–0.314; by one with none 0.168–0.206 / 0.176–0.323; by one
whose last thinking row is 1,190 rows back 0.586–0.695 / 0.707–1.097 — the run that agent has open reaches back that far
under PD-CHAT-004 revision 2, so the walk, not the lookup, carries it. Same order of magnitude throughout.
