# ADR-0064 — Project initialization: a task registry in `config`, one marker writer in main, and the work delegated to whoever can do it — Context

Part 1 of 6 of [ADR-0064](../0064-the-project-initialization-registry.md), which indexes every part.

## Context

**Project initialization** is one-time work a workspace owes when it is first opened: the product asks
whether anything applies, does what does not need asking, asks about what does, records each outcome
once, and never asks twice. Today the product ships exactly one such task — indexing the workspace for
the bundled code-intelligence runtime — but the specification is emphatic that the *framework* is the
thing and the task is a member: `REQ-WORKSPACE-080` closes with "a setup task added after the fact SHALL
participate in the prompt and in the setup UI under exactly the rules stated here, **with no additional
behavior of its own**", and `REQ-WORKSPACE-104` states what the current set therefore produces — a fresh
workspace that prompts for nothing and gates nothing.

What existed before this record was the task without the framework. `REQ-MCP-099`'s three stages ran, in
order, under their budgets, with cancellation and a tree kill — all of it built by Part T and proved on
this host. But it was reachable **only** from a button in Settings › MCP Servers. Nothing resolved
anything on workspace open, nothing was recorded anywhere, and the composer gate the specification asks
for could not engage because no value could reach it.
