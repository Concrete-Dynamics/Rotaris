---
reference: ROTARIS-CRW-001
domain: notifications-errors-recovery
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 19, Notifications, Error Handling, and Recovery

This record disposes of every open question raised in the draft of
[`../19-notifications-errors-recovery.md`](../19-notifications-errors-recovery.md) (requirement
prefix `REQ-NOTIFY`). The body of that specification has been amended so that each decision below is
stated normatively in place; the original open-question numbering is preserved here so the draft and
the resolved specification can be read against each other.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, and awkward behavior is never preserved for compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   omitted rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   full-screen text-mode interface, and domains 17 and 18 are retired. Requirements of this domain
   whose only observable surface was a shell invocation, a key-bound text-mode host, or a
   script-oriented output format are **withdrawn**, and every capability they carried has been
   rescued into a desktop-reachable requirement. See the "Graphical-only sweep" below.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable output format). Open
   questions asking for the exact phrasing of a human-readable message are resolved by fixing what
   the message must convey and leaving the wording to the implementation.

Cross-domain coherence was checked against `08-requirements-traceability.md` (delivery-state and
health vocabularies), `09-lifecycle-hooks.md` (the workspace hook-set fingerprint and the trust
decision), `12-desktop-shell-windows.md` (the seven primary views),
`14-library-artifacts-improvements.md` (library tab names) and `15-settings-configuration.md`
(settings category identifiers). No other source was consulted.

New requirements added by these resolutions: **REQ-NOTIFY-263** through **REQ-NOTIFY-268**. No
requirement identifier was renumbered, reused, or deleted.

## Graphical-only sweep

Four requirements had no surface other than a shell invocation or a key-bound text-mode host. Each
is withdrawn in place, and each capability it carried is now reachable from the desktop interface.

| Withdrawn | What it was | Capability rescued into |
| --- | --- | --- |
| REQ-NOTIFY-086 | The three quota-wait choices (keep waiting / change model / cancel), offered by an "interactive host" and bound to `W`, `M` and `C` with a help line. | **REQ-NOTIFY-263** (new) — the quota wait is presented in the run header of every session, focused or not, naming provider, model, exhaustion state and remaining time, and offering the same three choices as controls. Resolves OQ 3. |
| REQ-NOTIFY-155 | `sessions --repair` on "both command-line clients", printing `repaired {id}  {old_status} -> interrupted  ({reason})`. | **REQ-NOTIFY-264** (new) — workspace-wide stale-session repair is an action on the session list, reporting per repaired session the identity, the previous status and the liveness reason, with copyable detail and the same nothing-to-do outcome on repetition. REQ-NOTIFY-153's cross-reference was re-pointed. |
| REQ-NOTIFY-241 | `rotaris-cli setup` mirroring first-run machine setup headlessly, one line per step, non-zero exit on failure. | **REQ-NOTIFY-265** (new) — a setup surface in Settings lists every managed step with its recorded outcome and offers re-running any single step on REQ-NOTIFY-236's terms, reading and updating the resumable state of REQ-NOTIFY-240. |
| REQ-NOTIFY-247 | The message-limit confirmation offering continue / double / cancel bound to `c`+Enter, `d`, and `x`+Escape. | **REQ-NOTIFY-266** (new) — a window-modal dialog owned by the session that reached the limit, stating count, limit and estimated token usage and offering the same three choices as controls, with focus on continuing and Escape cancelling. A non-focused run's limit raises an `info` notice instead. Resolves OQ 9. |

Four further requirements retained their capability but had shell-shaped text removed:

- **REQ-NOTIFY-076** no longer instructs the user to run `rotaris-cli login {provider}` in a
  terminal; the browser and device-code flows start in place under REQ-NOTIFY-202, and the
  requirement now forbids directing the user to a shell.
- **REQ-NOTIFY-202** no longer defines model persistence by reference to "the command-line login".
- **REQ-NOTIFY-156** now binds the desktop session list explicitly rather than "the plain session
  listing", and its marker is non-colour-only and exposed in the accessible name.
- **REQ-NOTIFY-165** and **REQ-NOTIFY-174** no longer fix a parseable single-line format; each now
  fixes the facts the report must carry and leaves the wording to the implementation, per decision 5.
- **REQ-NOTIFY-256** no longer lists "a line of command-line output" among the channels through
  which a repair may be announced.
