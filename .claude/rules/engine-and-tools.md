---
paths:
  - "packages/engine/**/*.ts"
  - "packages/agent-tools/**/*.ts"
  - "packages/hooks/**/*.ts"
  - "packages/config/**/*.ts"
  - "apps/desktop/src/run-host/**/*.ts"
---

# Inside a run

Engine code is structural: no `electron`, and **time comes from the clock ports, never from globals**
(`rotaris/no-bare-timers` fails `pnpm lint`). That is what lets a run be driven deterministically.

- **The engine and the tools do not import each other.** The run-host root fills the engine's `ToolPort`
  with the gate (`run-host/tools.ts`); both halves stay independent of the other's types.
- **A declared tool with no executor is removed from the persona**, not offered and then failed. One
  resolution feeds the prompt listing and the gate, so what the model is told it has is what the gate
  allows. **The gate decides; an executor never asks.**
- A tool reaching the network reads the egress policy **from saved configuration at every call**, never
  from a value captured at run start.
- **Configuration is resolved once per run start.** A surface that changes a value changes the *next*
  run. The **workspace service is the only writer**, and the writer re-emits hand-authored YAML with its
  comments — collapsing inline-comment spacing was the eleventh first-execution defect.
- `initialization:` / `project_init:` are read **outside** the layered merge (`REQ-WORKSPACE-078` names
  one file). Portable skills live in `config`, not `workspace` (ADR-0063), though `workspace` owns the
  word.
- A real PTY echoes a marker before honouring it, and `cmd.exe` costs a 5 s grace on timeout. Both are
  paid-for lessons; assert against them rather than around them.

Ordered edit paths: `docs/architecture/views/04-seams.md` §4 (tool), §5 (configuration key). The run
flow itself is `03-runtime-view.md`. Evidence: `AGENTS.md` indexes the proof per area — run the suite a
change touches, not the one script named after it.
