# Archived open questions — Specification questions (3 of 27)

The ruled, closed, resolved and withdrawn entries of [part 08](../../../architecture/open-questions/08-specification-questions-3.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-18"></a>

**OQ-18 — What "shipped model-capability metadata" is.** *(ADR-0028.)* *Part K (2026-09-05) ships the module EMPTY with a shape test: every discovered model exposes no reasoning levels until the owner decides the table's source and update policy; the slots grid keeps offering the five levels for a configured model.* `REQ-PROVIDER-137` and
`REQ-PROVIDER-149` both draw on metadata the product ships that knows, per model, whether a
reasoning-effort parameter is supported, which levels are disclaimed, and whether images are accepted.
Nothing states where it comes from, how it is keyed, or how it is updated. Treating it as build data
alongside the known-limits table is the obvious reading, but it is a **third table of third-party model
facts** and its update policy should be decided deliberately.

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the model-capability metadata is build data in the repository, keyed by model and refreshed at each release, its first entries the models the owner uses most. As built, Part K's module still ships empty with its shape test, so a discovered model exposes no reasoning levels; filling it is release data owed at the next refresh, and this ruling builds nothing.

<a id="oq-19"></a>

**OQ-19 — CLOSED by accepted review, applied 2026-09-07.** REQ-PROVIDER-018/063
and ADR-0029 now permit adjacent coordination locks. Completed operations remove
their own staging files and preserve overlapping operations' files. Enumeration
filters credential JSON. Regression coverage verifies a completed write beside
another operation's retained lock. The following paragraphs preserve the historical question.
`REQ-PROVIDER-018` says that once any credential operation has finished the directory holds nothing but
the per-provider files; `REQ-PROVIDER-152` requires an **adjacent** lock file for every read-modify-write.
The record reads the first as being about the operation's temp files. If it is meant literally and
exhaustively, the lock file must live elsewhere, which "adjacent" would then have to permit. *Still open,
with a cheaper resolution than it had: `REQ-PROVIDER-152`'s stated premise — "may be reached by more than
one application instance at once" — is withdrawn by SR-1, so the requirement is a candidate for amendment
under the standing direction, and **withdrawing the lock file makes the contradiction disappear rather
than needing adjudication**. If it is kept, the reclaim-a-dead-holder clause must be kept with it: that
clause is the part SR-2 makes* more *important, because it is the only thing that settles a lock an
instance that crashed left behind, and `REQ-STARTUP-164`'s reclaim path is one interval in which two
processes of this application genuinely coexist (constraint C-14). **Deleting a lock file and deleting a
settle-a-dead-owner obligation are different acts.***

<a id="oq-20"></a>

**OQ-20 — CLOSED by accepted review, applied 2026-09-07.** REQ-PROVIDER-012/057
now explicitly preserve credentials and last-error state for REQ-PROVIDER-013's
pre-contact failure result. The unsupported-method implementation and regression
coverage follow that exception. The following text preserves the historical question.

**Historical OQ-20.** The 30-second
non-interactive attempt that fails before contacting a provider must produce the failure result and
nothing else — no traceback, warning or other diagnostic in the log or the interface (`REQ-PROVIDER-013`).
Every other failure path records a per-provider last error (`REQ-PROVIDER-057`). Does the last-error
record count as "shown anywhere in the interface"? Read literally it does, so **this one path must skip
it**.

<a id="oq-24"></a>

**OQ-24 — No cost budget for the parse-requiring checks.** *(ADR-0040.)* `REQ-TRACE-088`'s one-second
budget covers "the sweep alone — enumeration, reading and matching". `REQ-TRACE-104`'s re-export-only test
and `REQ-TRACE-109`'s test-function collection both require a **full syntax tree**, and `REQ-TRACE-091`
requires them in the same verification run. No budget is stated for them, and at the stated scale a
full-fidelity parse is materially more expensive than a pattern pass.

*Part AJ (2026-09-09), the first execution: unmeasured still, by design — wave 1 reports REQ-TRACE-104 rule 1 and 109/110 as `requires-parse` findings for the built-in convention and runs both checks fully for pattern-declared conventions. Spike 7's 1,000-file tree (`spikes/traceability-scale.md`) is the corpus for the measurement; the sweep itself is 244–391 ms, so the parse-requiring checks have about 600 ms of REQ-TRACE-088's budget if they are to share it, though no requirement says they must. AJ′ measures the TypeScript compiler API against it.*

*Part AJ′ (2026-09-10), the second execution: MEASURED, and the premise is falsified. The TypeScript compiler API (5.9.3) parses the spike's thousand-file tree in 202 ms warm and 255 ms cold, 0.202 ms a file, after a load of about half a second once per process. Inside a real sweep it never sees a thousand files: only those a pattern cannot decide are parsed, which was 200 files in 34 ms on the same tree. So a full syntax tree is NOT materially more expensive than a pattern pass at the stated scale, and `REQ-TRACE-104` rule 1 with `REQ-TRACE-109`/`110` fit inside `REQ-TRACE-088`'s one second beside the sweep rather than competing with it. What the entry asked for was a budget and what exists now is the cost; stating the budget is the owner's, and the open count is left untouched here for that reason. One residue is recorded rather than hidden: `typescript` is not a runtime dependency of the packaged desktop application, so in a packaged build both checks degrade to the `requires-parse` finding naming that cause (Part AJ′'s handoff, ruling request 2).*

