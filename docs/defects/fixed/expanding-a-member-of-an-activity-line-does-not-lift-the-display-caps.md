## Expanding a member of an activity line does not lift the display caps

An activity line's members are rendered by `Row.tsx` under a key of their own:

```tsx
const key = m.callKey ?? `${m.index}`;
… expanded={surface.memberExpanded?.(key) ?? false} onToggle={() => surface.toggleMember?.(key)}
```

That key is **not** `rowKey(m)`, which is `tool:<callKey>` for a tool row. `hygiene` in `project.ts` applies
REQ-CHAT-166's caps to every row the reader has not expanded and tests membership as
`o.expanded.has(rowKey(row))`. So opening a member writes `activity-4` into the expansion map while the
projection looks for `tool:activity-4`, never finds it, and hands the renderer a value already cut short at
ten lines of output and two of input. The card opens; the text inside it is the truncated text.

The same double-keying is why `expansionKey()` exists — "the requirement keys tool rows by their tool-call key
and groups by the key of the group's first member, which is the same string for two different things" — but
`TranscriptPane` and `Row` both key the member map by a third form instead of by either.

## Specs

REQ-CHAT-061: "Clicking a tool row's header MUST expand it into a card that shows the **untruncated** call
input and result." REQ-CHAT-166 says the same from the other side: "Expanding a row per REQ-CHAT-061 MUST show
the untruncated value whatever the settings say." REQ-CHAT-059 fixes the identity an expansion is keyed by,
and `callKey ?? index` is a fourth spelling of it.

## Relevant files

- `packages/ui/src/transcript/Row.tsx` — the group branch's nested `<Row>`, where the member's key is chosen.
- `packages/ui/src/transcript/project.ts` — `hygiene`, which reads `o.expanded.has(rowKey(row))`, and
  `rowKey`, the single definition of a row's identity.
- `packages/ui/src/transcript/TranscriptPane.tsx` — `memberExpanded` / `toggleMember`, which carry the key.

Noticed 2026-09-16 while rewriting the run boundary for PD-CHAT-004 revision 2. **Not repaired**: it is
independent of that change, and the repair moves expansion-state keys, which is its own evidence to gather.

## Repaired — 2026-09-18

The member's card is keyed by `memberKey` (`Row.tsx`) — the member's own `rowKey`, the identity step 4
holds the caps against — instead of `callKey ?? index`, which stranded from `rowKey` on every member
without a call key (REQ-CHAT-059's content-hash fallback). Opening the card and lifting its caps are one
gesture again: `Row`'s group branch, both surfaces' `memberExpanded`/`toggleMember`, the plain-list
fallback key and the proof's seeded-open variant all read `memberKey` and nothing else. `data-member-key`
on the drawn member row publishes the card's key so the proof's click lands on the member it means.

Measured in the built app (`rows-proof`): the opened member's card carries all 30 lines of the run's only
30-line body — 30 `line` occurrences, tail `line 29`, no `cut short` marker — read from the live layout,
while the collapsed surface draws no member card and the line's own summary carries none of the output.
`transcript.test.ts` pins the projection half (member opened untruncated, sibling capped); `rows.test.ts`
pins the key identity. `rows-proof` itself is green on `main`'s script; the branch's added R0-4 assertions
read green up to the pre-existing REQ-CHAT-077 keyboard section, which regressed under an unrelated `main`
change (composer-docked-strip, R-040) and is recorded separately — the R0-4 evidence is unaffected.
