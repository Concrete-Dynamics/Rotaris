# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Second execution — 2026-09-09 (Part AP)

Part 8 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Second execution — 2026-09-09 (Part AP)

*Recorded under GD-10. Three defects — `AP-1`, `AP-2` and `AP-4` — and one reachability finding, `AP-3`; the manager
assigns the ordinals at merge. This branch does **not** take store v16 — `REQ-TRACE-472`'s granted permissions ride
the `delivery_runs.permissions` column v15 already writes, so nothing migrated.*

**Built and run:** the slot this record left for a run. `packages/workspace/src/delivery/runs.ts` holds the pure half —
the branch and directory derivation of `REQ-GIT-074/137/139/140` with every substituted value slugged so nothing
substituted can carry a `/`, the scheduler of `REQ-TRACE-478..483` and `463`, the prompt a unit receives with a
send-back's instructions (`REQ-TRACE-423`), the document composer and the in-place editor of `REQ-TRACE-434`, the
identifier and location conventions of `REQ-TRACE-442/443` — and the two named I/O units, provisioning through
ADR-0038's one Git chokepoint and the source write through ADR-0004's atomic replace. The writer's `beforeCommit`
slot is filled: a run-starting action provisions its worktree inside the transition's single-flight window and hands
the row back, and a refusal there refuses the action and writes nothing, which is how `REQ-TRACE-472`'s declined
disclosure and `REQ-TRACE-498`'s two repository rows are met. The workspace service arms the run family, the queue's
four controls, the source write, the review and blocker payloads, and re-runs the reap with the run host's real live
set. Main's coordinator is the **system** actor of that family: it claims, elevates for exactly one `session.start`,
restores the live state, writes the session id onto the row, settles it from the host's own ending, marks a run
waiting on a person, and cancels the board's runs when the last window closes. `pnpm requirements-runs-proof` drives
all of it against a real scratch Git repository built from Part AJ's fixture store, with the real traceability
engine on an in-thread executor and only the run host scripted.

**Found (1) — `AP-1`: the editor pane assigned its fields from an effect.** The first build of `EditorPane` reset
`title`, `description` and the failure notice inside a `useEffect` keyed on the props, which is the shape
`react-hooks/set-state-in-effect` refuses and which re-renders the pane twice on every open. React's own answer is to
reset by identity, so the writable form is now a component of its own keyed by the requirement and the text it was
opened on. No reading of `REQ-TRACE-436` would have found it; `pnpm lint` did, on the first assembly of the Part.

**Found (2) — `AP-2`: a deferred candidate was told the wrong number of slots were in use.** The scheduler reported
`REQ-TRACE-483`'s slot deferral as `slotReason(executing.length, concurrency)` — the count of units executing when
the pass *began*. A pass that dispatches two candidates and defers a third therefore printed "Waiting for a unit
slot: 0 of 2 in use." directly beneath two rows it had just marked `next`. The count is the concurrency less the
slots still free, which is the same value whenever a pass dispatches nothing, and differs exactly in the case the
queue is read in. The unit test had pinned the wrong number and was corrected with it; the end-to-end proof is what
put a person's eye on two rows and a contradiction.

**Found (3) — `AP-3`, a reachability finding, not a defect.** The scheduler's `manualReason` ("Automatic scheduling
is off: X waits until you release it from the queue.") is **unreachable through the product's own routes** today.
Every route into the released column other than a board release — a blocker cleared, a reaped run resumed — also
leaves the requirement without a disclosed launch, and the undisclosed stall sits above the manual deferral in the
ladder, so that is the sentence the queue states. `REQ-TRACE-482` is still met (nothing begins on its own, and the
queue says why), and the sentence the user gets is the more useful of the two because it names the next action. It
is recorded here rather than repaired because repairing it would mean ranking a *less* actionable reason first.