*Part R″ (2026-09-11): closed, and the way it was measured is now honest.* Part AJ′ answered the
substance — the TypeScript compiler API decides `REQ-TRACE-104` rule 1 and `109`/`110` over spike 7's 1,000-file
tree in about 200 ms warm, after a one-time load of 0.3–0.6 s per service process. What wave 3 changed is the
assertion that guards it: the linear-growth ratio was a quotient of two single wall-clock readings, which is
load-sensitive by construction and had already gone red once at 3.06 against a 3.0 threshold. It is now the
quotient of the **minimum of three readings** on each side, with a **work-count ratio asserted unconditionally**
beside it and the timing ratio recorded rather than asserted below a 25 ms floor. **The threshold was not moved.**
*Corrected 2026-10-01 (R-067):* "the minimum of three readings on each side" was not how the readings were taken. Each
side's three readings were taken in turn, the full tree's first, so the half side ran hotter; and the sweep's full side
was a single reading. Each pair is now read with seven readings a side, interleaved and alternating which side goes
first (ADR-0040, third execution, "Corrected 2026-10-01"). The parser's ratio read 1.89 to 2.09 in twelve runs. Its answer
to this entry is unchanged.

<a id="oq-25"></a>

**OQ-25 — Project-supplied regular expressions run unbounded.** *(ADR-0040.)* `REQ-TRACE-073` compiles
four patterns per project-declared convention and evaluates them against every claimed file;
`REQ-TRACE-154` states that the absence of any time or resource limit on the scan is "a deliberate
decision and not a gap", and `REQ-TRACE-225` places no wall-clock bound on the engine read. A pattern with
catastrophic backtracking therefore hangs the pass indefinitely, and the specification's own mitigations —
the board stays usable, the last good board stays on screen — cover the **symptom** but leave the pass
wedged. ADR-0002's worker-thread placement makes it terminable; **whether it should be terminated, and
what the user is told, is not specified.** The pattern arrives with a checked-out repository, not from the
user.

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** closed; the pattern-cost question is answered by termination on the user's cancel alone. The bound stands as Part AJ decided it: no limit on a project's pattern, and a pass is terminated on the user's cancel alone, never on the engine's initiative, the user told only "cancelled". Part R″ recommended closing with a pattern-cost guard raised as an item of its own; that guard is not raised, and the ruling leaves termination to the user.

*Part AJ (2026-09-09), the first execution's decision: no bound on the pattern (REQ-TRACE-154/225 forbid one). The pass runs on a worker thread; a cancel raises a shared flag the pass observes at its next checkpoint, and a worker that has not answered 2 s after the cancel is terminated and respawned for the next job. Termination happens only on the user's cancel, never on the engine's initiative, and the user is told only "cancelled". Whether the engine should ever terminate on its own, and what it says when it does, stays open.*

*Part R″ (2026-09-11): the regex bound stands as Part AJ decided it. Recommended: close, with the
pattern-COST question — a catastrophic-backtracking guard — raised as its own item rather than carried here.*

<a id="oq-26"></a>

**OQ-26 — Resolved.** See *Resolved, and closed with the reason* above.

<a id="oq-27"></a>

**OQ-27 — Resolved by dissolution.** See *Resolved, and closed with the reason* above.

<a id="oq-29"></a>

