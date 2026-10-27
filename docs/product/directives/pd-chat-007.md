[Product directives](../directives.md) › PD-CHAT-007

<a id="pd-chat-007"></a>

### PD-CHAT-007 — every queued prompt belongs to a session

A queued prompt SHALL always carry the session that owns it: the explicit session id it was submitted to, or the
`session_id` key of its context snapshot (REQ-CHAT-039). There is no unscoped queued prompt. REQ-CHAT-038's "(empty =
unscoped)" and REQ-CHAT-039's sentence giving an unscoped prompt a behaviour of its own ("an unscoped prompt MUST be
consumable by any run but invisible to session-scoped listings") no longer govern, and a request that would create a
prompt with no owner is refused. Every other clause of the two requirements still governs: the content, the id and the
status progression, the refusals, the exactly-once transition, a prompt visible and consumable only by its session's runs,
and ownership preserved across edit and trigger.

**As built.** `queued_prompts.session_id` is `NOT NULL` since store v6, so no unscoped prompt can be stored, and
`resolveQueueOwnership` (`packages/engine/src/sessions.ts`) refuses an `unscoped` verdict; every route supplies the
addressed session. Its comments cited OQ-51 as open until 2026-10-06 (fin22), when they were worded to this directive; the
store migration's comment that names it (`packages/store/src/schema.ts`, v13) keeps its words, a shipped migration being
never edited.

**Why, and what it costs.** OQ-51: REQ-CHAT-041's amendment of 2026-09-07 assigned one session-scoped queue to the
instance, and the store has never been able to hold a prompt with no session, while REQ-CHAT-039 still described one. The
owner withdrew it. What it costs: no prompt can be queued for "whichever run comes next"; a prompt is queued for a session.

> **Narrows:** REQ-CHAT-038, REQ-CHAT-039

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-51.*
