# Product-owner decisions on the architecture record — Rulings after the gate — 2026-09-06

Part 9 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Rulings after the gate — 2026-09-06

### ESC-32 — IC-7: the code-intelligence language servers are tools provisioned after installation

**Ruled: option 2 — amend the requirement.** Raised by Part T, ADR-0035's first execution (2026-09-06), as
implementation condition **IC-7**: the bundled runtime is self-contained — it answers `tools/list` and the
protocol with nothing else installed — but the language servers its symbol-level tools need are obtained by
the runtime itself at the first use of a language, into the per-user data directory (TypeScript through
`npm install typescript@5.9.3` and `typescript-language-server@5.1.3`; Python through `uvx --from
pyright==1.1.403`; every other language by its own download), which `REQ-STARTUP-159` as written did not
permit. The owner chose, from the three ways IC-7 offered to discharge itself, the second: read
`REQ-STARTUP-159`'s "the only things fetched after installation" to include those servers as **tools
provisioned after installation**, the way Git and ripgrep already are — declared in the setup manifest with
name, version, source and licence (`REQ-STARTUP-058`), listed in `THIRD-PARTY-LICENSES.txt`'s "Tools
provisioned after installation" section (`REQ-STARTUP-142`), and surfaced to the user before the first
fetch (`REQ-MCP-118`, minted for it).

**Why this one.** It is the treatment the product already gives Git and ripgrep, so it adds no second
regime; it costs no artifact size and no second interpreter to pin and licence; every language the runtime
supports keeps its symbol tools rather than the two a bundle would carry; and the user reads what will be
fetched, from where and to where, on the surface that holds the setup action, before a run can trigger it.

*The alternatives were:* **option 1**, bundle the servers for the languages the release claims — a Node
runtime and two npm packages beside the Python tree, an estimated 60–100 MB more, a second interpreter to
pin and licence under `REQ-STARTUP-142`, and only TypeScript and Python served offline; **option 3**, ship
without symbol-level tools for any language whose server is absent (today: all of them), the pattern-search
and memory tools still offered and the category saying so. The first buys offline symbol tools for two
languages at a size and licensing cost the owner did not want; the third ships the runtime's headline
capability switched off.

**Consequences to carry.**

- IC-7 stays on the release until **both** halves of its option-2 discharge are shown. The amendment, the
  manifest's declaration checked against the runtime, and the disclosure with its proof are the first half.
  The second — the notices generator listing the servers under `REQ-STARTUP-142` — waits on that generator,
  which is not built (`REQ-STARTUP-141/142/143`; ADR-0054). The entry in `implementation-conditions.md`
  says so; no condition is downgraded by the person doing the work. *2026-09-27: the second half is shown. The
  notices generator lists the servers, and IC-7 is recorded as discharged there. The release pipeline's evidence
  of the section is still owed (`first-release-plan.md` §4.3).*
- `REQ-STARTUP-064`'s reason for exempting the reserved token from cache warm-up — "what it resolves to
  ships inside the artifact" — was true of the runtime and false of its servers. The outcome (no warm-up
  step) stands; the reason is qualified in place and kept beside its qualification, under GD-10.
- Languages beyond TypeScript and Python are not declared, by the amendment's own terms: the disclosure says
  a further language's server is obtained the same way. Declaring more is a release decision, not a defect.

### ESC-33 — REQ-MCP-044's 8-second toast is a second copy of an owned figure

**Ruled: amend `REQ-MCP-044`; `REQ-NOTIFY-011` is untouched.** Raised by Part V, ADR-0049's execution in
full (2026-09-06): `REQ-MCP-044` gave its construction warning "a UI toast of severity 'warning' with an
8-second auto-dismiss", and `REQ-NOTIFY-011` fixes the acknowledgement lifetime at 4200 ms while declaring
itself the product's single definition of one and forbidding any surface from stating another. A build
could not satisfy both.

**Why this one.** The MCP text is the copy and the NOTIFY text is the definition, which is the same
relationship `REQ-NOTIFY-044` already has with `REQ-SHELL-023`'s views, `REQ-CONFIG-269`'s categories and
`REQ-LIBRARY-103`'s tabs — cite the owner, hold no copy that can drift. Nothing is lost by the shorter
span: `REQ-MCP-044` delivers through **two** channels and the durable one is the persisted `mcp_config`
session issue, readable in the session's issues file after the run; the acknowledgement was never the
record. And `REQ-NOTIFY-268`, built in the same part, now records every warning notice at publication.

