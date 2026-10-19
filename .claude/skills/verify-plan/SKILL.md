---
name: verify-plan
description: 'Local verification planner: given a diff, print the required gate, the complete affected proof suites, and the architecture documents to consult. Use whenever deciding which proofs to run, after editing product code, before a commit, when the user asks what to verify, which proofs a change needs, or "run the whole suite a part touches". Unmapped paths require explicit review — never treat them as no proofs. Run pnpm verify:plan rather than reconstructing that list from script headers or the proof registry.'
argument-hint: '[--files paths | --base=ref]'
---

Read and follow `.agents/skills/verify-plan/SKILL.md`, the repository's canonical portable workflow.