**Found (4) — `AP-4`: the queue promised a start the claim would refuse.** The service folded "this launch has no
accepted disclosure" into `REQ-TRACE-463`'s stall map, and the stall has an escape: a candidate the person has armed
is offered anyway, because arming is how a stalled start is retried. But `resume` from a run-failure blocker returns
to the released column, which is a run-starting decision, so it provisions and arms — while carrying no disclosure,
because nobody was asked for one. The scheduler therefore marked it `next`, `claim()` refused it (correctly —
`REQ-TRACE-497` forbids an undisclosed run being observable), and **nothing started, forever**, with the queue
saying otherwise. Worse, the phantom `next` consumed one of the two unit slots, so a later release of three
candidates started one instead of two. The disclosure is now its own input to the scheduler, checked before the
stall and not escaped by arming, and the claim logs any offer it cannot take, because the invariant is that what the
scheduler offers the claim takes. Both halves of this were invisible to reading: the first three assertions of the
proof passed, and the fourth and fifth failed together on one cause.

**Readings recorded.**

- *The queue's two persisted controls are configuration, and now they are registered.* This record's first execution
  withdrew a `delivery_queue` table on the ground that `REQ-TRACE-480` names the workspace configuration and no part
  had registered the keys. They are registered here: `requirements.scheduling.mode` and `max_concurrent_units`
  (`REQ-CONFIG-196`), written by the service through the Tier A writer and reloaded at once. The in-memory holder is
  now the cache of the configured values. A stop is still persisted nowhere.
