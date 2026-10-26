# The first release — Windows only, skills and workspace-context injection

*Drafted 2026-09-25 from [R-051](../product/requests.md#r-051). A plan, not a decision: it schedules work the
record already decides, and every ruling it needs is named as the owner's rather than taken here.*

**The owner's words.** "ok lets go with windows only first. skilsand workspace injection is a must have. thats it."

**What the plan does with them:**

- **Windows only** narrows what a release publishes. That is a change to four live requirements, so it is a
  directive: [`PD-STARTUP-001`](../product/directives/pd-startup-001.md#pd-startup-001). It narrows REQ-STARTUP-026, 030, 035 and 156.
- **Skills** and **workspace-context injection** are already specified (REQ-CHAT-034, REQ-CHAT-162,
  REQ-WORKSPACE-041..073). They are mostly built. The plan finishes them and proves them in the built app.
- **"thats it"** defers everything else on the go-live gap list from the first release. Deferring is scheduling
  only. No requirement is superseded, and each deferred item stays owed where it is recorded now.

*2026-10-06 ([R-071](../product/requests.md#r-071)): the owner confirmed as built the open questions this plan names as open — OQ-58, OQ-59, OQ-67 to OQ-71, OQ-79, OQ-80, OQ-87 to OQ-89, OQ-92, OQ-93 and OQ-131 among them — and deferred the release pipeline's notices and signing (OQ-72 to OQ-75, OQ-83), continuous integration and the Linux and macOS builds; the work counts as finished without them. Each ruling is in its entry in [`open-questions.md`](open-questions.md), and those that depart from a requirement are directives (`PD-WORKSPACE-003`, `PD-WORKSPACE-004`, `PD-STARTUP-002` to `PD-STARTUP-005`). The mentions below of those questions as open are kept as the record of the plan as it ran.*

## Parts

Since 2026-10-26 the rest of this document is in [`first-release-plan/`](first-release-plan/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](first-release-plan/01-1-scope.md) | 1. Scope |
| [02](first-release-plan/02-2-must-have-skills.md) | 2. Must-have: skills — §2.1, §2.2, §2.3 |
| [03](first-release-plan/03-3-must-have-workspace-context-injection.md) | 3. Must-have: workspace-context injection — §3.1, §3.2, §3.3, §3.4 |
| [04](first-release-plan/04-4-the-windows-release-pipeline.md) | 4. The Windows release pipeline — §4.1, §4.2, §4.3, §4.4, §4.5, §4.6 |
| [05](first-release-plan/05-4-the-windows-release-pipeline-2.md) | 4. The Windows release pipeline *(continued, from "It shows no override anywhere (REQ-STARTUP-167). If the owner defers it, the release …")* — §4.7, §4.8, §4.9 |
| [06](first-release-plan/06-5-the-release-gate.md) | 5. The release gate |
| [07](first-release-plan/07-6-what-only-the-owner-can-do.md) | 6. What only the owner can do; 6.1 O-2, step by step |
| [08](first-release-plan/08-7-order-of-work.md) | 7. Order of work; Published-asset verification — T3, 2026-10-24 |
