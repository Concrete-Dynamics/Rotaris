# ADR-0063 — Portable skills: a pure discovery library in `config`, a catalog the run host owns, and skills as context units

- **Status:** accepted, with its first execution recorded below
- **Date:** 2026-09-14
- **Origin:** `REQ-WORKSPACE-051` to `REQ-WORKSPACE-069`, `REQ-WORKSPACE-072`, `REQ-WORKSPACE-073` and
  `REQ-WORKSPACE-151`, none of which was cited anywhere in this tree before this record. The `skills:`
  key has been a section-class key in `packages/config/src/keys.ts` since Part I with **no reader behind
  it**, the Settings Skills category has been a placeholder naming this mechanism as what it waits for,
  and `packages/ui/src/slash/catalogue.ts` has carried `SKILL_COMMANDS_NOT_BUILT` for the same reason.
- **Depends on:** ADR-0002 (process topology — which process may read the user's files), ADR-0036
  (configuration loading, the merge classes and the section readers), ADR-0037 (when a configuration
  change takes effect — Tier B at run start), ADR-0016 (the tool registry) and ADR-0017 (the one gate),
  for the read fence the catalog widens; ADR-0049 (notices and acknowledgements), ADR-0048 (windows and
  modality) for the native chooser.
- **Requirements:** `REQ-WORKSPACE-051`..`069`, `072`, `073`, `151`, `050`, `059`, `060`..`066`;
  `REQ-CONFIG-166`, `167`, `168`, `169`, `042`, `048`, `256`, `258`, `268`, `269`, `343`;
  `REQ-CHAT-025`, `028`, `034`, `162`; `REQ-SHELL-048`, `REQ-SHELL-056`, `REQ-SHELL-164`;
  `REQ-TOOLS-130`, `REQ-TOOLS-132`; `REQ-WORKSPACE-009`, `REQ-WORKSPACE-149`

## Context

A **portable skill** is a `SKILL.md` a third party wrote, discovered under a layout this product reads
rather than defines (`packages/workspace/CONTEXT.md`). The requirements ask for five things that do not
obviously belong in one place:

1. **Discovery** — a two-scope search with a fixed order, a disable manifest, a frontmatter grammar, a
   name normalisation and a shadowing rule (051–055).
2. **Policy** — a `skills:` configuration section with two override maps that overlay per skill name,
   persisted sparsely into the workspace file (062–065, REQ-CONFIG-166..169, 256, 258).
3. **Injection** — a model-facing catalog block and force-loaded bodies, as context units ordered
   against two units this build does not have (060–062).
4. **A read fence widening** — every cataloged skill directory becomes a read root for agent file tools,
   while writes stay refused (059).
5. **Two surfaces** — a Settings tab and one composer slash command per user-invocable skill (067–069,
   072, 073, 151).

Three facts decide the placement, and none of them is a preference.

**`workspace` cannot host this.** The component view's matrix gives the run host
`kernel, contracts, platform, store, engine, agent-tools, model, mcp, config, hooks` — **not**
`workspace`. Injection happens at agent construction, which is the run host's. So the library cannot
live in the package whose `CONTEXT.md` owns the vocabulary, and that is not a contradiction: contexts
follow **spec domains**, not packages (`CONTEXT-MAP.md`).

**`config` already does exactly this shape of work.** `config/src/mcp/discovery-files.ts` walks the
user's home directory and a workspace root for third-party configuration files, with `home`, `platform`
and `readFile` injected so the walk is testable without a filesystem. Skill discovery is the same walk
against a different layout, and the `skills:` section reader has to live in `config` regardless.

**The catalog is per workspace root and cleared at session creation (058), so it is run-host state.**
It is not configuration — configuration is re-read per run start by Tier B and never cached across one.
The catalog is cached *until a session is created*, which is a different lifetime with a different
trigger, and only the process that creates sessions can honour it.

### What this record does NOT decide, and says so

`REQ-WORKSPACE-060` fixes the order of injected context units as **workspace context → skill catalog →
force-loaded skill bodies → persona memory**. Two of those four do not exist: workspace context
injection (`REQ-WORKSPACE-041`..`050`, the `AGENTS.md` merge) is unbuilt, and persona memory is unbuilt.
This record builds the middle two and makes the seam an **ordered list**, so the absent units are empty
slots in a sequence rather than a shape a later part has to re-cut. `contextUnits` is documented with
the four positions named and two of them stated empty.

> **Reported back, 2026-09-22 — the seam held, and the empty slot was load-bearing in a way this record
> did not foresee.** `PD-WORKSPACE-002` built the first of the two absent units (workspace-context
> injection, `REQ-WORKSPACE-041`..`048`). The list shape cost the filling **nothing**: one `push` ahead of
> the catalog, no signature change, no caller touched, and every existing assertion about the middle two
> stood unaltered — which is the claim this section made and is the part worth recording as confirmed.
>
> What it did not foresee is that an *empty slot is invisible to the surface that configures it*. The
> settings screen had carried an Instructions inventory since Part AG, listing the very files this slot
> would have read; nothing anywhere said the list described a mechanism that did not run. The owner asked
> for switches over "the auto injection" on the reasonable assumption that there was one. A slot named in
> a record is not a slot named in the product, and the second absent unit — persona memory — has the same
> exposure today. ~~`REQ-WORKSPACE-050`'s worktree half is still unbuilt and is recorded in `docs/defects/`.~~
>
> **Repaired, then executed in the built app.** The worktree half was built on 2026-09-22 (`0b3ebe3`) as the repair of
> [`isolated-runs-read-instruction-files-from-the-base-workspace.md`](../../defects/fixed/isolated-runs-read-instruction-files-from-the-base-workspace.md)
> (now under `fixed/`). On 2026-09-27 `pnpm injection-proof`'s isolated launch showed it in the built app: a run in
> `.rotaris/worktrees/<sid>` received the worktree's committed text under the worktree's paths, while the catalog stayed
> the base workspace's (first-release-plan §3.3; first-executions row 2026-09-27).

## The decision

### 1. The discovery library is pure, lives in `config`, and touches the filesystem through one module

`packages/config/src/skills/`:

| module | what it owns | filesystem |
| --- | --- | --- |
| `roots.ts` | the two scopes' directories in 051's exact order | no |
| `manifest.ts` | `.installed.json`'s three shapes → disabled names (052) | no (takes the text) |
| `parse.ts` | the `SKILL.md` frontmatter grammar, triggers, invocation (053, 055, 056) | no (takes the text) |
| `names.ts` | `normalizeSkillName` (054) | no |
| `policy.ts` | effective load and invocation per skill (062, 063, 064) | no |
| `blocks.ts` | the catalog block and the force-loaded block (061, 062) | no |
| `discover.ts` | the walk that calls all of the above | **yes**, and nowhere else |

`discover.ts` takes `readDir`, `readFile` and `stat` as injectable ports with `node:fs` defaults, so
every rule above is checkable without laying down a directory tree, and the proof still exercises the
real one.

**Why the frontmatter is parsed with the `yaml` package and not by hand.** This repository has two
hand-written frontmatter readers already — `workspace/src/traceability/frontmatter.ts` (ADR-0040 #2,
which forbids the dependency so the engine runs embedded) and
`apps/desktop/src/workspace-service/prompts.ts` (REQ-CHAT-160's `key: value` grammar). Neither fits:
`REQ-WORKSPACE-053` requires the frontmatter to **be a mapping** and to carry a nested
`trigger: {type, keywords: [...]}`, which is YAML with structure, and requires "malformed YAML" as a
distinct skip reason — a grammar that cannot be malformed cannot report it. `config` already depends on
`yaml`. A third hand-written reader would be a third set of edge cases for a format the product does not
define.

### 2. The run host owns the catalog, the session state and the injection

`apps/desktop/src/run-host/skills.ts` — one `SkillHost` for the process:

- **the cache**, keyed by resolved workspace root, filled on `workspace.opened` and on first read,
  cleared by `rescan` and by session creation (058, 069);
- **the session state**, `{ forced: Set<name>, manual: Map<name, record> }`, keyed by session id with one
  `pending:<root>` bucket the next created session adopts (057, 073 — see the ruling below);
- **`contextUnitsFor(root, sessionId)`**, a **getter** handed to the engine and called at every agent
  construction, so a force-load reaches the next agent and never retracts one already built
  (REQ-CONFIG-166, REQ-WORKSPACE-062);
- **`readRootsFor(root)`**, the sorted resolved skill directories (059).

Discovery always runs against the **base** workspace root, never a worktree's effective root
(`REQ-WORKSPACE-050`) — the same rule `runtime` and `personas` already follow in `createToolPort`.

### 3. A skill body reaches the model only as a context unit on the system prompt

`withContextUnits(systemPrompt, units)` sits beside `withPlaybook` in `engine/src/run/run.ts` and is
applied at the two places a persona's prompt becomes an agent's: `Run.turn()` and
`IterationChildren.execute()`. Both already compose `withPlaybook`, so this is one more composition at
two sites rather than a new path.

This is what makes `REQ-WORKSPACE-065`'s "never scoped per persona" true **by construction**: the units
are a property of the session, composed onto whatever prompt the role resolved, so no role can see a
different catalog.

### 4. The read fence is widened per tool port, which required correcting how the fence is held

`REQ-WORKSPACE-059` needs the cataloged directories to reach `FenceConfig.additionalReadOnlyRoots`.
They could not, as the code stood: `executorsFor` builds a fence per port but the file tools read
theirs from `FileToolState`, which is cached per workspace root and **keeps the first fence it saw**.
The state exists to hold the read record and the undo stacks, which are deliberately shared across runs
in a workspace (`REQ-TOOLS-137`, `REQ-TOOLS-132`); the fence is not, and sharing it was incidental.

The fence is now passed per tool rather than read off the shared state. `FileToolState` keeps only what
`REQ-TOOLS-132`/`137` say it keeps. See the first-execution report: this had a consequence nobody had
noticed.

### 5. Naming and collisions follow REQ-SHELL-056, in the renderer

`packages/ui/src/slash/skills.ts`, modelled on `slash/prompts.ts` — the same bind-reader /
cached-answer / register-after-the-built-ins shape, and the same three defects apply verbatim (AO-1: a
registry rebuilt by its memo must not re-read; AO-2: a read in flight must land on the live registry;
AO-3, found in a launch log on 2026-09-16: a read in flight is the window's answer and a second caller
joins it rather than starting another — here there are THREE starters, the registrar's effect, the
configuration key's and the rescan counter's, where the prompt files have two).
Naming, suffixing and collision are the renderer's because the catalogue that holds the other names
lives there, which is the reason `REQ-CHAT-160`'s equivalent rules live there too.

## Consequences

1. **No new package and no new edge.** `config` gains a directory, the run host a module, `ui` two,
   `contracts` one file. Every import is on an edge the matrix already allows.
2. **Two new message families** — renderer → main `skills.read/rescan/forceLoad/loadFile`, main → run
   host the same four. No new channel, no new store table, no new control operation. *(Since 2026-09-27 a
   fifth member each way, `skills.list` → `skills.listed`, for REQ-CHAT-162's `/skills` — still no channel,
   no table and no control operation; see the report at the end of this record.)*
3. **One new native dialog**, with its capture seam, on REQ-SHELL-164's terms.
4. **`skills.enabled` is read from the SAVED configuration at force-load**, not from the run's captured
   Tier B snapshot, because `REQ-WORKSPACE-073` gates a user gesture happening now rather than a run
   that started earlier. This follows the `fetch` tool's per-call policy read (REQ-SANDBOX-038), which
   is the existing precedent for "a saved edit reaches the next gesture without a restart".
5. **The repository becomes its own fixture.** `.agents/skills/{build-ui,debug-ui,review-ui}` are
   project-scope skills under 051, which is what `AGENTS.md` has claimed since 2026-09-12 with nothing
   able to observe it. The proof asserts it.

## Rulings this record proceeds under, and where they are logged

Five conflicts were found in the corpus while reading, before any code. Each is logged as an ESC or an
OQ; this record states the reading the build proceeds under so the two cannot drift.

| # | Logged | Reading built |
| --- | --- | --- |
| A | ESC-37 | Domain 13 governs the delivery shape: a force-loaded always-active block, carrying REQ-CHAT-162's three identifying facts. **Ruled as built 2026-09-27** (R-052) |
| B | ESC-38 | Seven columns: Skill, Source, Path, Trigger, Invocation, Load, Description. **Ruled as built 2026-09-27** (R-052) |
| C | ESC-39 | REQ-SHELL-056's `-2`, `-3` suffixing; the holder keeps the name. **Ruled as built 2026-09-27** (R-052) |
| D | OQ-58 | Session state keyed by session id, with one `pending:<root>` bucket the next session adopts |
| E | OQ-59 | A file chooser on win32 and linux, both properties on darwin; the directory form stays reachable through `/skill <path>` |

## First execution — 2026-09-14

*Recorded in place, per `CLAUDE.md`'s standing policy, with one row appended to
`first-executions.md`.*

**It found a defect, and it was in the part of the mechanism this record had to correct in order to
build the feature at all — decision 4.**

`REQ-CONFIG-468` registered `runtime.additional_read_only_roots` and Part K wired it into the fence
that `executorsFor` builds per tool port. But the file tools take their fence from `FileToolState`,
which `executorsFor` caches per workspace root and creates **once**:

```ts
let state = deps.fileStates.get(root);
if (!state) { state = new FileToolState(fence); deps.fileStates.set(root, state); }
```

The comment on the line above it said "the file-tool state is per workspace root and keeps the first
fence it saw", so the behaviour was **known and written down** — and read as a property of the read
record rather than as what it also was: **a configuration value that stops taking effect after the
first run in a process**. A user who added a read-only root in Settings and saved got the new root at
the next run only if no run had happened in that workspace since the run host started. `grep` and
`glob` took the per-port fence and honoured it; `read_file`, `write_file` and the two `haet` tools took
the stale one. Two tools in one bundle disagreed about where the boundary was.

Nothing in the requirement corpus is wrong. `REQ-CONFIG-468` says the key designates roots the tools may
read; ADR-0037 puts the key in Tier B, read at each run start. The code loaded it at each run start and
then handed it to an object that had already made up its mind.

**It was invisible for the same reason it mattered.** The default for the key is the empty list, so the
stale fence and the fresh one were equal on every machine that has never set it — which is every machine
in every proof this repository has run. The first value that would differ is the one this feature
computes, because the cataloged skill directories change on a rescan, which `REQ-WORKSPACE-069` requires
to govern agents constructed afterwards. Building the feature is what made the two fences differ, which
is the fourth time in this project that a mechanism's defect was reachable only by building the thing
that depended on it.

**The repair** is decision 4: the fence travels with the tool, the state holds the read record and the
undo stacks. The falsified comment is kept beside its replacement in `run-host/tools.ts`.

Recorded as a defect note in a defect note (removed once repaired) and as the
hundred-and-first entry in `codebase.md`'s ledger.

**It found a second, in the surface — and the proof found it, not a test.** The Settings selectors were
bound to `state`, the run host's projection of what the *files* say, rather than to the pending settings.
A user could choose a policy, the change would reach the pending state and dirty the form correctly, and
the control would **snap back to the file's value** on the next render. The proof's log recorded all
three selections as "chosen" and every row still read its saved value, which is what made it visible;
no unit test would have, because the pure setters were right and the wiring was what was wrong.

It is the same rule the Display category already follows and states — *what is drawn follows the screen,
and Save decides what the file says* (REQ-CONFIG-472's note in `run-host`'s Tier C paragraph). Repaired
by passing the pending block into `SkillsSettings` and preferring it; the row now publishes both values
(`data-load` and `data-saved-load`) so the proof can tell a control that responded from one that did not.
The hundred-and-second entry in the ledger.

**Two toolchain facts the proof establishes, recorded because the next proof will want them.**

1. **Overriding `HOME`/`USERPROFILE` kills the Electron process before it paints** on Windows — exit
   `0x80000003`, two log lines in. A control run with the identical environment minus those two variables
   exited 0. User-scope discovery is therefore pointed at a scratch tree by a capture seam
   (`ROTARIS_CAPTURE_SKILLS_HOME`), not by the environment.
2. **The command registrar mounts with the transcript toolbar**, which the Workspace view draws only once
   there is a transcript. A launch that sits in Settings has no composer at all, and one with no session
   has no toolbar — so the proof submits a prompt before probing the commands, and probes the table and
   the commands in separate launches.

**What it did not find.** The search order including the `.git` file that ends a linked worktree's walk,
the manifest's three shapes, the shadowing rule, the context-unit ordering, the sparse policy write with
its baseline-over-a-lower-layer case, and the master switch were all built as written and held on the
first run. `pnpm skills-proof` passes at **8 checks over 7 launches**, and the repository's own three
skills are discovered, listed and invocable — the claim `AGENTS.md` has made since 2026-09-12 is now
observable rather than asserted, and a test in `packages/config/src/skills/skills.test.ts` keeps it so.

## The `/skills` listing — built 2026-09-27, reported in place

*`first-release-plan.md` §2.2 decided the path and holds the first-execution note; this record carries the part
that changes what it said. One row in `first-executions.md`.*

This record built everything REQ-CHAT-162 asks for except the listing, and said so where the command would register
(`SKILLS_LISTING_NOT_BUILT`). It is built now, on the terms this record already set: the run host, which owns the
catalog, writes the listing — as ONE `system` row through the followed session's own writer
(`run-host/skills.ts`'s `writeSkillListing`) — and the renderer keeps the command's name and collision rule, as
decision 5 puts them there. No new owner of state, no new package or edge, and no store change: REQ-CHAT-046/047 make
the row a system notice whose text is the listing, fixed once in `contracts/skills.ts` and drawn as the listing by
the one row renderer. No in-context column, as ESC-37's ruling requires.

**Decision 5 needed one correction to take a second fixed command.** Its registrar read any holder of the `skill`
kind badge as its own earlier work, and `/skill <path>` carries that badge — so a skill named `skill` took the
command or lost its own depending on which effect ran first, against REQ-SHELL-056 both ways. `/skills` would have
had the same exposure. The two fixed names are now always taken
([`a-skill-named-skill-takes-the-skill-command.md`](../../defects/fixed/a-skill-named-skill-takes-the-skill-command.md)).
The same change's gate found the prompt-file registrar holding the same hole from the other side — the fixed
commands register by effect after the prompt files are on a rebuilt registry, and a re-read took `/skills` back for
a `skills.md` — so both registrars now hold the two names
([`a-prompt-file-named-skills-takes-the-skills-command.md`](../../defects/fixed/a-prompt-file-named-skills-takes-the-skills-command.md)).

**One gap the specification leaves is logged as OQ-66**, with the reading built: REQ-CHAT-162 asks for the listing
to be reachable from the Settings tab, whose header actions REQ-WORKSPACE-067 fixes at two, so the tab's table is
read as that reach and nothing is added; and `/skills` from a window following no session is refused with a stated
reason, because a row must be saved with a session and OQ-58's pending bucket cannot hold one.