- *The elevation has two residues this build cannot close, and they are stated rather than hidden.* The coordinator
  grants `REQ-TRACE-470`'s preset by handing the run host a live state carrying `runtime.permission_mode:
  autonomous` for one start. (a) `runtime.allow_unsandboxed_autonomous` is **not** a Tier B key
  (`REQ-CONFIG-263` closes that list; `REQ-CONFIG-265` makes it Tier C), so the opt-in half of `REQ-TRACE-470` has no
  per-run route. On the attended desktop the engine's `REQ-TOOLS-067` downgrade does not fire, so the run holds the
  preset; a headless host would downgrade it to `ask`, exactly as `REQ-TRACE-470` warns. (b) A composer start that
  reached the run host between the two hand-overs would read the elevated state — a window of two round trips. Both
  close the same way, with a per-run permission field on `session.start`, which is a run-host seam this row does not
  own; it is raised in the handoff as a ruling request.
  **Closed by the owner's authorized refactoring, 2026-09-13 (R-009).** The original residue above remains
  as the record of the first implementation. `session.start.boardPermissions = permissive` now carries the
  board coordinator's grant over the main-to-run-host boundary. The launch module captures configuration
  before leasing credentials and applies `permission_mode: autonomous` together with
  `allow_unsandboxed_autonomous: true` to that launch. `Sessions.start` consumes the prepared setup.
  Active run ports resolve configuration by session identifier, and every model resolver retains its launch's
  leased bearers. Board dispatch sends one start request. Tier B's key list and the user's live settings retain
  their existing meaning.

  The first focused execution found an additional defect: `Run.start` wrote `permission_mode: default` and
  an empty configuration snapshot into every launch audit. The session record already held the effective
  permission. The audit now records that effective permission and the captured runtime section, including both
  board grant fields. The 2026-09-16 defect closeout completed every effective configuration section, inline
  resolved persona prompts and deterministic credential redaction.
  `launch.test.ts` exercises real configuration loads and session records with scripted provider responses:
  overlapping board/composer starts, reversed lease completion across workspaces, failed credential leases,
  a thrown session start, and renderer contract isolation. The snapshot assertion failed against the literal
  `default` audit and passed after the correction; the existing session-resume tests preserve the original audit.
  Validation: the focused launch/configuration/board/session/run/tool suite passed 57 tests;
  `requirements-runs-proof` passed 104 tests after its handover assertions were updated to the per-launch
  grant, and now includes the real launch suite. `pnpm check` passed 1,625 tests with 25 skipped;
  `pnpm build` passed. All model responses in these checks were scripted.
- *`edit` and `create` are transitions that record, not refusals.* The first execution left them refusing and named
  this part. They now write into the project's own artifact through `requirements.source.write` and record the
  action with the summary the audit keeps (`REQ-TRACE-405`); the wave-1 refusal sentence and its pin in
  `transition.test.ts` were retired together. `accept-proposal` and `accept-change-work` are still refusals naming
  OQ-45, unchanged.
- *One unit per release.* Decomposition (`REQ-CONFIG-195`'s `execution.decomposition`) is registered as
  configuration and not built: a release starts unit `u<n+1>` where `n` is the number of runs the record already
  has. The branch template's `{unit_id}` is therefore always a single unit, and `REQ-GIT-139`'s cycle suffix carries
  the second and later deliveries of the same requirement.
- *The `requirements:` block's three unconsumed sub-blocks are carried opaque.* `evidence`, `delivery` and `board`
  are registered by the specification (`REQ-CONFIG-190/191/192/197`) and consumed by no part yet. Refusing a
  documented key would be the wrong refusal and validating a block nothing reads would be a second copy of a schema
  nobody executes, so they are accepted as mappings and passed through, with their inner validation owed to whoever
  consumes them. One key of `delivery` is read now (2026-10-15, fin47): the withdrawn `store_subpath`, reported and
  dropped as `REQ-CONFIG-192` and `REQ-CONFIG-183`'s carve-out require; the rest of the block is still carried opaque.

**Not built here, stated:** decomposition into several units (above); the offers of `REQ-TRACE-409..416`, the source
revisions of `278..280` and the graph of `322..333`, which stay where the first execution left them; the improvement
store's two actions (OQ-45); `REQ-TRACE-465`'s stop control, which is the existing session control and is reachable
only once a board run has a surface to stop it from — the coordinator's `cancelAll` is the application-close half.
`REQ-TRACE-469` rides on that same cancel, and is now cited where it does: `session.control {op: 'cancel'}` reaches
`run.stop`, whose **first** act is to release whatever is blocked on a person (`REQ-MONITOR-012`), and every waiter
finishes `cancelled` whatever its deadline, which is `REQ-TOOLS-055`'s rule and is measured in
`packages/agent-tools/src/gate.test.ts`. An unlimited wait therefore ends with the stop instead of outliving it. What
**this** branch measures is the coordinator's half — a board run blocked on an unlimited approval has the cancel
issued at once, with nothing answering the approval first (`requirements-runs.test.ts`); a person pressing stop is
unmeasured here, because that button is `REQ-TRACE-465`'s and no surface in this branch offers it.

> **Reconciled 2026-09-28 (`PD-ORCH-005` clauses 3, 9 and 15, OQ-108, R-065).** The coordinator's `cancelAll` is now
> `quitAll`, and it sends the run host's `session.control {op: 'announceShutdown'}`, the application's quit, not the
> stop control's `cancel`: a stop request keeps its first reason, so the `cancel` rested a board run by `stop`
> (`docs/defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md`). The run comes to rest by `quit`, and what
> waits on a person is **withdrawn** by the quit (clause 9), never answered and no longer `cancelled`, so the
> paragraph above describes the release before the directive. REQ-TRACE-469's guarantee holds unchanged: the unlimited
> wait still ends at once with the quit. REQ-TRACE-464's "SHALL cancel" is read through clause 3's quit; OQ-108 records
> that no directive yet names it.

The five panes are **built and exported and nothing in this branch hosts them**: the board that mounts them is Part
AK′'s, in a worktree of its own, so this row's proof drives the panes' pure halves and the mechanism beneath them,
never a mounted pane. That is the seam the merge closes, and it is the one thing in this note that a reader should
not mistake for a working surface.
