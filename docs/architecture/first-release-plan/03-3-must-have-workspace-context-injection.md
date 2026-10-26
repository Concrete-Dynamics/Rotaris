# The first release — Windows only, skills and workspace-context injection — 3. Must-have: workspace-context injection

Part 3 of 8 of [the first-release plan](../first-release-plan.md), which indexes every part.

## 3. Must-have: workspace-context injection

**Built** (first-executions row 2026-09-22):

- the Instructions category as an editor over four bases past the workspace root;
- a per-file switch;
- `instructions.overrides`, written sparsely;
- injection through `apps/desktop/src/run-host/skills.ts` and `packages/config/src/instructions.ts`.

~~These are unit-tested only.~~ **Executed in the built app 2026-09-27** by `pnpm injection-proof` (§3.2, §3.3 below).

**3.1 OQ-64.** The question: when an instruction override is switched off, does it still suppress its base?
The build computes suppression over the enabled set. *Ruled 2026-09-27 as built: switching an override off
returns its base to the merge.* §3.3's proof asserts that answer.

**3.2 REQ-WORKSPACE-049's bound.** The requirement: discovering and merging the context files completes within
200 ms for a workspace holding up to 20 context files totalling 1 MiB on local storage, and never delays first
input. It is not measured. The plan is:

- a fixture workspace at exactly that bound;
- the p95 over cold-cache runs, taken in the built app on the Windows gate machine's class of hardware;
- the result recorded in `first-executions.md` whether it passes or not.

If it fails, the fix is a separate change, and the reading stays next to it.

