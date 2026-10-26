# Run Monitoring and Steering — 20. Status bar and title bar

Part 4 of 8 of [domain 02](../02-run-monitoring-steering.md), which indexes every part. Defines REQ-MONITOR-176 – REQ-MONITOR-213.

### 20. Status bar and title bar

**REQ-MONITOR-176** — The bottom status strip shows plain-text readings of: workspace path, branch, safety flags, current model, cumulative tokens (thousands-separated with a `tok` suffix, tooltip explaining that it counts tokens used by this workspace's runs), a cost reading, and the number of background sessions.

**REQ-MONITOR-177** — When no cost label exists, the cost reading is hidden entirely rather than rendering a bare label with no value.

**REQ-MONITOR-178** — The status strip shows a cloud-credit chip reading `{balance} credit`, with an additional no-credit warning marker when spending admission is blocked, tinted with the accent color normally and the warning color when blocked, with a tooltip naming the account state and stating that activating it opens the account page for topping up. The chip is hidden entirely unless a credit reading is ready.

**REQ-MONITOR-179** — The title bar shows a session chip whose dot pulses for live states, a label of the form `session {status}`, and an accessible description stating the session status in a sentence.

**REQ-MONITOR-180** — While post-run improvement analysis is running, a separate informational, pulsing indicator with its own label is shown; setting it must not change run state. Across parallel runs the indicator is the logical OR of all runs, so that when one run's analysis finishes the indicator stays lit while any other run is still analyzing.

### 21. Provider limits, cloud credit, and quota waits

**REQ-MONITOR-181** — The subscription-limits card renders one row per provider limit, each carrying: the limit's label; a monospaced reading of the amount used against the allowance; a progress bar filled to that fraction; and a detail caption. A bar at or above 60% of its allowance renders in the warning tint by default, paired with text so the warning is never carried by colour alone (REQ-SHELL-149). The reading must convey the amount used and the allowance as two separately identifiable figures in the same unit; where that unit is money it is computed and rendered by the single money-arithmetic rule of REQ-PROVIDER-121, and where it is a count it carries thousands separators. The detail caption must convey when the allowance next resets, and, where the provider states it, the length of the window the allowance covers; where the provider supplies no reset information the caption says that the reset time is not known rather than omitting the caption. The wording and the separators of both are the implementation's.

**REQ-MONITOR-182** — Limits for every authenticated provider are fetched without any one provider delaying another: the interval from the first request to the last row settling must not exceed the longest single-provider timeout plus a small fixed overhead, and must not grow in proportion to the number of providers configured. A provider that is slow, unauthenticated, or failing must never delay or suppress the rows of providers that answered. The per-provider fetch timeout is 5 seconds — the same timeout the provider domain applies to a subscription-usage request, so one figure governs the call and the surface waiting on it — and the fixed settling overhead the card is allowed on top of it is at most 1 second, whatever the number of providers configured. A provider that has not answered within its timeout settles as a degraded row (REQ-MONITOR-183) rather than holding the card open.

**REQ-MONITOR-183** — A provider that is unauthenticated or whose fetch failed keeps a visible degraded row naming the provider, stating that usage is unavailable, and giving the specific remediation for that provider (sign in, run the provider's token setup, or retry when the provider exposes usage data). The card's empty state explains that providers which are signed in may report subscription limits there.

**REQ-MONITOR-184** — Limits are computed a single time at startup; there is no polling loop, no expiry timer, and no file watching. After settings observes a successful re-authentication of a provider, a refresh is triggered on a background worker; its result replaces the stored limits and notifies views, which re-render with no additional wiring. A failed refresh degrades to the unavailable card and must never present a blocking dialog.

**REQ-MONITOR-185** — Cloud credit is modeled with a phase of `signed_out`, `loading`, `ready`, or `error` — every phase has something to show, so the tile is never drawn as an empty card — and a state of available, exhausted, overdrafted, or unknown, each carrying its own label. It carries a pre-rendered balance label, a last-call cost label, a backend admission flag, and a copyable error string. Credit is considered blocked exactly when the phase is ready and admission is not allowed.

**REQ-MONITOR-186** — Cloud credit is re-read at application start, on cloud sign-in, whenever a run leaves a live-claiming status for any status that does not claim one (REQ-MONITOR-024, over the vocabulary of REQ-SESSION-073) — which covers every status that ends a run and a return to idle alike, because every run that executed spent credit whatever its outcome — on a repeating 120-second timer, and on explicit user request. The 120-second interval is fixed and is not user-configurable: the reading is cheap, it is what admission decisions are answered from (REQ-MONITOR-187), and a user-lowered interval would only add traffic while a user-raised one would only make a blocked account discovered later. The timer runs only while the application window is visible; it is suspended while the window is minimized or hidden and resumes with an immediate re-read when the window is shown again, so a hidden application performs no periodic credit work (REQ-MONITOR-174). No re-read may block the interface: while one is in flight every control stays operable and the previous reading stays on screen until a newer one replaces it.

**REQ-MONITOR-187** — Given a run whose models are cloud-hosted and a last reading indicating the account may not spend, starting the run must first raise a confirmation that names the balance; the user may start anyway. The check is answered from that last reading alone and must add no network call to the start path.

**REQ-MONITOR-188** — Credit state must be conveyed by text and shape, never by color alone.

**REQ-MONITOR-189** — Given a run failure whose message contains "rate limit" or "quota" (case-insensitively): on cloud models with a ready credit reading, a persistent error notice is raised naming the reported balance and state, stating that the session is preserved and that the user may top up or choose a model on another provider, offering an action to open the cloud account, and the balance is re-read because the reading that produced the failure is by definition stale. Otherwise a persistent error notice states that a provider limit was reached, that the session is preserved, and that the user may choose another model or retry after the provider resets, offering a change-model action.

**REQ-MONITOR-190** — All other run failures raise a persistent error notice stating that the run failed and that the session and draft were kept for recovery, with a review action, and with the raw failure message retained in copyable details.

**REQ-MONITOR-191** — Quota retry backoff honors a provider-supplied retry-after value when present (minimum 1 second); otherwise it is exponential from a 60-second base doubling per attempt and capped at 300 seconds.

**REQ-MONITOR-192** — While parked on a quota wait, an agent waits on a decision keyed by that agent. Where automatic resume is allowed, the wait timing out resolves as a retry. Where it is not allowed, the wait continues indefinitely until a person decides.

**REQ-MONITOR-193** — The fallback candidates offered during a quota wait are exactly the configured models, from any configured provider, whose size tier equals the current model's tier, less any model excluded under REQ-MONITOR-194. A model's tier is not established here: it is the tier alias the model resolves through (REQ-CONFIG-070, REQ-CONFIG-071) as REQ-ORCH-019 defines it, and this domain adds no second rule for deriving one. A model that resolves through no tier alias has no tier, is therefore never an automatic fallback candidate, and may still be chosen explicitly. Candidates are presented in the order their models are declared in the configuration, so the order is deterministic, reproducible across runs, and under the user's own control; no ranking by price, latency, or provider is applied.

**REQ-MONITOR-194** — A provider-and-model pair that answered with a structured insufficient-quota response (HTTP 429) is recorded in the session record as out of quota. For the rest of that session it is neither retried automatically nor offered as an automatic fallback candidate (REQ-MONITOR-193), and the exclusion survives a resume of the same session. The exclusion governs automatic behavior only. A user may still choose an excluded pair explicitly, from any model selector or from the quota-wait decision surface (REQ-MONITOR-303), and it must be listed there rather than hidden, annotated with the reason that the provider reported insufficient quota for it in this session — the same treatment REQ-MONITOR-067 requires of any withheld model. Choosing it explicitly clears the recorded exclusion for that pair, so it is eligible again until a further insufficient-quota response re-records it.

**REQ-MONITOR-195** — Entering a quota wait sets the execution status to `waiting`, records a wait state carrying the waiting agent, the message, the model, the wait duration in seconds, and whether automatic resume is allowed, and appends a system transcript row. The wait state is cleared on resume or stop. `waiting` belongs to the live-claiming subset (REQ-MONITOR-024), so a quota-waiting session keeps presenting its parked agents (REQ-MONITOR-291) and is not reconciled to a terminal outcome (REQ-MONITOR-211).

- **REQ-MONITOR-196** — *Withdrawn.* Its only surface was a terminal-interface modal, and the product has no terminal interface; the decision surface it described is carried by REQ-MONITOR-303.

**REQ-MONITOR-197** — Every host (REQ-MONITOR-003) presents from the same wait state and `waiting` status, delivered to all of them alike (REQ-MONITOR-216), and every one of them must present the run as waiting on provider quota, not as stalled or failed.

**REQ-MONITOR-303** — Entering a quota wait raises a decision surface in the desktop interface for the session that is waiting. It must convey that the run is parked because a provider reported its quota exhausted, and must name the model and the provider. It has two body variants, chosen by the wait state's automatic-resume flag (REQ-MONITOR-195): where automatic resume is allowed, it also conveys the approximate retry delay and that the run will retry by itself if left alone; where it is not, it also conveys that this provider-and-model pair is treated as out of quota for the remainder of the session (REQ-MONITOR-194). It offers exactly three choices, and the set of three is a fixed contract while the wording of each is the implementation's: keep waiting, which resolves the wait as a retry and returns the status to `running`; cancel the run, which takes the ordinary cancellation path (REQ-MONITOR-127, REQ-MONITOR-129); and change model now, which opens a model picker offering the fallback candidates of REQ-MONITOR-193, listing excluded pairs with their reason rather than hiding them (REQ-MONITOR-194), and which on selection applies the run's model switch (REQ-MONITOR-142) and resolves the wait as a retry on the chosen model. The surface must not block the rest of the application: while it is open the transcript keeps updating, other sessions keep running, and every other control stays operable. Dismissing it without choosing leaves the wait exactly as it was and does not answer it; while the session's status is `waiting` the surface must remain reachable again from the run header, so a dismissed decision is never a lost one. At most one such surface exists per waiting session, and a session that leaves `waiting` for any reason closes its own.

> **Narrowed by [`PD-MONITOR-004`](../../product/directives/pd-monitor-004.md#pd-monitor-004), 2026-10-06, revision 2 the same day.** The
> change-model picker lists every configured model key, alphabetically, the waiting model included, with an out-of-quota
> pair annotated and choosable; REQ-MONITOR-193's candidates are not its filter. *Revision 2:* keep waiting resolves the
> wait as a retry, at once, only where automatic resume is not allowed (an out-of-quota pair, retried as an explicit
> choice of it, which clears its exclusion); where automatic resume is allowed it acknowledges and changes nothing, and
> the timer resolves the wait as a retry when the interval elapses. Every other clause above still governs.

### 22. Failure visibility

**REQ-MONITOR-198** — Run lifecycle feedback is normalized across hosts around exactly eight event kinds: run started, run progress, run paused, run cancelled, run completed, run failed, quota wait entered, and recovery (from a stall or from a quota wait). Every host must expose all eight as separately identifiable events — a consumer must be able to tell which kind occurred without parsing free-form text — and no host may collapse two kinds into one or add a ninth.

**REQ-MONITOR-199** — Completion and failure notices must persist with copyable technical details rather than relying on transient messages. A notice carries a severity, title, message, detail text, a persistence flag, an optional action label and identifier, and the session it belongs to.

**REQ-MONITOR-200** — Starting a run clears only those persistent notices whose session id is the session being started. A persistent notice carrying any other session id survives that start and every start after it, and is removed only when the user dismisses it or when a newer notice for that same session replaces it. Starting a new run must never be the reason a user loses the record of another session's outcome.

**REQ-MONITOR-201** — When the focused run completes successfully, a persistent success notice states that the run completed and invites review of the transcript and artifacts, with an action to view artifacts. Other terminal states of the focused run produce a transient message naming the terminal status.

**REQ-MONITOR-202** — When a background run finishes, a persistent notice names the session and its terminal status, states that the focused run continues and the user may switch to review the finished one, and offers a switch action. A background failure uses warning severity, a title naming the failed session, and carries failure details.

**REQ-MONITOR-203** — Given a run that failed without letting an exception escape (the loop caught the error and summarized it into its progress record), the failure must still be reported through the failure path with the loop's own wording, so that authentication-recovery handling still runs instead of the session ending with a bare failure message and no recovery offer.

**REQ-MONITOR-204** — Given a run that requested a sandbox and never reported having started, the backend's refusal reason and remediation must be shown verbatim under a title stating the run stopped before it started; a generic failure message that invites an unsatisfiable retry is not acceptable.

**REQ-MONITOR-205** — A lifecycle-hook advisory raises a persistent warning notice whose title says lifecycle hooks need attention and which offers an action that opens hook settings. The notice must never contain the text of a hook's command. It must appear every time an advisory is raised, whatever the run's state, whichever host is in use, and whether or not the session it concerns is the focused one; an advisory that is raised but not shown is a defect.

**REQ-MONITOR-206** — The terminal whole-state read is retried up to 3 times, 100 ms apart. If every attempt fails, a refresh-failure message naming the attempt count and the underlying error is emitted, and the run's terminal signal still completes: a read failure must never swallow the run outcome.

**REQ-MONITOR-305** — A run carries a warnings surface, reachable while the run is executing, listing conditions that do not stop the run but that a person watching it needs to see. It must list at least: every agent whose context has reached 75% of its compression threshold (REQ-MONITOR-087), naming the agent and its context reading; every failed tool call, naming the agent, the tool, and the failure; and every agent error and every unexpected agent exit, naming the agent and what was recorded. Each entry states which agent it concerns and is actionable — activating it selects that agent (REQ-MONITOR-042). The surface updates when an event changes something it lists and performs no periodic polling, it defers its refresh while hidden and catches up when shown (REQ-MONITOR-039), it carries an explicit empty state, and it conveys severity by text and shape and never by colour alone (REQ-SHELL-149). Entries are warnings and never notices: raising one must not clear, replace, or suppress any notice of REQ-MONITOR-199.

### 23. Crash, orphan, and contradiction handling

**REQ-MONITOR-207** — A session whose execution status claims a live run but whose recorded process identifier is no longer alive is a stale session and must be detectable as such.

**REQ-MONITOR-208** — Liveness probing must not signal the probed process. Where a platform's naive liveness check would deliver an interrupt to the target, an inspection-only mechanism must be used instead, and only an unambiguous "no such process" answer may be treated as proof of death — every ambiguous answer must be treated as alive.

**REQ-MONITOR-209** — Repairing a stale session settles the session to `interrupted` and every orphaned agent to `cancelled`. `cancelled` is a legal transition target from every non-terminal agent state, so repair can settle any agent whatever it was doing.

**REQ-MONITOR-210** — The interface must offer the repair and announce that it happened. A repair attempt on a session whose process is alive must be refused with a reason, and the refusal must distinguish "the process could not be confirmed dead" from "the process is running".

**REQ-MONITOR-211** — Given an execution status that neither claims a live run nor is `idle`, every running, waiting, or queued agent must be settled to the run's own outcome: completed / succeeded / done→done; failed / error→failed; anything else (paused, cancelled, interrupted)→cancelled. Their activity is replaced with a statement that they ended with the run, and their active tool chips are cleared.
  > **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 4, 2026-09-28.** Clause 13: a
  > session at rest never settles a `paused` agent to the run's outcome; it keeps its state and its last activity
  > until it resumes or ends. Every other running, waiting or queued agent is settled as stated.
  > Revision 6 (2026-10-06), clause 23: the agents a crash left present `paused`, by `crash`, before the crash is
  > recorded, and are not settled; a session a store failure left busy is settled as stated.

**REQ-MONITOR-212** — The `idle` status is deliberately exempt from that reconciliation, because a run that never began has no outcome for its agents to inherit.

**REQ-MONITOR-213** — Once reconciliation (REQ-MONITOR-211) has settled an agent, every surface — agent tree, live counters, dashboard, mission graph, persona windows, inspector — must show that agent in the settled state and its cleared activity. No surface may still present it as running, waiting, or queued, and no surface may apply a settling rule of its own or exempt itself from the outcome.
  > **Narrowed by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 4, 2026-09-28.** Clause 13: every
  > surface shows a `paused` agent as `paused`, the one state REQ-MONITOR-211's reconciliation leaves as it is.
  > Every settled agent is shown as stated.
  > Revision 6 (2026-10-06), clause 23: so is an agent a crash left before the crash is recorded, shown `paused`.
