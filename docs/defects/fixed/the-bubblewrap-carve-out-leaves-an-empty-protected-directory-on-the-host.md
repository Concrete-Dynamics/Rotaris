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

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067, by REQ-SANDBOX-077's own fallback. A mount that creates no mountpoint does not
exist: a name absent under a directory bound in from the host can be hidden only by a mount at that name, and the
mount needs the name to exist first. So the Linux renderer no longer renders case (c). `bwrapTokens`
(`packages/agent-tools/src/confinement/render-bwrap.ts`) now throws REQ-SANDBOX-083's `SandboxUnavailableError`
whenever the specification holds an absent carve-out. The error names each absent path. The terminal enforcement
point turns it into the `sandbox_unavailable` refusal (exit 126) for that one command, and the next command is
rendered afresh (REQ-SANDBOX-078). The error class moved to `confinement/errors.ts` so the renderer can throw it
without importing the barrel that imports the renderer. The falsified reason stays in the renderer's comment next to
its replacement. The shared specification is unchanged, and so is Seatbelt: it denies the absent name by rule and
creates nothing.

Pinned by:

- `confinement.test.ts`: "case (c) is refused, never rendered as a mount that bubblewrap would create on the host",
  "case (c) under bubblewrap refuses the command through the wrap…", and the parity case, which now expects the
  refusal.
- `terminal.test.ts`: "REQ-SANDBOX-077, -078, -083: under bubblewrap a root missing a protected name refuses the
  command, runs nothing and creates neither name", for a foreground command and a background one.

All four fail on the code before the repair.

`sandbox-proof` scenario 6 now measures the six effects with `.git` present in both network postures, and adds a
third confined launch, `effects-absent-git`. That launch runs as root under Xvfb with bubblewrap 0.9.0. Both commands
were refused with `sandbox_unavailable` and 126 (read from the store's `tool_calls`), nothing ran, and `.git` was
still absent on the host afterwards. The whole proof exits 0.

The consequence is severe enough that it is raised as
[OQ-140](../../architecture/open-questions.md): on Linux, every confined command in a root that lacks `.git` or
`.rotaris` is refused. Seatbelt runs those commands. IC-8 records the measurement in place.
