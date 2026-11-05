# The measurements — what is in `spikes/`

The reports of the spikes this product was priced and built against. A spike is taken as **the first act of building
the thing it prices** — never before it, never after it (`AGENTS.md`) — and its report is what the record then cites:
an ADR carries the measurement in its `Evidence:` header field, and a claim in the architecture README or in a
specification resolution rests on one of these files by name.

**24 reports on 2026-11-05.** The **state** of each spike — which numbered spike it answers, what it settled, what it
did not, what is still owed — is "The measurements", [§12](../README/12-the-measurements.md) of the architecture
README, together with the numbered spike list in [`../open-questions.md`](../open-questions.md). This folder is where
the readings themselves are.

## What a report is, and what it is not

- **A report records what was true on the machine and the date it names, and it is never rewritten.** A later reading
  is a section inside it or a report of its own; where a measurement disproved a *reason* but not a *conclusion*, the
  record keeps both beside each other and the ADR says so in as many words. A report is dated evidence, not the
  current state of the product.
- **The numbering is not this folder's.** Spikes 1 to 22 are the register's; several reports are titled by their
  subject instead, and a few are not numbered spikes at all — an implementation condition's measurement (IC-1, IC-4,
  IC-6), a directive's first act, a proof's own record. The "spike" column below is the report's own or §12's; `—`
  means the report answers something other than a numbered spike.
- **A report holds what a reader may see**: a host, a date, a command line, numbers. Never a key, a token or a URL
  carrying one — a model key is written `openai-compatible--<endpoint>/<model>`.
- **Where a report is over the document budget** it is an index and its parts sit in the folder of the same name
  (`commit-on-the-publish-path.md` and `commit-on-the-publish-path/`), moved verbatim
  ([the document budget](../../README.md#the-document-budget)). **8 of the 24 have a parts folder** on 2026-11-05.
- **A report is not a proof.** [`../live-runs/`](../live-runs/README.md) holds the autopsies of live-run packs, and
  `theme-proof.md` below is the detailed record of a `pnpm theme-proof` run; each is evidence of the same kind, kept
  where the work that produced it put it.

## The reports

| Report | Spike | Date | What it measured |
|---|---|---|---|
| [agent-resume.md](agent-resume.md) | — | 2026-09-27 | resuming an agent from its recorded conversation (`PD-ORCH-005`), end to end |
| [backup-restore-mechanism.md](backup-restore-mechanism.md) | 22 | 2026-09-02 | the whole-store backup and restore, run end to end — the restore as ADR-0058 wrote it failed 30 of 30 |
| [cached-portable-launch.md](cached-portable-launch.md) | 20 | 2026-09-02 | the cached launch of the Windows `onefile` portable, against SR-7's gate condition |
| [code-intelligence-branch.md](code-intelligence-branch.md) | item 5 | 2026-09-06 | the reserved-token branch on the application's own binary (ADR-0035, ADR-0055) |
| [code-intelligence-bundle.md](code-intelligence-bundle.md) | — | 2026-09-06 | the bundled code-intelligence runtime: what it costs, and that it fetches its servers at first use (IC-7) |
| [commit-on-the-publish-path.md](commit-on-the-publish-path.md) | 21 | 2026-09-02 | the transaction commit and the WAL checkpoint on the publish path |
| [corrected-restore-rerun.md](corrected-restore-rerun.md) | — | 2026-09-02 | the corrected restore, re-run — discharges IC-1 |
| [credential-protection.md](credential-protection.md) | — | 2026-09-05 | the credential file's protection on Windows: apply, read back, and what survives |
| [ipc-hop-latency.md](ipc-hop-latency.md) | 10 | 2026-09-01 | the run-host → main → renderer double hop |
| [machine-identifier-rename.md](machine-identifier-rename.md) | — | 2026-09-03 | the machine identifier under a real rename, and the foreign-lock report as one condition (IC-4) |
| [mcp-console-suppression.md](mcp-console-suppression.md) | item 4 | 2026-09-05 | no console window at any point, on the packaged build |
| [mcp-negotiation.md](mcp-negotiation.md) | item 3 | 2026-09-05 | protocol version negotiation over `OwnedStdioTransport` (the spike is the regression test) |
| [native-load-proof.md](native-load-proof.md) | — | 2026-09-04 | the build's load proof, and the first packaging of the product (IC-6) |
| [packaged-first-paint.md](packaged-first-paint.md) | 17 | 2026-09-01 | launch to first paint on the packaged Windows artifacts — it triggered SR-7 |
| [power-loss.md](power-loss.md) | — | 2026-09-04 | the power-loss test (OQ-12): the harness half; the fault half awaits the owner |
| [presenter-liveness-and-instance-claim.md](presenter-liveness-and-instance-claim.md) | 14 and 16 | 2026-09-02 | the wedged presenter, and the single-instance claim on Windows |
| [remote-and-synchronised-storage.md](remote-and-synchronised-storage.md) | 19 | 2026-09-02 | the store and exclusive-create locking on remote and synchronised storage |
| [renderer-invariance-and-benchmark-cadence.md](renderer-invariance-and-benchmark-cadence.md) | 1 | 2026-08-31 | element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase |
| [responses-dialect.md](responses-dialect.md) | 6 | 2026-09-03 | the Responses dialect through the AI SDK, against a non-vendor base URL |
| [store-schema-and-open-path.md](store-schema-and-open-path.md) | 8 | 2026-09-03 | the store against its declared indexes, the open path, log recovery, the integrity check, long paths |
| [theme-proof.md](theme-proof.md) | — | 2026-09-04 | three palettes from rendered pixels — the record of `pnpm theme-proof` |
| [traceability-scale.md](traceability-scale.md) | 7 | 2026-09-09 | the traceability engine at `REQ-TRACE-300`'s scale |
| [two-writers-one-store.md](two-writers-one-store.md) | 18 | 2026-09-03 | two writer processes on one store |
| [windows-writer-handle-compaction.md](windows-writer-handle-compaction.md) | 9 | 2026-08-31 | the writer's own handle, and what a follower sees across a compaction (withdrawn) |

## Where a new report goes

One file named for what it measured — `<slug>.md` — linked from the table above, in the same commit as the work that
took the spike, and answering to §12's register. A report over the document budget splits into `<slug>.md` and
`<slug>/` like any other document. [`tools/folder-indexes.test.ts`](../../../tools/folder-indexes.test.ts) fails
`pnpm test` when a report in this folder is in neither this table nor a parts folder of it.
