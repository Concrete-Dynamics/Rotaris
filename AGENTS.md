# Rotaris-crw — clean-room rewrite

This repository is the **clean side** of a clean-room reimplementation. Everything here must be
traceable to approved behavioral specifications, approved architecture decisions, public technical
documentation, or approved design material.

**This file is the repository's rules, for every agent and every harness.** It is the one copy, and the repository
has no `CLAUDE.md` (the owner, 2026-10-27). Claude Code reads this file only when no `CLAUDE.md` stands in or above the
checkout; where one does, as on the Linux agent host, a Claude session starts without these rules — a risk the owner
accepted, recorded in `docs/defects/claude-code-sessions-under-an-ancestor-claude-md-load-no-repository-rules.md`.
Where the rules, the skills and the path-scoped rules live, and which harness reads which, is
[Agent harnesses](#agent-harnesses--one-set-of-files) below.

## Hard boundary — applies to every agent and session working in this repository

Do **not** read, clone, fetch, search, or quote from any of the following, for any reason:

- `https://github.com/Concrete-Dynamics/Rotaris-legacy` (the reference, renamed 2026-10-21) and
  `https://github.com/theUpsider/Rotaris` (an earlier home of the same reference), or any mirror, fork, or
  package of either
- the reference commit `e7093dda` and its ancestors, wherever they appear
- `D:\Development\Apps\Rotaris-cleanroom-sealed\` (the sealed reference clone and raw analysis)
- any transcript, scratchpad, or report produced by an agent that read the above

`https://github.com/Concrete-Dynamics/Rotaris` is, since 2026-10-21, this repository itself, not the reference.

If a task seems to require one of those sources, it does not. Raise the gap as an open question
against the relevant requirement instead. Convenience, speed, and implementation difficulty are
never valid reasons to cross the boundary.

## Approved inputs

- `docs/product/` — product directives (`PD-<DOMAIN>-<NNN>`), which **govern over** the requirements they name
- `docs/spec/` — approved behavioral requirements (`REQ-<DOMAIN>-<NNN>`)
- `docs/architecture/` — architecture and Architecture Decision Records
- `docs/clean-room/` — process, reference record, zone policy, provenance
- public library and platform documentation
- the approved Claude Design UX reference for information architecture and visual design
- sanitized black-box conformance feedback (observable differences only)

## When the owner asks for something

A request that would change what the product does is **classified before any code is written** and
logged in `docs/product/requests.md` when it is made. The table in `docs/product/README.md` chooses
between the five outcomes: **covered** (cite the `REQ` ids), **OQ-NN** (`docs/architecture/open-questions.md`),
**ESC-NN** (`docs/architecture/owner-decisions.md`, then an amendment round), **defect found by building**
(amendment round + a row in `docs/architecture/first-executions.md`), or **`PD-<DOMAIN>-<NNN>`**
(`docs/product/directives.md`).

A directive governs over every requirement it names, per identifier and never wholesale. The
specification is **never edited in place** for one — the requirement keeps its text and gains a
back-pointer to the directive in the same commit (`pnpm symbols` enforces the identifiers).
A request contradicting a faithful requirement is a **directive**, not an escalation. When in doubt,
log the request and classify it in writing.

**An open question does not wait on the owner** since 2026-10-07 ([R-072](docs/product/requests.md#r-072)): the
orchestrator's consortium rules it under the owner's standing delegation — two independent advocates argue and
recommend, a ruling agent rules, and the ruling is written into the entry and minted as a directive where it departs
from a requirement. An escalation, and a clause the owner ruled personally, stay the owner's. An agent that is not the
orchestrator raises a question and never rules it. Plans running in parallel raise open questions from the ranges
their briefs assign; one that lands on a number `main` already holds takes the next free one, says so in its entry and
renumbers its citations (`.agents/skills/orchestrated-build/references/repository.md`, "Merge conflicts").

## Defects noticed along the way

A defect an agent notices **while doing other work** is written to `docs/defects/` **without asking the
owner first** — recording it is never gated on permission, so nothing is lost when the session that saw
it ends. Follow the schema in `docs/defects/README.md`: name, concise description, the specification it
contradicts (or none), and the relevant files. Record it whether or not it is in scope to fix.

Recording is not repairing and not classifying. Writing the note does not authorize the fix, and it does
not substitute for the paths above: a **defect found by building** still owes its amendment round and its
row in `docs/architecture/first-executions.md`, and a change the owner asks for is still classified in
`docs/product/requests.md` before code. When a noted defect is repaired, move its note to `docs/defects/fixed/`
rather than deleting it.

## Process state

**Both gates are closed and implementation is authorized, bounded.** The Specification Gate closed
2026-08-31 (`docs/clean-room/specification-gate.md`); the Architecture Gate closed 2026-09-03
(`docs/clean-room/architecture-gate.md`). What is authorized is **the mechanism** — process topology,
the store, the run flow, the event stream, settings, permissions, the backup and the restore.
**On 2026-10-06 the owner counted the work as finished** without the release pipeline and its inputs (signing,
the licence inputs, the icon), continuous integration, the Linux and macOS builds and the owner's hardware checks
([R-071](docs/product/requests.md#r-071)): each stays owed where it is recorded, and none is an agent's to start.

**Design material, and how to use it.** `docs/design/` holds the **approved design language** —
adopted and authoritative: cite the token by name, never a literal colour or pixel value. Its
**information architecture is not adopted**: screens, order and tabs come from `docs/spec/`
(`REQ-SHELL-023` is canonical). `docs/design/mockup/` is read **for craft, never for structure**;
where the two disagree the specification governs. `docs/design/README.md` §2 is the adoption rule.

**One bound is not waived and no agent may treat it as advice:**

- **No Linux or macOS release artifact may be produced** until the build hosts exist (**IC-3**).

*Corrected 2026-10-13: this read "Two bounds", the other being "`REQ-SHELL-128`'s three built-in themes cannot
yet be met (IC-2): `nocturne` and `high-contrast` have no palette, and the token set declares no theme metadata or
native-surface mapping". IC-2 was discharged on 2026-09-04 by `pnpm theme-proof` and OQ-30 closed with it: all
three themes carry a palette, a label, a description and a dark flag (`packages/contracts/src/theme/themes.ts`);
only the different-scale multi-monitor drag remains, the owner's measurement.*

`docs/architecture/implementation-conditions.md` holds **IC-1 to IC-8** *(this read "IC-1 to IC-7")*. A condition binds the work it
names: that work may not be reported complete until the condition is discharged, discharging means
recording the result in the record whether or not it passed, and **no condition may be downgraded by
the person doing the work**.

**A mechanism's first execution reports back into the record that decided it**, in place, including
when it found nothing — standing policy, ruled at the Architecture Gate — **and appends one row to
`docs/architecture/first-executions.md`**. Keep a falsified reason beside its replacement; never
repair it quietly in the code that meets it.

**A spike is taken as the first act of building the thing it prices**, not before and not later.

## The codebase

Rotaris is **one Electron desktop application**: a pnpm workspace of TypeScript packages (Node ≥ 24,
React in the renderer, SQLite for the session record, electron-vite for the build, Vitest for the tests)
over five composition roots in `apps/desktop/src/`.

Two routers answer the two questions worth asking before an edit, and neither costs more than a page:

- **Where does a thing live, and what do I open first?** → [`docs/module-map.md`](docs/module-map.md) —
  packages, roots, entry files, test globs, and the placements that are not where you would guess.
- **Where does *this edit* land, in what order?** → the router at the top of
  `docs/architecture/views/README.md`, then the view it names (`04-seams.md` for the eight additions
  this product makes most often).

`docs/architecture/codebase.md` is the deeper map — what landed, what stands in, what is owed. Packages
follow **process boundaries**, arrows point downward only, and `eslint-plugin-boundaries` fails
`pnpm lint` on a violation. `apps/desktop/src/{main,preload,renderer,run-host,workspace-service}` are
the only places `electron` is imported. Engine code takes time from the clock ports, never from globals
(`rotaris/no-bare-timers`). A design-equivalent control exists only in `packages/ui/src/design-system/`
(`tools/check-ui-language.mjs` fails `pnpm lint` on one written elsewhere). A store migration is
**appended**, never edited once shipped. Nothing in `packages/kernel/src/generated/` is written by hand
— `pnpm symbols` writes it.


### Commands

```
pnpm install --prefer-offline                 # a fresh worktree also needs: node node_modules/electron/install.js
pnpm worktree:new <topic>                     # that line and the ones before it, wrapped: fetch origin/main, branch, worktree, install, electron, preflight
pnpm worktree:land                            # fetch, rebase onto origin/main, gate + affected proofs on the rebased head, fast-forward push, cleanup
pnpm worktree:overlaps                        # what parallel work shares: each branch's files vs its fork from origin/main, the files two branches touch, and where main moved too — a report
pnpm check                                    # symbols + typecheck + lint + tests — all four green before a commit (an orchestrated build: on each head it lands)
pnpm vitest run <path>                        # the narrowest verification; tests sit beside the unit they cover
pnpm typecheck | pnpm lint | pnpm symbols     # the pieces, when the whole gate is too slow
pnpm dev-time report                          # where the time went (R-075): the gate, builds, proofs and worktree steps record themselves — and the reds each next green closed
pnpm build && electron apps/desktop/out/main/index.js
pnpm dev                                      # electron-vite, against the workspace source
pnpm <area>-proof                             # the built app measuring one mechanism — docs/proofs/README.md indexes all of them
pnpm verify:plan                              # a diff → gate, complete proof suites, architecture docs; unmapped paths need review
pnpm preflight [proof-id …]                   # the machine before a suite launches — node, git, Electron, the build, the bundle, the display; it launches nothing
pnpm evidence write|verify <dir>              # an evidence directory's manifest — machine, build, per-file sha256; verify re-hashes it
pnpm app:drive start|shot|inspect|stop        # drive the built app, free, no provider
pnpm mockup                                   # the design material, before drawing a surface
```

`pnpm check` does not reach two checks, and both have sections below: **`pnpm app:drive`** (free) and
**`pnpm live-run`** — the built product against a real key in a throwaway workspace, bounded by the
endpoint's own accounting. It spends the owner's money, it is never automatic, and an agent asks before
running it (the standing exception is the section's own).

`docs/module-map.md` is maintained on the same terms as the views, on the narrower trigger it states: a
package that appears, moves or changes what it owns, or an entry point named there that moves. An
ordinary fix, or a refactor that moves nothing another agent would navigate by, changes nothing in it.

`.claude/rules/` holds the invariants that bind **one subtree** — surfaces, the store, what crosses a
boundary, inside a run, tests and proofs. Each carries `paths:` frontmatter, so it reaches context only
when a file it names is read, which is why they are not in this file; [Agent harnesses](#agent-harnesses--one-set-of-files)
indexes them by path for a harness that does not load them itself. They are repository content for the
same reason `.claude/skills/` is; `.claude/rules/README.md` states what may be written there. A rule that
outlives its convention is deleted, not annotated.

## Where the work happens — a temporary branch in a temporary worktree

**Every change is built on a temporary branch in its own temporary worktree, and lands on `main` by a rebase
and a fast-forward push the agent performs itself; `main`'s history is linear, with no merge commit** (the owner,
2026-10-04: "please always use rebase instead of a merge commit for main."). The primary checkout is not a place
to write. Only trivially reversible, single-file documentation edits may be made in place, and only when
`git status` is clean.

Steps, the conflict shapes a rebase replays, and the LF line-ending rule live in
`docs/clean-room/agent-workflow.md` — read it before the first edit, not here. `pnpm worktree:new` and
`pnpm worktree:land` (Commands) wrap the two halves; the rules stay in that file.

## The architecture views — consult before, maintain after

`docs/architecture/views/` holds the system as built: **component** (packages, allowed edges),
**process** (processes, messages, files on disk), **runtime** (run flow, controls, store,
configuration), **seams** (the ordered edit path for a command, a channel, a store column, a tool,
a configuration key, a notice, a preference, a surface), **state ownership** (which process owns a
fact and who may write it) and **sequences** (launch, an approval, the board). Two obligations bind
every change:

- **Consult before modifying code** — read the view that covers the area; the router at the top of
  `views/README.md` chooses it, and each view carries its own section index.
- **Maintain after modifying code** — update the affected view **in the same commit**, plus the
  "last reconciled" date in `docs/architecture/views/README.md`. A view that disagrees with the
  code is a defect of the change that made it so.

## The design language — consult before, match after

The same pair binds every change that **draws, redraws or restyles a surface**
(`docs/design/README.md` §7; §2 states what is adopted). Before writing the component, run
**`pnpm mockup`** and read the surface for **craft, never structure** — structure comes from
`docs/spec/` (`REQ-SHELL-023` governs). After drawing, match it: tokens alone are not compliance,
and a plausible invention is not a third option where the design material decides.

The repository operationalizes this pair through `.agents/skills/build-ui`, `.agents/skills/debug-ui`, and
`.agents/skills/review-ui`. The first two join implementation to built-app evidence; the third is a report-only
critic over screenshots, geometry, computed styles and deterministic findings, capped at three iterations.

## Traceability

Implementation work cites the requirement IDs it satisfies. Commits that implement behavior
reference those IDs so requirement, decision, code, and test remain linked. Work that implements a
**product directive** cites its `PD-<DOMAIN>-<NNN>` on the same terms, and where a directive governs,
the code cites the `PD` rather than the requirement it displaced.

[`CONTEXT-MAP.md`](CONTEXT-MAP.md) is the **domain glossary**: one `CONTEXT.md` per context,
each derived from `docs/spec/` and citing its owning `REQ-<DOMAIN>-<NNN>`. Consult it before naming
anything; a word the specification does not have is an open question, not a licence to invent one.
Prefer its word over a synonym you would otherwise reach for. [`docs/module-map.md`](docs/module-map.md) answers
*where*; the [proof registry](docs/proofs/README.md) answers *what re-verifies it*.

A document of the record holds at most **500 lines and 32 KiB**, and one over that is split into an index at its own
path and parts in a folder of the same name ([`docs/README.md`](docs/README.md), "The document budget";
`tools/check-doc-budget.mjs` fails `pnpm lint` on a new one). The specification's live domains, the directives, the
open questions and the longest architecture records are split that way: open the index, then the part it names.

A **scratchpad** outlives the conversation: `.scratchpad.md` in the primary checkout (git-ignored, so a fresh
clone has none) carries the owner's standing asks, decisions and dead ends a compacted session would lose —
read it when picking up work, and keep it current when something must not get lost.

Every closing report uses the **handoff** shape [`docs/clean-room/agent-workflow.md`](docs/clean-room/agent-workflow.md)
fixes: a heading and four lines — **Zustand** (what is now true), **Beweise** (what ran and what it said),
**Offen** (what remains), **Nächster Schritt** (the one action that follows). It closes an agent's work to the
owner, a lane's report to the next lane, and every landed `pnpm worktree:land` run.

## Agent harnesses — one set of files

Rules and skills are written once, and every harness reads them from the same files. A copy kept for a second
harness is the copy that drifts, so a harness that cannot read a canonical file is given a pointer to it, never its text.

| What | Canonical home | Claude Code | Codex, and any harness reading `AGENTS.md` and `.agents/skills/` |
| --- | --- | --- | --- |
| the rules | this file | loaded at session start, whole, only where no `CLAUDE.md` stands in or above the checkout | loaded at session start — Codex reads the first 32 KiB, so this file stays under that |
| the skills | `.agents/skills/<name>/` | through `.claude/skills/<name>/SKILL.md`, a router | discovered there |
| the rules that bind one subtree | `.claude/rules/<area>.md` | loaded when a file its `paths:` names is read | read by hand, from the index below |
| GitHub Copilot's agents | `.github/agents/*.agent.md` | — | Copilot; each defers to this file |

**Measured** 2026-10-26 on Claude Code 2.1.310 and Codex CLI 0.164.0 ([first-executions](docs/architecture/first-executions.md)).
When Claude Code discovers `.agents/skills/` itself, the routers go.

**A router is a pointer, not a skill.** It carries the skill's `name`, its canonical `description` and
`argument-hint`, and one line sending the reader to `.agents/skills/<name>/SKILL.md`; an instruction written in a router
is in the wrong file. `tools/agent-config.test.ts` fails a skill with no router, a router whose fields differ from the
canonical file's, a root `CLAUDE.md`, a rule file this index does not name, and this file at 32 KiB or more.

**The path-scoped rules, by path.** A harness that does not load them reads the rule before editing a file it names:

| Rule | Binds |
| --- | --- |
| `.claude/rules/contracts-and-ipc.md` | `packages/contracts/`, `apps/desktop/src/{main,preload}/` |
| `.claude/rules/engine-and-tools.md` | `packages/{engine,agent-tools,hooks,config}/`, `apps/desktop/src/run-host/` |
| `.claude/rules/store.md` | `packages/store/`, `packages/workspace/src/{backup,restore}.ts` |
| `.claude/rules/tests-and-proofs.md` | every `*.test.ts` and `*.test-support.ts`, `apps/desktop/scripts/` |
| `.claude/rules/ui-surfaces.md` | `packages/ui/`, `packages/ui-core/`, `apps/desktop/src/renderer/` |
| `.claude/rules/README.md` | the rules themselves: what may be written there |

## The proof scripts — the rules they obey

`pnpm check` (symbols, typecheck, lint, tests) is the gate every change passes before it lands on main: an agent
working alone runs it before each commit; in an orchestrated build it runs on the exact head each landing
pushes, its builders committing on the quick checks (the owner, 2026-10-07; the skill's CHANGELOG). Beside it
sit the **proof scripts**: each launches the **built** application against a scratch profile and measures a
mechanism in the product rather than in a unit test. Every one is a first execution's evidence, and the area it
covers is the area it re-verifies.

Two rules about them. **Run the whole suite a part touches, not the one script named after it** — a change
that moves a shared seam breaks a neighbour's proof, and that is the point of having them. And a proof is
**evidence, not a test of the harness**: a red is a defect of the product until the harness is shown to be
wrong.

`pnpm verify:plan` prints that list for a diff (working tree, index and untracked against the merge-base with
`main`, or `origin/main` if `main` is missing): the gate, the complete affected proof suites, and the architecture
documents. An unmapped path requires explicit review — it is never "no proofs". Run it before deciding which
proofs to skip.

`pnpm preflight [proof-id …]` checks the machine before a suite launches: node, git, Electron, the desktop build
(and whether it is older than its sources), the code-intelligence bundle, `.proof/`'s writability, exported
`ROTARIS_*` variables (every launch strips them) and the display — plus, for each named proof, what its registry
record needs beyond the harness. It launches nothing; a red is the machine, not a proof result.

**No proof hangs on a launch that overruns, and none leaves the app's processes behind.** Every launch a script starts
goes through `lib/bounded-launch.mjs`'s `spawnBounded`, and a driven one through the driver's `stopApp`; never a bare
`spawn` or a `spawnSync` of Electron, which `lib/launch-sites.test.ts` fails, naming the two reasoned exceptions. A
launch ends with its whole process group. How the bound, the drain and those exceptions work is the proof registry's
"How a proof launch is bounded".

Which proof covers what is the **proof registry**, [`docs/proofs/README.md`](docs/proofs/README.md), rendered from
[`tools/proof-registry/registry.mjs`](tools/proof-registry/registry.mjs) (`pnpm proofs:index`; `pnpm lint` fails it stale
and `tools/proof-registry/registry.test.ts` holds it to the tree); each row links the proof's record under `docs/proofs/`.
It answers what a proof covers, not which suite a diff needs: `pnpm verify:plan` prints that plan, and it is followed
rather than reconstructed from the registry's rows.

## A branch, a worktree, a landing — `pnpm worktree:new` / `pnpm worktree:land`

The two wrappers around the workflow [`docs/clean-room/agent-workflow.md`](docs/clean-room/agent-workflow.md) states;
that file is the rule text, holds what each wrapper does, and is read before the first edit.
**`pnpm worktree:new <branch>`** cuts a branch's worktree from `origin/main` and installs it; **`pnpm worktree:land`**
rebases it, gates and proves the rebased head, pushes it fast-forward to `main` and removes the trees — a conflict
aborts the rebase and hands back, a red stops it with nothing pushed, and the gate is never retried.
`pnpm worktree:overlaps` reports what parallel work shares, and is never a gate.

## Repository skills — `.agents/skills/`

Six portable workflows live under `.agents/skills/`, where REQ-WORKSPACE-051 makes them discoverable from
this repository; Claude Code reaches each through its router (above). **`build-ui`** creates or substantially restyles a
surface, **`debug-ui`** repairs a bounded rendered defect, and **`review-ui`** is a report-only external critique.

A fourth, **`orchestrated-build`**, drives a large body of work (a release backlog, every open defect) through a
multi-agent workflow: per bundle an independent reviewer that repairs in place and lands it, repair rounds,
acceptance with the proof sweep and live runs, and recovery from container restarts out of the workflow journals.
It improves itself under the guardrails its `SKILL.md` states; `pnpm check` runs its self-test.

A fifth, **`run-autopsy`**, is the post-run forensic skill: it reads a live run's launch log, session store and
transcript as evidence and writes a fixed-schema friction and defect report, and the orchestrated build's acceptance
autopsy follows it (the profile's `autopsy.method`).

A sixth, **`verify-plan`**, prints the gate, the complete affected proof suites and the architecture documents for a
diff (`pnpm verify:plan`). Unmapped paths require explicit review — never treat them as no proofs.

`build-ui` and `debug-ui` may change source within the authority of the current task. `review-ui` writes only
evidence under `.ui-review/`. Its critique is proposed evidence and reaches implementation through a separate,
authorized build or debug pass. A complete review loop has at most three iterations.

## Where the time went — the development-time store (R-075)

`pnpm dev-time report` reads `~/.rotaris/dev-time/log.jsonl`, one record per measured span, and computes **the reds
each next green closed**. **Most spans record themselves** — the gate and each of its stages, `pnpm build`, every proof
script, the worktree wrappers' steps — so no habit is needed and none should be invented: don't wrap timers around what
the store already holds. Anything else is explicit: `pnpm dev-time run <kind>:<label> -- <command>`, or a `start`/`stop`
pair. A measurement never fails the work it measures, and no test writes the operator's store
(`ROTARIS_DEV_TIME_DISABLE`, `ROTARIS_DEV_TIME_HOME`). What records itself, and how, is
[`01-component-view.md`'s dev-time section](docs/architecture/views/01-component-view.md#the-development-time-store-behind-pnpm-dev-time-2026-10-18-r-075).

## Driving the built app — `pnpm app:drive`

The fastest way to see what a surface actually does without editing a proof script and waiting out a
launch. It spends nothing, talks to no provider by default (the scripted dialect), and runs against a
scratch profile under `.drive/`. Full usage is in the script's own header
(`apps/desktop/scripts/drive.mjs`) — `pnpm app:drive` with no command prints it.

It drives the **built** app, so `pnpm build` first. `start --env=ROTARIS_APP_LOG_LEVEL=debug` logs every level (an
exported variable never reaches it); otherwise `log` prints info and above (PD-MONITOR-002). The commands, and how a
window is named (`windows`, `useWindow`, `--window=`), are the script's header.

`stop` is the application's quit: a live run comes to rest with the stop reason `application_shutdown`, and `stop` waits
for the process to end; since OQ-298's ruling no close guard is asked, so unsaved settings stay unsaved. `stop --crash`
is the immediate exit, for a drive that means to leave a crash for the next launch to repair.

`click --settle` presses only once the match has held still across two frames and is what its centre would press, and
fails when the press met something else, naming it: use it for a control that a notice, a new row or a resize can move
between the measurement and the press (driver-proof's Pop out, 2026-10-06; a plain `click` is unchanged).
`type` types a line break as Shift+Enter, the composer's newline (REQ-CHAT-001), so a multi-line text keeps its breaks and
is submitted only by `--enter`; the capture seams' typed steps do the same.

`command` is relayed to main's own `runCommand` — the same path the renderer's channel reaches — so driving a
command drives the product, not a stand-in for it. The seam (`apps/desktop/src/main/driver.ts`) exists only
when `ROTARIS_DRIVER` names an endpoint file at launch; it is verification only, and `pnpm driver-proof`
is its proof.

Two habits worth keeping: **`shot` produces a PNG an agent can read directly** (it waits four of the renderer's
frames first, so it is never the frame before a click or a navigation; its reply's `painted: false` says a window
presented none), which is the cheapest way to meet
the design language's "match after drawing" obligation above; and a step that needs a condition should `waitFor` it rather than
sleep, because the reason this seam exists is that fixed offsets have produced false reds three times.

## The live run — `pnpm live-run`

Every other check in this repository answers the model itself. `pnpm test` uses scripted clients; each
`*-proof` script scripts the dialect or the run host. They prove the mechanism and they cannot prove that the
product works against a real model: a real endpoint, a real key, a real catalogue, real tool calls, a real
workspace changed on disk.

`pnpm live-run` does exactly that, against whichever OpenAI-compatible endpoint the owner registered, in a
throwaway workspace, for a few cents.

### When to run it

After a major feature lands — a part closed, a lane merged, a store migration, anything that touches the run
loop, the tools, the providers or the shell. It is a smoke test of the whole product, not a unit check; it does
not replace the part's own proof, it follows it.

It is **never** automatic. It is not in `pnpm check`, `pnpm test` collects nothing from it, and no hook or CI
step may call it. It runs when the owner asks for it, or when an agent asks the owner and is told yes.
An agent must not run it on its own initiative: it costs money the owner pays.

**Against the registered self-hosted default, that last rule is already answered** ([R-068](docs/product/requests.md#r-068),
2026-10-02). The default endpoint, `katalyst`, is the owner's own server, registered `unmetered`, and the owner's
authorization to run against it is standing: "you may do the live run.never ask for my persmission for it. you always
have my permission." A run against it spends nothing and is not asked about again; it is still never automatic in the
sense above (no `pnpm check`, hook or CI step reaches it). The rule stands unchanged for every **metered** endpoint
(one whose registry entry does not say `unmetered`, OpenRouter among them): such a run spends the owner's money and is
asked for first. `pnpm slice-proof` signs into the same registry since that day and runs on the same terms.

An owner's yes is not always enough in an agent session: the harness's automatic permission classifier has refused
`live-run.mjs --confirm` launches the owner authorised (R-066, R-067), and which it admits is not established, so an
agent does not predict it. An agent that meets that refusal stops, and it does not reach the run by another route,
such as splitting the refused launch into admitted `--only=` pieces. It records the refusal where its task lives and
says so in its report. Only the owner can close the gap: by allowing `node apps/desktop/scripts/live-run.mjs --confirm`
for agent sessions in the harness's permission rules, or by running the command by hand. The refusals met, and the
allow rule that stands on the Linux host, are the manual's "The classifier's refusals".

### Everything else about it — [`docs/proofs/live-run.md`](docs/proofs/live-run.md)

The live run's manual is its proof record: registering an endpoint and storing its key, the flags, the scenarios and
what each asserts, the cost bounds (**name `--max-iterations` yourself on an endpoint that charges**), the evidence
pack, the `faults` and duress scenarios and the rule they obey (replay the shape the record names, never a plausible
family resembling it), reading a failure (a red is a **defect of the product** until the harness is shown wrong, and is
recorded where the mechanism was decided), and the fixture. **Read it before running a live run or changing
`apps/desktop/scripts/live-run.mjs`; its rules bind as if they stood here.** It moved out of this file on 2026-10-26
so that this file fits the window every harness reads whole.
