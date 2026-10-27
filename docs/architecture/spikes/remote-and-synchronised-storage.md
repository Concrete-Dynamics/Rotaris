# Spike — the store and exclusive-create locking on remote and synchronised storage

- **Date:** 2026-09-02
- **Assigned as:** spike 19. ESC-15 retained it with a changed question ("whether anything *else* the
  product writes into `.rotaris/` misbehaves on synchronised storage"); ESC-21 assigned it the strength
  of the integration-lock ruling ("Spike 19 decides whether refusal is the right strength or whether a
  warning suffices; it does not reopen the direction").
- **Question, as given:** what actually happens to the store, and to exclusive-create locking, on remote
  and synchronised storage. This decides the severity of ESC-15 and ESC-21.
- **Scope:** measurement only. No product code was written and none is authorised. Nothing was written
  into the repository except this file.

**Headline.** ESC-15's ruling survives and is strengthened. Its stated *mechanism* does not.
Write-ahead logging did **not** fail on a UNC path over SMB — it succeeded, in 320 process-trials, with
zero errors. The store did **not** open read-only in any measured configuration. What was measured
instead is worse than the ADR predicts: on a mapped network drive letter the store opens read-write,
`PRAGMA journal_mode=WAL` returns `wal`, the read-back that ADR-0058 prescribes returns `wal`, the
32 KiB `-shm` file is created — and the next write throws a disk I/O error. And where one database file
is reached through two path spellings, two writer processes each reported committing 300 rows with zero
errors while up to 568 of those 600 rows silently vanished, with `integrity_check` returning `ok`.

Exclusive create, by contrast, was a flawless mutual-exclusion primitive over SMB: 2,500 races, exactly
one winner in every one. ESC-21's first premise is confirmed by measurement. Its second — that a
file-synchronisation client breaks it — is **not testable on this machine** and was not faked; what
*is* measured is that the tie it creates cannot be broken by anything `REQ-GIT-128` puts in the lock
file, and that the detection ESC-21's ruling depends on works, cheaply, against a real registered
provider.

---

## Parts

Since 2026-10-26 the rest of this document is in [`remote-and-synchronised-storage/`](remote-and-synchronised-storage/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](remote-and-synchronised-storage/01-1-environment.md) | 1. Environment |
| [02](remote-and-synchronised-storage/02-2-remote-here-is-a-real-smb-round-trip-not-a.md) | 2. "Remote" here is a real SMB round trip, not a simulation — §2.1, §2.2, §2.3, §2.4 |
| [03](remote-and-synchronised-storage/03-3-method.md) | 3. Method |
| [04](remote-and-synchronised-storage/04-4-results-the-store-on-a-network-filesystem.md) | 4. Results — the store on a network filesystem; 4.1 Write-ahead logging **succeeds** over SMB (`a-wal.js`); 4.2 The read-back ADR-0058 prescribes does not detect the failure it exists to detect (`b-fallback.js`, `h-mapped.js`); 4.3 A mapped network drive letter fails deterministically, then works (`h-mapped.js`, `p-intermittent.js`); 4.4 ADR-0058's chain, link by link (`o-chain.js`); 4.5 Two openers, one file, two spellings: silent, undetected loss (`s-mixed.js`, `c-run.js`, `e-run.js`) |
| [05](remote-and-synchronised-storage/05-5-results-exclusive-create-over-smb-i-runjs.md) | 5. Results — exclusive create over SMB (`i-run.js`) |
| [06](remote-and-synchronised-storage/06-6-results-the-synchronisation-client-case-esc-21.md) | 6. Results — the synchronisation-client case (ESC-21); 6.1 What a sync client breaks, stated precisely; 6.2 What is testable on one machine, and what it showed (`q-esc21.js`); 6.3 What is **not** testable here; 6.4 The detection ESC-21's ruling depends on **works**, and is cheap (`k-detect.ps1`, `k2-child.ps1`, `t-detect-cost.ps1`) |
| [07](remote-and-synchronised-storage/07-7-results-the-concurrent-copy-analogue.md) | 7. Results — the concurrent-copy analogue; 7.1 A gentle first pass with no statistical power (`l-run.js`) — recorded so it is not re-run; 7.2 The same experiment with enough power to decide it (`m-run.js`); 7.3 The other direction: when the replica is pushed back (`n-writeback.js`) |
| [08](remote-and-synchronised-storage/08-8-results-the-other-rotaris-residents-on-shared.md) | 8. Results — the other `.rotaris/` residents on shared storage (`j2-atomic.js`) |
| [09](remote-and-synchronised-storage/09-9-verdicts.md) | 9. Verdicts |
| [10](remote-and-synchronised-storage/10-10-what-this-harness-does-not-model.md) | 10. What this harness does not model |
| [11](remote-and-synchronised-storage/11-11-impact-on-the-record.md) | 11. Impact on the record; ADR-0058 — the workspace store; ADR-0004 — the atomic document primitive; ADR-0005 — the session lock / ESC-21; `REQ-GIT-124` ordering — confirmed by measurement; Open question this spike opens |
| [12](remote-and-synchronised-storage/12-12-files.md) | 12. Files |