**OQ-29 — Native surfaces under a dark theme.** *(ADR-0048.)* `REQ-SHELL-160(b)` makes it an acceptance
criterion that no native surface presents a light background while a dark theme is active, on each
platform, and names native dialogs as things to inspect on screen; `REQ-SHELL-164` says the product is
answerable only for what it supplies to a native dialog. On most platforms the operating-system folder
chooser follows the **system** setting and no application-side call changes that, while four requirements
require the product to use native choosers. The record's reading is that `REQ-SHELL-160(b)` covers
surfaces the application itself tints and `REQ-SHELL-164` carves out the host's own dialogs. **Needs
confirming rather than assuming.**

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the reading is confirmed. REQ-SHELL-160(b) covers the surfaces the application itself tints, and REQ-SHELL-164 carves out the host's own dialogs, which follow the operating system's setting, so a native chooser drawn light under a dark theme is not a failure of REQ-SHELL-160(b).

<a id="oq-32"></a>

**OQ-32 — Which process the benchmark's per-process figures describe.** *(ADR-0053.)* `REQ-UIBENCH-050`
reports memory, thread and handle counts "for the process that produced the record". In a multi-process
engine there are several. The record proposes the renderer process of the measured window; the sum over
the iteration's process tree is also defensible and gives different numbers. Since comparability is only
claimed between runs of one revision, either is conformant, **but the choice must be recorded**.

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the per-process figures describe the renderer process of the measured window, as the record proposed, and this is the recorded choice. ADR-0053's benchmark harness is not built, so nothing measures them yet.

<a id="oq-33"></a>

**OQ-33 — The configuration-home variable on non-Linux hosts.** *(ADR-0053, ADR-0042.)*
`REQ-UIBENCH-039` names it contractually and it is meaningful on one platform only. The record reads it
as named because it is the one *standard* variable available, with the benchmark-private variable
carrying the same job elsewhere. If instead the preference store must honour it on all three platforms,
ADR-0042's resolution order should say so. Either reading is implementable; they are different.

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the configuration-home variable is to be honoured on Linux alone, the benchmark-private variable carrying the same job on the other platforms; ADR-0042's order is otherwise unchanged. **The build differed:** `resolvePreferenceRoot` read `XDG_CONFIG_HOME` before its platform branch, so the preference store honoured it on Windows and macOS too, while `resolveUserDirs` honoured it on Linux alone. Recorded in [`the-preference-root-honours-xdg-config-home-on-every-platform.md`](../../../defects/fixed/the-preference-root-honours-xdg-config-home-on-every-platform.md), not built here; built by fin22 the same day, the configuration home now read in the Linux branch alone, as `resolveUserDirs` reads it.

<a id="oq-34"></a>

