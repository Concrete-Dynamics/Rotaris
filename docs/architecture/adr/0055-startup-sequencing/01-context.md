# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Context

Part 1 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## Context

**SR-1: a second launch surfaces the running instance rather than starting a rival process.**
`REQ-STARTUP-161` fixes it: at most one instance per user account, every launch resolving to exactly
one of two outcomes and no third — it becomes the running instance, or it is handed to the instance
already running and ends without opening a window of its own. Several workspaces and several windows
are **not** a second instance and remain fully available; every main window, including
`REQ-SHELL-017`'s replacement window and `REQ-SHELL-162`'s demo window, is a window of the one
instance. The application defines no configuration key, environment variable, preference or interface
control by which a second can be started.

`REQ-STARTUP-161` also fixes what the deciding record must be, entirely in observable terms: one per
user account; **outside every workspace directory**, so it never appears in a project or its version
control; **not a key of the desktop preference store**, whose key set is closed (`REQ-SHELL-006`,
`REQ-STARTUP-146`); created by the launch that becomes the instance and released when that process
ends, **"a record that outlives its process being settled by `REQ-STARTUP-164`"**; and creatable,
readable and removable **without elevation**. Its form and location are explicitly implementation
choices — which is what this record decides. That closing clause matters more than it looks: the
requirement **anticipates the record surviving its holder** and hands that case to the probe-and-reclaim
path rather than to any operating-system release, which is what lets the record be an ordinary unheld
file.

`REQ-STARTUP-164` fixes the resolution order and the failure direction. (1) Claim the record
exclusively; success makes this process the instance and startup continues at `REQ-STARTUP-040`.
(2) A failed claim means a record exists; attempt the hand-over, complete when the instance
acknowledges. (3) No acknowledgement within **5 seconds** — record unreadable, identifying no process,
naming a process that is not running, or naming one that does not answer — reclaim the record and retry
the claim **exactly once**. At most one reclaim and two claim attempts, and no waiting beyond that one
interval, **so a record another party keeps recreating can never make a launch spin.** (4) If the second
claim also fails, another launch claimed it inside the interval; attempt the hand-over once more and
end. The requirement names its own lineage — *"this is the discipline `REQ-SESSION-047` and
`REQ-SESSION-058` apply to a session lock — parse, probe, at most one reap, one retry, no spin, and no
side effect on the probed process"* — and it **deliberately resolves the ambiguous case in the opposite
direction**: an unreadable session lock resolves toward live because two writers would corrupt a
session, while an unreachable instance record resolved toward live would leave the user unable to start
the application at all. Probing must not affect the probed process, and a launch writes nothing but the
record while resolving it. **The requirement closes by licensing the one state the reclaim can produce**,
and this record now depends on that sentence: *"Reclaiming from a process that is running but
unresponsive is the one path by which two processes of the application can briefly exist, and what makes
it safe is that a session is protected by its own lock whichever process reaches it (`REQ-SESSION-046`,
`REQ-SESSION-047`), not by this record."*

`REQ-STARTUP-162` fixes what a hand-over looks like: **nothing the user can see except a surfaced
window.** No window, dialog, banner, acknowledgement or error from the handed-over launch; nothing
written to the preference store or to any per-user or per-workspace state; the refusal is silent and no
surface anywhere reports it. Which window is surfaced: the main window that most recently held
keyboard focus, or the one built first if none ever has; never a persona or terminal window
(`REQ-SHELL-123`). Where the instance holds the record but has **no window open at all** — the
platform convention where a process continues after its last window closes — it builds and shows a main
window, resolving its workspace exactly as a launch does, and that window goes through the same
post-show activation as any other. Surfacing means show, un-minimise, and ask the window manager to
raise and activate; **a window manager that declines the raise is a supported outcome**, nothing is
retried, and what is guaranteed regardless is that the window exists, is not minimised or hidden,
carries the content the launch asked for, and has the platform's attention hint set if there is one
(`REQ-SHELL-161`).

`REQ-STARTUP-163` fixes what a workspace directory a launch carries does. Where the launch becomes the
instance, `REQ-STARTUP-041` applies unchanged. Where it is handed over: if a main window already has
that directory open, **that window is the one surfaced and no window is built**; otherwise the instance
**builds an additional main window** on that directory, shows it and surfaces it, leaving every window
already open exactly as it was — same workspace, same active view, same composer contents, same runs
still executing. `REQ-SHELL-017`'s replacement semantics do not apply and the close gates of
`REQ-STARTUP-053` and `REQ-SHELL-021` are **not evaluated**: such a launch adds a window rather than
displacing one. A launch carrying no directory builds no window while the instance has one open.

`REQ-STARTUP-040`, `REQ-STARTUP-043`, `REQ-SHELL-015`, `REQ-WORKSPACE-014` and `REQ-WORKSPACE-141` fix
the startup order and make it observable: **preference scoping established, branded icon set, bundled
fonts registered, persisted theme restored — all before any window exists**; then the window is shown;
then and only then repository discovery, the update check and cloud-credit polling. **Constructing a
window without showing it must produce no network traffic.**

