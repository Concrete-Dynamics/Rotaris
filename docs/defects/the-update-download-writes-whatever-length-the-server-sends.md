## The update download writes whatever length the server sends

Noticed 2026-10-22 while reading the updater for R-084's plan; read, not run. `streamInChunks` writes every byte of the
asset's response body to the staging file and hashes it, with no bound: the size the release feed states for the asset
(`FeedAsset.size`) is used only for the progress label. A response that does not end — a misbehaving storage host, or one
an attacker on the path controls — is written to disk until the disk fills or the process quits, and only then could the
digest refuse it. The manifest and its signature are bounded (1 MiB, `install.ts`'s `SMALL_RESPONSE_LIMIT`); the asset is
not. The digest check still guarantees nothing unverified is installed; what is unbounded is the disk the attempt can use.

## Specs

- None directly: REQ-STARTUP-124 fixes the chunk size and the write-failure sentence and says nothing of a bound.
  REQ-STARTUP-169 (decided, R-084) adds one: no more bytes than the stated non-zero size, the excess treated as a failed
  download.

## Relevant files

- `apps/desktop/src/main/updater/download.ts` — `streamInChunks`, the unbounded loop.
- `apps/desktop/src/main/updater/install.ts` — `runInstall` passes `offer.asset.size` only as the progress total.
