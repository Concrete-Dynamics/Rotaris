## The checkpoint dialog's indeterminate bar runs a third infinite animation, against the design language's "exactly two"

Noticed 2026-11-03 by the consortium's ruling of [OQ-496](../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-496)
(the scope of §1.8's motion rule), while reading `packages/ui/src/shell.css` for the animations the shell runs. §1.8 of
the adopted design language (`docs/design/README/01-1-the-design-language.md`) states: "Exactly two infinite animations
are permitted in the whole system: `.status-dot.is-pulsing` (1.6 s opacity breathe, used only while a state is actively
running) and `.spinner` (0.8 s)." The checkpoint dialog's progress bar (`REQ-SHELL-117`'s indeterminate, window-modal
dialog) draws its fill with a third: `@keyframes checkpoint-indeterminate`, a 1.2 s translate from −100 % to 250 % of
the track, `infinite`, on `.checkpoint-dialog__bar-fill`. It honours the OS reduced-motion signal
(`prefers-reduced-motion: reduce` sets `animation: none` and a full-width fill) but, like the sheet's own block, only the
OS leg of `REQ-SHELL-135`'s resolution order. The design system's `.spinner` is the component the language gives an
indeterminate wait, and the dialog does not use it.

Not repaired here: the ruling that noticed it did not rule it (its question was §1.8's scope, not this surface), and the
repair is a `debug-ui` change to one dialog — either the `Spinner` beside the dialog's text, or a §1.8 amendment admitting
an indeterminate bar as a third status animation, which is a ruling to ask for, not to take while fixing.

## Specs

Contradicts §1.8 of the adopted design language ("Exactly two infinite animations are permitted in the whole system"),
which `docs/design/README.md` §2 adopts as authoritative. `REQ-SHELL-117` asks for an indeterminate progress dialog and
names no drawing; `REQ-SHELL-135`'s resolution order (in-app setting, then OS signal, then motion on) is met only on its
OS leg by this rule, as §1.8 notes for `base.css`'s block.

## Relevant files

- `packages/ui/src/shell.css` — `.checkpoint-dialog__bar-fill`, `@keyframes checkpoint-indeterminate` and the
  reduced-motion block beside them (about lines 1563–1566).
- `packages/ui/src/CheckpointDialogs.tsx` — the `role="progressbar"` element that carries the bar.
- `docs/design/README/01-1-the-design-language.md` §1.8 — the rule; `docs/design/system/components.css` — `.status-dot.is-pulsing` and `.spinner`, the two it permits.
