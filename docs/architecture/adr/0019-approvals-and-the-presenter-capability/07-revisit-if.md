# ADR-0019 — Approvals: the wait registry lives with the gate; the presenter is a revocable capability — Revisit if

Part 7 of 8 of [ADR-0019](../0019-approvals-and-the-presenter-capability.md), which indexes every part.

## Revisit if

The product gains a second presenter kind — a system notification that can be answered, or a remote
approver — at which point "registered presenter" stops being a boolean and `REQ-TOOLS-053`'s
definition of attended needs re-reading; or `approval_timeout_seconds: 0` is reconsidered; or the lapse
window cannot be set wide enough to avoid false revocations under ordinary main-process load, in which
case the choice narrows to a hang at `0` or a specification change, and the question becomes an
escalation rather than an architecture decision. **Or `REQ-SANDBOX-101`'s presence-only sentence is
confirmed as the operative test rather than `REQ-TOOLS-053`'s capability test**, in which case the
conflict this record was originally written around returns exactly as it stood and the argument
preserved in consequence 2 becomes live again.

**Or the run host stops being a `utilityProcess`.** The correction above is a fact about *this* hosting:
a run host built as a detached child process or a separate executable could outlive main, would then
observe `parentPort` closing, and the channel-close branch would become the mechanism this record
originally described. Anything that changes the run host's hosting re-opens that paragraph and the
teardown consequence that follows from it.

**Or a native dialog family turns out to have no asynchronous form on some platform.** The
synchronous-native-dialog prohibition is measured on Windows for two dialog families. A platform where a
dialog `REQ-SHELL-164` requires can only be shown synchronously is a conflict between that requirement
and `REQ-TOOLS-064`'s *never a hang*, and is an escalation rather than an architecture choice.
