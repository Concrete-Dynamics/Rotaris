[Product directives](../directives.md) › PD-SHELL-005

<a id="pd-shell-005"></a>

### PD-SHELL-005 — while an update downloads, its notice carries Distribution's words

*Revision 2 (2026-10-22, [R-084](../requests.md#r-084)) — **the download notice cancels, and a verified download waits for the
next start or `Restart now`**: the action and the apply sentences are replaced, and `REQ-SHELL-115` joins the Narrows list
for the one action it gains. `PD-STARTUP-008` carries the rest of the request.*

While the download of an update runs, the update notice SHALL keep its identity and be updated in place, never replaced,
as REQ-SHELL-118 states, and SHALL carry REQ-STARTUP-118's words: the title `Downloading Rotaris {version}` and the
message `{measured} — verifying against the published checksum when it finishes.` It SHALL NOT be persistent while the
download runs, so no dismissal can wave off a version whose install is in flight, and its action SHALL be disabled with an
accessible description stating why — revision 2: the action SHALL instead cancel the download, enabled for the whole of the
transfer and the verification (REQ-STARTUP-170). A verified download SHALL NOT lead into the apply: the same notice SHALL
become REQ-STARTUP-174's persistent ready notice with `Restart now` — revision 2 — and the apply follows at the next start or
at `Restart now` (`PD-STARTUP-008`). `REQ-SHELL-115`'s closed list gains that one action, cancel the running update download,
and no other — revision 2.

> **Revision 1 said, and no longer governs:** "and its action SHALL be disabled with an accessible description stating why.
> The apply SHALL follow the verified download in one sequence (REQ-STARTUP-122), with no second activation of the action,
> so a "ready to install" state stands only for the length of the apply."

A failure SHALL turn the same notice into REQ-STARTUP-120's `Update not installed`, in place. The notice that offers the update before the
download — its title `Rotaris {version} is available`, its persistence and its `Update now` — and REQ-SHELL-118's
waved-off rule are unchanged.

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

> **Narrows:** REQ-SHELL-118, REQ-SHELL-115

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-85. Revision 2 raised by the owner,
2026-10-22; logged as [R-084](../requests.md#r-084).*
