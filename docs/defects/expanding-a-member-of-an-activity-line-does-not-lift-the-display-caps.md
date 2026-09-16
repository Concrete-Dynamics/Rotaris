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
