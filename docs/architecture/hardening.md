# Hardening — the application measured against engineering standards

- **Created:** 2026-11-01, for [R-091](../product/requests.md#r-091) ("harden the behavior of the App according to
  software engineering standards"), from three read-only surveys of the checkout at `6dc7e8a3`. *(Numbered R-090 while
  it was written; another session's R-090 landed first, so the request and its companion R-092 took the next free numbers.)*
- **Governs:** nothing. It records what was measured, against which standard, what holds, what does not, and which
  bundle of the orchestrated build closes each gap. The requirements and directives it cites govern; a mechanism's
  first execution reports into the record that decided it and into [`first-executions.md`](first-executions.md).
- **Maintained:** each landing that closes a row changes its status here, in the same commit; a row closed by a
  measurement names the proof or test that pins it.

## Parts

Since 2026-11-03 the rest of this document is in [`hardening/`](hardening/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part. **A landing that closes a row changes it in the part that holds it** (§3 in part 02, §6 in part 04).

| Part | What it holds |
|---|---|
| [01](hardening/01-what-was-measured-and-the-assets-and-trust-boundaries.md) | What was measured against what; assets and trust boundaries (§1, §2) |
| [02](hardening/02-the-findings.md) | The findings, with their status (§3; a closing landing changes its row here) |
| [03](hardening/03-what-is-not-built-here-and-the-plan.md) | What is not built here; the plan and its bundles (§4, §5) |
| [04](hardening/04-requirements-traceability-and-the-decision-archive.md) | Requirements traceability and the decision archive, R-092 (§6; its rows close here) |
