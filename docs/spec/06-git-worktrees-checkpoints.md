---
reference: ROTARIS-CRW-001
domain: git-worktrees-checkpoints
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Git Integration, Worktrees, and Checkpoints

## Overview

Rotaris can give each agent session a Git worktree of its own, so two concurrent runs never write into one checkout; it records an automatic Git-backed checkpoint at the close of each iteration whose tree differs from the last commit; and it lets the user roll a tree back to any recorded checkpoint, taking a safety checkpoint of the current state first. Completed isolated sessions can later be merged back into the base branch through a hidden, verified integration run that only ever moves the base by a fast-forward. The domain is exposed through a dedicated desktop Git view (worktree table, commit history, checkpoint browser, merge flow), the desktop session-launch and session-management surfaces, configuration keys, persisted session records, and a stored event stream. Nothing in the domain ever performs a network Git operation.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`06-git-worktrees-checkpoints/`](06-git-worktrees-checkpoints/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](06-git-worktrees-checkpoints/01-requirements.md) | Requirements; Scope and Cross-Cutting Invariants; Isolated Worktree Creation; Worktree-Layer Git Error Semantics; Session State and Persistence; Run Lifecycle Binding; Retired Command-Line Surfaces (Runs and Sessions) | REQ-GIT-001 – REQ-GIT-154 (30) |
| [02](06-git-worktrees-checkpoints/02-checkpoint-recording-git-layer.md) | Checkpoint Recording (Git Layer); Checkpoint Policy (Per-Session); Checkpoint Restore Policy; Retired Checkpoint Command Surface; Event Stream Contracts; Session Deletion and Ref Lifecycle | REQ-GIT-029 – REQ-GIT-069 (42) |
| [03](06-git-worktrees-checkpoints/03-configuration-keys.md) | Configuration Keys; Desktop Git View — Structure; Desktop Git View — Session Checkpoints Card; Desktop Checkpoint Flow | REQ-GIT-070 – REQ-GIT-101 (36) |
| [04](06-git-worktrees-checkpoints/04-desktop-git-data-collection.md) | Desktop Git Data Collection; Desktop Worktree Creation and Deletion Dialogs; Desktop Session-Launch Isolation and Status Display | REQ-GIT-102 – REQ-GIT-161 (24) |
| [05](06-git-worktrees-checkpoints/05-worktree-integration-merging-session-branches.md) | Worktree Integration (Merging Session Branches Into Base); Requirement-Execution Worktrees (Shared Namespace Contracts); Agent Commits and Attribution; Concurrency and Timing (Consolidated) | REQ-GIT-124 – REQ-GIT-146 (24) |
| [06](06-git-worktrees-checkpoints/06-edge-cases.md) | Edge Cases | REQ-GIT-147 – REQ-GIT-151 (5) |
| [07](06-git-worktrees-checkpoints/07-data-formats.md) | Data & Formats; On-disk layout (base workspace); Git namespaces; Persisted records (behavioral schemas); Commit message formats (fixed identity `rotaris <rotaris@local>`, which REQ-GIT-032 fixes and REQ-GIT-144 limits to checkpoint objects and integration acceptance commits); Event shapes (stored event stream); Shared textual formats; Configuration surface (layered YAML) | — |
| [08](06-git-worktrees-checkpoints/08-open-questions.md) | Open Questions | — |
