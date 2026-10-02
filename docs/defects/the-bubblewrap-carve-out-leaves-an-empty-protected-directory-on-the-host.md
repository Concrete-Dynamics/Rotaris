## The bubblewrap carve-out for an absent `.git` or `.rotaris` leaves an empty directory on the host

When a protected subpath is absent inside a writable root, REQ-SANDBOX-077 case (c) applies. The Linux renderer then
emits `--tmpfs <p> --remount-ro <p>` (`packages/agent-tools/src/confinement/render-bwrap.ts`). To mount a tmpfs at a
path that does not exist, bubblewrap first creates the mountpoint. That path lies under a writable root the host bound
in with `--bind`, so the new directory is created **on the host**. The command runs with the name empty and read-only,
as intended. When it ends, an empty `<root>/.git` remains on the host, and the next command in the same session renders
case (b) against that directory instead of case (c).

Measured 2026-09-28 by `sandbox-proof` scenario 6 (IC-8's first Linux execution), as root under Xvfb, bubblewrap
0.9.0 on Ubuntu 24.04. In the `effects-network-denied` workspace, which had no `.git`, the confined
`mkdir -p .git/hooks; echo planted > .git/planted` was refused (`exit=2`, nothing written under the name). Afterwards
the host held `.git` as an empty directory. The same residue appears by hand with no application involved:
`bwrap --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp --bind $D $D --tmpfs $D/.git --remount-ro $D/.git -- /bin/sh -c 'echo x > .git/p'`
leaves `$D/.git`. The renderer's own header claims that "both options live in the confined process's own mount view
and leave nothing on the host". The measurement falsifies that claim.

## Specs

This contradicts REQ-SANDBOX-077's closing paragraph: "a protected subpath absent under case (c) is still absent
afterwards and no empty directory remains for anything to clean up. A backend that cannot establish a carve-out
without creating a host-visible file or directory SHALL NOT create one; it refuses the command under REQ-SANDBOX-083
instead." It also contradicts REQ-SANDBOX-061's parity reading and REQ-SANDBOX-127's third effect as that requirement
cites REQ-SANDBOX-077. The write under the name was refused, so REQ-SANDBOX-056's hook-installation concern holds. The
host-visible residue is the part that fails.

## Relevant files

- `packages/agent-tools/src/confinement/render-bwrap.ts`: case (c)'s `--tmpfs`/`--remount-ro` pair and the comment the measurement falsifies.
- `packages/agent-tools/src/confinement/spec.ts`: where the carve-out case is chosen.
- `apps/desktop/scripts/sandbox-proof.mjs`: scenario 6's `absentGitStaysAbsent`, which is red until this is repaired.
- `docs/architecture/implementation-conditions.md`: IC-8, where the measurement is recorded.

Noticed 2026-09-28 under R-062 while taking IC-8's first Linux execution. Not repaired. The task that found it
covered the harness only. A repair has to choose between a mount that creates no mountpoint (for example, a writable
bind of the root's parent arranged so the name is shadowed without being created) and REQ-SANDBOX-077's fallback of
refusing the command. That is a renderer decision, and it is measured by this same scenario.
