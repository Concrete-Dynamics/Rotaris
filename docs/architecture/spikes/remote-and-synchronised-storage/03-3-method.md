# Spike — the store and exclusive-create locking on remote and synchronised storage — 3. Method

Part 3 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

## 3. Method

Fourteen throwaway harnesses, all under the scratchpad, all named in section 12. Common shape: a runner
that seeds a database through the `local` spelling (so every arm starts byte-identical), spawns one or
more separate Node processes that reach the file through a chosen spelling, waits for them to exit, then
verifies through a read-**write** open (which forces WAL recovery, so a verifier cannot mistake
"invisible to me" for "lost").

Every writer row carries a payload and a checksum computed over it, so torn content is distinguishable
from missing content. Every verification runs `PRAGMA integrity_check` as well as a row count, because a
count alone cannot tell corruption from loss.

**One methodological correction is recorded because it changes what the numbers mean.** The first pass
verified with `new Database(path, { readonly: true })`. A read-only connection to a WAL database cannot
create the `-shm` it needs, so it can report zero rows for a database whose WAL is full of them. Every
figure below comes from the corrected read-write verifier. The superseded run is kept at
`d-results.json` and must not be quoted.

---
