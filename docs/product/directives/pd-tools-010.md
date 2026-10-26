[Product directives](../directives.md) › PD-TOOLS-010

<a id="pd-tools-010"></a>

### PD-TOOLS-010 — `send_signal SIGINT` stops a background session where the shell loses the signal

`send_signal SIGINT` (REQ-TOOLS-110) and the stream-control interrupt (REQ-TOOLS-128) SHALL stop a background session
whose command takes SIGINT's default, as [R-044](../requests.md#r-044) ruled ("SIGINT stops a background session"), and not
only send the signal. Where the session's shell has a window, between starting a command and the command's own image, in
which a delivered SIGINT is lost — `dash` as `/bin/sh` on Linux, between its `vfork` and the command's `exec` — the product
SHALL read the session's process group the instant before it sends the signal and again at 250 ms and 1.5 s while the
session still runs, and SHALL send SIGINT once more, once each, to what that window cost the signal:

- a member that the first reading found to be the shell, not ignoring SIGINT, which is alive and now runs another image
  (its name or its arguments changed);
- where such a member had started nothing at the first reading and is still the shell, each child it has started since;
- with each, its descendants alive that the first reading did not hold.

It SHALL NOT send a second SIGINT to a process the first reading found already running the command, whatever that process
did with the first, one-shot handlers included, nor to what it starts on receiving it. Each re-delivery is logged as a
warning. A session whose shell has no such window — any shell but `dash` — is not read and is signalled once, as
REQ-TOOLS-110 states. Off Linux nothing is read: Windows terminates the session's tree for every signal (OQ-10, R-044).

The residue OQ-135 states is accepted: a member that `exec`s between the reading and the delivery, and installs a handler
within that step, is sent a second SIGINT; a script that traps SIGINT and then `exec`s its command has the trap overridden;
and a shell other than `dash` that loses a SIGINT across its fork, if one does, is not read.

**As built.** `BackgroundSession.checkSigint` and `missedSigint` (`packages/agent-tools/src/terminal/background.ts`) over
`ProcessTable.tree` (`@rotaris/platform`), armed where `hasVforkWindow` finds the session's shell to be `dash`. The
measurements are OQ-135's: 0 of 150 to 200 sessions ran on in each case under six CPU burners, against 5 to 28 with the
check disabled.

**Why, and what it costs.** R-044 read SIGINT as stopping a session, and acceptance finding A8 graded a dev server or a
watcher left running after "Sent SIGINT" a product defect. A single delivery could not meet that where `dash` discards a
signal in its fork window. The owner took the narrow re-delivery as built. What it costs: a command that `exec`s within one
synchronous step and installs a one-shot handler there can be sent two SIGINTs, and a script's own SIGINT trap can be
overridden.

> **Extends:** REQ-TOOLS-110, REQ-TOOLS-128

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-135.*
