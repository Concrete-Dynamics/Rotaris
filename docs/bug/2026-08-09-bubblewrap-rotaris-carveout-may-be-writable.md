# A missing `.rotaris` carve-out may let a sandboxed agent widen its own sandbox (bubblewrap)

> Found: 2026-08-09, while writing the SWR-2507 manual verification protocol.
> Status: **unverified prediction from reading the code.** Test S7b of
> `docs/testing/sandbox-verification-protocol.md` exists to settle it. Verify before fixing.
> Severity if real: **high** — self-widening confinement is the classic sandbox escape shape.

## The reasoning

`build_bubblewrap_argv` (`src/rotaris_core/sandbox/backends.py`) emits, in order:

1. `--ro-bind / /` — everything read-only,
2. `--bind <workspace_root> <workspace_root>` — the workspace writable,
3. `--ro-bind-try <workspace_root>/.rotaris ...` — the control directory back to read-only.

Step 3 uses the `-try` variant, which silently does nothing when the source path does not
exist. Its docstring argues that a missing source is safe "because the enclosing
`--ro-bind / /` already covers the path". **That enclosing bind is shadowed by step 2**,
which re-mounts the whole workspace subtree writable — `.rotaris` included.

So on a workspace where `.rotaris` does not yet exist, the agent may be able to create it
and write its own `agents.yaml`, hook definitions or permission configuration — which the
*next* run would read as its own policy. A fresh SWR-2404 worktree is exactly this case: by
the same file's docstring, a new worktree has no `.rotaris`.

Seatbelt should not share the problem: its rule is a path pattern evaluated per access, so
it does not depend on the directory existing at profile-build time. **A divergence between
the two backends is itself a defect** — the same configuration must confine the same way on
both, or the protocol's results do not transfer between platforms.

## What a fix would look like

Create the carve-out directory before building the argv, or express the exclusion in a way
that does not depend on the path existing (bind an empty read-only tmpfs over it), and add
a backend-parity test asserting both backends refuse the same write.

## How to confirm

Follow step S7b of `docs/testing/sandbox-verification-protocol.md` on WSL2 with a workspace
that has no `.rotaris` directory.

## What changed in code (2026-08-09) — status still **unverified**

Fixed on `unit/f5-sandbox-probe-carveout`. The status above does **not** change: the fix was
verified by reading the mount semantics and by asserting the rendered argv, never by running
`bwrap`. **Step S7b still has to be run on a real WSL2 host, and on macOS for the parity
half, before this report can be closed.**

- `build_bubblewrap_argv` now renders a carve-out three ways instead of one:
  - **not inside any writable root** (`read-only` mode) → nothing, because there the enclosing
    `--ro-bind / /` genuinely is the whole story and no later bind shadows it;
  - **inside a writable root, source present** → `--ro-bind-try` as before, which keeps the
    contents readable so `git status` still works inside the sandbox (protocol step S5);
  - **inside a writable root, source absent** → `--tmpfs` plus `--remount-ro`, an empty
    read-only filesystem mounted over the name. Nothing to read, nothing creatable.
- The docstring's old claim — that a skipped `--ro-bind-try` was safe because `--ro-bind / /`
  covered the path — is gone, replaced by the reason it was wrong.

**A new artefact that S7b should check for.** `bwrap` has to create a mount point before
mounting a tmpfs over it, and the writable bind shares inodes with the host, so the empty
directory very likely survives the sandbox: a workspace with no `.git` would gain an empty
`.git/`. Bubblewrap offers no way to mount at a path without creating it, so the trade was
made deliberately — an empty directory is recoverable, a sandbox that can widen itself is
not — but whether it actually happens, and what it breaks (repository-root detection walks
`.git`), is unconfirmed. Record it when running S7b.

The durable deliverable is the backend-parity test in
`tests/unit/test_sandbox_backends.py`: two small readers model the rule each mechanism
applies (bubblewrap replays mounts in order, Seatbelt replays last-match-wins SBPL) and the
test asserts one dict over both backends, so a divergence names which backend diverged. A
control asserts both still allow ordinary work in the workspace, and a meta-test proves the
bubblewrap reader can actually see the original hole. The readers model the mechanisms; they
do not run them, which is exactly why S7b is still required.
