# Resolution Record — Domain 01, Multi-Agent Run Orchestration — A4 — the root execution record and the planning execution path (2026-09-13)

Part 4 of 4 of [domain 01's resolutions](../01-run-orchestration.md), which indexes every part.

## A4 — the root execution record and the planning execution path (2026-09-13)

Item **A4** of the accepted review (`../../../SPECIFICATION_REVIEW.md`) found a contradiction this record
left standing across two of its own dispositions. Disposition **2** built the plan gate and disposition
**14** made `single` a capability change; read together with the iteration mechanics, the three
requirements said incompatible things.

**What each said, kept beside its replacement.**

- **Disposition 14** concluded that under `single` "no child is ever spawned and the whole delegation
  machinery is inert", and REQ-ORCH-025 said so. **REQ-ORCH-072 spawns the root child at the start of
  every iteration of every run.** Both cannot be true. The word "child" was carrying two meanings: the
  run's own root agent, and an agent another agent delegated to. The outcome of disposition 14 stands
  unchanged — the `delegate` tool is withheld from every role, the delegation machinery is inert — and
  what changed is the vocabulary: REQ-ORCH-025 now says **no delegated child**, and REQ-ORCH-072 calls
  the run's own record the **root execution record** and states in its own text that it is not a
  delegated child. It arrives through no `delegate` call, counts against none of REQ-ORCH-046's
  admission limits, holds no model slot of REQ-ORCH-050, and is not presented as a task agent. That
  reading is the one the rest of the corpus already took: REQ-MONITOR-043 and REQ-MONITOR-089 both call
  it "the run's synthetic root", and REQ-CHAT-068 withholds the delegation-context header from it. Only
  REQ-ORCH-072 was out of step, and it is the sentence that changed.
- REQ-ORCH-072's clause that lookups "resolve for it" is kept and made precise rather than dropped: the
  root carries a canonical name and a task id in the same namespace a delegated child's identity lives
  in, so a lookup naming the root resolves to it. The parent-scoping of REQ-TOOLS-155 and REQ-TOOLS-156
  is untouched, so an agent that may not read a record it does not own is refused for **that** reason
  and is never told the root does not exist — the two refusals mean different things and a reader of the
  transcript can tell them apart.
- **Disposition 2** specified the gate as a restriction on spawning: "no child is spawned whose role
  holds a tool the registry declares as writing workspace files or running commands". **Under `single`
  the entry role holds exactly those tools**, by disposition 14. A gate stated only over spawning
  therefore either blocked a `single` run from starting at all or said nothing about the one agent that
  would do the writing. Neither is what the gate is for.

**The replacement.** The gate withholds **capability**, not the start. The run starts, its root execution
record is created with the entry role as REQ-ORCH-072 requires of every run, and while the gate is held
every agent — the entry role included — holds **planning grants**: the set it would otherwise hold, less
every tool declared as writing workspace files or running commands, with an undeclared tool counting as
declaring all three. The withholding is enforced **where a call is dispatched**, so it binds whatever
route a tool reached a role by and does not depend on any one role's configuration being right. The spawn
restriction disposition 2 wrote is kept beside it rather than replaced by it: a child whose role holds
such a tool is still refused admission, which tells the model why at the moment it asked. Approval
installs the execution grants for the remainder of the run.

**Two consequences worth stating.** A hold is not a termination — it raises no terminal status and no
terminal result, and the run the user answers is the run that reached the gate, whether or not the
process that hosted it outlived the hold. And the product's own recording is not the work the gate
blocks: the session, the plan, the todo state and the run's events stay writable throughout, because a
gate that stopped the product recording what it was doing would lose the plan it exists to obtain.

**Dependent contract.** A hook command withheld at the gate needed a reason, and REQ-HOOKS-126 declared
`"untrusted_workspace"` "the only defined reason". It now defines exactly two, the second being
`"plan_gate"`, emitted once per withheld invocation rather than once per session — the hold ends when the
user answers, and the same hook runs normally afterwards. The rationale REQ-HOOKS-126 already gave for
emitting anything at all is what settled it: a configured hook absent from the stream cannot be told
apart from one that ran and had no effect.

**Not decided here.** Whether the host process is released while the gate is held, how the answer reaches
the run, and where the mode is offered at run start are architecture and are owed by the build of
REQ-ORCH-152 to REQ-ORCH-154. What this round fixes is what the requirements say, not how the mechanism
is put together.
