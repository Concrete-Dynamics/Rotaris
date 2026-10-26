# IC-8 — the confinement backends are written but not proven; the rendering is not the contract (PROPOSED 2026-09-15)

*Part of the register [`implementation-conditions.md`](../implementation-conditions.md), which states how an entry binds. Moved here verbatim on 2026-10-26 ([R-087](../../product/requests.md#r-087)); only relative links were re-pointed. Its status is the index's table.*

**Raised by:** ADR-0022's first execution (Part AR, 2026-09-15). **Binds:** the two per-platform
renderers and any claim that OS-level confinement works.

`REQ-SANDBOX-127` states it in terms that leave no room to read them down:

> The rendered invocation is a means, not the contract. A confinement backend SHALL be judged
> conformant only by the observable effect on a live process on a real host of the platform
> concerned, and a rendering that matches `REQ-SANDBOX-075` to `REQ-SANDBOX-079` word for word but
> does not produce that effect is non-conformant. … No backend may be reported `available` on the
> strength of a rendered string alone, and no substitute or emulated backend may satisfy this check
> on behalf of an absent one.

The six effects it enumerates, each to be demonstrated on **each** supported platform under an active
mode: a write inside an effective writable root succeeds; a write outside every writable root and
outside the platform's temporary locations is refused; a write under `<root>/.git` or
`<root>/.rotaris` is refused **whether or not the subpath existed beforehand**; a read outside every
writable root succeeds; an outbound socket is refused while `runtime.sandbox_allow_network` is false
and succeeds while it is true; and the working directory the command observes is unchanged.

**None of the six has been demonstrated.** The build host is `win32`, which `REQ-SANDBOX-065` places
outside the closed two-member platform set, so the product on this machine correctly reports
`available: false` and every run that asks for confinement is refused before it starts. That path
**is** proven — `pnpm sandbox-proof`, five scenarios — and it is the path ESC-6 ruled the first
release accepts. What is not proven is the other path.

**What has been done instead, stated plainly so it is not mistaken for the check.** The shared
specification, the quoting and both renderers carry unit tests over their exact output: the bubblewrap
option sequence including all three carve-out cases of `REQ-SANDBOX-077`, the Seatbelt profile
including the denials-after-allowances rule of `REQ-SANDBOX-075`, both trial invocations including
`REQ-SANDBOX-070`'s final `-- /bin/sh -c 'true'`, and property tests over hostile paths for
`REQ-SANDBOX-064`. These establish that the product renders what the specification says to render.
`REQ-SANDBOX-127` says in advance that this is not the same claim.

**This condition binds the work it names.** The two renderers may not be reported complete, and no
conformance claim may be made for either backend, until the six effects have been run on a real macOS
host and a real Linux host and **the result recorded here whether or not it passed**. No agent may
downgrade it while doing the work.

**Its shape is IC-3's.** Both wait on hosts this project does not have; ESC-6 option 2 already named
extending `REQ-SANDBOX-127`'s obligation to a further continuous-integration platform as the real
cost of admitting one. If the owner wants the renderers proven rather than written, that is the same
hardware decision, and it is theirs.

## First execution on Linux — 2026-09-28 (R-062): the six effects held; the absent-subpath residue that the third one cites failed REQ-SANDBOX-077

**Not discharged, and this measurement cannot discharge it.** IC-8 requires the six effects on a real macOS host
**and** a real Linux host. This section covers Linux only, and one of the checks failed. The condition stands as
written above.

**What ran.** `pnpm sandbox-proof` scenario 6 was added for this measurement
([`the fixed note`](../../defects/fixed/sandbox-proof-asserts-the-windows-verdict-on-every-platform.md)). Each effect is
one `terminal` call from a scripted agent in an unattended run with `sandbox_mode: workspace-write`. That call goes
through ADR-0022's enforcement point in the built application, exactly as a model's call would. Every verdict is read
from the **host** side after the run: what exists on disk, and what a listener in a separate host process accepted.
The confined command's own report is kept only as the explanation. There were two launches. In the first,
`sandbox_allow_network: false` and `.git` was absent beforehand. In the second, `sandbox_allow_network: true` and
`.git` was present beforehand. `.rotaris` was present in both.

**The host.** Ubuntu 24.04.4 in a virtual machine (kernel `6.18.44-fc-v37`), running as **root** under Xvfb, Node 24. bubblewrap
0.9.0 was installed through the proxy for this measurement. It was not on the host before, and without it the
product correctly reported the launcher-missing verdict and refused the confined run. The product's own trial
reported `confinement: available (bubblewrap)`, and so did the proof's independent trial.

| REQ-SANDBOX-127 effect | network denied, `.git` absent | network allowed, `.git` present |
| --- | --- | --- |
| a write inside the effective writable root succeeds | held | held |
| a write outside every root and every temporary location is refused | held (`exit=2`, nothing on the host) | held |
| a write under `<root>/.git` is refused | held (`exit=2`, nothing under the name) | held |
| a write under `<root>/.rotaris` is refused (present before) | held | held |
| a read outside every writable root succeeds | held | held |
| an outbound socket is refused while the network is off, and succeeds while it is on | held (`ECONNREFUSED`; the host listener accepted 0) | held (`pong`; the host listener accepted 1) |
| the working directory the command observes is unchanged | held | held |
| REQ-SANDBOX-077 (c): an absent protected subpath is still absent afterwards | **FAILED**: an empty `.git` directory remained on the host | not applicable (present before) |

**What it found.** One defect, in the product. To mount case (c)'s tmpfs, bubblewrap creates the mountpoint, and it
creates it through the writable bind, so it lands on the host. The write under the name was refused, which means a
hook cannot be planted. But the name now exists on the host, and REQ-SANDBOX-077 says in so many words that it must
not. The renderer's comment says both options "leave nothing on the host". That reason is falsified and is kept where
it stands until the repair replaces it:
[`the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md`](../../defects/fixed/the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md).
~~The proof stays red on a Linux host with `bwrap` until the defect is repaired.~~ *(Repaired 2026-09-29; see below.)*

**What it could not show, stated so it is not read as shown.**

- **macOS.** Nothing here touches Seatbelt.
- **An unprivileged user.** The run was as root, so bubblewrap needed no unprivileged user namespace. This does not
  measure the AppArmor userns restriction that Ubuntu 24.04 applies to ordinary users, which is the path most Linux
  users meet. That path is REQ-SANDBOX-073's trial-failure verdict, and it was not reached.
- **`read-only` mode.** Only `workspace-write` ran.
- **Configured writable roots beyond the workspace.**
- **`.rotaris` absent beforehand.** The configuration lives there, so it was present in both launches. Case (c) was
  measured on `.git` only.
- **The network effect against a destination off the machine.** The listener was on the host's loopback. The
  "denied" reading shows a separate network namespace, and the "allowed" reading shows the host's own. Outbound
  traffic from this VM goes through a proxy, so a remote destination would have measured the proxy.

**What the proof checks on every host.** It now reads the host's own verdict and checks the product against it:
`win32`, launcher missing, trial failed, or available. So `pnpm sandbox-proof` is the check this condition names on
Linux and on macOS, and on win32 it is still ESC-6's path.

## Linux again — 2026-09-29 (R-067): the absent-subpath case is refused, and nothing remains on the host

**Not discharged.** The macOS half has still not run.

**The repair.** The 2026-09-28 measurement falsified the renderer's reason for case (c): "both options live in the
confined process's own mount view and leave nothing on the host". It stays in `render-bwrap.ts`, beside what replaced
it. There is no mount arrangement that hides an absent name without a mountpoint at that name, so case (c) is no
longer rendered on Linux. The renderer refuses the command under REQ-SANDBOX-083, which is REQ-SANDBOX-077's own
fallback, and names each absent path in the cause. The consequence is raised as
[OQ-140](../open-questions.md): on Linux, a writable root that lacks `.git` or `.rotaris` refuses every confined command,
while Seatbelt runs them.

**What ran.** `pnpm sandbox-proof`, as root under Xvfb, Node 24, bubblewrap 0.9.0, on the same kind of host as
before (kernel `6.18.44-fc-v50`). There were three confined launches. The first two ran the six effects with `.git`
present, one with the network denied and one with it allowed. The third, `effects-absent-git`, ran with the network
denied, `.git` absent and `.rotaris` present, and made two `terminal` calls: the `.git` plant and a write inside the
root. The whole proof exited 0. The same proof on the code before the repair exited non-zero on
`denied.absentGitStaysAbsent`, because an empty `.git` directory remained on the host.

| REQ-SANDBOX-127 effect | network denied, `.git` present | network allowed, `.git` present | `.git` absent (`effects-absent-git`) |
| --- | --- | --- | --- |
| a write inside the effective writable root succeeds | held | held | refused with the command (below) |
| a write outside every root and every temporary location is refused | held | held | not run |
| a write under `<root>/.git` is refused | held (`exit=2`) | held (`exit=2`) | held: the command never ran |
| a write under `<root>/.rotaris` is refused (present before) | held | held | not run |
| a read outside every writable root succeeds | held | held | not run |
| an outbound socket is refused while the network is off, and succeeds while it is on | held (the host accepted 0) | held (`pong`; the host accepted 1) | not run |
| the working directory the command observes is unchanged | held | held | not run |
| REQ-SANDBOX-077 (c): each command is refused (`sandbox_unavailable`, 126), and nothing runs | — | — | **held**: 2 of 2 refused, read from the store's `tool_calls`; the cause names `<root>/.git` |
| REQ-SANDBOX-077 (c): an absent protected subpath is still absent afterwards | — | — | **held**: absent |

**What it could not show, beyond the list above.** `.rotaris` absent was still not measured live, because the
configuration lives there. It takes the same code path as `.git`, which the unit tests pin with both names absent.
A configured additional root was not measured either. Under this repair such a root refuses every command, and OQ-140
names that.

*2026-10-21 (the Windows ARM64 session's D3; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, built at `dbf6a514`): `pnpm sandbox-proof`'s win32 path was re-run and passed — the outside verdict, the refusal before start, the disabled launch control, `effects.applicable` false. **IC-8 stays undischarged**: it needs the six effects on a real macOS and a real Linux host, and Windows has no confinement to measure (ADR-0022, its last paragraph).*
