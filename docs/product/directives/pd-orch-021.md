[Product directives](../directives.md) › PD-ORCH-021

<a id="pd-orch-021"></a>

### PD-ORCH-021 — a follow-up's first root carries the previous root's conversation

When a new request enters an existing session and the run it starts begins with a fresh root, that root MUST begin from
the conversation of the session's most recent root, and only then be sent its payload. This directive's case is **the
first fresh root of a continued run**; a resumed root (`PD-ORCH-005` clause 4), every later root of the same run and every
root of a session's first run start as before.

1. **What is carried.** The conversation of the session's most recent root other than the new one, an iteration's or a
   plan cycle's, whichever was opened last, read from its record (`PD-ORCH-005` clause 1) as a resume reads it: from its
   last compression on, so what was condensed stays condensed. It is cut after the root's last answer (its last
   assistant message that calls no tool), and any tool call the record holds no result for is left out, so every tool
   call carried has its result.
2. **Where it goes.** The carried messages come first, and the payload REQ-SESSION-115 states (its preamble, the latest
   request, the handoff and the recent context, with every budget unchanged) is the root's next message after them.
   Nothing is carried where the previous root never answered.
3. **It is recorded.** The carried messages are recorded under the new root as one replacement before its first message,
   so a resume of it loads what it was given, and one timeline entry `root_conversation_carried` names the root carried
   from, the root carried to and the number of messages.
4. **The request the root works on is the one compression keeps.** REQ-MONITOR-082's original request is, for a root
   that carries a conversation, the payload it was sent, not the first request of the carried conversation; the carried
   messages are compressed with the history after the payload. Where the payload is still among the preserved recent
   turns, the summary precedes it and it is kept there once.

**Why, and what it costs.** The owner: "please make it so that when i type a new prompt in the same session, the context
is not reset. i feel like this costs a lot of redescovering." Before the directive a follow-up's root was sent the
handoff alone (six transcript rows cut to 700 characters, the latest artifact, the todo, the progress), so it re-read the
files and re-ran the searches its predecessor had already done. The cost is a larger first request for a follow-up's
root, bounded by the compression the root already runs under (REQ-MONITOR-076): a long previous conversation is condensed
at the root's first step instead of being rediscovered over many. Delegated agents are not given a carried conversation:
each child still starts from the brief its parent writes, and the parent now writes it knowing what was found before.

This directive names [`PD-ORCH-005`](pd-orch-005.md#pd-orch-005), whose clause 4 resumes an open iteration's root from its
own record: that case is a root continuing its own conversation, this one a new root beginning from its predecessor's.

REQ-SESSION-115 and REQ-ORCH-004 are extended in that the conversation context in effect is carried as the previous
root's conversation besides the payload; REQ-MONITOR-082 is narrowed in that the original request of a root that carries
a conversation is its payload.

**First execution, 2026-11-25.** Built as stated in `packages/engine/src/run/carry.ts` and `Run.freshRootStart`, with
`Conversation.pushRequest` and `compress` taking a carried prefix. Measured with the scripted model: a follow-up's first
request carries the first run's request and answer before the handoff, a first run carries nothing, an unanswered call is
left out, and a compression keeps the new request verbatim with the carried conversation condensed. Not measured: a real
model across a follow-up, the token cost against the rediscovery it saves, and one known limit: a root that carried a
conversation and is then resumed from its record (`PD-ORCH-005` clause 4) takes the first request of its record as its
original request again, until a compression rewrites the record with the payload first.

> **Extends:** REQ-SESSION-115, REQ-ORCH-004
> **Narrows:** REQ-MONITOR-082
