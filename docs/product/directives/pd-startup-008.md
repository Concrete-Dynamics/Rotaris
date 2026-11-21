[Product directives](../directives.md) › PD-STARTUP-008

<a id="pd-startup-008"></a>

### PD-STARTUP-008 — an update downloads by itself and takes effect at the next start or by `Restart now`

*Revision 2 (2026-11-21, [R-117](../requests.md#r-117)) — **the owner rules UD-1 to UD-12, and the AppImage joins the
background path**: the "Reserved to the owner" paragraph is replaced by "The owner's rulings", REQ-STARTUP-117,
REQ-SHELL-114 and REQ-NOTIFY-216 join the Narrows list for UD-3, and the platform sentence of "What is unchanged" is
replaced. Revision 1's text is kept below where it no longer governs.*

*Revision 3 (2026-11-21, [R-072](../requests.md#r-072), the rulings of [OQ-553](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-553),
[OQ-554](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-554) and [OQ-555](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-555), for [R-117](../requests.md#r-117)) — **the
in-place ready notice, which of the update's states take the banner back, and an integrity refusal with no retry**: items
13 to 15 are added below the list, ruled by the consortium under the owner's delegation, and REQ-STARTUP-174,
REQ-STARTUP-120 and REQ-NOTIFY-221 join the Narrows list. Items 1 to 12 and the owner's rulings UD-1 to UD-12 stand
unchanged.*

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
13. **REQ-STARTUP-174** — *revision 3.* Where the target was replaced in place (UD-8), the ready notice is titled
    `Update installed` (REQ-STARTUP-119, REQ-STARTUP-121) and conveys that the named version has been downloaded, verified
    and installed, that it runs the next time Rotaris starts, and that `Restart now` runs it now, in place of "will be
    installed the next time Rotaris starts" (OQ-553). Where the update notice is not the current notice when the pending
    update is verified, it does not become the ready notice and nothing is published: the title-bar indicator of
    [`PD-SHELL-018`](pd-shell-018.md#pd-shell-018) carries the ready state and `Restart now` (OQ-554).
14. **REQ-NOTIFY-222 and REQ-STARTUP-116** — *revision 3.* An update's later states change the banner only as
    [`PD-SHELL-005`](pd-shell-005.md#pd-shell-005) revision 3's "When the notice changes" states: in place while the
    update notice is current; where it is not, the ready notice is not published, the offer a silent transport failure
    leaves is not published, and the offer a cancel leaves is published only where no notice holds the slot (OQ-554). A
    failure UD-4 shows, and a failed apply, are always published. Items 2, 11 and 12 still govern their own cases.
15. **REQ-STARTUP-120 and REQ-NOTIFY-221** — *revision 3.* A refusal on authenticity or integrity, and every discard UD-4
    shows, is REQ-STARTUP-120's notice — its title, severity, persistence and the technical sentence as copyable details —
    with the message `Rotaris is unchanged. You can download the release manually.` and no action, because REQ-STARTUP-179
    forbids retrying that release in the same process, a press of `Try again` included (OQ-555). Every other failure
    REQ-STARTUP-120 governs keeps its message and `Try again`.

Item 10's "exactly one member" states its own case, the cancel. [`PD-SHELL-018`](pd-shell-018.md#pd-shell-018) revision 2
narrows REQ-NOTIFY-044 by the disjoint case of the member that opens an available release's page (OQ-556, revision 3).

The notice surface's own case — REQ-SHELL-118's download notice and REQ-SHELL-115's action list — is
[`PD-SHELL-005`](pd-shell-005.md#pd-shell-005)'s, revised for this request rather than narrowed a second time.

**The owner's rulings (revision 2).** The owner decided UD-1 to UD-12 of
[`../architecture/background-update-plan.md`](../../architecture/background-update-plan.md) §6 personally on 2026-11-21;
none is ruled under R-072's delegation. Each fills the clause of REQ-STARTUP-169 to REQ-STARTUP-181 that reserved it:

- **UD-1 (REQ-STARTUP-169).** Where the platform reports the connection as metered, the download SHALL NOT start on its own;
  the offer is presented as REQ-STARTUP-116 presents it, with `Update now`, and a download the user starts there runs as
  REQ-STARTUP-169 states. A connection whose cost the platform does not report is treated as not metered. No preference key
  is added (REQ-STARTUP-146 and REQ-SHELL-006 stand).
- **UD-2 (REQ-STARTUP-170).** A cancel holds for the process that received it: the notice becomes REQ-STARTUP-116's offer
  with `Update now`, and no download of that version starts on its own again in that process. The next launch downloads it
  again. A cancel records nothing (`updates/dismissedVersion` included).
- **UD-3 (REQ-STARTUP-117, REQ-SHELL-114, REQ-NOTIFY-216).** Dismissing the download notice or the ready notice of
  REQ-STARTUP-174 only hides it: the download runs on, the pending update stays and the next-start apply follows, and no
  version is recorded. Waving a version off is done only by dismissing REQ-STARTUP-116's offer — the notice a cancel (UD-2)
  or a metered connection (UD-1) leaves — and there REQ-STARTUP-117 governs unchanged.
- **UD-4 (REQ-STARTUP-172, REQ-STARTUP-179).** A transport failure of a download the user did not start is not shown: it
  is logged and the next launch tries again. Every refusal on authenticity or integrity, and every discard under
  REQ-STARTUP-172 other than the silent one it names, is shown as REQ-STARTUP-120's notice.
- **UD-5 (REQ-STARTUP-178).** A pending update yields to the feed: a newer release the feed names is downloaded and, once
  verified, replaces it; a release the feed names that is older than the pending one discards the pending one.
- **UD-6 (REQ-STARTUP-173).** While the installed flavour's next-start apply runs, a small non-modal window conveys that
  Rotaris is being updated, and closes when the installer has been started; the updated application opens after it.
- **UD-7.** The first main window of the updated version shows one transient acknowledgement conveying the version it was
  updated to, and nothing persistent.
- **UD-8 (REQ-STARTUP-173, REQ-STARTUP-175).** The apply is at the next start or by `Restart now`, never at quit. Where the
  flavour's target can be replaced while the application runs (portable, AppImage), it SHALL be replaced as soon as the
  pending update is verified.
- **UD-9 (REQ-STARTUP-177).** An apply that did not complete is retried by at most two launches in all, after which the
  pending update is discarded. An unapplied pending update is kept until it is applied or superseded, with no time limit. A
  start with no network applies it (REQ-STARTUP-172 needs none).
- **UD-10 (REQ-STARTUP-170).** The progress, the cancel and the ready state stay reachable from an indicator in the title
  bar while another notice holds the banner: [`PD-SHELL-018`](pd-shell-018.md#pd-shell-018).
- **UD-11 (REQ-STARTUP-176).** No automatic rollback. The portable's and the AppImage's `<name>.old` stays until the
  replaced artifact has painted, and the recovery by hand is documented with the release.
- **UD-12.** Decided on the evidence of the over-install interruption spike (the plan's Stage 4), which is brought back to
  the owner before the installed flavour's next-start apply is enabled.

> **Revision 1 said, and no longer governs:** "Reserved to the owner. The decisions UD-1 to UD-12 of [`../architecture/background-update-plan.md`](../../architecture/background-update-plan.md) §6 are not taken here, and no build implements a clause that names one before it is. A ruling that departs from a requirement this directive does not name — REQ-STARTUP-117, REQ-SHELL-114 and REQ-NOTIFY-216 on dismissing (UD-3), REQ-STARTUP-146 and REQ-SHELL-006 should a preference be wanted (UD-1) — revises this directive and names it."

**What is unchanged.** REQ-STARTUP-105 to REQ-STARTUP-113, REQ-STARTUP-123, REQ-STARTUP-124, REQ-STARTUP-126,
REQ-STARTUP-167 and REQ-STARTUP-168: one endpoint and no way to disable the check; exact names and the order; the signature
verified before the manifest is parsed and before any asset byte is fetched; the 1 MiB bound on the small reads and the
chunked digest; no override. ADR-0054's bespoke updater (Alternative B) stays, and `electron-updater` stays rejected; its
install-at-quit pattern is not this directive. IC-3 and IC-8 stand. *Revision 2:* the background path covers every flavour REQ-STARTUP-125 can apply on a published platform key — the Windows installer and portable and, since [`PD-STARTUP-013`](pd-startup-013.md#pd-startup-013), the Linux AppImage; a build that cannot apply is [`PD-STARTUP-014`](pd-startup-014.md#pd-startup-014)'s. *Revision 1 read:* "`PD-STARTUP-001`, IC-3 and IC-8 stand: Windows x64 alone."

**Why, and what it costs.** The owner wants Rotaris installable from a release and kept current the way current desktop
assistants are: the new build arrives by itself and is used the next time the application starts, or at once when the user
asks, and work in progress is never cut off by it. The derived requirements put a click before the download and the apply
straight after it, which on the installed flavour closes every window within 1200 ms of a download the user may have
forgotten starting. What it costs: bandwidth spent without asking (UD-1); one installer's worth of disk held between the
download and the next start; a new per-user record; on the installed flavour, a first start after an update that is slower
by the installer's run; and a never-bricks guarantee for that flavour that rests on the installer's own over-install
behaviour, which nobody has measured (UD-12).

**Why revision 3, and what it costs.** OQ-553, OQ-554 and OQ-555, ruled 2026-11-21 under the owner's delegation (R-072),
raised by the `design-ui` brief of the update's surfaces. *Item 13:* UD-8 makes REQ-STARTUP-174's "will be installed the
next time Rotaris starts" false for the portable and the AppImage, which REQ-STARTUP-174 itself reaches ("or … already
applied in place"); `Update installed` is REQ-STARTUP-119's kept title and the one under which REQ-STARTUP-121 offers
`Restart now`. *Item 14:* the banner holds one notice (REQ-NOTIFY-024), and the owner put the progress, the cancel and the
restart in the title bar for the time another notice holds it (UD-10, PD-SHELL-018), so the update's own states do not
take back a slot the person is reading; UD-2's offer is published where it displaces nothing. UD-2 is not reworded: it
fixes what a cancel leaves, and says nothing of a notice that another has already replaced. *Item 15:* UD-4's "shown as
REQ-STARTUP-120's notice" answers the question REQ-STARTUP-179 reserved — whether a refusal is shown, and on which surface
— and 179 names that notice in the sentence that forbids the retry, so it fixes the notice and not the `Try again`; the
message is REQ-STARTUP-120's with "try again or" removed. What it costs: a ready update can go unseen until the next start
by a person who never looks at the title bar, where it is applied anyway (REQ-STARTUP-173); a cancel from the title bar
while another notice stands leaves no `Update now` in that process; a refusal caused by a corrupted transfer is retried only
by the next launch.

**Recorded, not built.** Scheduled after the dependency remediation in the stages of the plan; the first execution is owed
to the stage that builds it. *Built in part, 2026-11-21 (R-117, the plan's PR-2):* the pending update's store, its
launch-time cleanup, UD-5's and UD-9's rules and REQ-STARTUP-172's revalidation, with the click flow still triggering
everything; UD-8 and UD-11 for the AppImage. Executed over fakes and, for REQ-STARTUP-173's last sentence, in the built
application ([`first-executions`](../../architecture/first-executions/39-the-register-38.md)); not yet against a released
artifact.

> **Narrows:** REQ-STARTUP-017, REQ-STARTUP-114, REQ-STARTUP-116, REQ-STARTUP-119, REQ-STARTUP-121, REQ-STARTUP-122, REQ-STARTUP-125, REQ-STARTUP-127, REQ-STARTUP-155, REQ-NOTIFY-044, REQ-NOTIFY-215, REQ-NOTIFY-222, REQ-STARTUP-117, REQ-SHELL-114, REQ-NOTIFY-216, REQ-STARTUP-174, REQ-STARTUP-120, REQ-NOTIFY-221

*Raised by the owner, 2026-10-22; logged as [R-084](../requests.md#r-084). Revision 2: the owner's rulings, 2026-11-21, [R-117](../requests.md#r-117).*

*Revision 3 raised by the consortium under the owner's delegation, 2026-11-21; logged as [R-072](../requests.md#r-072), the
rulings of [OQ-553](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-553), [OQ-554](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-554) and [OQ-555](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-555), for
[R-117](../requests.md#r-117). No other directive narrows REQ-STARTUP-174, REQ-STARTUP-120 or REQ-NOTIFY-221.*