- The Overview paragraph and the Data & Formats section headed *Command-line output formats* were
  amended accordingly; that section is now *Reports whose information content is fixed and whose
  wording is not*.

## Dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | Publication is a totally ordered, serialized operation whatever thread raises it: each publication is accepted, assigned its identifier and has its clearing rules applied before the next is accepted, so two publications never interleave. Every publication in a burst is applied and the last one applied is the one on screen; painting may be coalesced, so a notice superseded within the same event-loop turn need never be drawn, and the missing intermediate frame is explicitly not a defect. This keeps REQ-NOTIFY-025's monotonic identifiers and REQ-NOTIFY-029's clearing rules well defined under concurrency without demanding a frame per publication. | REQ-NOTIFY-033 |
| 2 | RESOLVED | Stacking ships, and it is the only acknowledgement surface: a lone acknowledgement is the stack holding one member. Keeping two surfaces would have meant two placement rules, two width rules and two accessible-tree shapes for one message kind. The two widths of REQ-NOTIFY-013 are re-expressed as depth conditions rather than product variants — 520 px while exactly one is visible, 360 px while two or three are — and a stack growing from one member to two narrows the standing acknowledgement rather than replacing or reordering it, which preserves REQ-NOTIFY-017. | REQ-NOTIFY-013, REQ-NOTIFY-016 |
| 3 | RESOLVED | A quota wait is a working run, not a stopped one. Its normalised state stays `running`, so it is busy under REQ-NOTIFY-050 and the composer stays locked; the run header states that the run is waiting on a provider limit, names the provider and the exhausted model, states whether the provider is marked exhausted under REQ-NOTIFY-088, and counts the remaining time down continuously where a resume time is known — or states that only the user ends the wait where auto-resume is not permitted. The three choices survive the loss of the text-mode host as header controls: keep waiting, change model (opening REQ-NOTIFY-074's list and pinning under REQ-NOTIFY-089), cancel the run. It applies to unfocused sessions too, matching REQ-NOTIFY-252's treatment of awaiting-input. | REQ-NOTIFY-263 (new), REQ-NOTIFY-083, REQ-NOTIFY-086 (withdrawn), REQ-NOTIFY-087 |
| 4 | RESOLVED | Under decision 5 the microcopy is not specified; the information content is. A provider failure in a settings row or in the modal that triggered it names exactly three facts: the provider, the operation attempted (a health check, an authentication, a logout or a model discovery — a closed list, so a fifth kind of failure cannot appear unlabelled), and the reason with the provider's or the transport's own text reproduced rather than paraphrased. Wording and arrangement are the implementation's. | REQ-NOTIFY-203 |
| 5 | RESOLVED | The cadence rule is made symmetric with the known-size case rather than left open: whole-percent changes where the total size is known, whole-megabyte changes of the amount downloaded where it is not. A final update is published when the download settles in both cases, so the last text a user reads states the amount actually received rather than the last threshold crossed — otherwise a download ending at 12.4 MB would rest at "12 MB" indefinitely. | REQ-NOTIFY-218 |
| 6 | RESOLVED | The diagnostics view reports its own failure inside itself and publishes nothing: the user is already looking at the surface that failed, so a notice would only duplicate it. The failure is presented as that region's empty condition under REQ-NOTIFY-006 — one plain sentence, the reason in a copyable detail block, and a re-read control. Partial failure degrades rather than fails: records that cannot be rendered are skipped and counted, the rest are shown, and one line states how many were unreadable. An empty diagnostics log and an unreadable one are never presented alike. | REQ-NOTIFY-267 (new) |
| 7 | RESOLVED | Both survive. The notice store belongs to the application process, not to a window: re-creating the main window neither resets the monotonic identifier sequence nor discards the current notice, and the new window renders whatever notice is current under REQ-NOTIFY-024. Identifiers are unique across every window of the process, so REQ-NOTIFY-026's identifier-matched dismissal stays meaningful across a re-creation. REQ-NOTIFY-027's "application session" is defined as one run of the process, so only ending the process discards the store. The alternative — per-window state — would have made REQ-NOTIFY-034's secondary and popped-out windows each carry a different current notice, contradicting REQ-NOTIFY-259. | REQ-NOTIFY-025, REQ-NOTIFY-027 |
| 8 | RESOLVED | The terminal members of REQ-NOTIFY-048's vocabulary are named as exactly `cancelled`, `completed` and `failed`. `completed` raises the success notice; `failed` raises nothing here and reaches the user through REQ-NOTIFY-060's classification; `cancelled` produces only a transient acknowledgement. The rule is extended to cover resting non-terminal states as well — `idle` and `paused` also produce only a transient acknowledgement — so every state a run comes to rest in is reported exactly once and none falls through unannounced. The single carve-out is a condition another requirement already reports differently, namely the message limit (REQ-NOTIFY-266). | REQ-NOTIFY-059 |
| 9 | RESOLVED | Two halves. The status: `paused_message_limit` presents as `paused` (see OQ 15), so the session reads paused rather than idle and is not busy. The path: focusing such a session presents REQ-NOTIFY-266's window-modal confirmation at once, the command-palette entry for continuing a paused session stays enabled only in that state, and a run other than the focused one reaching its limit raises a persistent `info` notice naming the session with a focus action rather than opening a dialog over unrelated work. "Reattached" was reworded, since there is no separate process to reattach from. | REQ-NOTIFY-248, REQ-NOTIFY-266 (new), REQ-NOTIFY-247 (withdrawn) |
| 10 | RESOLVED | The persistent error notice of REQ-NOTIFY-065, and no other surface. "Run-channel refresh failure" is added to that requirement's producer list, the notice carries the session identifier of the channel that failed so REQ-NOTIFY-028's scoping applies, and the values already displayed for that session are left standing rather than blanked — a refresh that could not complete must never present as a run with no state. This differs deliberately from REQ-NOTIFY-207, where a failed subscription-limits refresh raises nothing: that is a settings-row convenience read, while a run channel failing to refresh means live run state is no longer being received. | REQ-NOTIFY-065 |
| 11 | RESOLVED | No new lifecycle member. `interrupted` keeps presenting as `idle`, so REQ-NOTIFY-050's busy test stays over the nine members of REQ-NOTIFY-048 and no surface has to learn a tenth word. The distinction the question was reaching for is carried where it is actually needed — the session list, which marks a session whose persisted execution status is `interrupted`, on the same terms as the stale marker of REQ-NOTIFY-156: not by colour alone, and exposed in the row's accessible name. | REQ-NOTIFY-160, REQ-NOTIFY-049 (confirmed; no change), REQ-NOTIFY-156 |
| 12 | RESOLVED | REQ-NOTIFY-047 is canonical, and the action vocabulary was corrected to match rather than the other way round. "Initialize or resolve a project" is replaced by "open the project-initialization surface for a named workspace" — a navigation, not a write. Initialization is started, and its actionable-failure retry over exactly the pending tasks is offered, inside that surface, where REQ-NOTIFY-047 already requires the outcome to be reported. REQ-NOTIFY-044 now states as a closed property that no action in the vocabulary performs work in the user's project. | REQ-NOTIFY-044, REQ-NOTIFY-047 (confirmed; no change), REQ-NOTIFY-229, Data & Formats (notice action vocabulary) |
| 13 | RESOLVED | Single-slot replacement is canonical; nothing is queued, restored or re-presented, because a returning notice would make REQ-NOTIFY-024's "does not return unprompted" and REQ-NOTIFY-026's identifier matching incoherent. REQ-NOTIFY-003's obligation is redefined as discharged at publication. Retrievability is then supplied where the document already keeps durable evidence: new REQ-NOTIFY-268 records every `warning` and `error` notice, with its title, body and detail unchanged, to the timeline of the session it concerns, or to application diagnostics where unscoped — recording before rendering, so a notice superseded within one event-loop turn is still recorded. `info` and `success` notices are deliberately not recorded; only failures, refusals and recovery-bearing outcomes need to survive replacement. | REQ-NOTIFY-268 (new), REQ-NOTIFY-003, REQ-NOTIFY-024, Data & Formats (timeline entries) |
| 14 | RESOLVED | Both halves. Severity: REQ-NOTIFY-032's notice is not an error notice at all — it is an attention notice about work the user is not looking at — so REQ-NOTIFY-065 is scoped to error notices and explicitly excludes it, and `warning` stands, because the focused work is unaffected. Duplication: the classification of REQ-NOTIFY-060 still runs for a non-focused failure, setting status and fixing the recovery, but its error notice is withheld while that session is unfocused and is published on focusing it. That gives exactly one notice per failure at any moment, and delivers the recovery affordances at the moment REQ-NOTIFY-030 already says they must move. | REQ-NOTIFY-032, REQ-NOTIFY-065, REQ-NOTIFY-060 (confirmed; no change) |
| 15 | RESOLVED | `paused_message_limit` presents as `paused`. `idle` was the defect: a run stopped at its limit is resumable and a command-palette entry offers to continue it, which contradicts an idle reading, while a tenth vocabulary member would force every surface to learn a word carrying no display distinction. `paused` is already in the vocabulary, is already not busy under REQ-NOTIFY-050, and already means "stopped, resumable". | REQ-NOTIFY-049, REQ-NOTIFY-248 |
| 16 | RESOLVED | The 2-second activation budget binds and the 20-second classifier bound is the defect, so it is replaced: the classification call's own bound becomes 2 s, and it is allowed only whatever remains of the activation budget when it is dispatched. Exceeding that is a failed classification handled by REQ-NOTIFY-109, which already decides from collected signals alone — the design tolerates classifier failure by construction, so a tight bound costs nothing, whereas a 20-second call would break a stated end-to-end guarantee. The bound gains the key `runtime.loop_classification_timeout` (see OQ 26). | REQ-NOTIFY-106, REQ-NOTIFY-100, Data & Formats (configuration keys, thresholds) |
| 17 | RESOLVED | Confirmed, and the ambiguity removed at the source. REQ-NOTIFY-146 describes how an unrepaired stale session reads and no longer implies a gate: worktree integration is named as the one operation exempt from that reading, and REQ-NOTIFY-159 is named as the sole binding requirement for the integration precondition. Checkpoint restore and session-list actions still see the session as busy, which is what REQ-NOTIFY-157 and REQ-NOTIFY-158 depend on. | REQ-NOTIFY-146, REQ-NOTIFY-159 (confirmed; no change) |
| 18 | RESOLVED | Bottom-right corner of the host window's content area, 16 px from the right edge and 16 px from the bottom edge. Bottom-right keeps the acknowledgement out of the top-of-window band REQ-NOTIFY-034 gives the persistent banner, so a banner and an acknowledgement never contend for the same strip; 16 px is a single value used for both margins so nothing has to be re-derived per edge. Where the host is narrower than the bounded width plus those margins, the width yields and the margins hold. REQ-NOTIFY-017's "nearest the anchoring corner" is made concrete: newest lowest, earlier ones moving upward, 8 px between adjacent acknowledgements. | REQ-NOTIFY-012, REQ-NOTIFY-017 |
| 19 | RESOLVED | Both presentations draw a 1 px border on all four sides. Neutral uses the surface's ordinary border colour; error uses the error severity colour and adds a left-edge rule three times that width in the same colour. The error case is therefore distinguished by shape as well as colour, which is what REQ-NOTIFY-258 demands, and the treatment is the same one REQ-NOTIFY-035 already fixes for a persistent notice — one visual rule for severity across both surfaces rather than two. | REQ-NOTIFY-014 |
| 20 | RESOLVED | Entry translates in from the edge the acknowledgement anchors to — the right edge, given OQ 18's bottom-right anchor — over 160 ms with opacity rising from zero to full; exit is the reverse over 120 ms. Deriving the direction from the anchor rather than naming a fixed direction means the two decisions cannot drift apart. Exit is shorter than entry so a stack reflows promptly when one member leaves. Both are suppressed entirely under the reduced-motion rule already stated in the requirement. | REQ-NOTIFY-022 |
| 21 | RESOLVED | 1 px border, so the left rule is 3 px under the fixed 3× ratio. One pixel is the smallest width that can carry the 3:1 contrast floor reliably at every scale factor, and it makes the notice border and the acknowledgement border of OQ 19 identical, so severity looks the same on both surfaces. | REQ-NOTIFY-035, REQ-NOTIFY-014 |
| 22 | RESOLVED | Under decision 5 this is human-readable text read aloud by assistive technology, so no separator string is fixed. What is fixed is the observable property: the parts are joined so that assistive technology announces them as distinct phrases rather than as one run-on word, and the joining text belongs to no part's own content — so a test can assert the parts and their order without asserting punctuation. Applied to both the acknowledgement name and the notice name and description. | REQ-NOTIFY-019, REQ-NOTIFY-041 |
| 23 | RESOLVED | This domain enumerates none of the three sets; it cites the domains that own them. A notice action's view is one of the seven primary views of REQ-SHELL-023, its settings category one of the thirteen identifiers of REQ-CONFIG-269, and its library tab one of `prompts`, `artifacts`, `proposals` from REQ-LIBRARY-103. Notifications adds no view, category or tab of its own, and an action naming a value outside the owning domain's vocabulary is not dispatched — which is a testable closure without this document holding a fourth copy of three lists that would drift. | REQ-NOTIFY-044, Data & Formats (notice action vocabulary) |
| 24 | RESOLVED | No tier applies, and none is guessed. Where the exhausted model records no role, or one outside `small_model` / `medium_model` / `large_model`, the candidate set is empty by construction, no automatic fallback is attempted, and the run enters REQ-NOTIFY-083's wait state directly. Inferring a role from the model's name or size would silently move a user's work onto a model they never assigned; entering the wait is the conservative outcome the document already provides for "no fallback exists". | REQ-NOTIFY-082 |
| 25 | RESOLVED | One fixed order, most constrained first: provider-enforced response schema; tool call carrying the schema; provider JSON-object mode with no schema; plain text parsed against the schema. Most-constrained-first means each fallback loses exactly one guarantee at a time, and it makes "the next format that provider accepts" total. Refusal of the last member fails the operation as an ordinary failure rather than looping. The order is also recorded in Data & Formats. | REQ-NOTIFY-098, Data & Formats (structured-output format preference order) |
| 26 | RESOLVED | `runtime.tool_call_timeout` (30 s), `runtime.shell_command_timeout` (100 s), `runtime.summary_timeout` (120 s), and — added by OQ 16 — `runtime.loop_classification_timeout` (2 s, never exceeding the remaining activation budget). All four sit in the `runtime` section beside the bounds already keyed there, so REQ-NOTIFY-100's claim that each of the seven bounds can be changed without changing another is now true of all seven rather than four. | REQ-NOTIFY-100, Data & Formats (configuration keys, thresholds) |
| 27 | RESOLVED | A signature is a canonical serialisation, so equality is decidable without semantic judgement: for a tool call, the tool name plus its argument object with keys ordered, whitespace runs collapsed to a single space, string values trimmed, and every string value cut to its first 200 characters; for an assistant message, the literal `message` plus the same canonicalisation of its text. Truncation at 200 characters is what makes near-identical long prose count as repetition, which is the behaviour the detector exists for; ordering keys makes the comparison independent of serialisation order. | REQ-NOTIFY-108 |
| 28 | RESOLVED | Two closed lists. Recovery-eligible: no output within `runtime.child_stall_timeout`; a single tool call or shell command exceeding its own bound while the child's own bound was unspent; incomplete work with the iteration allowance spent; a repeated read-then-edit cycle producing no commit. Not recovery-eligible: `cancelled`, `blocked`, an authentication failure, a quota exhaustion, a permission refusal, a validation error in the task definition, and the child's own `runtime.child_timeout` being exceeded. The dividing line is whether an instruction could plausibly change the outcome — a denied permission or an exhausted quota cannot be instructed away, and a child that consumed its whole budget has nothing left to spend on advice. REQ-NOTIFY-111's "stuck condition it can recover from" now points at this list rather than restating it. | REQ-NOTIFY-112, REQ-NOTIFY-111 |
| 29 | RESOLVED | A gate-authoring note is exactly the artifact that gate authoring under REQ-NOTIFY-138 wrote into the workspace proposing a gate that has not yet been applied — it counts as found where that artifact exists and parses, and nothing else does. In particular no file authored by the workspace's own contributors is read for this purpose, so which of the two fixed sentences a user sees never depends on how their repository happens to be documented, and the product only ever cites a note it wrote itself. | REQ-NOTIFY-137 |
| 30 | RESOLVED | Known drift is defined by reuse, not by a new concept: exactly the staleness conditions of REQ-NOTIFY-187 evaluated against the unit's own evidence — the recorded commit no longer being the requirement's current commit, or the recorded requirement-text hash differing from the current text's hash — together with any traceability link the unit recorded that no longer resolves. "No known drift remains" holds exactly where none of those does, at the moment the result is recorded. This makes the completion contract checkable from data the unit already records under REQ-NOTIFY-176. | REQ-NOTIFY-175 |
| 31 | RESOLVED | An unrecognised kind is displayed, never hidden and never rendered as unblocked. It shows its recorded reason word for word under REQ-NOTIFY-183, states that its kind is not one for which the board defines an answer, and offers exactly one thing to do: open the requirement it blocks. It offers no choice, because none is defined — and critically the board invents none, which keeps REQ-NOTIFY-186's "renders verdicts produced elsewhere and derives none of its own" intact. REQ-NOTIFY-184's "at least one thing to do" guarantee is extended to cover it explicitly. | REQ-NOTIFY-182, REQ-NOTIFY-184 |
| 32 | RESOLVED | The requirement's delivery state moves to `needs-update`, a member REQ-TRACE-232 already defines, and stays there until verification runs again and records fresh evidence. While re-verification is outstanding the earlier evidence stays on screen marked stale together with which of the two recorded values stopped matching — neither removed nor rewritten — so the user can see what was verified and why it no longer counts. Deleting the evidence was rejected: it would leave the requirement indistinguishable from one never verified, losing the information the staleness check just produced. | REQ-NOTIFY-187 |
| 33 | RESOLVED | Bounded at 10 seconds of re-attempts at 150 ms. Within the bound nothing is reported as a failure, as drafted; on expiry the request stops and the listing is reported as a failed listing under REQ-NOTIFY-195, its detail stating that the checkpoint channel stayed occupied. An unbounded re-attempt was the defect: it leaves a progress indicator that never resolves, which REQ-NOTIFY-001 forbids for any workflow. 10 seconds matches the update-check bound already in the document, so the product has one "we waited long enough" figure rather than two. | REQ-NOTIFY-192 |
| 34 | RESOLVED | `coming_soon`: the runtime provider catalog of REQ-NOTIFY-210 declares the provider announced but not yet connectable — no authentication offered, no capability call made. `error`: the capability call of REQ-NOTIFY-199 could not be completed for a reason other than credential rejection (network failure, timeout, malformed response, provider-reported fault). `warning`: the call succeeded but the provider is usable only in part — models reported unavailable under REQ-NOTIFY-205, a failed subscription or credit read under REQ-NOTIFY-207, or exhaustion marked under REQ-NOTIFY-088. A total precedence order is added for overlapping conditions — `coming_soon`, `checking`, `unauthenticated`, `error`, `warning`, `healthy`, `unknown` — so the single indicator REQ-NOTIFY-200 promises is always well defined. | REQ-NOTIFY-200 |
| 35 | RESOLVED | No fifth label. The four are given closed entry conditions instead: Funded where the balance can fund the next call; Out of credit where it is zero, or above zero yet insufficient; Overdrawn where it is below zero; Unknown state where sufficiency cannot be determined. "Out of credit" therefore covers the small-positive-balance case, which is the honest reading for a user — the money will not buy the next call — and it keeps REQ-NOTIFY-209's "displayed as unable to proceed rather than as funded" true without widening the vocabulary. | REQ-NOTIFY-209 |
| 36 | RESOLVED | Per workspace and declared hook set, within one application session: the pair is (workspace, hook-set fingerprint recorded by REQ-HOOKS-092). Changing the declared set forms a new pair and publishes again; a new launch publishes again while the condition holds. Per-workspace alone would suppress the notice after the repository added a hook; per-launch alone would re-nag on every workspace switch. Since notices are not persisted (REQ-NOTIFY-027), no part of this suppression survives a restart, which is stated so the "publishes again each launch" behaviour is not read as a defect. | REQ-NOTIFY-224 |
| 37 | RESOLVED | The second statement — declares hooks that have not been reviewed — applied over the whole current set. A recorded decision covers exactly the set it was recorded against, and REQ-HOOKS-095 already invalidates it on any addition, removal, alteration or reordering, so there is no partial approval and therefore no mixed state to report. The count REQ-NOTIFY-224 states is the size of the current set, not of the part added since the review, which keeps the count and the withheld-hook set the same number. | REQ-NOTIFY-227, REQ-NOTIFY-225 (confirmed; no change) |

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
