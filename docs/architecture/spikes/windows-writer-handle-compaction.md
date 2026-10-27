# Spike — the writer's own handle, and what a follower sees across a compaction

- **Date:** 2026-08-31
- **Question:** ADR-0004 established that `fs.renameSync` over an existing file fails on Windows while a
  descriptor is held on it, and drew the rule for *readers*. The record's append-and-compact files are
  compacted by renaming a staged file over a target whose append handle **the writer itself holds**
  (`REQ-EVENTS-091`, `REQ-TOOLS-078`, `REQ-TOOLS-190`, `REQ-SESSION-133`). No ADR guards that. If the
  rename fails the consequence is silent: `REQ-EVENTS-091` and constraint E-06 both specify that an
  incomplete trim leaves the previous contents in force and records a warning, so the caps are simply
  never enforced.
- **Scope:** measurement only. No product code was written and none is authorised.

---

## Parts

Since 2026-10-26 the rest of this document is in [`windows-writer-handle-compaction/`](windows-writer-handle-compaction/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](windows-writer-handle-compaction/01-1-environment.md) | 1. Environment |
| [02](windows-writer-handle-compaction/02-2-method.md) | 2. Method |
| [03](windows-writer-handle-compaction/03-3-results-is-the-claim-true.md) | 3. Results — is the claim true?; 3.1 The baseline (`p1`, 200 iterations per case); 3.2 Is a share mode permitting delete reachable from Node? (`p2`, `p2b`–`p2e`); 3.3 What durability is actually obtainable (`p4`, `p4b`) |
| [04](windows-writer-handle-compaction/04-4-results-the-proposed-fix-under-concurrency.md) | 4. Results — the proposed fix under concurrency; 4.1 The naive shape (R-D) fails exactly as predicted, and silently; 4.2 The fix works at every realistic cadence, and needs the retry ladder; 4.3 What the follower observed — 172,191 reads |
| [05](windows-writer-handle-compaction/05-5-results-the-followers-offset-problem.md) | 5. Results — the follower's offset problem; 5.1 A signal that closes it, and that no ADR specifies |
| [06](windows-writer-handle-compaction/06-6-verdicts.md) | 6. Verdicts |
| [07](windows-writer-handle-compaction/07-7-what-this-harness-does-not-model.md) | 7. What this harness does not model |
| [08](windows-writer-handle-compaction/08-8-impact-on-the-adrs.md) | 8. Impact on the ADRs; ADR-0004; ADR-0008; ADR-0009; ADR-0024 |
| [09](windows-writer-handle-compaction/09-9-files.md) | 9. Files |