**OQ-34 — Demo mode and process-wide network silence.** *(ADR-0055.)* `REQ-SHELL-005` says that in demo
mode "the process opens no outbound network connection for its whole lifetime", while `REQ-SHELL-162`
lets a demo window be opened from a non-demo window and `REQ-STARTUP-057` says a non-demo window of the
same process is unaffected and checks for updates normally. **Those cannot both hold once a mixed process
exists.** Either the claim is per-window rather than per-process, or a demo window must be its own
process. *SR-1 sharpens this rather than resolving it, and forces the direction:* with one instance a
mixed process is not an unusual configuration to be avoided but the **only one available**, and "a demo
window must be its own process" is no longer an option the architecture can take, because a second
process of this application is exactly what `REQ-STARTUP-161` forbids. The per-window reading is
therefore the only one that can hold, and it should be **stated in the requirement rather than inferred**
by every reader who meets the pair. ~~Still needs a product-owner statement.~~ Stated 2026-10-06 (below).

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the claim is per window: a demo window opens no outbound connection for its whole lifetime, and a non-demo window of the same instance behaves normally. [`PD-SHELL-004`](../../../product/directives/pd-shell-004.md#pd-shell-004) states it and narrows REQ-SHELL-005. Demo mode itself is not built; the directive governs it when it is.

<a id="oq-35"></a>

**OQ-35 — Decision closed, 2026-09-07.** REQ-SANDBOX-079 now defines each
confined command as a fresh inner shell initialized from configured session
working directory/environment. Changes inside that invocation end with it.
Unconfined commands retain their persistent shell. REQ-TOOLS-123 cites that
lifetime, and tool help/observations must disclose the active mode.

**Historical question.** Foreground calls accumulate working directory,
exported variables and aliases in a persistent shell (`REQ-TOOLS-097`), but a confined command is rendered
as a nested shell invocation submitted into that shell (`REQ-SANDBOX-079`), so a directory change or an
export inside a confined command lives in the inner shell and dies with it. **Does shell state persist
across confined foreground calls?** The two requirements describe different behaviour for the unconfined
and confined modes and neither says so. This must be resolved before the terminal tool's description is
written, since the description is what tells the agent whether a directory change persists.

<a id="oq-37"></a>

**OQ-37 — CLOSED by accepted review, applied 2026-09-07.** The fetch tool
uses explicit direct transport for every hop. Proxy environment variables,
system settings and global dispatchers have no effect. Tool help and failures
disclose this requirement. A local target/proxy regression verifies zero proxy
contacts for direct fetch and confirms the proxy receives the control request.
The following text preserves the historical question.

**Historical OQ-37.** Nothing says whether `fetch` honours system or
environment proxy settings. It matters: a proxy changes which host a connection is actually opened to, and
`REQ-SANDBOX-022` promises that a denied host observes zero connection attempts. The chosen client does
not honour proxy environment variables by default, which makes "no proxy" the de facto answer — the
fail-closed direction, but one that will surprise corporate users and **should be an explicit decision
rather than a library default**.

<a id="oq-39"></a>

**OQ-39 — A presenter that is registered and never answers. *Premise stale on one side; the record's
answer is strengthened; the window is still unanchored. MEASURED 2026-09-02 AND EXPLICITLY ~~NOT CLOSED~~. Ruled 2026-10-06.***
*(ADR-0019; not blocking. Constraints T-41, T-31.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the poll and the window are accepted as built — a gap-based liveness poll every 250 ms, a registration lapsing after 3 s without a reply (`PresenterRegistry`, `DEFAULT_POLL_MS`, `DEFAULT_LAPSE_MS`), revoking every registration and routing later asks to the headless policy without a timer on the user's wait. The amendment the owner asked for, REQ-SANDBOX-101 defining attendedness as REQ-TOOLS-053 does, **is already in the requirement's text**: it now reads attendedness as "a test of capability, not of registration", under which "a session whose presenter is present but wedged is unattended", and the sentence this entry quotes ("Only the presence of that channel is tested") is no longer there. Nothing further is minted; `PD-TOOLS-002`'s narrowing of the requirement is unchanged. The window stays sized by the spike's floor and not by a product-load measurement.

***What spike 14 settled, and what it deliberately did not.*** `spikes/presenter-liveness-and-instance-claim.md`
**settled the mechanism**: a gap-based poll detected all nine blocked runs at **+386 to +468 ms** on a
500 ms threshold, with **zero false lapses in 258 s** of unblocked running and a maximum idle channel gap
of 303 ms. It also settled three things this entry did not ask. **(1) The check must be gap-based, not
reply-based** — while main was blocked the channel never closed, the process probed alive, every message
was accepted, and when the block ended **all 84 outstanding replies arrived**, the last at 7,885 ms round
trip, so a "did the reply arrive" check reports success eight seconds late and never fires. **(2) The
exposure is not the approval dialog**, which cost the poll nothing at a 266–267 ms maximum gap; it is
**every synchronous native dialog anywhere in the product**, during which no main-process JavaScript runs
at all — 0 timers, 0 handled renderer messages, 0 replies to the run host, over 6,489 ms and 7,339 ms.
That is now constraint **T-31**'s stated dependency and an application-wide prohibition in ADR-0019.
**(3) No platform signal for an unresponsive main is usable from the run host** — the operating-system
signals detect a busy loop and **never** a native modal, and reaching them from a Node utility process
needs a native addon and was not measured.

***What it did not settle is exactly the thing this question asks.*** **The window is still not sized.**
The spike's main process paints one heading: no renderer framework, no transcript pipeline, no session
writer, no workspace service, no version-control invocation. It does **not** reproduce the 22,777 ms of
event-loop lag `spikes/ipc-hop-latency.md` measured under frame load, which is the state the window has to
survive. **So the floor is narrower and it is still a floor.** ADR-0019's existing Revisit-if — that a
window which cannot be set wide enough turns this into an escalation — **stays live**, and the measurement
this entry needs is a liveness poll answered by a main process carrying product-shaped load.

***This entry's opening sentence is superseded and is kept only because ADR-0019 and constraint T-41 both
quote the wording it describes.*** It states that `REQ-TOOLS-053` and `REQ-TOOLS-069` define attendedness
as **presence** of an approval presenter. **They no longer do.** `REQ-TOOLS-053` now reads: a session
counts as interactive "exactly when an approval prompt for that session can be put in front of a person",
and `REQ-TOOLS-064` glosses the unattended case as one "for which the modal dialog of `REQ-TOOLS-063`
cannot be shown". Registration absence is a *sufficient* condition in `REQ-TOOLS-069`'s next sentence,
not the definition.

**That strengthens the record's answer rather than changing it.** Presenter registration is revoked on a
lapsed channel-level liveness signal as well as on a closed channel, which settles in-flight waits
through `REQ-TOOLS-177`'s teardown cancel (mapped by `REQ-TOOLS-052` to deny with source `cancelled`) and
routes later asks to the headless policy, without putting a timer on the user's wait. Under the amended
text that poll is **the implementation of the specification's own capability test** — a wedged presenter
is not one an approval can be put in front of — rather than an architecture-invented answer to a gap. One
narrowing comes with it: `REQ-SANDBOX-101` fixes attendedness "at the moment its mode is resolved", so
the revocation governs where a **later** ask is routed and never revisits a mode resolution already made.

**Two halves remain open and they are now different from each other.** The *TOOLS* half is answered by the
amended `REQ-TOOLS-053`. The *SANDBOX* half is not: `REQ-SANDBOX-101` still says "Only the presence of
that channel is tested, not whether it later answers" **and** asserts that its condition is exactly
`REQ-TOOLS-053`'s and `REQ-TOOLS-069`'s, which are no longer the same condition — reported as a
specification defect, with the reconciling reading (the clause is about the **person** not answering)
recorded as a reading and not as the text. And the **lapse window** is still a free parameter no
requirement anchors, with `runtime.approval_timeout_seconds: 0` still removing the only backstop
`REQ-SANDBOX-101` names.

**The measurement gives the window a floor and does not size it.**
`spikes/ipc-hop-latency.md` measured a single `webContents.send` of a 69 KB payload taking **88.263 ms**
while main's event loop was otherwise **idle**, and observed the wedged-main state directly at
**22,777 ms** of event-loop lag — so the window must clear the first comfortably and catch the second.
**The spike never showed a modal dialog**, which is exactly the case the window has to survive, so spike
14 is **not** discharged. If no workable window exists this still becomes an escalation between a hang at
`0` and a specification change.

<a id="oq-40"></a>

**OQ-40 — The maximum supported transcript viewport height. *Premise now measured rather than argued;
~~still open~~, ruled 2026-10-06, and the choice has a scale.*** *(ADR-0045; not blocking.)* The transcript's slot pool must be
a fixed capacity or `REQ-UIBENCH-054`'s element-count invariant has no meaning, but nothing in the
specification bounds the viewport: `REQ-SHELL-022` fixes the opening (1440×900) and minimum (1000×680)
window sizes and **no maximum**. ADR-0045 declares a product constant `H_max` and sizes the pool at
`ceil(H_max ÷ 30 px)` plus overscan, 30 px being `REQ-CHAT-057`'s minimum row height.

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the maximum supported transcript viewport height is **4,320 CSS pixels**, an 8K display at 100 % scale, and a taller viewport keeps ADR-0045's growth path. That is the value built (`H_MAX` in `packages/ui/src/transcript/constants.ts`).

***The earlier formulation — size the pool for "the largest viewport the window can reach" — is now known
to have no referent, which was argued and is now measured.*** On Windows a content height of **20,000 CSS
pixels was requested, granted, and reported by the renderer as a real laid-out viewport**, on a machine
whose tallest display is 1,080 px and where the display enumeration offers nothing that bounds it. The
window manager did not clamp; the reachable height was at least 20,000 px and was not probed further. A
declared constant is therefore the **only** thing available to write down, not merely the tidier option.

**The measurement also gives the choice a scale.** At 20,000 px the viewport calls for **671 slots
against a pool of 80** — so the growth branch, if the constant is set low, means the transcript pane is
blank below the pool's coverage until it grows. And it confirms the not-blocking claim empirically rather
than by argument: across every phase record and all sixty resize steps of twelve runs the largest slot
count the viewport ever called for was **34**, with a pool-growth watermark of **0**, because
`REQ-UIBENCH-060`'s sweep never exceeds the construction size and `REQ-UIBENCH-098` pins the display
environment.

**Somebody must still choose the number**, because choosing it fixes the behaviour on a display taller
than it. It is a product statement about supported hardware rather than an implementation constant, which
is why it is filed rather than chosen. *Not measured and therefore not claimed:* behaviour when a display
is attached or removed while the window exists, behaviour at a scale factor other than 1, and whether
either other platform's window manager clamps where Windows does not.
