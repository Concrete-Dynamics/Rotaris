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

## Repaired — 2026-10-31

*Falsified by the repair: "the size the release feed states for the asset (`FeedAsset.size`) is used only for the
progress label" no longer holds; it is also the bound below.*

REQ-STARTUP-169's bound. `streamInChunks` counts what it has received, and when a non-zero `claimedTotal` would be
exceeded by the next piece it ends the transfer before buffering any of that piece, so not one byte past the stated size
reaches the staging file. Returning out of the loop closes the body's iterator, which ends the transfer. The outcome is
a new `why`, `oversized`, kept apart from `read` because REQ-STARTUP-179 counts an oversized transfer among the integrity
refusals and not the transport failures. `runInstall` words it in its own sentence,
`<name> is larger than the <size> bytes the release feed states for it; the download was ended and discarded, and nothing was installed`,
at the `download` stage, and discards the partial file and the staging directory as on any other download failure. A
claimed size of 0 stays unbounded (REQ-STARTUP-118's `{N} MB`).

Pinned in `download.test.ts` and `install.test.ts` over fakes; never run against a real oversized response. REQ-STARTUP-179's
"not retried for that release by the same process" belongs to the background path, which is not built (the background-update
plan's PR-4). Today an install is started only by the user's click, and no refusal is retried automatically.

*Corrected 2026-10-31, in review of that repair: "kept apart from `read`" did not hold for a body whose close rejects.
Returning out of the loop closes the iterator, a cancelled web stream (what `updater/electron.ts` hands in) can reject as
it closes with `net::ERR_CONNECTION_RESET`, and the `catch` then reported the refusal as `read`, so `install.ts` showed
"ended early" rather than the bound's sentence. The bound itself held: no byte past it was written. `streamInChunks` now
carries the reason it ended a transfer (`oversized`, `write`, `aborted`) across the close; a body that fails on its own
is still `read`. Pinned in `download.test.ts` over a fake body that rejects on close.*
