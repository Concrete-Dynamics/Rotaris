## An expanded activity line draws its members twice

`projectDisplay` emitted an open run's members a **second** time, as top-level displayed rows immediately
after the header:

```ts
if (expanded.has(header.key)) for (const m of members) out.push({ shape: 'row', key: rowKey(m), row: m });
```

`Row.tsx` already reveals the same members **nested** inside the line's own article, hanging from
PD-CHAT-004's single continuous rule in the agent's persona colour. Both paths read the same set and the same
key: `TranscriptPane` passes one `expanded` set to step 4 and computes `const open = expanded.has(d.key)` from
it for the renderer, and a group's key is `group:<first member's key>` on both sides. Opening a line in the
product therefore drew every member once under the rule and once again beneath it — the second copy with a
gutter of its own, since `placements()` does not mark a top-level row as a member and the row falls back to
drawing full attribution or a persona bar.

Neither proof could see it. `rows-proof`'s two activity surfaces pass `new Set()` to the projection and open
the line by **clicking** it, with a note saying that seeding the projection alone "would draw member rows no
`Row` revealed" — the opposite half of this same disagreement, recorded and worked around rather than
followed. The unit test asserted the projection's own output (`['row', 'group', 'row', 'row', 'row', 'row']`)
and so asserted the duplication as intended behaviour.

## Specs

REQ-CHAT-065 — "Expanding a group MUST keep the header on screen and reveal its members beneath it" — is met
once, not twice, and PD-CHAT-004 fixes the shape of that once: "hanging from a **single continuous rule** in
the agent's persona colour that spans the whole revealed run". A rule can span only members that share one
container, so the nested drawing is the one the directive describes and the top-level emission is the copy
that no requirement asks for. REQ-CHAT-058's retained-rendering bound and REQ-CHAT-165's residency also both
count displayed rows, and the duplicates counted twice against them.

## Relevant files

- `packages/ui/src/transcript/project.ts` — `foldRuns`, which emitted the second copy; repaired to emit the
  header alone, carrying its members for the renderer to reveal.
- `packages/ui/src/transcript/Row.tsx` — the group branch, which draws `.row__members` and the rail.
- `packages/ui/src/transcript/TranscriptPane.tsx` — where one `expanded` set reaches both paths.
- `packages/ui/src/transcript/transcript.test.ts` — the assertion that recorded the duplication as expected.

**Repaired 2026-09-16**, in the commit that carries PD-CHAT-004 revision 2.
