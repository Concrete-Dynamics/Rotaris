[Product directives](../directives.md) › PD-CHAT-009

<a id="pd-chat-009"></a>

### PD-CHAT-009 — the user's chat controls are recorded under the chat domain's timeline words

The chat domain SHALL have a timeline-event vocabulary of its own, whose words name what the user did with the
conversation's controls and what became of it:

- `steering_submitted`, `steering_injected` and `steering_not_delivered` — a steering prompt submitted by the user,
  delivered into its agent's conversation, and one the run ended before delivering (REQ-MONITOR-133, REQ-MONITOR-134);
- `prompt_queued`, `prompt_edited`, `prompt_removed` and `prompt_triggered` — a prompt queued for the next iteration,
  edited, removed, and become a task (REQ-CHAT-035, REQ-CHAT-037, REQ-CHAT-038, REQ-CHAT-040);
- `todo_edited` — a todo item added, updated or removed by the user;
- `entry_model_switched` and `entry_reasoning_switched` — the entry model or reasoning level switched by the user;
- `transcript_cleared` — the transcript cleared by the user (REQ-CHAT-081);
- `run_paused_message_limit` and `pause_resolved` — the run pausing at the message limit (REQ-ORCH-087), and that pause
  resolved by the user.

Each entry is written when the fact occurs, on the session's timeline, and is among the records the session domain's
export reaches. REQ-ORCH-139's closure over these words is [`PD-ORCH-014`](pd-orch-014.md#pd-orch-014)'s.

**Why, and what it costs.** These thirteen were written with no vocabulary's word (OQ-157). They are the user's own
actions, so they belong to the domain whose controls produce them rather than to domain 01's list of what a run does. A
person reading the export after the fact can tell what the user did from what the run did. What it costs: a second
domain now fixes timeline words, and a reader of domain 03 has to know that this entry holds them.

> **New:** no live requirement covers this.

*Raised by the owner, 2026-10-06, ruling OQ-157 as recommended; logged as [R-071](../requests.md#r-071). Built as `PD-CHAT-007`
and renumbered `PD-CHAT-009` before it landed, `main`'s `PD-CHAT-007` and `PD-CHAT-008` having landed meanwhile.*

> **First execution, 2026-10-06, built under [R-071](../requests.md#r-071):** with `PD-ORCH-014`'s, as one gate; the
> thirteen names were already written as stated, and the gate cites each to this entry. Nothing in the text was wrong.
