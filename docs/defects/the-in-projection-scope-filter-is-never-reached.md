## REQ-CHAT-069's scope filter is implemented twice and the one inside the projection is never reached

`projectDisplay` takes a `scopeAgent` option and applies `inScope()` to every row; `TranscriptPane` declares
the prop and threads it through. `WorkspaceView` — the only surface that owns the scope toggle — never passes
it. It filters the rows itself instead, before they reach the pane:

```tsx
const shownRows = useMemo(() => (scope === 'task' && selected !== null ? scopedRows(rows, selected) : rows), …);
```

`scopedRows` lives in `TranscriptSurface.tsx` and keeps `RUN_OWNED_KINDS` plus the selected agent's rows;
`inScope` keeps `user`, `system` and `verifier` plus the named agent's. The two are not the same list, and
only one of them decides what the product shows. The in-projection copy is exercised by a single unit test.

Two rules, one requirement: whichever is edited next, the other silently disagrees.

## Specs

REQ-CHAT-069 fixes one filter — "filtering keeps rows of the kinds user, system, question, approval and
verifier (run-owned) plus the selected agent's rows; verifier rows MUST never be filtered out per agent". One
requirement is entitled to one implementation; `CLAUDE.md`'s standing rule against two definitions of one
grammar applies to a filter for the same reason.

## Relevant files

- `packages/ui/src/transcript/project.ts` — `ProjectOptions.scopeAgent` and `inScope`, the unreached copy.
- `packages/ui/src/transcript/TranscriptPane.tsx` — declares and threads `scopeAgent`; no caller supplies it.
- `packages/ui/src/TranscriptSurface.tsx` — `scopedRows` and `RUN_OWNED_KINDS`, the copy the product runs.
- `packages/ui/src/WorkspaceView.tsx` — `shownRows`, where the product's filter is applied.

Noticed 2026-09-16 while threading `agentDepth` through the same call site. **Not repaired**: collapsing them
changes what the Workspace transcript shows under "This task", which is behaviour and wants its own evidence.
