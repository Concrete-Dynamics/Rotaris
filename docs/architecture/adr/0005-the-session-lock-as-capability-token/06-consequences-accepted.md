# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — Consequences accepted

Part 6 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## Consequences accepted

1. A lock naming another machine, or one whose record is incomplete, is never reclaimed automatically and
   requires `REQ-SESSION-183`'s explicit, user-confirmed action. Unchanged, and it is the safe direction —
   but under `REQ-SESSION-054` it now indicates a fault rather than a routine condition, and
   `REQ-SESSION-048` requires the refusal to say so.
2. Pid recycling can make a dead session report alive until the recycling process exits
   (`REQ-SESSION-054`); accepted, documented, and it must not be "fixed" in a way that breaks
   `REQ-SESSION-051`'s resolve-toward-alive rule.
3. A run-host crash (ADR-0002) leaves live-looking lock rows for every session it held. Each becomes stale
   and is repairable individually or all at once (`REQ-SESSION-063`); the repair announcement is how
   `REQ-MONITOR-283`'s "reported as such on the next start" is satisfied without a separate mechanism. This
   is the case the lock exists for and it is unchanged by SR-1.
4. **Consequence 4 of the superseded version is withdrawn and must not be cited.** It read: "Where ADR-0058
   has opened the store read-only — a workspace on a network share or in a cloud-sync folder — no session
   can be run at all." That was true and it was fatal, and it is the observation ESC-15 acted on. Under
   `REQ-SESSION-198` the store is never on such storage, so the case does not arise. **What survives is the
   sentence that made it fatal: acquiring a lock is a write to the store.** That is the single clearest
   statement of why the store had to become machine-local, and it belongs in this record because this is
   where the write happens.
5. The reap transaction holds the store's write lock across one liveness probe. That is an inspection-only
   call of microseconds, but it is an operating-system call inside a database transaction and it is the only
   one in the product; it must stay the only one.
6. Everything main and the workspace service need from a session — the integration precondition, the stale
   list, the session browser — is a **read**, and reads need no lock (`REQ-EVENTS-098`) and, under
   write-ahead logging, never block the writer. `REQ-EVENTS-098` states that as a conformance property of
   the store, so this is not merely convenient.
7. **The product now has two lock media and must keep exactly one liveness predicate.** That is a standing
   invariant rather than a one-time task, and it is the most likely thing a later sweep would erase by
   "unifying" the two locks. `REQ-GIT-128` records why they are not unified; *Why the two locks are not
   unified* above records the five grounds and what would break, and it is the section to read before
   proposing the merge.

8. **One of the two lock media can be silently non-exclusive, and the product's answer is to refuse
   rather than to detect the failure afterwards.** Under ESC-21 an integration on a workspace inside a
   file-synchronisation agent's tree is refused before the lock is created. Two costs are accepted with
   it. A user whose project genuinely lives in such a folder cannot integrate worktrees there at all,
   with "hold the workspace on this machine's own storage" as the stated remedy — which is a real
   capability lost to a storage choice the product cannot make safe. And the refusal is only as good as
   `REQ-STARTUP-166`'s classification: an agent the product does not recognise classifies as unknown,
   which is a silent negative by ruling, so the integration proceeds under a lock that does not lock.
   **That residual is not closed by anything in this record and must not be presented as if it were.**
   It is the strongest argument for the classification being maintained as clients change, and it is why
   the refusal is worth having even though it is incomplete: it removes the recognised cases, and the
   recognised cases are the common ones.

9. **The session lock is never on storage where exclusive semantics are doubtful, and that is a second,
   independent dividend of ESC-15.** `REQ-SESSION-198` puts the store on machine-local storage always, so
   the primary-key insert this record relies on always runs against a local file. The hazard ESC-21
   describes reaches exactly one lock in the product. Before ESC-15 it would have reached both.
