## The hooks payload bound test reads one wall-clock sample and fails under host load

`packages/hooks/src/engine.test.ts`, "REQ-HOOKS-139: resolving/gating 100 entries and building a 100 KB payload stay
inside their bounds", times `serializePayload(buildToolPayload(…))` for a 100 KB payload with one `process.hrtime`
reading on each side and asserts the difference is under 10 ms. One wall-clock sample counts every moment the
scheduler gives the CPU to another process, so the test measures the host's load as much as the payload: on
2026-10-01 a full `pnpm check` on the `skill-concurrency` branch (a change to `.agents/skills/` only), run while two
workflow agents built the Electron app and a reviewer ran its own `pnpm check` (load average 7–8 on 4 CPUs), failed it
at `expected 10.698778 to be less than 10`. The same file run alone a minute later passed 23 of 23 (tests 108 ms).

The repair of
[`the-hooks-payload-bound-test-times-a-module-import-with-the-payload.md`](fixed/the-hooks-payload-bound-test-times-a-module-import-with-the-payload.md)
took the module import out of the window; this is the part it left. With plans now running four agents at once on
this host, every gate is a loaded gate, and a red that teaches people to re-run is noise the gate cannot afford. The
50 ms configuration window two lines above has the same shape with more margin.

Found 2026-10-01 while gating the skill change that lets two plans run at once. Recorded, not repaired. A faithful
repair keeps the 10 ms figure and measures it under REQ-HOOKS-139's own reference condition: for example the best of a
handful of samples, or the process's CPU time (`process.cpuUsage`) rather than wall time, each of which approximates
"a single execution thread … timing the named operation alone" on a busy host. Lowering the figure or widening the
bound would change the requirement and is not a repair.

## Specs

None contradicted by the product: REQ-HOOKS-139 fixes the 10 ms payload bound "measured under one reference condition:
a single execution thread on a contemporary developer workstation … timing the named operation alone". The test
departs from that condition when the host is loaded, so its red there says nothing about the requirement.

## Relevant files

- `packages/hooks/src/engine.test.ts:137-150`: the test; the 10 ms window is `s2` to the assertion at `:148`, and the
  50 ms window `s1` at `:139-141` has the same single-sample shape.
- `packages/hooks/src/payload.ts`: `buildToolPayload` and `serializePayload`, the operation timed.
- `docs/spec/09-lifecycle-hooks.md`, REQ-HOOKS-139: the bounds and their reference condition.
