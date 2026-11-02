## The question stepper keeps the superseded step-pill row and "Agent Questions" heading

`QuestionForm` in `packages/ui/src/QuestionStepper.tsx`, the docked question stepper `PD-CHAT-002` puts at the
transcript tail, still draws two pieces of the modal stepper that directive supersedes. Lines 136 to 151 render an
`<ol class="question-form__pills">` of numbered pills, one per step, under a comment that reads "REQ-CHAT-099 pills
retained as overall progress indicator"; every unanswered step's pill is `data-state="active"`, so the row is no longer
REQ-CHAT-099's one-active-step indicator either. Line 121 sets `aria-label="Agent Questions"` and line 133 falls back to
the visible heading "Agent Questions · N steps" when the prompt names no persona; that is REQ-CHAT-099's modal title,
and it is title case. The `aria-label` is also dead weight: line 122's `aria-labelledby` names the region instead.
`apps/desktop/scripts/questions-proof.mjs` (lines 199 to 200 and 221 to 222) asserts two pills, so the proof holds the
retired row in place. Recorded 2026-11-02, read in the source, not driven in the built app; noticed by guide 10's
section 8 (D10-16, D10-17) while writing the design research corpus under
[R-093](../product/requests.md#r-093).

## Specs

- `PD-CHAT-002` (`docs/product/directives/pd-chat-002.md`) supersedes REQ-CHAT-099 and says what it costs:
  "modal-specific navigation behaviors (step pills, sequential Back/Next buttons) are replaced with a scrollable
  all-step form". Each step shows its own number, title and description; no step indicator is named. The pill row
  contradicts it.
- REQ-CHAT-099 (`docs/spec/03-conversation-composer-transcript/05-15-desktop-todo-pane.md`) is the only source of
  "Agent Questions" and of the pills, and its back-pointer marks it superseded; a label taken from a superseded
  requirement is a superseded label. `PD-CHAT-002` fixes no overall heading, so which heading the dock carries, if
  any, is an open question to raise, not one this note answers.
- `docs/design/README/01-1-the-design-language.md` §1.11: "Sentence case everywhere — titles, buttons, nav labels".
  "Agent Questions" is title case.

## Relevant files

- `packages/ui/src/QuestionStepper.tsx` — lines 121 to 122 (the region's two names), 133 (the heading's fallback),
  136 to 151 (the pill row).
- `packages/ui/src/shell.css` — lines 1979 to 2005, the `.question-form__pills` and `.question-form__pill` rules.
- `apps/desktop/scripts/questions-proof.mjs` — lines 54, 168, 172, 199 to 200 and 221 to 222, which probe and assert
  the pills.
- `docs/research/design/10-ux-writing.md` — section 8, D10-16 and D10-17; `docs/research/design/backlog.md` row 67.
