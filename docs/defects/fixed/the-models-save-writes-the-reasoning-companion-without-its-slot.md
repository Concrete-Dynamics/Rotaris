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

## Repaired — 2026-09-22, and the product was never at fault

The note left two readings open — the slot's control never committed its value, or the save wrote a
change set the slot was missing from — and named the first as the one to test. It is the first, and one
line of the launch log says so:

```
capture: select select[aria-label="Model for large_model"] = other → no such control
capture: select select[aria-label="Reasoning strength for large_model"] = high → chosen
```

**Two capture seams named controls the product no longer draws.** Neither the save path nor the
configuration writer was involved; both did exactly what they were asked with the one value that
reached them.

1. **A searchable select is not a `<select>`.** `ROTARIS_CAPTURE_SELECT` set the value through
   `HTMLSelectElement.prototype`, which drives the reasoning companion (a native `<select>`) and cannot
   drive the slot beside it — the slot is the design system's `SearchableSelect`, a button plus a
   listbox. The seam now drives that control the way a person does: click the trigger, wait a frame for
   the panel, click the `[role="option"]` carrying the wanted `data-value`. The native path is unchanged.
2. **A `PopoverMenu` has two trigger classes.** Repairing (1) uncovered the next scenario failing the
   same way: the permission-mode seam clicked `[data-testid="chip-mode"] .chip-menu`, and the trigger is
   `.strip-btn` once PD-CHAT-001's revisions docked the composer controls into a strip. This is the
   third time this file has missed a control that changed shape —
   `docs/defects/fixed/the-config-proof-clicks-a-control-that-became-a-popover.md` is the second — so the
   selector now names both forms rather than whichever one was current.

**The failure was also silent for longer than it needed to be**, and that is repaired beside it. A
`select` step that finds nothing logged `no such control` and the launch carried on, so the proof failed
five assertions later on a file missing a key nobody had chosen. `config-proof` now reads its own select
steps back out of the log before it reads the file, and a step that was not `chosen` fails naming itself.

Measured: `pnpm config-proof` exit 0. `large_model: other` **and** `large_model_thinking: high` are both
in the workspace file, `permission_mode: autonomous` is written by the composer's own control, and the
comment header and neighbouring keys are intact. `pnpm check` exit 0 (170 files, 2,119 passed).

**What this note got wrong, kept rather than corrected above:** it was written as a product defect
("a file holding `large_model_thinking` with no `large_model` is configuration that names a strength for
a model it does not name"), and the specification paragraph reasoned about what a requirement should say
about that pair. No such file was ever written by the product. The evidence that would have shown it —
the two `capture: select` lines in the launch log the note itself quotes the directory of — was two
commands away and was not read before the note was filed.
