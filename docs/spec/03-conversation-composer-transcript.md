---
reference: ROTARIS-CRW-001
domain: conversation-composer-transcript
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Conversation, Composer, and Transcript

## Overview

The conversation surface belongs to the single desktop application, and is backed by one queued-prompt service, one structured-question mechanism, and one session persistence model. The user types prompts into a composer that adapts to run state (start a run, continue a session, or queue a follow-up for a running iteration), invokes slash commands with inline discovery and validation, and reads a live transcript that renders user prompts, agent messages, streamed reasoning, tool calls with grouped and collapsible output, user-only edit diffs, pending-question and pending-approval prompts, and a task plan. Steering a live agent with text is a separate surface owned by the run-monitoring domain (REQ-MONITOR-070, REQ-MONITOR-137) and is not a composer mode. Prompt history, stashed drafts, and todo edits all persist to well-defined on-disk formats, and destructive operations always require explicit confirmation.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`03-conversation-composer-transcript/`](03-conversation-composer-transcript/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](03-conversation-composer-transcript/01-requirements.md) | Requirements; 1. Desktop Composer: Input, Shortcuts, and State; 2. Desktop Prompt Drafts and History Recall; 3. Desktop Slash Commands: Parsing and Execution; 4. Desktop Slash Suggestions and Live Highlighting | REQ-CHAT-001 – REQ-CHAT-027 (28) |
| [02](03-conversation-composer-transcript/02-5-desktop-slash-command-catalogue.md) | 5. Desktop Slash Command Catalogue; 6. Desktop Prompt Queue; 7. Desktop Prompt Stash and Prompt Persistence; 8. Desktop Transcript Model and Projection | REQ-CHAT-028 – REQ-CHAT-054 (31) |
| [03](03-conversation-composer-transcript/03-9-desktop-transcript-rendering.md) | 9. Desktop Transcript Rendering | REQ-CHAT-055 – REQ-CHAT-165 (8) |
| [04](03-conversation-composer-transcript/04-10-desktop-tool-thinking-and-grouped-rows.md) | 10. Desktop Tool, Thinking, and Grouped Rows; 11. Desktop Transcript Scrolling, Tail-Follow, and Search; 12. Desktop Copy and Row Interaction; 13. Desktop Manual Context Compression; 14. Desktop Transcript Clearing | REQ-CHAT-060 – REQ-CHAT-084 (31) |
| [05](03-conversation-composer-transcript/05-15-desktop-todo-pane.md) | 15. Desktop Todo Pane; 16. Structured Questions: Tool Contract; 17. Desktop Question Stepper; 18. Terminal Composer *(withdrawn — no terminal frontend)*; 19. Terminal Prompt History and Stash *(withdrawn — no terminal frontend)*; 20. Terminal Slash Commands *(withdrawn — no terminal frontend)*; 21. Terminal Custom Prompt and Skill Commands *(withdrawn — no terminal frontend)*; 22. Terminal Transcript Rendering *(withdrawn — no terminal frontend)*; 23. Terminal Transcript Memory, Archive, and Paging *(withdrawn — no terminal frontend)*; 24. Terminal Search, Clearing, and Compression *(withdrawn — no terminal frontend)*; 25. Terminal Todo Pane *(withdrawn — no terminal frontend)*; 26. Terminal Keyboard Leader System *(withdrawn — no terminal frontend)*; 27. Cross-Cutting Invariants; 28. Performance Targets (runtime-verifiable); 29. Image Attachments | REQ-CHAT-085 – REQ-CHAT-174 (80) |
| [06](03-conversation-composer-transcript/06-data-formats.md) | Data & Formats; On-disk files (externally observable); Session snapshot transcript rows; Structured-question answer payload; Custom prompt-command files; Defaults and limits summary | — |
| [07](03-conversation-composer-transcript/07-open-questions.md) | Open Questions | — |