10. `REQ-GIT-020` names an acquisition contender the sessions domain does not — the brief overlap of an
    in-place update hand-over (`REQ-STARTUP-121`) — and the row's primary-key insert refuses it
    identically. No separate mechanism is needed, but ADR-0054's hand-over must not assume the outgoing
    instance has released its locks before the incoming one claims them.

11. **A restore of `REQ-SESSION-201` brings lock rows with it, and one of them is poisonous.** The restore
    is refused while any session in the *target* store is live, so no lock is ever taken from under a
    running run (ADR-0058). What arrives is the **artifact's** lock rows as they stood when the backup was
    taken, and `REQ-SESSION-201` requires the backup to be valid while runs are live — so an artifact
    routinely carries locks for sessions that were mid-run. Restored on the machine that took the backup,
    those rows name this `host`, their pids probe dead, and the ordinary reap and repair settle them with
    no new concept. Restored on a different machine they name a foreign `host`, which `REQ-SESSION-056`
    resolves toward live and `REQ-SESSION-047` never reaps, so every session that was running at backup
    time arrives permanently unreachable and needs `REQ-SESSION-183`'s explicit, per-session,
    user-confirmed release — turning a recovery into a chore proportional to how busy the machine was
    when it died. *(That sentence stood in the conditional until 2026-09-02. It is now indicative, because
    the case has been run: see the measurement below.)*

    **The correction is one line and it belongs to the lock rules, so it is stated here:** a restore
    **drops lock rows whose `host` is not this machine**, and keeps the ones that name it. Restoring a
    store makes it this machine's store (`REQ-SESSION-198`), and a claim that a process on some other
    machine is running one of its sessions cannot be true of it. The dropped rows cost nothing and lose
    nothing: the session's `execution_status` still asserts a run, so with no lock the session is
    **stale** by `REQ-SESSION-057` and the ordinary explicit repair of `REQ-SESSION-060` settles it to
    `interrupted` — which is exactly what happened to it. Rows naming this machine are kept because they
    carry the pid `REQ-SESSION-059` wants a stale report to name. ADR-0058 owns where this sits in the
    restore sequence and requires the pre-restore summary to say how many sessions will arrive needing
    repair, so the correction is disclosed rather than silent.

    **Confirmed by measurement, 2026-09-02, against its own counterfactual**
    (`../spikes/backup-restore-mechanism.md`). A backup was taken with two sessions mid-run —
    `execution_status = running`, lock rows held — and restored into a world where those rows named a
    different machine. **With the correction applied:** both foreign-host rows dropped, both sessions
    arrived `running` with no lock, `live=false`, `stale=true`, and the ordinary explicit repair settled
    both to `interrupted`. **With the correction disabled against the same world:** both arrived holding a
    lock naming `DEAD-LAPTOP-7`, `live=true`, `stale=false`, **not repairable**, reachable only one at a
    time through `REQ-SESSION-183`. Terminal sessions were untouched either way, and rows naming this
    machine were kept and probed dead, so `REQ-SESSION-059` still had the pid to name. **The rule was
    written for a case nobody had run; the case has now been run, and both halves of it behave as the rule
    says.** That is worth stating rather than assuming: three defects were found in the same restore
    mechanism on the same measurement pass (ADR-0058, consequence 17), so this rule's survival is evidence
    and not a formality — it is the part of that mechanism that was reasoned correctly, and the reasoning
    that produced it is the reasoning to imitate.

    **What this rule does not cover, stated so the confirmation is not over-read.** It drops foreign-host
    rows on the way **in**, from the artifact. It says nothing about a foreign-host row already sitting in
    the **target** store — and measured, one such row makes that target permanently unrestorable, because
    `REQ-SESSION-056` resolves it toward live, `REQ-SESSION-047` never reaps it, and the restore is refused
    while anything in the target is live. A machine rename produces that condition for every lock row at
    once, which `REQ-SESSION-054` calls "a state that should not arise". Nothing here closes that, and the
    remedy — if the owner wants one — is a rule about the *target*, belonging with the ordinary reap and
    with `REQ-SESSION-183`, not an extension of this one.
