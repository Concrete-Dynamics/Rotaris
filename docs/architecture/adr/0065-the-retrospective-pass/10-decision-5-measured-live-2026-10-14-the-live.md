# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Decision 5 measured live — 2026-10-14 (the live scenario run at `ce5f952`, F2; fin43)

Part 10 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## Decision 5 measured live — 2026-10-14 (the live scenario run at `ce5f952`, F2; fin43)

**Found by the live run:** `ask-retrospective`, in a launch that had started no run, sent the retrospective's one
`/chat/completions` request with no `Authorization` header and got `401 Unauthorized`; the artifact's notes read "collector
crashed: Unauthorized…". Decision 5's reading — `configuredFor` and `leaseForContinuation` "already" give a pass with no run its
configuration and its bearers, so "the retrospective uses both" — **was false in the order the build used them**, and is kept
here beside its replacement: the capture took `configuredFor` first, a setup completed over the bearer map of its moment (empty
when nothing had leased), the lease then published a new map that setup never read, and the analysis reused the same cached
setup. A run never met it, because `launchSession` leases and then completes the setup over the bearers it leased. **Now:**
`leasedSetup` (`apps/desktop/src/run-host/launch.ts`) does exactly that for the retrospective — prepare, lease the providers the
configuration names (refusing as a continuation does when the entry provider is unresolved), complete over those bearers — and
the run host's `retrospectiveSetup` calls it at the capture and again at the analysis, publishing the lease and caching nothing
(`configure` stays a run start's). Pinned by `dispatch.test.ts`'s three cases (the analysis sends the leased bearer, the capture
reads its collector from the leased setup, a lease refusal returns before either; the first two red on the code before) and
`launch.test.ts`'s two `leasedSetup` cases.
([`../../../defects/fixed/a-retrospective-sends-its-model-request-with-no-credential-when-no-run-has-leased-one.md`](../../../defects/fixed/a-retrospective-sends-its-model-request-with-no-credential-when-no-run-has-leased-one.md).)
**Not measured:** the live `ask-retrospective` scenario since the change — it should show the request carrying a credential and
an artifact with no "collector crashed" note; the built app's proofs run the scripted provider, which takes no credential.

> **Corrected 2026-10-14 (fin46, `fin46-accept1-11`):** "refusing as a continuation does when the entry provider is unresolved",
> above, was the build's reading and is kept as written; it checked the **entry role's** provider, while the retrospective's one
> request goes to its own model (`retrospective_model`, then `medium_model`), so a retrospective was refused when only the entry
> role's provider was signed out and passed its lease when its own was, failing at its model call. `leasedSetup` now requires the
> retrospective model's sign-in provider (`PreparedRun.retrospectiveAuthProvider`), a continuation still the entry role's
> ([`../../../defects/fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md`](../../../defects/fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md)).
