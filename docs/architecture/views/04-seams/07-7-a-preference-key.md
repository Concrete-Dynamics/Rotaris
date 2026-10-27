# Seams — what to touch, in what order, to add one of the things this product adds most often — 7. A preference key

Part 7 of 8 of [the seams](../04-seams.md), which indexes every part.

## 7. A preference key

| # | File | What lands here |
|---|---|---|
| 1 | `packages/platform/src/preferences.ts` — `PREFERENCE_KEYS` | the key, its coercion and its default |
| 2 | `packages/contracts/src/commands.ts` — `PREFERENCE_COMMAND_KEYS` | **only** if a renderer may read or write it |

Invariants:

- `PREFERENCE_COMMAND_KEYS` is an **allow-list**. A key registered in `PREFERENCE_KEYS` and absent from it is
  main's alone — `workspace/lastOpened` is the worked example, and the asymmetry is deliberate.
- A per-workspace key is **minted by main** from the workspace that window opened (`composerDraftKey`, the
  requirement folds). The renderer sends the literal placeholder or nothing at all, so no window can name
  another window's workspace.

---
