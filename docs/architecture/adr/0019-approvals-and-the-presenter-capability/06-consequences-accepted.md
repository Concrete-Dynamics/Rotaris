# ADR-0019 — Approvals: the wait registry lives with the gate; the presenter is a revocable capability — Consequences accepted

Part 6 of 8 of [ADR-0019](../0019-approvals-and-the-presenter-capability.md), which indexes every part.

## Consequences accepted

1. The run host, not main, decides that a session is unattended, so main must register and revoke
   presenters explicitly and promptly on window creation and close, or a torn-down presenter will be
   treated as live until something else notices. **That "something else" is the lapse and only the
   lapse.** The earlier text said "until the channel notices"; the channel does not notice for a main
   that has died, and for a main that is alive with no window left there is nothing for it to notice.
   An explicit revoke on window close is therefore load-bearing rather than an optimisation: without it
   an application with no windows stays *attended* until a lapse it will never suffer, because a healthy
   main answers the poll perfectly well while being unable to show anything to anybody.
2. **A live-but-unresponsive presenter is now *inside* the specification's vocabulary, and the liveness
   signal is how the test is evaluated rather than a gap-filler.** The earlier text of this consequence
   read: "`REQ-TOOLS-053` and `REQ-TOOLS-069` test presence of a registration and nothing else — never
   whether the presenter later answers — so a main that is wedged rather than crashed is *attended* by
   the specification's own test while satisfying nobody… The two requirements conflict on this case."
   **That is no longer true of the requirements as they stand.** `REQ-TOOLS-053` asks whether a prompt
   can be put in front of a person and `REQ-TOOLS-069` derives attendedness from it; a wedged main fails
   that test, so `REQ-TOOLS-064`'s "never a hang" and the attendedness definition now agree instead of
   conflicting. The earlier argument is preserved above rather than deleted, because it is the reason
   the mechanism exists and because a reader coming from OQ-39 or constraint T-41 — both of which still
   quote the superseded wording — needs to see which sentence moved. ADR-0002's process split still makes
   the wedged case reachable in ordinary operation rather than exotic, and the spike figures above show
   it occurring. The costs of the answer are accepted and are all on the fail-closed side: a false lapse denies the
   asks that were in flight, and under `runtime.headless_approval_policy: abort` the *next* ask after a
   false lapse stops the run through the session's abort hook (`REQ-TOOLS-065`); an answer arriving from
   a dialog whose request was already cancelled is undeliverable, which `REQ-TOOLS-063` already disposes
   of by leaving the dialog open with all three buttons disabled and a status line. The direction cuts
   against the corpus's usual rule that an unanswerable liveness question resolves toward *alive*
   (`REQ-NOTIFY-255`, `REQ-SESSION-051`, `REQ-GIT-093`). The underlying principle is the same — resolve
   toward refusal — and only the mapping flips, because for a restore refusal means calling a process
   alive, while for an approval it means calling a presenter gone.
3. Session-state mirroring means a pending approval is written to persisted session state
   (`REQ-TOOLS-056` — the payload is "rendered by hosts **and persisted into session state**") and
   removed on settlement, so a crash can leave a stale pending entry. **Resume must treat any pending
   entry read back from the session record as cancelled**, since `REQ-TOOLS-059` forbids anything but
   the host UI from answering it and the waiting agent no longer exists. **Under SR-4 the rule is
   unchanged and its window shrinks.** The mirror is a row written in the same transaction as the wait's
   creation and removed in the transaction that settles it (ADR-0008), and `REQ-SESSION-067` no longer
   defers any save, so the stale entry a crash can leave is bounded by one interrupted transaction
   rather than by a deferral window. `REQ-SESSION-196` restores "the pending questions and approvals, as
   trailer rows", which is what the resume rule then settles. Under SR-1 and SR-2 there is additionally
   no rival process that could be waiting on the entry this instance is about to cancel.
4. Pairing (`REQ-TOOLS-062`) is enforced where the decision record is built, and it reads the pending
   payload — so it must happen before the entry is removed from the map.
5. **The run host does not outlive main, so the wait registry has no shutdown path of its own.** Measured
   at 207–341 ms in 6 of 6 runs. `REQ-TOOLS-054`'s bulk cancel and `REQ-TOOLS-177`'s teardown ordering are
   therefore reachable only for the cases where *something in the process tree is still running* — run
   cancellation, session teardown, an orderly quit. They are **not** a recovery path for a dead main, and
   must not be documented, tested or relied on as one. Consequence 3's resume rule is what settles a
   pending entry after that kind of death, and it is the only thing that does.
6. **A lapse that is a false positive is now bounded on one side only.** The floor is measured — 258 s of
   unblocked running with no main-channel gap above 303 ms — but on an idle main. The loaded case is not
   measured and the lapse window is not sized; OQ-39 is untouched by this evidence and the *Revisit if*
   trigger about a window that cannot be set wide enough remains live.
