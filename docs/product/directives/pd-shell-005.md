[Product directives](../directives.md) › PD-SHELL-005

<a id="pd-shell-005"></a>

### PD-SHELL-005 — while an update downloads, its notice carries Distribution's words

*Revision 2 (2026-10-22, [R-084](../requests.md#r-084)) — **the download notice cancels, and a verified download waits for the
next start or `Restart now`**: the action and the apply sentences are replaced, and `REQ-SHELL-115` joins the Narrows list
for the one action it gains. `PD-STARTUP-008` carries the rest of the request.*

*Revision 3 (2026-11-21, [R-072](../requests.md#r-072), the ruling of [OQ-552](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-552), for
[R-117](../requests.md#r-117)) — **the download notice is persistent, so the owner's UD-3 has the dismissal it names, and a
failure UD-4 keeps silent leaves the offer**: the persistence sentence and the failure sentence are replaced, a clause on
when the notice changes is added, and REQ-STARTUP-118 joins the Narrows list for its "non-persistent". The text each
replaces is quoted beside it.*

While the download of an update runs, the update notice SHALL keep its identity and be updated in place, never replaced,
as REQ-SHELL-118 states, and SHALL carry REQ-STARTUP-118's words: the title `Downloading Rotaris {version}` and the
message `{measured} — verifying against the published checksum when it finishes.` It SHALL NOT be persistent while the download runs, so no dismissal can wave off a version whose install is in flight —
revision 3: it SHALL be persistent for the whole of the transfer and the verification, and dismissing it SHALL only hide
it, as UD-3 of `PD-STARTUP-008` states: the download runs on, no version is recorded, and the title-bar indicator of
`PD-SHELL-018` stays — and its action SHALL be disabled with an
accessible description stating why — revision 2: the action SHALL instead cancel the download, enabled for the whole of the
transfer and the verification (REQ-STARTUP-170). A verified download SHALL NOT lead into the apply: the same notice SHALL
become REQ-STARTUP-174's persistent ready notice with `Restart now` — revision 2 — and the apply follows at the next start or
at `Restart now` (`PD-STARTUP-008`). `REQ-SHELL-115`'s closed list gains that one action, cancel the running update download,
and no other — revision 2.

> **Revision 1 said, and no longer governs:** "and its action SHALL be disabled with an accessible description stating why.
> The apply SHALL follow the verified download in one sequence (REQ-STARTUP-122), with no second activation of the action,
> so a "ready to install" state stands only for the length of the apply."

A failure SHALL turn the same notice into REQ-STARTUP-120's `Update not installed`, in place — revision 3: a failure
UD-4 shows SHALL; a transport failure of a download the user did not start, which UD-4 keeps silent, SHALL instead turn
it, in place, into REQ-STARTUP-116's offer with `Update now`, whose dismissal waves the version off as REQ-STARTUP-117
states, and no download of that version starts on its own again in that process. The notice that offers the update before the
download — its title `Rotaris {version} is available`, its persistence and its `Update now` — and REQ-SHELL-118's
waved-off rule are unchanged.

> **Revision 2 said, and no longer governs:** "It SHALL NOT be persistent while the download runs, so no dismissal can
> wave off a version whose install is in flight". *The reason is kept, falsified:* UD-3, the owner's ruling of 2026-11-21,
> makes a dismissal of the download notice record nothing, so no dismissal can wave the version off whatever the flag;
> and REQ-NOTIFY-040 gives a dismiss control only to a persistent notice, so UD-3's dismissal needs the flag set.
> **Revision 2 said, and no longer governs where UD-4 is silent:** "A failure SHALL turn the same notice into
> REQ-STARTUP-120's `Update not installed`, in place."

**When the notice changes — revision 3.** Every change named here — a repaint, the ready notice, the offer, a failure —
SHALL be made in place while the update notice is the current notice (REQ-NOTIFY-024). Where it is not, having been
dismissed or replaced, a repaint, the ready state and the offer a silent failure leaves SHALL publish nothing, the
indicator of `PD-SHELL-018` carrying the state; a failure UD-4 shows, and a failed apply, SHALL be published, replacing
whatever holds the slot; the offer a cancel leaves SHALL be published only where no notice holds the slot. Which
requirements that departs from is `PD-STARTUP-008` revision 3's (OQ-554).

**As built.** The updater's notices (`apps/desktop/src/main/updater/`), ADR-0054's "the same notice by identity, never by
replacement".

**Why, and what it costs.** OQ-85: REQ-STARTUP-118 and REQ-SHELL-118 disagree on the title, the persistence, the message
and the pause before the apply. Distribution owns the words and Shell the surface (`CONTEXT-MAP.md`), so the build took the
words from the one and the identity from the other, and ran the apply on from the download as REQ-STARTUP-122's sequence
has it. The owner confirmed that reading. What it costs: no second click before the install, and REQ-SHELL-118's
percentage-only message gives way to Distribution's sentence.

**Why revision 2, and what it costs.** R-084: the download starts by itself, so the one action left on its notice is
the one that stops it, and the apply waits for the next start or the user's restart. What it costs: one more member of a
closed action list.

**Why revision 3, and what it costs.** OQ-552, ruled 2026-11-21 under the owner's delegation (R-072, both advocates
followed). The owner ruled UD-3 personally on 2026-11-21, naming a dismissal of the download notice; this directive's
revision 2 left that notice without one. The consortium does not weigh the owner's two clauses against each other: the
later one names the dismissal, and it removes the hazard the earlier one gave as its reason, so this revision carries it
here. A transport failure UD-4 keeps silent left the notice with no outcome face to become and no exit; the offer states
no failure and is what a cancel leaves (UD-2). What it costs: a Dismiss beside `Cancel download` on one notice, the two
meaning hiding and stopping, which REQ-STARTUP-118's fixed message cannot explain; a person who replaced or hid the notice
sees the update's later states only in the title bar.

> **Narrows:** REQ-SHELL-118, REQ-SHELL-115, REQ-STARTUP-118

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-85. Revision 2 raised by the owner,
2026-10-22; logged as [R-084](../requests.md#r-084).*
*Revision 3 raised by the consortium under the owner's delegation, 2026-11-21; logged as [R-072](../requests.md#r-072), the
ruling of [OQ-552](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-552), for [R-117](../requests.md#r-117). Its case on REQ-STARTUP-118 is the download notice's
persistence alone; no other directive narrows that requirement.*
