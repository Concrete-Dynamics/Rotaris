# Background updates — installable from a release, downloaded by itself, applied at the next start

*Drafted 2026-10-22 from [R-084](../product/requests.md#r-084). A plan, not a decision: it schedules work the record
decides in [`PD-STARTUP-008`](../product/directives/pd-startup-008.md#pd-startup-008), [`PD-SHELL-005`](../product/directives/pd-shell-005.md#pd-shell-005)
revision 2 and REQ-STARTUP-169 to REQ-STARTUP-181 ([`../spec/11-startup-distribution-updates.md`](../spec/11-startup-distribution-updates.md)),
and every product decision it needs is named as the owner's (§6) rather than taken here. **Recorded, not built.** No
mechanism below has run; nothing here is a first execution, and no row is owed to [`first-executions.md`](first-executions.md)
until a stage builds one. Implementation is scheduled after the dependency remediation running beside this plan.*

**The owner's goal**, relayed by Augustus: Rotaris installable **from a release**, with an updater that behaves like current
desktop assistants. A newer build downloads by itself in the background, with no click; its progress is visible and can be
cancelled; the verified download is applied automatically **at the next start**, or at once by **Restart now**. A restart
is never forced in the middle of work and never arrives as a modal; the guards a clicked restart asks today stay. A broken
or cancelled download, or a failed apply, never leaves an installation that cannot start, and REQ-STARTUP-126's rollback
stays. The signature is verified before the manifest is parsed and before any asset byte is fetched (REQ-STARTUP-122, 123,
167), and the 1 MiB bounded reads and the chunked digest stay. ADR-0054's bespoke updater (Alternative B) is **retained**;
`electron-updater` stays rejected (§8). Windows x64 only (`PD-STARTUP-001`); IC-3 and IC-8 still bind.

| | Section |
|---|---|
| What the code does today, read on `b0d1b3ff` | §1 |
| The requirement map — what is kept, narrowed and new | §2 |
| The design the stages build | §3 |
| Crash, cancel and failure — what each interruption leaves | §4 |
| The stages, one pull request each | §5 |
| What the owner must decide (UD-1 to UD-12), and what is only an implementation choice | §6 |
| What blocks an installable release, and whose it is | §7 |
| Prior art, and why it is not the contract | §8 |

---

## Parts

Since 2026-10-26 the rest of this document is in [`background-update-plan/`](background-update-plan/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](background-update-plan/01-1-what-the-code-does-today.md) | 1. What the code does today |
| [02](background-update-plan/02-2-the-requirement-map.md) | 2. The requirement map |
| [03](background-update-plan/03-3-the-design-the-stages-build.md) | 3. The design the stages build |
| [04](background-update-plan/04-4-crash-cancel-and-failure-what-each.md) | 4. Crash, cancel and failure — what each interruption leaves |
| [05](background-update-plan/05-5-the-stages-one-pull-request-each-against-main.md) | 5. The stages — one pull request each, against `main`; Stage 1 — the first installable release path (before any behaviour change); Stage 2 — the pending update, its persistence and its integrity (no visible behaviour change); Stage 3 — the next-start apply and its recovery; Stage 4 — the non-modal surface, the automatic trigger and `Restart now`; Stage 5 — end-to-end acceptance on the built artifacts |
| [06](background-update-plan/06-6-what-the-owner-must-decide.md) | 6. What the owner must decide |
| [07](background-update-plan/07-7-what-blocks-an-installable-release-and-whose.md) | 7. What blocks an installable release, and whose it is |
| [08](background-update-plan/08-8-prior-art-and-why-it-is-not-the-contract.md) | 8. Prior art, and why it is not the contract |
