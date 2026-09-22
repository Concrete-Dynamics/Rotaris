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

## Repaired — 2026-09-22

The requirement keeps **one** implementation, and it is the one the product was already running:
`scopedRows` in `TranscriptSurface.tsx`, applied by `WorkspaceView` — the only surface that owns the
toggle — before the rows reach the pane. It keeps exactly the five kinds REQ-CHAT-069 names, and it
knows the run-level agent owns the rows named for its persona.

The unreachable copy is gone: `inScope`, `ProjectOptions.scopeAgent` and `TranscriptPaneProps.scopeAgent`
are deleted, and `projectDisplay` now dedupes the rows it was given rather than a filtered copy of them.
Collapsing this way changes **nothing the reader sees** — the deleted filter had no caller, so it always
answered true — which is why the note's caution about behaviour under "This task" does not apply to the
direction taken. The opposite direction was available and was not taken: `inScope` knew three of the five
kinds, so adopting it would have dropped another agent's `question` and `approval` rows from a scoped
transcript, which is the requirement's list read wrong.

Evidence: `packages/ui/src/rows.test.ts` gains two cases — the kept kinds asserted **as a whole list** in
the requirement's order, with another agent's `question` and `approval` rows kept and its `tool` row
dropped; and the run-level agent branch, which keeps a row named for its persona and an unnamed row of
that persona. `packages/ui/src/transcript/transcript.test.ts`'s scope case is inverted into a guard that
the projection does **not** filter by agent, so a second copy coming back fails a test. Both files green
(76/76). `pnpm typecheck` clean, which is what proves the two deleted props had no other caller.
`pnpm check` fails on one test unrelated to this change — `terminal.test.ts`'s real `git diff --no-index`
end-to-end, `expected 124 to be 1`, the subject of `the-real-git-diff-terminal-test-times-out-on-win32.md`.

Built-app evidence is weaker than it should be, and honestly so: `pnpm rows-proof` and `pnpm transcript-proof`
are **red on `main` at `1caf6a6`** before this change, on driven-input assertions, which is now recorded as
`docs/defects/the-two-driven-transcript-proofs-are-red-on-main.md`. The branch reproduces `main`'s reds at
the same lines and adds none. What the built app does say: `pnpm build` exit 0, and a driven launch
(`pnpm app:drive start|shot|stop`) draws the shell and the Overview view with no renderer error.