*The alternatives were:* **grant `REQ-MCP-044` a lifetime of its own**, which reopens `REQ-NOTIFY-011`'s
single definition for every domain that wants two more seconds and turns one figure into a per-surface
negotiation; or **make this warning a persistent notice** under `REQ-NOTIFY-040`, which stays until
dismissed or superseded. The second is not rejected — it remains available to `REQ-MCP-044` as a severity
decision at no cost to `REQ-NOTIFY-011` — but it is a change to what the warning *is*, not to how long a
transient lasts, and the owner did not make it here.

**Consequences to carry.**

- The 8 s figure is not preserved anywhere, and the amendment says so in place: a warning that must
  outlive an acknowledgement is a persistent notice, not a longer transient. A later reader who wants the
  MCP warning to stay on screen has one lever and it is severity.
- The built product already matched this ruling before it was made: Part V routed the warning to the
  acknowledgement channel because `REQ-NOTIFY-040` forbids the timed clear, and raised the disagreement
  rather than choosing. No code changes under this ruling; two code comments citing it as an open question
  now cite the amendment.

### ESC-34 — the notice action vocabulary was closed against two actions the product owes

**Ruled: amend `REQ-NOTIFY-044`; add both members.** Raised by Part V alongside ESC-33.
`REQ-NOTIFY-224` obliges the unreviewed-hooks notice to offer "an action opening the review" — the modal
dialog of `REQ-HOOKS-106` — and `REQ-WORKSPACE-152` (3) obliges the first-launch notice to carry "an
action that starts the flow". `REQ-NOTIFY-044`'s eleven members reached neither, and that requirement's
own closure ("an action naming a value outside the owning domain's vocabulary is not dispatched") makes
the gap a refusal rather than a stretch.

**Why this one.** `REQ-NOTIFY-224` and `REQ-WORKSPACE-152` state behaviour; `REQ-NOTIFY-044` enumerates.
When the two last disagreed, **resolution 12 of this domain corrected the enumeration** — "the action
vocabulary was corrected to match rather than the other way round" — and the same reading applies. The
nearest existing member, opening settings at a category, reaches the surface *beside* each target rather
than the target, and `REQ-WORKSPACE-152` distinguishes those two outcomes deliberately between its clause
(2) and its clause (3). The vocabulary's closed property survives both additions: neither writes into the
user's project.

*The alternative was* to narrow the two behavioural requirements to `open-settings`, which costs the user
a surface in each case and erases a distinction one of them draws on purpose.

**Consequences to carry.**

- Both members carry their object, as `REQ-NOTIFY-044` requires of every other member: the review is
  parameterised by workspace (the notice is published per workspace and hook set), the setup by provider
  where the action names one. **This one does change code** — the two members shipped in Part V carried no
  parameter — and the change is made under this ruling rather than left as a divergence.
