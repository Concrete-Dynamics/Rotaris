---
name: orchestrated-build
description: 'Drive a very large implementation (a release backlog, every open defect, a whole feature set) through a multi-agent workflow: bundles of two tasks per builder, an independent reviewer per bundle that repairs what it can in place and lands it from its own tree, repair rounds until it passes, then acceptance rounds (full proof sweep, live run against a real model, autopsy) whose findings go back through the same loop. Survives container restarts and usage limits by resuming from the workflow journals. Use when the owner asks to "fix everything before release", "do all open defects", "implement the whole backlog", "plan it and delegate with a workflow", or names this skill. The skill improves itself: read "Improving this skill" before finishing.'
argument-hint: '[scope, e.g. "every open defect and unimplemented feature except signing"]'
---

Read and follow `.agents/skills/orchestrated-build/SKILL.md`, the repository's canonical portable workflow.