`REQ-SHELL-011`, `REQ-STARTUP-044` and `REQ-WORKSPACE-008`: **one shared deferred first-paint delay**,
measured from the moment the window is shown, serves every deferred offer; the deferred workspace prompt
is a one-shot **abandoned unshown if the question has already been answered**, so two folder choosers
are never on screen at once. `REQ-SHELL-011` is explicit that it is the product's single definition of
that delay.

`REQ-STARTUP-155`: the main window is painted within **5 seconds** of launch, **on every published
artifact and every bundle mode, with no per-flavour differential** — and it now says whose 5 seconds:
*"that bound is on the launch that becomes the running instance; a launch handed to an instance already
running paints no window of its own, is bounded instead by the hand-over interval of
`REQ-STARTUP-164`, and where it does cause a window to be built that window is bounded by this same 5
seconds."* The machine-setup empty-plan fast path is decided within the 100 ms budget and delays
neither first paint nor post-show activation.

**`REQ-STARTUP-165` puts something in front of everything this record sequences, on one artifact.** A
`onefile` artifact may prepare itself once and start from that preparation on every later run; the run
that prepares is exempt from the 5-second bound and **no other run is**, "first run" meaning the first
run of a given *version* of that artifact for that user on that machine. Preparing is silent on four
paths — made, reused, superseded or redone (`REQ-STARTUP-150`) — must issue no network request and raise
no elevation prompt, and an unusable preparation must be redone rather than reported. ADR-0054 owns the
preparation's design; what this record owns is that it happens **before the application process exists**,
so it is upstream of the instance claim, of `REQ-STARTUP-040`, and of everything else here.

**There is a fifth path and it is not silent, which changes what phase −1 owes the rest of startup.**
`REQ-STARTUP-165` (c) now states the outcome for a run that produces **no usable preparation at all** —
the storage refusing the write, being full, or being unavailable, so that redoing it does not succeed
either. Such a run still starts the artifact, keeps every behaviour of clause (f), is exempt from the
5-second bound on `REQ-STARTUP-155`'s own terms because it performs the work a preparation exists to
avoid, and **is reported once, after the window is painted**, on the persistent non-modal non-blocking
surface `REQ-STARTUP-116` uses, at warning severity. `REQ-STARTUP-150` was amended to carve this out
explicitly: "an artifact preparing itself for launch, reusing a preparation, or redoing an unusable one
is always silent … while an artifact that could produce no preparation at all is always warned about and
never prevented from running, that being the one preparation outcome the product reports". **So phase −1
can now produce something the post-show pipeline has to deliver**, which it could not before.

**`REQ-STARTUP-043` has grown a fourth member and it is not a network call.** Post-show background
activation is now repository status discovery, **the workspace-storage determination of
`REQ-STARTUP-166`**, the update check, and the cloud-credit poll. `REQ-STARTUP-166` requires the product
to determine directly — from the storage the workspace directory sits on, and never inferred from a
failed write, a collided lock or a refused session — whether an opened workspace sits on storage shared
with or synchronised to another machine, and to warn when it does. It applies to **every** path that
opens a workspace: `REQ-STARTUP-041`'s startup resolution, a directory a launch carries to an instance
already running (`REQ-STARTUP-163`), and the project switch of `REQ-STARTUP-047`. It resolves to exactly
one of three states — reachable by another machine, replicated by a synchronisation agent, or not
classifiable — the first two raising a persistent warning and **refusing nothing**, the third silent. It
is explicitly post-show, so it delays neither first paint nor the moment the interface accepts input,
and it adds no key to the desktop preference store (`REQ-STARTUP-146`).

`REQ-STARTUP-050`: the complete default desktop is painted and visible **before** the modal chooser
opens.

`REQ-SHELL-162`, `REQ-SHELL-005`, `REQ-STARTUP-055` to `REQ-STARTUP-057`: demo mode is a **property of a
window fixed when that window is built**, never toggled in an open window, never persisted, never
inherited by a replacement window; a demo window carries a non-colour marker for its whole life, never
writes the last-opened-workspace key, never prompts for a workspace, and performs no update or cloud
network traffic. Demo content is a **constant of the build**.

`REQ-SHELL-016` and `REQ-STARTUP-045`: windows created and destroyed immediately must not deliver
deferred offers. `REQ-SHELL-008`: the bundled fonts are available before the first paint, with a host
fallback permitted in the live application and forbidden in a benchmark iteration (ADR-0053).
`REQ-STARTUP-140` and `REQ-STARTUP-156`: a configuration-load span is recorded in diagnostics, and the
release gate requires each published artifact to be downloaded and launched to first paint at least once
on its own platform. `REQ-STARTUP-152` makes the whole of SR-1 a release-checkable claim: *"launching
that entry point twice on one user account SHALL leave exactly one process of the application
running."*
