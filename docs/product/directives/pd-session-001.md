[Product directives](../directives.md) › PD-SESSION-001

<a id="pd-session-001"></a>

### PD-SESSION-001 — the listing record carries the three figures the sessions card shows

*Revision 2 (2026-10-06, fin22) — wording only: the second field is named as built. The record carries the latest run's
**duration label**, computed from the run's stored start time, and not the start time itself; nothing the card draws
changes. Revision 1's words are quoted below the paragraph.*

REQ-SESSION-030's listing record SHALL hold, beside its twelve fields, three more: the session's **token total** (its
`tokens_input` plus its `tokens_output`, the field `tokens`), the **duration label of its latest run** (`durationLabel`),
and its **workspace path** (`workspace_root`, the field `detail`). They are what the Overview's sessions card draws as
REQ-MONITOR-171's token label, duration label and detail caption. The duration label is the latest run's duration as `m:ss`
or `h:mm:ss`, counted from that run's stored start time (`run_started_at`) to now while the run is live and to the row's
`updated_at` otherwise, and empty before any run; so for a session paused and continued it counts the continuation alone.
The three are read from the same stored session row the listing record is read from, and reading them opens nothing else of
the session's (REQ-SESSION-042); every other clause of REQ-SESSION-030 still governs. `checkpoint_count` stays what it was
before this directive: a count over the session's checkpoint rows in the same store, as ADR-0039 derives it.

> *Revision 1 said, and no longer describes the record:* "the **start time of its latest run** (`run_started_at`)" as the
> second field, and "The duration label is the latest run's duration, counted from that start". The listing never carried
> the start time; `Sessions.list` computes the label from it.

**As built.** `Sessions.list` (`packages/engine/src/sessions.ts`, `durationLabel`) reads the three from the session row the
listing record is read from; the card is `packages/ui/src/OverviewView.tsx`.

**Why, and what it costs.** OQ-192: REQ-MONITOR-171 requires the three labels on each row, and REQ-SESSION-030's closed field
set forbids a listing to show anything else about the session, saying that making an attribute list-visible "is a change to
this field set". The owner kept the labels and had the field set changed. What it costs: three more fields every listing
reader carries, and a duration that does not add up a session's runs.

> **Narrows:** REQ-SESSION-030

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-192.*
