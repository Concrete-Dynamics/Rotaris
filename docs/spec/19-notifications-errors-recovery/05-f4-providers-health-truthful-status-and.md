# Notifications, Error Handling, and Recovery — F4. Providers: health, truthful status and settings-level recovery

Part 5 of 7 of [domain 19](../19-notifications-errors-recovery.md), which indexes every part. Defines REQ-NOTIFY-199 – REQ-NOTIFY-253.

### F4. Providers: health, truthful status and settings-level recovery

**REQ-NOTIFY-199** — Local authentication status is checked, and a provider reporting credentials is validated by calling a free capability endpoint — model discovery, or that provider's equivalent — rather than being trusted.

**REQ-NOTIFY-200** — A provider's status indicator reads exactly one of seven states — `checking`, `coming_soon`, `error`, `healthy`, `unauthenticated`, `unknown`, `warning` — each carrying its own text label distinct from the other six, so the state is readable without colour. A provider reads `healthy` only after the capability call of REQ-NOTIFY-199 has succeeded for it within the current check; one not yet checked reads `unknown`; one being checked reads `checking`; one whose credentials the provider rejected reads `unauthenticated`. A stored credential on its own never makes a provider read `healthy`. The remaining three have entry conditions of their own. A provider reads `coming_soon` where the runtime provider catalog of REQ-NOTIFY-210 declares it announced but not yet connectable; no authentication is offered for it and no capability call is made. It reads `error` where the capability call of REQ-NOTIFY-199 could not be completed for a reason other than the provider rejecting the credential — a network failure, a timeout, a malformed response, or a fault the provider reported about itself. It reads `warning` where that call succeeded but the provider is usable only in part: it reported one or more models unavailable under REQ-NOTIFY-205, its subscription or credit read failed under REQ-NOTIFY-207, or it is marked exhausted for the session under REQ-NOTIFY-088. Where more than one condition holds, the state shown is the first that applies in this order: `coming_soon`, `checking`, `unauthenticated`, `error`, `warning`, `healthy`, `unknown`. This requirement is the product's single definition of the provider status vocabulary, of its entry conditions and of that precedence order: a document that needs to name a provider status cites this identifier rather than restating the set, and a condition needing a status of its own extends this list rather than minting a value elsewhere. No surface may show a provider status outside these seven.

**REQ-NOTIFY-201** — Each provider row offers authenticating or re-authenticating and logging out, and logging out is confirmed first.

**REQ-NOTIFY-202** — Authentication uses a modal that either prompts for an API key without echoing it or presents device-code or browser instructions, validates the credential before saving it, and persists the models it discovered while validating. Device and browser instructions include the target URL rendered as an activatable link and the code to enter, and state that the browser may have opened already.

**REQ-NOTIFY-203** — Network and authentication work runs off the interface thread. Every exception it raises is surfaced to the user, and failures appear in the provider's own row or in the modal that triggered them, never as an application-level crash and never as a silent no-op. Such a failure names three facts: the provider it concerns; the operation that was attempted, being one of a health check, an authentication, a logout or a model discovery; and the reason, with the provider's or the transport's own text reproduced rather than paraphrased, on the terms of REQ-NOTIFY-005. Those three facts are required; the wording that carries them and their arrangement within the row or the modal are the implementation's.

**REQ-NOTIFY-204** — A status line reporting a failure still reads as a failure after the colour theme changes while it is on screen: both its wording and its failure presentation survive the change, and a visible error is never repainted as an ordinary progress message.

**REQ-NOTIFY-205** — A model the provider reports as unavailable stays in the model list, marked unavailable, with one sentence in the provider's own wording stating why it is unavailable and what the user can do about it. Unavailable models are never dropped, so the list continues to name every model the provider accounts for.

**REQ-NOTIFY-206** — Across a provider-health update the settings list is steady: rows keep their order and their place on screen, the list's scroll offset is unchanged, and any selection or keyboard focus inside the list is where it was. A row whose displayed values did not change does not visibly change.

**REQ-NOTIFY-207** — A subscription-limits refresh that fails, or that finds the provider still unauthenticated, leaves the previously displayed values in place and raises no error.

**REQ-NOTIFY-208** — An empty provider list shows a quick-start empty state carrying a per-provider quick-start destination.

**REQ-NOTIFY-209** — Hosted-cloud credit is displayed in each of its four phases — `error`, `loading`, `ready`, `signed_out` — and none of the four renders as blank or as an absence. In the ready phase the balance carries exactly one of four labels and there is no fifth: Funded where the balance can fund the next call; Out of credit where it is zero, or above zero yet insufficient to fund the next call; Overdrawn where it is below zero; Unknown state where whether it can fund the next call cannot be determined. A ready balance that cannot fund the next call therefore reads Out of credit or Overdrawn and never Funded. A failed read displays its technical detail in copyable form rather than a paraphrase of it. The balance is displayed as an absolute amount of credit, never as a percentage or a proportional meter.

**REQ-NOTIFY-210** — Provider identity used by settings and by the authentication and quota recovery surfaces — connection mode, destination, operator, privacy information — comes from one runtime provider catalog, and from no second list held in the interface.

### G1. Application updates

**REQ-NOTIFY-211** — Only standalone packaged builds check for an update; an installation made by a package manager does not check.

