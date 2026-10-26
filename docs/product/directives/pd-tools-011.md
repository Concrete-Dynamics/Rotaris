[Product directives](../directives.md) › PD-TOOLS-011

<a id="pd-tools-011"></a>

### PD-TOOLS-011 — a user's own terminal action and the user's presence have their words

**The audit's two members.** A permission-audit entry that records a user's own terminal action (REQ-SHELL-107)
carries the decision `user-input` and the source `user`. `user-input` SHALL be a member of the decision vocabulary that
an audit entry and its `permission.decision` event are read against, beside REQ-TOOLS-012's three. `user` SHALL be a
member of REQ-TOOLS-028's decision-source vocabulary, its thirteenth. No policy resolution yields either. What
REQ-TOOLS-012 says of resolution is unchanged: it yields `allow`, `ask` or `deny`, and the dispatcher handles only
`allow` or `deny`. Only the entry of a user's own terminal action carries the two.

**The presence words.** Domain 05's timeline words SHALL also hold `user_away` and `user_returned`: the run marking its
user away when an approval wait ended by timeout, and the user's next input to the session ending that stretch
(PD-TOOLS-005). Each entry carries the expired timeout, in seconds, as `after_seconds`.

**Why, and what it costs.** The terminal's audit entry was written with REQ-SHELL-107's two words, which neither closed
vocabulary held, so a decision-log reader enumerating them would not recognise it (OQ-54). The presence transitions were
session-log lines only (OQ-76), so an autopsy reading the store or the export saw a row of `permission_denied` issues and
not the instant the user went away or came back. What it costs: the audit's vocabularies are no longer the policy's, and
a reader must tell an audit decision from a policy outcome. The product keeps them apart in code (`AUDIT_DECISIONS` and
`AUDIT_DECISION_SOURCES` beside `DECISIONS` and `DECISION_SOURCES` in `packages/contracts/src/tools.ts`).

> **Narrows:** REQ-TOOLS-012, REQ-TOOLS-028

*Raised by the owner, 2026-10-06, ruling OQ-54 and OQ-76 as recommended; logged as [R-071](../requests.md#r-071). Built as
`PD-TOOLS-007` and renumbered `PD-TOOLS-011` before it landed, `main`'s `PD-TOOLS-007` to `PD-TOOLS-010` having landed
meanwhile.*

> **First execution, 2026-10-06, built under [R-071](../requests.md#r-071):** the rule held as written. The terminal's
> audit entry takes its two words from the audit's vocabularies (`USER_TERMINAL_DECISION` and `USER_TERMINAL_SOURCE` in
> `apps/desktop/src/run-host/terminal.ts`), and `UserPresence` writes `user_away` (actor `rotaris`) and `user_returned`
> (actor `user`) beside its two session-log lines, which keep their `WARNING` level so the stretch's end is visible
> wherever its start is (`packages/engine/src/run/presence.ts`). **What was measured.** `contracts.test.ts` and
> `presence.test.ts`, each red on `37f7a98`. **What was not measured.** No built-app or live run marked a user away.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Built-app execution of the presence words, 2026-10-13, plan fin42:** `pnpm approvals-proof`'s `away` launch marked a user
> away and back in the built app. One `user_away` entry (actor `rotaris`, `after_seconds: 12`) was written in the millisecond
> the first approval wait timed out, and one `user_returned` entry (actor `user`, `after_seconds: 12`) 3.5 s later, by the
> answer to the question tool's approval, with the session log's two lines at `WARNING` beside them. The rule held as written.
> The terminal's audit words (`user-input`, `user`) were not driven by it. A live run is still owed: `live-run.mjs`'s `away`
> scenario reads `user_away` against a real model, and `user_returned` is measured only in the proof.
