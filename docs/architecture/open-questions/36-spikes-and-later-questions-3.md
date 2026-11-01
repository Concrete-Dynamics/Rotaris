# Open questions — Spikes, and the questions raised since (3 of 35)

Part 36 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds no live entry; OQ-148 – OQ-150, OQ-157 – OQ-160 archived in [the archive](../../archive/architecture/open-questions/36-spikes-and-later-questions-3.md).

**Not a numbered spike, and deliberately so: a build-host obligation ADR-0056 creates.** Rule 4 of that
record requires a **build-time proof that each native binding loads under the shipped Electron binary,
from the packaged tree**, failing the build if it does not. It is the only check anywhere in the record
that catches an unloadable store binding, and the reason is an asymmetry worth stating once:
`REQ-STARTUP-156`'s release gate observes **first paint**, first paint does not open a store (ADR-0055
keeps the workspace read off the critical path, ADR-0058 opens after show), so **an artifact with an
unloadable store binding passes the release gate** — the property that makes the failure graceful is the
same property that makes the gate blind to it. The proof must run against the packaged tree under the
Electron binary that tree carries: run against `node_modules` in the checkout it proves nothing about
asar unpacking, and run under the host Node it passes on exactly the artifact that fails. **A proof
written the easy way is worse than none, because it reads as verified.** Somebody must establish that it
is constructible on all three release runners before it is relied on as the only defence.

- OQ-148 — In what order are children held on one `models:` key released when they belong to different sessions?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/36-spikes-and-later-questions-3.md#oq-148)
- OQ-149 — Does a paused child keep its slot on a `models:` entry while its session rests, against other sessions?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/36-spikes-and-later-questions-3.md#oq-149)
- OQ-150 — Is one `models:` key in two workspaces one entry for the per-model cap?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/36-spikes-and-later-questions-3.md#oq-150)
- OQ-157 — Which word, or which other record, takes each fact the product writes to the timeline under a name no vocabulary has?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/36-spikes-and-later-questions-3.md#oq-157)
- OQ-158 — May a child be renamed off a root's name when no sibling under its parent holds that name?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/36-spikes-and-later-questions-3.md#oq-158)
- OQ-159 — Is the run-level agent's tool-call count its own, or the run's aggregate?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/36-spikes-and-later-questions-3.md#oq-159)
- OQ-160 — Does the sidebar's "Last run failed: {message}" carry the failed task's whole output, or a bounded form of it?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/36-spikes-and-later-questions-3.md#oq-160)
