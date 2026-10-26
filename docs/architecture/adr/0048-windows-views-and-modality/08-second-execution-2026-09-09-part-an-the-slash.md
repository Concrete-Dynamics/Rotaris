# ADR-0048 — Windows, views and the three modality levels — Second execution — 2026-09-09 (Part AN), the slash popup's Escape slot and a dialog opened from the keyboard

Part 8 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

## Second execution — 2026-09-09 (Part AN), the slash popup's Escape slot and a dialog opened from the keyboard

*Recorded under GD-10; the proof is `pnpm slash-proof`.*

**The slot Part W left empty is filled.** The composer registers the slash popup's closer under `slashPopup` while the
popup shows and unregisters it when it hides, so window-level Escape (`REQ-SHELL-055`) dismisses the popup first,
then the search panel, then the drawers, in the order this record fixed. The popup itself never takes focus
(`REQ-CHAT-024`): the field's `aria-activedescendant` names the row, and the keys of `REQ-CHAT-026` are answered by
the field's own handler, whose `preventDefault` is what keeps the window handler from acting a second time.

**Defect fifty-eight — a command that opened a dialog took focus back from it.** `/pop` opens the stash dialog. The
composer, on an executed command, refocused its own field; the dialog mounted and focused its primary action between
the command's resolution and that line, and the field then stole focus back — measured on the proof's first run as
the active element being the composer while the modal was on screen, exactly the state `REQ-SHELL-055`'s "the modal
answers first" exists to prevent. The composer now refocuses itself only when nothing else has taken focus. The stash
dialog, which had never taken focus on opening, now does (its primary action, or Close when there is nothing to pop)
and gives it back when it closes, so a `/pop` typed, completed and submitted from the keyboard continues on the
keyboard.