**REQ-NOTIFY-212** — The application checks once per launch against the vendor's published release feed and abandons the check after at most 10 seconds. Where the network cannot be reached, or the feed has not answered within that time, startup is unaffected: no notice, no acknowledgement and no error appears, nothing waits on the check, and the user is asked nothing.

**REQ-NOTIFY-213** — A non-success or malformed response, a missing release and a rate-limited request included, is logged, and nothing the user can see is disrupted.

**REQ-NOTIFY-214** — Versions are compared as semantic versions, and prereleases and drafts are ignored. No user-facing opt-out from checking exists.

**REQ-NOTIFY-215** — Where a newer version is found, a non-blocking persistent info notice offers it once the main window is visible, naming the version, carrying the release summary or, where none exists, directing the user to the full release notes, and offering an action that installs it.

> **Narrowed by [`PD-STARTUP-008`](../../product/directives/pd-startup-008.md#pd-startup-008), 2026-10-22.** On a build that downloads in the background (REQ-STARTUP-169) the
> notice for a newer version is the download's notice, and it offers no install action before the download. The
> non-blocking persistent offer, its version and its summary still govern where an offer is shown.

**REQ-NOTIFY-216** — Closing the update notice without choosing is itself the answer that the user is to be reminded at the next launch. The dismissed version is persisted, and only that version is suppressed; a newer version is offered again.

**REQ-NOTIFY-217** — The update notice's identifier is retained, so dismissing an unrelated notice never records a dismissed version. The dismissed version is recorded before the notice is cleared.

**REQ-NOTIFY-218** — Download progress is reported inside the notice that made the offer: its title names the version being downloaded, and its body states the percentage complete and that the download will be verified against the published checksum when it finishes. Where the total size is unknown, downloaded megabytes are stated instead. Progress text is updated only on whole-percent changes where the total size is known, and only on whole-megabyte changes of the amount downloaded where it is not; in either case a final update is published when the download settles, so the last text shown states the amount actually received rather than the last threshold crossed.

**REQ-NOTIFY-219** — A downloaded update is installed only after its SHA-256 digest has been compared with the digest published for that release in `SHA256SUMS.txt` and the two match. Where they differ, the update stops, the installed application is left exactly as it was, and the failure is reported under REQ-NOTIFY-221. No signature is verified: a matching digest establishes that the download is the published file and nothing about who published it.

**REQ-NOTIFY-220** — Installation follows the package flavour: a portable Linux bundle is replaced in place; a portable Windows executable is moved aside and the new one put in its place; an installed Windows build launches its installer and the application exits; a macOS disk image is mounted and revealed for the user to complete the move.

**REQ-NOTIFY-221** — A failed update publishes a persistent error notice stating that the update was not installed, that the application is unchanged, and that the user can try again or download the release manually, with copyable detail and a retry action.

**REQ-NOTIFY-222** — A completed update publishes a persistent success notice. Where the application can restart itself, that notice offers a restart action. Where an external installer must take over, the notice states instead that the installer will finish the update, and the window closes on its own 1200 ms after the notice appears, with no user action. Where a restart the user asked for does not happen, the failure notice of REQ-NOTIFY-221 is published in its place.

> **Narrowed by [`PD-STARTUP-008`](../../product/directives/pd-startup-008.md#pd-startup-008), 2026-10-22.** Where an external installer must take over, the downloaded update
> publishes REQ-STARTUP-174's persistent notice with the restart action, and the window does not close on its own; the
> installer runs at the next start or when the user restarts. The in-place case and the failed-restart case still govern.

### G2. Window chrome and attention state

**REQ-NOTIFY-249** — The title bar carries session status as a single tag-styled chip combining the status indicator and the status word, never as a free-floating dot beside a word.

**REQ-NOTIFY-250** — A subordinate indicator one size step smaller than the status chip reports background post-run improvement analysis, labelled to state that a review is in progress and describing that the user can continue working. It is shown only while that analysis is in flight.
  > **Narrowed by [`PD-LIBRARY-002`](../../product/directives/pd-library-002.md#pd-library-002) revision 2, 2026-10-13** ([OQ-236](../../architecture/open-questions/51-spikes-and-later-questions-18.md#oq-236)). The indicator is also
  > shown while a user-started retrospective is in flight, labelled "Reviewing workspace history for improvements…"
  > (clause (d)); for the post-run pass the text above governs unchanged.

**REQ-NOTIFY-251** — Post-run improvement analysis never blocks or alters a run. On failure, or on exceeding `runtime.improvement_collector_timeout`, default 60 seconds, it yields an empty artifact.

  > **Extended by [`PD-LIBRARY-002`](../../product/directives/pd-library-002.md#pd-library-002), 2026-09-17.** The
  > same non-blocking discipline governs the directive's user-started retrospective: it runs off
  > everything the user is waiting on, is bounded by its own timeout with the empty-artifact
  > outcome, and never blocks or alters a run — it is not attached to a run at all, so there is
  > nothing of one it could alter.

**REQ-NOTIFY-252** — A run waiting on a person — for an approval it raised, or for an answer to a question it asked — is displayed as awaiting input. This holds for every session and not only the focused one, so a background run waiting for an answer is visibly waiting without being focused first. One sentence states that condition, worded identically on every surface that states it, and where the condition does not hold that sentence appears nowhere.

**REQ-NOTIFY-253** — Where a todo edit cannot be written through to the live run, the persisted session state is reloaded and the user is told that the todo changed elsewhere and that the latest session state was loaded.
