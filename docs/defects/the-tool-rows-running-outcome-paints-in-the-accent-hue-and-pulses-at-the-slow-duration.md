## The tool row's running outcome paints in the accent hue and pulses at the slow duration

`.tool__outcome--running` in `packages/ui/src/shell.css` (line 692) colours a tool row's in-flight outcome, the
`◉ running…` of `REQ-CHAT-060`, with `var(--rt-accent-300)` and animates it with `rt-pulse` at
`var(--rt-duration-slow, 900ms)`. The adopted material decides both values differently. A tool one-liner sits on axis Y:
`REQ-CHAT-060` says "the tool accent colour" and names none, and `docs/design/README.md` §7.2 item 5 records that the
material names axis Y, not the product accent, for a tool call. §1.3 gives the running state `--rt-run`, an axis Y step,
and reads the Z family, which `--rt-accent-300` belongs to, as done. §1.8 permits two infinite animations in the whole
system, `.status-dot.is-pulsing` at 1.6 s and `.spinner` at 0.8 s; `--rt-duration-slow` resolves to 240 ms in
`packages/contracts/src/theme/themes.ts`, and the 900 ms fallback written beside it matches neither. A running tool row
therefore reads in the done hue and breathes at a rhythm no rule of the language states, a third infinite animation in
its own period. Noticed 2026-11-02 while reviewing the design research corpus; guide 07's worked example (section 5,
item 7, "One C6 question") first read it from the source.

## Specs

- `REQ-CHAT-060` requires the pulsing `◉ running…` and the header "in the tool accent colour", naming no colour; it is met
  by the pulse and not contradicted. The colour and the period contradict the adopted language, which `AGENTS.md` makes
  authoritative: `docs/design/README.md` §1.3 (axis Y = running, `--rt-run`; Z = done), §1.8 (two infinite animations,
  the 1.6 s running pulse) and §7.2 item 5 (a tool one-liner moved to axis Y).
- The rubric rows C6 (colour carries one meaning; the three axis colours as waiting, running, done) and C9 (motion for
  status only, durations from the tokens) score it.

## Relevant files

- `packages/ui/src/shell.css` — `.tool__outcome--running`, line 692; the `prefers-reduced-motion` override at line 723.
- `packages/ui/src/transcript/Row.tsx` — the tool row that carries the outcome classes.
- `packages/contracts/src/theme/themes.ts` — `--rt-accent-300`, `--rt-run`, `--rt-duration-slow` (240 ms).
- `docs/design/README/01-1-the-design-language.md` — §1.3, §1.8; `docs/design/README/07-7-fidelity-consult-before-maintain-after.md` — §7.2 item 5.
- `docs/research/design/07-visual-composition-beyond-tokens.md` — section 5, item 7.
- `docs/defects/the-agent-rows-hand-drawn-status-dot-paints-done-in-the-running-hue.md` — the neighbouring note: the same
  `--rt-duration-slow` pulse on the agent row's hand-drawn dot.
