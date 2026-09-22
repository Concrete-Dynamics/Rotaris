## A Models save writes `large_model_thinking` and drops `large_model`

`pnpm config-proof` fails at its second scenario. The proof opens Settings → Models, selects `other` for
the `large_model` slot and `high` for that slot's reasoning strength, presses Save, and reads the
workspace file back. The companion key lands; **the slot itself does not**:

```
Error: the models save did not write the slot and its companion:
# workspace configuration
runtime:
  # the workspace states two keys and inherits the rest
  permission_mode: ask
  max_depth: 2
rotaris:
  delegation_strategy: single
large_model_thinking: high
```

`large_model_thinking: high` is written at the document root, and `large_model: other` is absent
entirely. The first scenario (`runtime` keys, comment preservation, the global file left alone) passes
immediately before it, so the save path, the file rewrite and the comment discipline all work — it is
this pair of controls that disagrees.

Two readings, and this note does not choose between them: the select for the slot never committed its
value (so nothing was saved because nothing changed), or the save wrote a change set the slot was missing
from. The proof drives both selects through the same `ROTARIS_CAPTURE_SELECT` mechanism two hundred
milliseconds apart, and the second one's effect is in the file, which makes the first reading the one to
test first.

**Not caused by the isolation change it was found beside.** Reproduced in the same worktree against the
unmodified `config-proof.mjs` taken from `main` (`git show main:apps/desktop/scripts/config-proof.mjs`),
which failed identically — same assertion, same file contents.

## Specs

`REQ-CONFIG-*` fixes the model slots and their reasoning companions as configuration keys, and the
Settings surface writes them. Whether a companion may be written for a slot that is not present is not
something a requirement contemplates; a file holding `large_model_thinking` with no `large_model` is
configuration that names a strength for a model it does not name.

## Relevant files

- `apps/desktop/scripts/config-proof.mjs` — the `models-save` scenario, the assertion around line 117.
- `packages/ui/src/settings/` — the Models tab's two selects and the save bar's change set.
- `packages/config/src/sections/models.ts` — the slots and their `*_thinking` companions.
- `apps/desktop/src/main/commands/` — the configuration save command that writes the workspace file.

Noticed 2026-09-22 while running the proofs whose launch environment had just been changed. Whether it
also fails in the primary checkout is not yet known; `docs/defects/` already records a class of proof
failure that only appears in a worktree, and this one has not been checked against that.
