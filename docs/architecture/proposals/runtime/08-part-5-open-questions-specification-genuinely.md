# RUNTIME slice — architecture proposals — Part 5 — Open questions (specification genuinely silent)

Part 8 of 10 of [the runtime proposal](../runtime.md), which indexes every part.

## Part 5 — Open questions (specification genuinely silent)

**OQ-1 — Is a second application instance on the same workspace a supported configuration?** C2.3,
C2.6 and REQ-MONITOR-243 all describe following a session owned by another process, and C7.12/C7.13
handle a lock this machine cannot prove dead. But nothing states whether opening the application
twice on one workspace is supported, discouraged or prevented (there is no single-instance
requirement anywhere in domains 11 or 12 that I found). The answer decides whether the foreign-follow
path of ADR-RUNTIME-05 is a routine path or a defensive one, and it is the premise of ESCALATE-2.

**OQ-2 — What happens if the run host process crashes while the application stays up?** C7.6 covers
force exit and requires it to be "reported as such on the next start", and C7.8–C7.13 cover a stale
session after a process death. Nothing covers the case where the engine's host dies but the windows
survive. Candidate behaviours, none specified: the shell reports every affected session as needing
recovery (which the existing stale machinery already produces), and either respawns the run host
lazily on the next launch or immediately. This is only a question because ADR-RUNTIME-01 recommends
a separate host; under alternative B it collapses into an application crash.

**OQ-3 — What happens when `<workspace>/.rotaris` cannot be written at run start?** REQ-EVENTS-084
covers the *event store* specifically (degrade to a warning, run continues). REQ-SESSION-048 has
session creation persist initial state then acquire the lock, and REQ-SESSION-086/167 delete a
just-created session on a sandbox or worktree-bind failure. But nothing states the outcome when the
state write itself fails — whether the run is refused before start on the REQ-EVENTS-021 path (one
`result` with status `error`, no `session.start`) or attempts to proceed. Refusing before start is
the only reading consistent with C3.12 (persist before publish), but it is inferred rather than
stated.

**OQ-4 — At what granularity is `usage.update` emitted?** REQ-EVENTS-053 fixes only that it must not
be emitted with no figures and that it carries run-to-date cumulative totals. REQ-MONITOR-166 fixes
a *sampling* cadence of 10 s for the token-history sparkline, which is a different thing. Whether a
`usage.update` accompanies every model turn, or follows the 10 s sample, or both, is unstated and
affects journal volume against the 20,000-event cap of C4.7.

**OQ-5 — Is the run host permitted to hold locks for sessions in more than one workspace at once?**
C1.9 says several locked background sessions may coexist *within a single workspace*, and C10.1 says
runs may be in flight "in the same workspace or in different ones". Under ADR-RUNTIME-01 one run
host would hold locks across workspaces, which appears to be intended but is never stated as such.

---
