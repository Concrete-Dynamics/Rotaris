# Resolution Record — Domain 19, Notifications, Error Handling, and Recovery — Escalations

Part 3 of 3 of [domain 19's resolutions](../19-notifications-errors-recovery.md), which indexes every part.

## Escalations

None. Every one of the thirty-seven open questions was decided here: thirty-seven RESOLVED, none
OMITTED, none MOOT, none ESCALATED. The specification's "Open Questions" section now records that
nothing is outstanding.

Three questions were affected by the graphical-only sweep but are still recorded as RESOLVED rather
than MOOT, because in each case the underlying capability survived and needed a decision of its own:
OQ 3 (the quota-wait surface, which needed a desktop presentation, not merely the removal of a
text-mode one), OQ 9 (the message-limit path, which needed both a status mapping and a dialog), and
OQ 4 (provider-row wording, resolved by the message-text decision rather than by the sweep).


> ## Amendment, 2026-09-06 — ESC-34: two actions the vocabulary could not express
>
> **The defect this closes.** `REQ-NOTIFY-044`'s vocabulary named eleven actions, and two requirements
> outside this domain oblige a notice to offer a twelfth and a thirteenth. `REQ-NOTIFY-224` — this
> domain's own requirement — says the unreviewed-hooks notice "offers an action opening the review", and
> the review is the modal dialog of `REQ-HOOKS-106`, not a settings category. `REQ-WORKSPACE-152` (3) says
> the first-launch notice carries "an action that starts the flow", and that requirement draws the
> distinction deliberately: its clause (2) gives the refusals an action "leading to that same Settings
> surface", while clause (3) starts the guided setup itself. Collapsing either into `open settings at a
> named category` would have left the user one surface short of what the requirement promises, and would
> have deleted a distinction `REQ-WORKSPACE-152` states on purpose.
>
> **How it surfaced.** The notice pipeline's first execution (ADR-0049, Part V, 2026-09-06) built the
> vocabulary as a closed union — `REQ-NOTIFY-044`'s "an action naming a value outside the owning domain's
> vocabulary is not dispatched" made that the only honest shape — and the two actions the built product
> already needed had no member to be.
>
> **The amendment, and the precedent it follows.** Both members are added to `REQ-NOTIFY-044` and to the
> Data & Formats restatement. **Resolution 12 above is the precedent and it points the same way**: when
> this vocabulary disagreed with `REQ-NOTIFY-047`, "the action vocabulary was corrected to match rather
> than the other way round". Here `REQ-NOTIFY-224` and `REQ-WORKSPACE-152` are the behavioural
> requirements and the enumeration is what had fallen behind.
>
> **The closed property was checked, not assumed.** `REQ-NOTIFY-044` closes with "no action in this
> vocabulary writes into the user's project". Opening the hook review writes nothing anywhere — the
> decision is taken inside the review dialog of `REQ-HOOKS-106` — and starting the guided
> provider setup acts on the application's own credential store, never on the repository. The property
> stands as written and is now stated of both new members explicitly.
>
> **Both carry their object, as this requirement demands of every other member.** The hook review is
> parameterised by workspace, because `REQ-NOTIFY-224` publishes per workspace and hook set and an
> unparameterised action would open the review of whichever workspace happened to be open. The provider
> setup carries a provider only where the action names one — `REQ-WORKSPACE-152` (3)'s notice starts at
> the catalog step and names none, while clause (1)'s re-authenticate entry names one — so the parameter
> is optional in the vocabulary and the two entry points stay distinguishable.
>
> **What was not done.** No third member was added for `REQ-NOTIFY-227`'s other three hook-trust
> statements: only the second publishes a notice, and the other three are read on surfaces reached
> without an action. `REQ-NOTIFY-044`'s citation discipline is unchanged — the provider name is the
> catalog's (`REQ-NOTIFY-210`), not a fourth list held here.


> ## Amendment, 2026-11-21 — ESC-43: the update requirements swept to domain 11
>
> **The defect this closes.** ESC-8's signed manifest and SR-1's several windows were applied to domain 11 and never reached
> §G1 here. `REQ-NOTIFY-219` still said "No signature is verified", against `REQ-STARTUP-167`, and `REQ-NOTIFY-212` still
> counted one check per launch, against `REQ-STARTUP-114`'s one per window activation. The updater has followed domain 11 since
> 2026-09-28.
>
> **The amendment.** Both requirements are corrected in place to domain 11's text, as ESC-8's sweep would have done: the
> signature is verified before the checksum file is parsed and before any byte of the update is fetched, then the digest is
> compared; and the check runs each time a main window is shown. Nothing else in §G1 changes, and no directive is needed: the
> record is corrected, not departed from.
>
> **Ruled** by the model under the owner's explicit delegation ("you rule esc 43", [R-120](../../../product/requests.md#r-120)),
> option (1) of [ESC-43](../../../archive/architecture/owner-decisions/15-escalations-after-the-gate-2026-10-22.md#esc-43).
>
> **The text replaced.** `REQ-NOTIFY-212` read "checks once per launch"; `REQ-NOTIFY-219` read: "A downloaded update is
> installed only after its SHA-256 digest has been compared with the digest published for that release in `SHA256SUMS.txt`
> and the two match. Where they differ, the update stops, the installed application is left exactly as it was, and the
> failure is reported under REQ-NOTIFY-221. No signature is verified: a matching digest establishes that the download is the
> published file and nothing about who published it."

