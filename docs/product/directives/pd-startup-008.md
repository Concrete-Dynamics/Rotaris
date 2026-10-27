[Product directives](../directives.md) › PD-STARTUP-008

<a id="pd-startup-008"></a>

### PD-STARTUP-008 — an update downloads by itself and takes effect at the next start or by `Restart now`

**The directive.** On a supported standalone build, an update the release feed offers SHALL be downloaded in the background
with no click, shown with its progress and a cancel action, verified, kept as the pending update, verified again from the
retained bytes, and applied at the next start or when the user chooses `Restart now` — never by a restart, a close, an
installer or a modal the product starts on its own while it runs, and never at quit. REQ-STARTUP-169 to REQ-STARTUP-181
carry that behaviour; they were minted with this directive at the owner's ask and are marked *decided, not derived* at their
heading. This directive states which derived requirements they displace, and the case in which each is displaced:

1. **REQ-STARTUP-114** — a cancel of the running download is not a second update operation and is never refused.
2. **REQ-STARTUP-116** — an offered version that is neither waved off nor cancelled is not presented with `Update now`
   before its download; the notice that appears is the download's (REQ-STARTUP-169, REQ-STARTUP-170).
3. **REQ-STARTUP-119** — after a verified download the installed flavour shows REQ-STARTUP-174's ready notice with
   `Restart now`, not `Finish the update`, and no window closes on its own; the 1200 ms auto-close no longer governs there.
4. **REQ-STARTUP-121** — `Restart now` is also offered on the installed flavour's ready notice, where it starts the verified
   installer and the updated installation follows it. The portable's hand-over is unchanged.
5. **REQ-STARTUP-122** — the sequence pauses after the digest comparison: the download is kept as the pending update in
   per-user storage rather than a fresh temporary directory (REQ-STARTUP-171), verified again before the apply
   (REQ-STARTUP-172), and applied at the next start or by `Restart now`. The order up to the digest is unchanged.
6. **REQ-STARTUP-125** — the installed flavour's installer is started without its pages, at the next start or by `Restart
   now`, and the updated installation is started when it completes (REQ-STARTUP-173). The portable's path names a complete
   executable at every instant (REQ-STARTUP-176); the order "renamed to `<name>.old`, then moved in" no longer governs where
   it leaves the path empty.
7. **REQ-STARTUP-127** — the installed flavour's ready notice does tell the user to restart before its hand-off.
8. **REQ-STARTUP-155** — the launch that applies a pending installed-flavour update is exempt from the first-paint bound for
   that apply alone (REQ-STARTUP-173).
9. **REQ-STARTUP-017** — a silent installation the updater starts launches the updated application when it completes; one
   started any other way still never does.
10. **REQ-NOTIFY-044** — the action vocabulary gains exactly one member: cancel the running update download.
11. **REQ-NOTIFY-215** — the notice for a newer version is the download's, with no install action before the download.
12. **REQ-NOTIFY-222** — an installed-flavour update that has downloaded publishes the ready notice with the restart action;
    the window does not close on its own.

The notice surface's own case — REQ-SHELL-118's download notice and REQ-SHELL-115's action list — is
[`PD-SHELL-005`](pd-shell-005.md#pd-shell-005)'s, revised for this request rather than narrowed a second time.

**Reserved to the owner.** The decisions UD-1 to UD-12 of
[`../architecture/background-update-plan.md`](../../architecture/background-update-plan.md) §6 are not taken here, and no
build implements a clause that names one before it is. A ruling that departs from a requirement this directive does not
name — REQ-STARTUP-117, REQ-SHELL-114 and REQ-NOTIFY-216 on dismissing (UD-3), REQ-STARTUP-146 and REQ-SHELL-006 should a
preference be wanted (UD-1) — revises this directive and names it.

**What is unchanged.** REQ-STARTUP-105 to REQ-STARTUP-113, REQ-STARTUP-123, REQ-STARTUP-124, REQ-STARTUP-126,
REQ-STARTUP-167 and REQ-STARTUP-168: one endpoint and no way to disable the check; exact names and the order; the signature
verified before the manifest is parsed and before any asset byte is fetched; the 1 MiB bound on the small reads and the
chunked digest; no override. ADR-0054's bespoke updater (Alternative B) stays, and `electron-updater` stays rejected; its
install-at-quit pattern is not this directive. `PD-STARTUP-001`, IC-3 and IC-8 stand: Windows x64 alone.

**Why, and what it costs.** The owner wants Rotaris installable from a release and kept current the way current desktop
assistants are: the new build arrives by itself and is used the next time the application starts, or at once when the user
asks, and work in progress is never cut off by it. The derived requirements put a click before the download and the apply
straight after it, which on the installed flavour closes every window within 1200 ms of a download the user may have
forgotten starting. What it costs: bandwidth spent without asking (UD-1); one installer's worth of disk held between the
download and the next start; a new per-user record; on the installed flavour, a first start after an update that is slower
by the installer's run; and a never-bricks guarantee for that flavour that rests on the installer's own over-install
behaviour, which nobody has measured (UD-12).

**Recorded, not built.** Scheduled after the dependency remediation in the stages of the plan; the first execution is owed
to the stage that builds it.

> **Narrows:** REQ-STARTUP-017, REQ-STARTUP-114, REQ-STARTUP-116, REQ-STARTUP-119, REQ-STARTUP-121, REQ-STARTUP-122, REQ-STARTUP-125, REQ-STARTUP-127, REQ-STARTUP-155, REQ-NOTIFY-044, REQ-NOTIFY-215, REQ-NOTIFY-222

*Raised by the owner, 2026-10-22; logged as [R-084](../requests.md#r-084).*
