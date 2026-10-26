# Architecture proposals — UI slice — 1. Scope of this slice

Part 1 of 10 of [the ui proposal](../ui.md), which indexes every part.

## 1. Scope of this slice

This slice covers everything a user sees and touches: the single main window with its seven primary
views, the auxiliary persona and terminal windows, the artifact dialogs, the conversation transcript
and composer, the notification and recovery surfaces, the theming and accessibility contract, the
startup sequence, how the application installs and updates itself, the opt-in diagnostics recorder,
and the built-in UI performance benchmark.

It does **not** cover: how a run is orchestrated, how tools are executed or permitted, git and
worktree mechanics, session persistence formats, the model layer, MCP, settings semantics, or the
requirements board's own logic. Where a decision of mine depends on one of those, it is cited and
named as a dependency rather than decided here.

Two things are settled by product decision and are not open in any proposal below: the product is an
Electron desktop application, and the model layer sits behind an internal abstraction. Everything
else in the candidate stack is assessed against the requirements.

**A note on what is missing.** The approved visual design reference is not available in this
session. Every proposal below is about *mechanism* — where state lives, what crosses a process
boundary, what paints a row, what a preference is written to. Where a decision would fix information
architecture or visual design, I have said so and stopped rather than inventing one.

---
