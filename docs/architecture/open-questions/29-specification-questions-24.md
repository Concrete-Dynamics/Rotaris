# Open questions — Specification questions (24 of 27)

Part 29 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-140; OQ-135 – OQ-139 archived in [the archive](../../archive/architecture/open-questions/29-specification-questions-24.md).

- OQ-135 — Does `send_signal SIGINT` owe the session's stop when the shell discards the signal?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/29-specification-questions-24.md#oq-135)
- OQ-136 — How long does an empty poll wait for a soft-paused command?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/29-specification-questions-24.md#oq-136)
- OQ-137 — Does choosing `plan` in the Settings Runtime category re-arm a released session?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/29-specification-questions-24.md#oq-137)
- OQ-138 — Do the tool results whose requirements spell a plural marker keep it, when the tool row draws them?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/29-specification-questions-24.md#oq-138)
- OQ-139 — May a `write_file` call with no `operation` be read as the one operation its other arguments allow?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/29-specification-questions-24.md#oq-139)

**OQ-140 — Under bubblewrap, does a writable root that lacks `.git` or `.rotaris` refuse every confined command?**
*(REQ-SANDBOX-077: its case (c) renders `--tmpfs <p> --remount-ro <p>`, and its closing paragraph refuses, under
REQ-SANDBOX-083, a carve-out that cannot be established without a host-visible directory. Also REQ-SANDBOX-061's
backend parity, REQ-SANDBOX-127's first effect, and REQ-TOOLS-123. Raised 2026-09-29 by the repair of
[`the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md`](../../defects/fixed/the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md)
under [R-067](../../product/requests.md#r-067). Open.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

IC-8's first Linux execution measured that the rendering case (c) names cannot meet the closing paragraph of its own
requirement. bubblewrap creates a mountpoint before it mounts. Under a writable root bound in from the host, that
mountpoint is created on the host. No mount arrangement avoids this: a name that does not exist can be hidden only by a
mount at that name. Two alternatives were weighed and rejected:

- An overlay needs a work directory on the host's filesystem.
- Binding the root read-only and its children writable refuses every new file at the root's top level.

On Linux, case (c) can therefore only be refused. The two requirements disagree about the Linux case: REQ-SANDBOX-077
describes that case as running, with "the name reads as empty", while REQ-SANDBOX-061 requires the same write verdicts
on both platforms.

**What the build proceeds under:** the closing paragraph's fallback. ADR-0022's consequence 3 and OQ-7's closure had
already chosen it as the fail-closed reading. The renderer throws `SandboxUnavailableError`, and the terminal refuses
that one command with `sandbox_unavailable`, 126, and a cause naming each absent path. The session goes on
(REQ-SANDBOX-078). Nothing is created on the host.

**What that costs, stated so it is not discovered later.** On Linux, with an active mode that grants writable roots,
every command is refused while any effective writable root lacks either name:

- a workspace that is not a Git repository;
- a session worktree (`<workspace>/.rotaris/worktrees/<id>`), unless the repository tracks `.rotaris`;
- any configured additional root (REQ-SANDBOX-058), since an ordinary directory holds neither name.

The specification computes a carve-out per writable root. REQ-SANDBOX-056 speaks of "workspace-relative subpaths".
Under Seatbelt all of these commands run, and only the write under the absent name is denied.

**What a ruling decides.** One of three things:

1. Accept the Linux limit as the refusal now reads, and say it where the user meets it.
2. Amend REQ-SANDBOX-077 so that bubblewrap may create the empty name. Its content is never writable, but it
   stays on the host.
3. Narrow the carve-outs to the workspace-relative names REQ-SANDBOX-056 states, so that a configured additional
   root carries none.
