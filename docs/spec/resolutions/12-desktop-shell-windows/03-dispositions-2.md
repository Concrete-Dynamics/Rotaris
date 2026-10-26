# Resolution Record — Domain 12, Desktop Shell, Navigation, and Window Management — Dispositions (continued)

Part 3 of 3 of [domain 12's resolutions](../12-desktop-shell-windows.md), which indexes every part. The table continues from the part before; its header is repeated here.

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 36 | RESOLVED | The interval is 400 ms after the last keystroke, with an immediate flush — not waiting out the interval — whenever the composer loses focus, the active view changes, the workspace is replaced, or the window closes. Survival of an abnormal termination is deliberately not promised; the bound is stated instead, which is checkable where a promise would not be: a power loss or a killed process may lose at most the keystrokes of the last debounce interval and nothing earlier, because every deliberate departure from the composer has already flushed. A draft is never left half-written — a write lands whole or not at all — so the text read back is always text the user actually typed at some moment. | REQ-SHELL-159 |


> ## Amendment, 2026-09-02 — ESC-24, and the preference store's per-user location
>
> *The ESC-24 half is recorded by the sweep pass rather than by the agent that made it, so the record is
> not owed twice. The preference-store half is the sweep's own corrective edit.*
>
> **ESC-24 — a launch arriving while this instance is shutting down is refused.** `REQ-SHELL-169` is
> minted, placed in the window-close and shutdown section. "Shutting down" is the interval from the
> ordered shutdown effects `REQ-MONITOR-131` fixes beginning until the process ends, force-exit allowance
> included and not copied. Through it the instance builds no window, opens no workspace, and starts and
> writes nothing on the launch's behalf — including the window `REQ-STARTUP-162` would otherwise have a
> window-less instance build. The reason the ruling gave is carried in the requirement: admitting the
> launch would mean two instances briefly existed, which `REQ-STARTUP-161` exists to prevent, at the
> moment the product is least able to reason about its own state.
>
> **The refusal is answered, never silent**, and the requirement states why silence is not equivalent: an
> unanswered launch treats the instance as unreachable and reclaims the record, which is the path
> `REQ-STARTUP-164` keeps for a process that *cannot* answer, and taking it for one that can would
> produce the two simultaneous processes the refusal exists to avoid. Where a main window is on screen it
> is surfaced and already states that stopping is under way; where none is, the user is still told the
> application is finishing shutting down and will open when it has, so a launch that appears to do
> nothing for the length of the allowance is not mistaken for one that failed. The waiting launch's
> surface is handed to domain 11 rather than fixed here.
>
> **Domain 11 was amended in step, because without it the refusal is defeated by the requirement it
> relies on.** `REQ-STARTUP-164` clause (3) reclaimed the record where "a process that is running does
> not answer" within 5 seconds. A refusal is an answer but is not an acknowledgement of the hand-over, so
> on the literal reading a launch refused one second into a thirty-second allowance would reclaim the
> record four seconds later and become exactly the second instance ESC-24 forbids. The clause now states
> that an answered refusal stops that interval running at all, that the launch waits instead, that the
> wait is bounded by the force-exit allowance, and that the deferred launch re-enters the resolution
> order at clause (1) once the record is released. `REQ-STARTUP-162` gained the shutting-down exception
> to its build-a-window clause, had its silence rule scoped to a launch that has been handed over and has
> ended, and gained the paragraph fixing what a refused launch shows while it waits.
> `REQ-STARTUP-161` states that waiting is not a third outcome and that the two-outcome set stays closed.
> The Data & Formats constant for the 5 s hand-over wait now says it bounds an **unanswered** hand-over.
>
> **`REQ-SHELL-006`'s preference store now says which per-user location it is.** This is the sweep's own
> correction and it closes the last residue of the round's first defect. `REQ-STARTUP-145` now fixes
> which per-user location the product uses and directs every requirement that places something in a
> per-user directory to cite it. The desktop preference store is **not** one of `REQ-STARTUP-145`'s
> directories, so it inherited nothing, and its own closed list of observable properties described it
> only as "the host platform's own standard per-user application-settings location" — the same silence
> the round had just closed elsewhere. The store holds `workspace/lastOpened` and
> `diagnostics/outputDir`, both paths that describe *this* machine, so a replicated store would answer a
> launch on one machine with a folder that exists only on another. The property is added to the closed
> list with `REQ-STARTUP-145` cited for its terms and the reason stated locally, so a later reader meets
> the argument rather than the silence. The store's physical path and on-disk form remain implementation
> choices.
>
> **The alternative that was available and not taken** was for this document to state why the preference
> store *may* replicate. Nothing in the corpus supports that and two of the store's own keys contradict
> it, so the selection was made rather than the exception.

> ## Amendment, 2026-09-02 (requirement-shape sweep)
>
> **`REQ-SHELL-155` restated a refusal that domain 07 owns, and inherited its defect with it.** The
> checkpoint-restore refusal was stated independently here and in `REQ-SESSION-164`, and both attached the
> refusal to the decision to begin rather than to the whole of the restore — so a session becoming live
> after the question was answered was a session the user was never told about, and the restore proceeded to
> replace the working tree under a run that was using it.
>
> **Corrected by citation rather than by a second statement**, which is the pattern this corpus uses
> wherever two documents describe one condition. `REQ-SESSION-164` owns the condition and states the window;
> this requirement holds no copy of it and states no window of its own. What remains here is the part that
> is genuinely the shell's: **a restore refused because a session became live during it is reported on the
> same surface, in the same terms, as one refused at the moment it was asked.** Without that, an
> implementation could correctly refuse late and still present the user with a failure that looks like a
> different problem, which is how a correct refusal becomes an unhelpful one.