- Activating a hook-review action whose workspace is not the open one is not built. The product logs it
  and opens nothing; navigating between workspaces from a notice is owed, and is recorded in the map
  rather than silently ignored.
  *Built 2026-10-13 (fin41, item N86): the owed navigation's first execution.* The case is reachable because notices are
  application-wide: a second main window (PD-SHELL-001) or a switch since the notice was raised puts the action in a
  window holding another workspace. The renderer now hands the action's workspace to main (`hooks.review {workspace}`),
  and main reaches it — the window holding it surfaced (REQ-STARTUP-163), else one added for it with no gate and no close
  — then opens that workspace's review in that window and stores the decision against it. Where no window holds the
  workspace, adding one is ~~the build's reading and not a ruling~~ the ruled reading since 2026-10-13: [OQ-267](../open-questions/57-spikes-and-later-questions-24.md#oq-267),
  ruled under [R-072](../../product/requests.md#r-072) as [`PD-SHELL-001`](../../product/directives/pd-shell-001.md#pd-shell-001) revision 2. `pnpm notice-proof`'s
  `review-other` launch drives it; before the repair it logged "… which is not the open workspace" and opened nothing
  ([`../../defects/fixed/a-hook-review-notice-for-another-workspace-opens-nothing.md`](../../defects/fixed/a-hook-review-notice-for-another-workspace-opens-nothing.md)).
  The provider-named sign-in branch stays a logged no-op: no notice names a provider, so nothing reaches it.
- The count is unchanged: no identifier was minted or withdrawn.

### ESC-35 — the intent-classification bound was set against a hosted provider's latency

**Ruled: amend `REQ-ORCH-008`; raise the default from 8.0 s to 12.0 s.** Raised by the live run's first
execution (2026-09-11, `AGENTS.md`): against the owner's self-hosted vLLM endpoint the classification call
did not answer inside 8.0 s, so `REQ-ORCH-007`'s fallback stood in — `moderate_feature`, flagged, reason
"the classification call timed out after 8 s" — on a prompt the model classifies correctly when it is
allowed to finish. Nothing failed; the ladder did exactly what it promises. The figure was simply chosen
against providers whose first token arrives sooner than a local one's.

**Why this one.** The bound exists so a slow classifier cannot delay the first iteration, and the cost of
being wrong is asymmetric: too long delays a run start by seconds, too short silently degrades every run
on that endpoint to the fallback intent, which then gates capabilities, playbook cells and the budget
clamp (`REQ-ORCH-005`) for the whole run. A default that a supported class of endpoint cannot meet is a
default set against the wrong population. 12.0 s clears the measured first-token latency with margin and
stays well inside what a person waits at run start.

*The alternatives were:* **a configuration key** — a `runtime:` field so this machine alone sets 12 s —
which is the better long-run shape but mints a `REQ-CONFIG` identifier and leaves the shipped default
still wrong for local endpoints, so it answers the owner's machine and not the defect; or **leave 8.0 s
and accept the fallback**, which is only tenable while nobody reads the intent, and `REQ-ORCH-005` makes
that false. The configuration key is **not rejected** — it remains available on top of this ruling, and
`ClassifyDeps.timeoutMs` already carries a per-call override for whoever mints it.

**Consequences to carry.**

- The old figure is not preserved anywhere and the amendment says so in place, quoting what the sentence
  read. A reader who wants the shorter bound back needs a measurement that says 12.0 s costs something.
- **This one changes code**: `CLASSIFICATION_TIMEOUT_MS` and the test that drives the clock past it, both
  citing this ruling. No other bound moves — `REQ-ORCH-113`'s completion classifier stays at 15 s and
  `runtime.loop_classification_timeout` (`REQ-CONFIG-467`) stays at 2.0 s; they bound different calls.
- The count is unchanged: no identifier was minted or withdrawn.

### ESC-36 — the provider row visibility: REQ-PROVIDER-140's union against REQ-CONFIG-389's authenticated-only list

**Raised 2026-09-14, ~~not yet ruled.~~ Ruled 2026-10-06.** Raised by R-016, the Settings Models overhaul, while planning which
rows the rebuilt providers card may draw. The two requirements state disjoint populations and no document
between them narrows either.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the built behaviour is kept. REQ-PROVIDER-140 governs: the Settings provider list shows every provider its union lists, authenticated or not. REQ-CONFIG-389 is amended to match by [`PD-CONFIG-002`](../../product/directives/pd-config-002.md#pd-config-002), which narrows its first sentence and keeps the managed-cloud quick-start rule and the rule that a reference by a model slot alone causes no row. The amendment is carried as a directive with its back-pointer, the specification not being edited in place by this round.

- **REQ-PROVIDER-140** (domain 04) fixes the listed set: "the union of the ids holding a stored credential,
  the built-in catalog ids, and the snapshot ids, each appearing exactly once, ordered by id." Every
  built-in provider therefore appears whether or not it is authenticated — the screenshot the request
  arrived with shows OpenAI Codex, GitHub Copilot, DeepSeek and OpenAI-compatible rows reading "Not
  authenticated", and `packages/providers/src/signin.ts` `list()` implements exactly this union.
- **REQ-CONFIG-389** (domain 15) fixes the same set differently: "The provider list shows **no** built-in or
  merely-referenced provider by default; a row appears only once a provider is authenticated. The one
  exception is the managed-cloud provider … A provider that is only referenced by a model slot — a deleted
  custom endpoint included — must **not** cause a row to reappear."

REQ-CONFIG-440's withdrawal routes the withdrawn text-mode provider list at "REQ-CONFIG-329 and
REQ-CONFIG-367 to REQ-CONFIG-389", and REQ-PROVIDER-103's withdrawal routes the command-line list at
REQ-PROVIDER-140 — so each withdrawal redirected the same capability at a requirement that now disagrees
with the other about who gets a row. Both were amended since (3e87bb2, b982f50) without either text
changing on this point. REQ-NOTIFY-200 governs the state vocabulary a row shows, not who gets a row, and
cites no side. `packages/contracts/src/providers.ts` (`ProviderRowSchema`) and the renderer card
(`packages/ui/src/settings/Providers.tsx`) follow REQ-PROVIDER-140 today.

**Why this is an escalation and not a defect found by building.** The specification is not silent and the
build is not wrong against one of its requirements; two live requirements cannot both hold. That is
`docs/product/README.md`'s table's third row: an amendment round decides, and until it does, the surface
stays on the side it was already built — REQ-PROVIDER-140's union — rather than an agent choosing a
winner by rebuilding.

**What the ruling decides.** Which of the two texts governs, or what third population both are amended to
state. The visual overhaul itself (row anatomy, actions, confirmations, empty state) does not wait on it:
every requirement it implements is common to both readings, and the ESC-36 row keeps today's visibility.

*The alternatives, for the ruling's convenience:* **REQ-PROVIDER-140 stands** — every provider is always
listed, which makes the settings the product's one place to *start* authentication for anything, matches
the mockup's fourth row (GitHub Copilot, "not authenticated", an Authenticate action) and is what is
built; or **REQ-CONFIG-389 stands** — rows appear on authentication, managed-cloud excepted, which makes
the list a shorter, state-first inventory but leaves unauthenticated built-ins reachable only through the
add-provider dialog's chooser. A third shape (unauthenticated built-ins grouped under a collapsed
section) would need minting in both domains and is named only to be complete.

### ESC-37 — what invoking a skill delivers: REQ-CHAT-034/162's attached payload against REQ-WORKSPACE-062/073's force-loaded block

**Raised 2026-09-14. RULED 2026-09-27: domain 13 stands** (see "Rulings after the gate — 2026-09-27" below). Raised while planning portable-skill discovery (ADR-0063), on
reading what happens after a user invokes a skill's command. Two live requirements describe two
different mechanisms, and the difference is observable to a user.

- **REQ-CHAT-034** (domain 03): the skill "MUST be **attached to the next prompt** the user submits …
  in the payload shape REQ-CHAT-162 fixes". **REQ-CHAT-162** fixes that payload — it "MUST identify
  itself as the body of a skill document, name the skill, name the absolute path it was read from, and
  carry the skill file's body verbatim" — and adds that "**attaching a skill MUST mark it as in
  context**", with the listing carrying a per-skill "whether it is already in context" column.
- **REQ-WORKSPACE-073** (domain 13): invoking the command makes the skill's **load mode `on` for the
  current session**, so "the agent constructed for the next prompt receives that skill's body as a
  **force-loaded context block** per REQ-WORKSPACE-062" — an always-active block introduced by an
  activation statement, present for every agent of the session and not attached to one prompt.
  **REQ-WORKSPACE-067** states the opposite of CHAT-162's indicator in as many words: the tab "SHALL
  show **no** per-agent in-context indicator and SHALL offer **no** composer chip".

The two differ in lifetime (one prompt against the session), in scope (the next prompt's agent against
every agent constructed afterwards), and in what the user is shown. Domain 13's resolution record
settled this deliberately — its OQ 5 rules the in-context indicator and the composer chip out of scope
with reasons, and its OQ 21 rules the session-only lifetime — and the shared toast both requirements
quote, "Skill loaded for the next prompt: {name}", reads naturally under either.

**Why this is an escalation and not a defect found by building.** Neither text is wrong against the
behavioural target; two live requirements state different mechanisms for one gesture, and domain 03's
own withdrawal note routes the withdrawn terminal payload at REQ-CHAT-162 while domain 13's routes the
same capability at REQ-WORKSPACE-073 and REQ-WORKSPACE-062. Each withdrawal redirected one capability
at a requirement that now disagrees with the other.

**What the build proceeds under, and why it is the conservative side.** Domain 13 owns portable skills
— the vocabulary, the discovery, the load modes and the settings surface are all its — so the
**force-loaded block** is built, with the body reaching the model carrying REQ-CHAT-162's three
identifying facts (it says it is a skill document, it names the skill, it names the absolute path) and
the body verbatim below the frontmatter. That satisfies everything REQ-CHAT-162 fixes about the
*payload* while delivering it as domain 13 fixes the *lifetime*. The in-context indicator and the
composer chip are **not** built, because REQ-WORKSPACE-067 forbids them by name and a ruling for
domain 03 can add a column far more cheaply than a ruling for domain 13 could remove one.

**What the ruling decides.** Whether a skill invocation is per-prompt or per-session, and whether the
Settings tab carries an in-context column. *The alternatives:* **domain 13 stands** — what is built;
one lifetime, readable from the Load column, and REQ-CHAT-162's in-context sentence is amended to cite
it. Or **domain 03 stands** — the body rides one prompt, which needs a per-prompt attachment path the
engine does not have (nothing today puts content in front of one turn and removes it after), a new
in-context column, and REQ-WORKSPACE-067's two prohibitions amended.

### ESC-38 — the Skills table's columns: REQ-CONFIG-343's five against REQ-WORKSPACE-067's amended seven

**Raised 2026-09-14. RULED 2026-09-27: seven columns** (see "Rulings after the gate — 2026-09-27" below). Raised by the same planning pass. Both requirements fix the
column set of one table and neither cites the other.

- **REQ-CONFIG-343** (domain 15): "The skill table has **five** columns: Skill, Source, Trigger, Load,
  Description."
- **REQ-WORKSPACE-067** (domain 13, amended by that domain's resolution round, OQ 4): "a table with
  columns **Skill, Source, Path, Trigger, Load, Description**", plus "a per-row **invocation** selector
  (accessible name 'Invocation policy for {name}')" and two header actions. The `Path` column is the
  amendment's own subject — its resolution table records REQ-WORKSPACE-074's withdrawal as rescued by
  "the Settings Skills tab table, **which now also shows each skill's `SKILL.md` path**".

Domain 15 was not amended alongside, so its count is stale rather than contradictory in intent. The
invocation selector is a further difference: REQ-WORKSPACE-067 requires one per row without saying
whether it is a column, and the approved mockup's Skills card draws Invocation as a column between
Skill and Load.

**What the build proceeds under.** **Seven columns** — Skill, Source, Path, Trigger, Invocation, Load,
Description — which is REQ-WORKSPACE-067's set with the selector it requires drawn as the mockup draws
it. Every column either requirement names is present; the disagreement is only about how many there
are. **What the ruling decides** is whether REQ-CONFIG-343's count is amended to match domain 13 (the
cheap reading, and what is built) or whether domain 13's Path column is dropped — which would undo an
amendment made three weeks earlier for a stated reason.

### ESC-39 — a skill whose command name is taken: REQ-CHAT-034 skips it, REQ-SHELL-056 renames it

**Raised 2026-09-14. RULED 2026-09-27: suffixed** (see "Rulings after the gate — 2026-09-27" below). Raised by the same planning pass, on the one rule that decides
whether a discovered skill can be silently unreachable.

- **REQ-CHAT-034** (domain 03): "Where such a name is already taken, the command already holding it
  keeps it and **the skill's registration for that name is skipped**."
- **REQ-SHELL-056** (domain 12): a generated entry whose name collides with a built-in "**SHALL be
  offered under the first free name formed by appending `-2`, `-3`, …**, and its description SHALL
  additionally name the skill it came from — so **a skill is never silently unreachable** from the
  composer and a built-in command never changes meaning because a skill was installed."
- **REQ-WORKSPACE-072** (domain 13) names domain 12's rule as the one that governs and forbids a
  parallel one: collision handling is "exactly those REQ-SHELL-056 fixes … and this domain SHALL NOT
  define a parallel normalization or a first-registration-wins rule of its own."

Two domains therefore point at each other's opposite: domain 13 routes the question to domain 12's
suffixing, and domain 03 states skipping. The same pair of texts also disagree about **normalisation**
— REQ-CHAT-034 and REQ-WORKSPACE-072 say "normalized name", which REQ-WORKSPACE-054 defines as
collapsing every run outside `[a-z0-9]`, while REQ-SHELL-056's catalogue normal form collapses
whitespace and underscores to `-` and *removes* every other character, so `c++/build` normalises to
`c-build` under one and `cbuild` under the other.

**What the build proceeds under.** REQ-SHELL-056's rule, for both halves: **catalogue normal form** for
the command name, and **`-2`, `-3` suffixing** on collision with the description naming the skill.
REQ-WORKSPACE-072 explicitly defers to it, REQ-SHELL-056 states its reason in the requirement text, and
the two readings are reconcilable in one direction only — under suffixing, the command holding the name
does keep it, which is REQ-CHAT-034's first clause; under skipping, REQ-SHELL-056's "never silently
unreachable" is simply false. The skill's **normalized name** (REQ-WORKSPACE-054) remains the identity
everywhere else: the policy map keys, the catalog block, the table, the shadowing rule. Only the
*command* takes catalogue normal form, which is what REQ-SHELL-056 says it contributes.

**What the ruling decides.** Whether REQ-CHAT-034's skipping clause is amended to cite REQ-SHELL-056,
and whether the two normal forms are one form or deliberately two. They can stay two — a skill's
identity and its typed command are different things — but nothing currently says so.
