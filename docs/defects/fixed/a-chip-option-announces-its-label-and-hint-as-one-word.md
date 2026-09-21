## A chip option announces its label and its hint as one unbroken word

Every option in a `PopoverMenu` draws its label and its optional hint as two sibling `<span>`s inside the
option `<button>`, with no separator between them and no `aria-label` on the button. The button's accessible
name is therefore computed from its contents joined with nothing, so assistive technology announces the two
run together:

- `Auto` + `start at once` → **"Autostart at once"**
- `Plan first` + `plan gate first` → **"Plan firstplan gate first"**
- `Plan first · released` + `approved — choose again to plan the next run` →
  **"Plan first · releasedapproved — choose again to plan the next run"**

Visually there is no defect: the two spans are separate boxes and the stylesheet places them apart. The defect
is only in the computed name, which is why no screenshot shows it. It was surfaced by `pnpm plan-gate-proof`
on 2026-09-17, whose new re-arm launch reads the chosen option's `textContent` back out of the page and logged
the third line above; the proof asserts on a substring and so passes either way.

This is **not** caused by `PD-ORCH-003`, which only changed one label and one hint. It is the shape of the
component and it reaches every chip built on it — the model chip, the reasoning chip, the run-start-mode chip,
the permission-mode chip, and any future one — so the count of affected surfaces grows with the pattern.

The fix belongs in the design system rather than at a call site: either the option button carries an
`aria-label` composed from the two parts with a separator, or the hint is associated with
`aria-describedby` so it is announced as a description rather than fused into the name. Which of the two is a
design-language question, and it owes the evidence loop in `.claude/rules/ui-surfaces.md` — a shared control
changed in `design-system/` is exactly the case that rule exists for. Not repaired here: this change's scope
is the plan gate's release, and repairing a shared control on the way past would put an unevidenced change to
every chip inside a commit about something else.

## Specs

`REQ-CHAT-007` obliges a disabled control to publish its reason through **tooltip and accessible
description** — the two-channel rule this component honours for the trigger's reason (`aria-describedby`
pointing at the chip's own reason element) and does not honour for an option's hint. The hint is the same kind
of fact on the same control, published into the name instead of beside it.

`REQ-SHELL-048` fixes the action vocabulary a labelled control may use; a name that is two labels fused is not
one of its labels. `PD-CHAT-001` is the directive that made these chips value chips over a press-revealed
popover, which is what put a hint inside a button in the first place — it asks for the hint and says nothing
about how it is announced, so no clause of it is contradicted.

## Relevant files

- `packages/ui/src/design-system/overlays.tsx` — `PopoverMenu`'s option button and its two spans
  (`chip-menu__label`, `chip-menu__hint`); the button carries `role="menuitemradio"`, `aria-checked` and
  `aria-disabled`, and no name of its own.
- `packages/ui/src/WorkspaceView.tsx` — `PopoverChip`, and the four chips that pass `hints`.
- `apps/desktop/scripts/plan-gate-proof.mjs` — the `re-armed` launch whose `CHOOSE_PLAN` eval reads the
  option's `textContent`; its logged answer is the evidence above.
- `packages/ui/src/design-system/design-system.test.ts` — where an assertion on the computed name would sit.

## Repaired — 2026-09-21

Each `PopoverMenu` option button is now named by its label alone (`aria-labelledby` to the
`chip-menu__label` span) with the hint as its accessible description (`aria-describedby` to the
`chip-menu__hint` span, REQ-CHAT-007's extension). No `aria-label` is composed, so the visible
label stays the single source of the name (REQ-SHELL-048) and no duplicated string can drift.
DOM text, CSS classes and `textContent` are unchanged, so the visuals and the plan-gate proof's
`CHOOSE_PLAN` reader are unaffected. Options without a hint carry no `aria-describedby`.
`SearchableSelect` rows keep their existing shape (hint visible only; `aria-description`/`title`
reserved for `unavailableReason` per REQ-CONFIG-429) — same-commit change not taken, named
follow-up if a row hint ever needs the description channel.

Evidence: `design-system.test.ts` gains two open-panel assertions via a test-only `defaultOpen`
seam (43/43 green); driven built app reads `aria-labelledby` resolving to `Auto` and
`aria-describedby` to `start at once` on the run-start-mode chip (same for `Plan first` /
`plan gate first`); `pnpm plan-gate-proof` exit 0; `pnpm ui-audit` shows only the pre-existing
Git-table SHRUNK at 1000x680 (`.table.git__table` 340 holds 352, no scroll — the subject of
`the-git-table-clips-its-content-and-does-not-scroll.md`, untouched by this change).
