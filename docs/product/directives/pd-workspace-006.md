[Product directives](../directives.md) › PD-WORKSPACE-006

<a id="pd-workspace-006"></a>

### PD-WORKSPACE-006 — a code-intelligence setup's failure reads in these words where REQ-WORKSPACE-092 and REQ-WORKSPACE-093 give none

*Renumbered before landing: built as `PD-WORKSPACE-005` on its branch, it took the next free number, `PD-WORKSPACE-006`, when `PD-WORKSPACE-005` (the project-setup banner, OQ-171) landed on `main` first; its citations followed.*

The `code-intelligence-setup` task's step details and failure SHALL read as follows. REQ-WORKSPACE-092's two fixed
sentences for a stopped step, REQ-WORKSPACE-091's for a skipped one, REQ-WORKSPACE-093's three stage reasons and its
summary, and the retryable outcome are unchanged.

- **A step's detail.** A step not attempted (an earlier one failed, or the setup was cancelled between steps) and a step that
  ran and wrote nothing have an **empty** detail; the step's status (`not-attempted`, `succeeded`, `failed`) says what
  happened. A step whose command could not be started reads in the **launch's own error text** (for example
  `spawn /opt/ci ENOENT`). Every other step's detail is the last 400 bytes of its combined output **once that output is
  trimmed of its leading and trailing blank space**, cut where a UTF-8 character begins so that no character is split.
- **A failed stage with an empty detail** takes the setup's final sentence, "A step failed, so the workspace is only partly
  set up.", as its error's `{detail}`.
- **A setup that began no stage** fails retryably with REQ-WORKSPACE-093's summary, under the reason "Code intelligence could
  not complete this project's setup". Its detail is the run host's own refusal of the start ("A code-intelligence setup is
  already running for this workspace; wait for it to finish or cancel it first.", "That workspace is not open in the run
  host", "The configuration could not be loaded"); "the setup was cancelled before it started." for a run cancelled while
  its setup waited for the one before it; or "the run host did not answer the setup's start" with the request's own error in
  parentheses, for a start the run host does not answer within main's 15 s request bound. A refused start is not waited
  out: the task fails at once and runs again at the next open of the workspace or on Try again. No cancellation follows an
  unanswered start.
- **A setup whose finished status never arrives** ends as a retryable failure with REQ-WORKSPACE-093's summary, under the
  reason of the stage that was running, or the reason above where none was. Its detail is "the run host exited before the
  setup finished." when main sees the run host exit, or "no outcome arrived within the setup's time budgets." once every
  stage's budget plus REQ-WORKSPACE-092's 5 s for each has passed since the follow began (2235 s, about 37 minutes). The
  steps that finished are reported; the one that was running is not. No cancellation is sent when that bound passes.

**As built.** `stepDetail`, `lastUtf8Bytes`, `SETUP_REASON`, `CANCELLED_BEFORE_SETUP_ERROR`,
`SETUP_RUN_HOST_EXITED_DETAIL`, `SETUP_OVERDUE_DETAIL`, `SETUP_START_UNANSWERED_DETAIL` and `SETUP_FOLLOW_BOUND_MS`
(`apps/desktop/src/main/initialization.ts`); the output's trim in the run host's setup (`packages/mcp/src/setup.ts`).

**Why, and what it costs.** OQ-167, OQ-169 and OQ-175: REQ-WORKSPACE-092 and REQ-WORKSPACE-093 give a reason per stage and
a detail per stopped step, and nothing for a step with no output, a step that could not start, a setup that began no
stage, or one whose outcome never reaches the task; read literally, a failed stage's error was "{reason}: " with nothing
after it. The owner made the built words and the immediate retryable failure the rule, with the 37-minute bound. What it
costs: the borrowed final sentence is the run host's (REQ-MCP-112's final outcome) in this domain's error; a tail counted on
trimmed output differs from the output as written where it ends in blank lines; and a setup whose run host keeps working
past the bound without reporting is reported failed though it may still finish.

> **Narrows:** REQ-WORKSPACE-092, REQ-WORKSPACE-093

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the rulings of OQ-167, OQ-169 and OQ-175.*