> **First execution, 2026-09-27 — the Linux reading; the Windows gate-class reading is still owed.** Taken in the
> built app by `pnpm injection-proof`'s latency section (first-executions row 2026-09-27).
>
> **Hardware.** A Linux container: 4 vCPU Intel Xeon @ 2.10 GHz, kernel 6.18 in a Firecracker VM, with the workspace
> on the VM's virtio block device. That device is local and non-removable. The machine is not the gate machine's
> class, so this reading does not stand in for it.
>
> **Fixture.** Fourteen instruction files, every slot discovery can reach, totalling exactly 1,048,576 bytes. Twenty
> cannot be built: **OQ-68**. Twelve of the fourteen are read by the merge. The two bases suppressed by their on
> overrides hold one line each. Every read file exceeds the per-file limit, and the total limit drops eight of them.
>
> **What was timed.** The run host's own cold path, `SkillHost.workspaceContext`, on the monotonic clock port: the
> saved-policy read, the discovery and the merge. The policy read is included on purpose, because `PD-WORKSPACE-002`
> made it part of deciding what is merged.
>
> **What "cold" means here.** Twenty consecutive launches, each a new Electron process. Before each launch, every
> fixture file's data pages were dropped (`POSIX_FADV_DONTNEED`, after one `sync`). `mincore(2)` then confirmed that
> 0 of 266 pages were resident. Dentries and inodes were not dropped. The workspace service stats every instruction
> file at workspace open anyway, before any merge can run. **Cold means the guest's page cache only.** The disk is a
> Firecracker virtio device, and the hypervisor's own cache, outside this VM, can still serve those reads; nothing
> inside the guest can drop it.
>
> **Reading.** The figure of record, retaken after the gate's fixes with its evidence kept in
> `.proof/injection-proof/latency.json`: **p95 20.29 ms** (nearest rank, 20 runs), median 11.16 ms, minimum 7.97 ms,
> maximum 21.34 ms. Discovery and merge alone had a p95 of 15.76 ms, and the policy read alone 4.64 ms. The product
> code timed was unchanged by those fixes; the proof's launches now also move `HOME` into the scratch profile on POSIX.
> Three earlier runs of 20 gave p95 15.42 ms (the first reading reported here, from the first committed code), 25.4 ms
> and 28.64 ms (maximum 46.82 ms; both taken while the proof's reporting was still being finished). The first
> reading's evidence is gone: a later `--skip-latency` run clears the evidence directory. **The bound is met on this
> machine** in all four runs. The worst p95 is about a seventh of it.
>
> **The unconditional halves.** All twenty separate processes produced byte-identical merged context (one SHA-256).
> In all twenty, the merge ran only after the typed prompt was accepted and recorded as row 0: that is the measured
> half of "never delays first input". The requirement's other clause, that the window keeps responding to input while
> the merge runs, is **argued from placement, not measured**: the merge runs in the run host, never in the window's
> process, so nothing in the window waits on it.
>
> **Still owed.** The same measurement on the Windows gate machine's class of hardware (§5, O-6). The script has no
> per-file page-cache eviction on Windows: there it labels its reading **warm** and does not assess it against the
> bound. A cold method for Windows is owed with that reading.

**3.3 A built-app proof.** `pnpm injection-proof` is new and belongs in the AGENTS.md index. It opens a
workspace with instruction files at each base, switches one off, starts a scripted run, and reads what the
model port received. It asserts four things:

- order;
- presence;
- the switched-off file's absence;
- the OQ-64 outcome.

It also covers REQ-WORKSPACE-050's worktree case: a run in an isolated worktree reads context from the run's
execution root.

> **First execution, 2026-09-27 — built, and green on Linux** (`apps/desktop/scripts/injection-proof.mjs`; the
> AGENTS.md index; first-executions row 2026-09-27). It reads what the model port **received**. A new seam,
> `ROTARIS_CAPTURE_MODEL_REQUESTS`, makes the scripted client append each call's system text to a file. The seam is
> compiled out of a packaged build, and only the scripted client can write through it, so no real provider is called
> or recorded.
>
> **Every instruction base is a scratch directory.** The home-relative bases use `ROTARIS_CAPTURE_INSTRUCTIONS_HOME`.
> The global base is the profile's own configuration directory. The machine-wide base uses a second new seam,
> `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`, which is also compiled out. Without it, the only way to place a file at
> `/etc/codex` was to write into the machine's own `/etc`. The same gap had left the unit tests reading the host's
> real `/etc/codex`: [`the-instruction-discovery-tests-read-the-machines-own-etc-codex.md`](../../defects/fixed/the-instruction-discovery-tests-read-the-machines-own-etc-codex.md).
> The first repair of that note missed the catalog cases' `host()` helper, and the gate's verification found it; it is
> now repaired, with a case that decides the isolation on any host. On POSIX the proof also sets `HOME` to its scratch
> home, after the gate traced a launch reading the operator's `~/.agents/prompts`. **One root of the operator's machine
> was still read**: the skill search's `/etc/codex/skills`, which had no seam
> ([`three-proofs-and-the-catalog-tests-read-the-machines-own-etc-codex.md`](../../defects/fixed/three-proofs-and-the-catalog-tests-read-the-machines-own-etc-codex.md));
> closed 2026-09-28, below.
>
> **Four launches.**
>
> 1. **All on.** Ten blocks arrived in discovery order. The on override suppressed its own base and nothing else.
>    The context unit arrived ahead of the skill catalog.
> 2. **Switch.** Two files were switched off through Settings → Instructions and saved. The inventory listed all
>    eleven present files, each under its source label, and the policy was written sparsely.
> 3. **Switched.** The switched-off file sent nothing, not even its source comment. **OQ-64 as ruled:** with the
>    override off, `AGENTS.md` came back into the merge.
> 4. **Isolated.** The run executed in `.rotaris/worktrees/<sid>`. Its workspace blocks carried the **committed** text
>    under the worktree's paths, not the base's working copy. The base's switches still governed them by identity.
>
> **Two falsifications, each red.** Suppression computed over presence failed launch 3. Context read from the base
> root instead of the execution root failed launch 4. Both were rebuilt and run, then reverted.
>
> **What it does not observe.** REQ-WORKSPACE-047 gives the block to "each agent built for that session". The scripted
> run never delegates, so the proof reads the entry agent's call only. A delegated child receiving the block is shown
> by neither the proof nor a unit test: the child's system text goes through the same `withContextUnits` call
> (`packages/engine/src/children/orchestration.ts`), which is an argument, not an observation. The recorded calls are
> the classifier, the entry agent (the only one carrying context) and the post-run analyst, which rightly carries none. Two defects in the same requirements were
> noticed by the gate and recorded, not repaired there:
> [`an-instruction-file-that-is-not-utf-8-is-injected-with-no-warning.md`](../../defects/fixed/an-instruction-file-that-is-not-utf-8-is-injected-with-no-warning.md)
> (REQ-WORKSPACE-045's decoding half) and the `/etc/codex/skills` read above.
>
> **Both repaired 2026-09-28 (R-062; first-executions row 2026-09-28).** The port every discovery reads through
> (`NODE_DISCOVERY_PORTS.readFile`) decodes with a fatal `TextDecoder`, so the note's bytes `68 69 0a ff fe c3 28 0a`
> now produce REQ-WORKSPACE-045's warning naming the path and the error, and no block — pinned through the real port in
> `packages/config/src/instructions.test.ts`, and red against the lenient decode. The same strictness reaches a
> `SKILL.md`, which is skipped as an unreadable file with the decoder's reason; REQ-WORKSPACE-053's silence on the
> encoding is **OQ-79**. The skill search's machine-wide root moved under the one injectable directory the instruction
> base already had (`SkillRootsEnv.machineDir`; `ROTARIS_CAPTURE_SKILLS_MACHINE ?? ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`
> in the run host, compiled out of a packaged build), so this proof's existing variable now isolates the catalog too,
> `skills-proof` stages a skill under its scratch machine root and lists it off Windows, `settings-proof` sets the
> instruction seam, and the catalog tests decide the isolation of both roots on any host by recording every probe.
> **What the repair did not observe:** no proof lays an undecodable file down for the built app — the decoding half is
> shown by the unit cases over the real port alone; and `skills-proof`'s launches after its policy launch did not run
> on Linux, for the reason [`skills-proof-writes-its-global-policy-where-only-windows-reads-it.md`](../../defects/fixed/skills-proof-writes-its-global-policy-where-only-windows-reads-it.md)
> records, so the run launch's catalog naming the machine skill is asserted in the script and unproven on this host.
>
> **Observed in the built app 2026-10-13 (fin42, whats-next N61).** `injection-proof`'s launch 5, `undecodable`, lays the
> note's eight bytes down as a workspace `AGENTS.md` beside a valid `CLAUDE.md`: the model received the sibling's block
> alone, no leniently decoded text, and main's log carried `warning run host: workspace context: <path> could not be read
> (The encoded data was not valid for encoding utf-8); it contributes nothing`. The "did not observe" above is answered for
> the decoding half; the `skills-proof` sentence beside it is the fixed note's, not this one's.

**3.4 A live run.** One `pnpm live-run` scenario with a workspace `AGENTS.md` whose instruction the model can
only follow if it was injected. Owner-approved, like §2.3.
