# Architecture proposals — DATA slice — D. Configuration load semantics

Part 5 of 25 of [the data proposal](../data.md), which indexes every part.

## D. Configuration load semantics

**D1 — Five layers, fixed and total, with no sixth and no per-key inversion. (hard)**
`REQ-CONFIG-031`: built-in defaults → auto-discovered tool servers → the global discovery snapshot →
global `agents.yaml` + `models.yml` → workspace `agents.yaml` + `models.yml`. `REQ-CONFIG-449`.
`REQ-CONFIG-234` and `REQ-CONFIG-235` withdraw the sixth layer explicitly: there is no command line
with which to name a configuration file, so no such file exists.
Within one scope, that scope's `models.yml` overlays that scope's `agents.yaml` `models:` block per
field, and a global `models.yml` still loses to a workspace `agents.yaml` (`REQ-CONFIG-005`).

**D2 — Four merge classes with different overlay depths, and lists never append anywhere. (hard)**
`REQ-CONFIG-040`. Replace-if-not-null (`REQ-CONFIG-041`): a higher layer replaces only with a
non-null value. Named-entry (`REQ-CONFIG-043`): entries union by name; where both values are
mappings the entry's **immediate** fields are overlaid, otherwise the higher value replaces
outright; the overlay reaches exactly one level — top-level key → named entry → whole field value
(`REQ-CONFIG-046`). Section (`REQ-CONFIG-047`): overlays per field and is **recursive through
nested mappings at any depth** (`REQ-CONFIG-048`), stopping at any value that is not a mapping.
Computed (`REQ-CONFIG-049`): produced by the loader, never merged from a file; a `workspace_root`
written into a file has no effect.
`REQ-CONFIG-050` and `REQ-CONFIG-450`: **no key anywhere merges list contents.** Role tool lists,
verification checks, hook entries, requirement sources, refresh triggers, escalation triggers,
source-file extensions, host lists, writable roots — every one is replaced by a layer that states
it. `REQ-CONFIG-461` makes these the *only* merge rules in the product and says a shipped example
describing whole-document replacement is wrong and is corrected, not honoured.

**D3 — Three-state and four-state distinctions must survive the merge. (hard — and this is a
representation constraint, not a policy one)**
`REQ-CONFIG-056` names three deliberately three-valued settings that must stay distinguishable:
`verifier.checks` (unset = auto-detect, `[]` = explicitly no verification, a list = that suite),
`checkpoints.enabled` (unset / `true` / `false` — and `REQ-CONFIG-159`, `REQ-GIT-044`,
`REQ-GIT-070` all restate that a written `false` stays off even for an isolated session), and
`hooks.entries` (`REQ-CONFIG-055`: a bare `entries:` means inherit; `entries: []` means an explicit
empty list that replaces).
`REQ-CONFIG-057` adds a fourth: a per-model `max_parallel` written explicitly as `null` is
distinguishable from an omitted one and defeats the provider-conditional default of
`REQ-CONFIG-095`.
`REQ-CONFIG-052` / `REQ-CONFIG-451`: at the top level `null` and absent are behaviourally identical
and a null cannot clear an inherited value. `REQ-CONFIG-053`: inside a named entry a null **can**
clear, because entry fields are overlaid without a null guard.
Taken together: the loaded document model must distinguish *absent*, *explicit null*, and *value*,
and must apply a **different null policy per merge class**. A model that maps YAML `null` onto a
language's own nullish value, or that treats "absent" and "null" as one, cannot produce these
observables.
`REQ-CONFIG-054`: a bare section key (`verifier:`, `checkpoints:`, `initialization:`,
`project_init:`, `hooks:` with no value) means "unset" and is coerced to an empty section rather
than raising a type error.

**D4 — Passes run in a fixed order relative to each other. (hard)**
Per scope, **before** any cross-scope merge: legacy role-name canonicalisation (`REQ-CONFIG-062`)
and hook scope stamping (`REQ-CONFIG-151` — provenance is unrecoverable once a higher layer's list
has replaced a lower one; `REQ-CONFIG-452` calls dropping superseded lists a privilege-reduction
vector). `hooks:` shorthand normalisation also happens before validation and merging
(`REQ-CONFIG-148`).
After the merge: tier-alias substitution (`REQ-CONFIG-073`) **before** per-role reasoning synthesis
(`REQ-CONFIG-036`); `fallback_model` resolution before referential validation (`REQ-CONFIG-067`);
schema validation; tool-server provenance after validation but before secret resolution
(`REQ-CONFIG-038`); known-token-limit back-fill after validation (`REQ-CONFIG-037`,
`REQ-CONFIG-096`); placeholder and secret resolution after validation, **so a stored secret value
can never itself be the cause of a schema failure** (`REQ-CONFIG-035`, `REQ-CONFIG-037`).
Auto-discovered locations are applied user-level first then project-level, so a project-level
declaration of the same server name wins, and the winning source per name is recorded and observable
(`REQ-CONFIG-039`, `REQ-CONFIG-222`).

**D5 — A completed load is fully resolved; no caller finishes the job. (hard)**
`REQ-CONFIG-035` enumerates what must already hold: `workspace_root` resolved; no reference field
still holding a tier alias; the synthetic reasoning entries of `REQ-CONFIG-076`/`REQ-CONFIG-079`
existing and pointed at; the schema satisfied; token limits back-filled only where the entry stated
neither; every `mcp_servers:` entry carrying a provenance value; every environment placeholder and
stored secret resolved.

**D6 — No read cache for the primary files; a `(mtime, size)` cache for the snapshot, with the
false negative accepted. (hard)**
`REQ-CONFIG-014`: "The configuration file set has no read cache: every load re-reads `agents.yaml`
and `models.yml` from disk."
`REQ-CONFIG-211`: an updated `project_settings.yaml` is observed on the next load whenever its
modification time **or** its byte size differs from the previous read. A rewrite leaving both
unchanged is not observed before restart, and **that is accepted rather than defended against** —
the product's own writer always advances the mtime (`REQ-CONFIG-212`), so the unobserved case needs
a deliberate external writer. "No content hashing is performed on this path."
`REQ-CONFIG-210`: any snapshot read failure drops the cached entry for that path.

**D7 — The severity taxonomy is a closed, total contract across the whole load. (hard)**
`REQ-CONFIG-024`, `REQ-CONFIG-233`. **Fatal**: YAML syntax error; a primary file that is not valid
UTF-8; a non-mapping top level; a `hooks:` value that is neither mapping nor list; a bad hook event,
matcher or blank command; a bad confinement mode, egress disposition or relative writable root; a
bad check name, command, `cwd` or `failure_pattern`; a run-start mode outside `auto`/`plan`; a
duplicate check name or duplicate requirement source id; **an unknown key under `requirements:`**.
**Silent**: missing or empty file; extra top-level keys in `models.yml`.
**Warn and continue**: an unknown top-level key, and an unknown key inside any merged section other
than `requirements`; a corrupt discovery snapshot; a circular startup-model alias chain; a reasoning
override on an unconfigured or missing base model; a tool-server `url` carrying an unresolved
placeholder.
**Coerce**: unknown permission mode → `restricted`; unknown non-interactive approval policy →
behaves as `deny`; unknown board role name → the workspace default role.
**Report, not fatal**: every referential error.
Note the deliberate inversion: `REQ-CONFIG-183` makes an unknown key **anywhere** under
`requirements:` a hard load failure — "the opposite of the top-level policy". And
`REQ-CONFIG-476` deliberately withholds coercion from `run_start_mode` because a mis-spelled `plan`
read as `auto` would remove a gate the user asked for.

**D8 — Validation happens on assignment as well as on load, for two sections. (hard)**
`REQ-CONFIG-111` (`runtime:`) and `REQ-CONFIG-183` (`requirements:`): "so a settings surface writing
an invalid value onto a loaded configuration is refused at the moment of the write, not silently at
the next load." `REQ-CONFIG-436` closes the loop: every value a security control produces is
assigned through the validating runtime policy **before any file is written**, so a value the schema
would reject is refused at the control that produced it and never reaches a file.
This forbids a validate-once-at-parse design. The loaded configuration object is itself a validating
model.

**D9 — Two parsers for one file, deliberately. (hard, and odd)**
`REQ-CONFIG-040` and the `Data & Formats` table: `rotaris.delegation_strategy` is "a workspace-only,
desktop-only key read by a **separate parse of the same file**, with no global equivalent, no merge
semantics and no schema validation"; accepted values `orchestrator`/`swarm`/`single`, anything else
leaves the default. It is a top-level key belonging to no merge class, so it "contributes nothing to
the merged configuration and is neither reported nor rejected" — yet it is read.

**D10 — YAML must be parsed in a safe subset, and YAML 1.1 boolean folding must be undone
symmetrically. (hard — this constrains the library choice)**
`REQ-CONFIG-015`: "parsed in a safe subset that cannot construct arbitrary language objects from
document tags."
`REQ-CONFIG-020`: for any field whose accepted values are a string vocabulary, a value the parser
folded to a boolean is coerced back to a lower-cased string before validation — `off`/`false`/`no`
become `"off"`/`"false"`/`"no"`, and `on`/`true`/`yes` become `"on"`/`"true"`/`"yes"`. The coerced
string is then validated normally, so `sandbox_mode: off` loads as the accepted value `off` while
`sandbox_mode: on` is rejected as an **unrecognised confinement mode naming the accepted list**
(`REQ-CONFIG-127`) — "never as a type error, and never silently accepted."
`REQ-CONFIG-090` requires the same tolerance for a model's `thinking`: `true` reads as `high`,
`false` reads as unset.
A YAML 1.2 parser does not fold `on`/`off`/`yes`/`no` at all, in which case they arrive as the
strings the requirement demands and the coercion is a no-op for those spellings — but `true`/`false`
still fold under 1.2 and must still be un-folded. A YAML 1.1 parser folds all six. Either is
workable; the coercion must be written for whichever is chosen, and must be applied per-field
against a vocabulary rather than globally.

**D11 — A rejected configuration value fails the whole load, and nothing that depends on it starts.
(hard)**
`REQ-GIT-071` states the rule for the whole of domain 06 and `REQ-GIT-138` relies on it: "the load
fails as a whole rather than falling back to a default or repairing the value, nothing that depends
on that configuration starts, **no session directory and no lock are created**, and the failure is
reported on the surface that asked for the load as an error the user can act on, the application
continuing to run with no workspace configuration loaded." That last clause is the important one:
a fatal configuration error is fatal to the *workspace*, not to the *process*.
`REQ-CONFIG-246` adds that for a run no person is watching, referential errors are **always** fatal
to that run — there is no inline sign-in or model editor to offer.

**D12 — Branch-namespace validation happens at configuration load, on a rendered example. (hard)**
`REQ-GIT-138`: a `branch_template` or `integration_branch_template` that would produce names under
`rotaris/session/` or `rotaris/integration/` is rejected **while configuration is loaded**, so that
nothing is ever created from it. And the check must be made on a rendered example, not on the
literal template prefix: every placeholder is substituted with a fixed non-empty sample value, the
result is slugged and assembled exactly as `REQ-GIT-139` assembles a real name, and the finished
example is tested for the forbidden prefixes. "A template that reaches a forbidden namespace only
after substitution is therefore caught, which a literal prefix test would miss."
This puts the branch-name slugging and assembly rules of `REQ-GIT-139` — lower-case fold, replace
each maximal run outside `a–z 0–9 . _ -` with a single `-`, strip leading and trailing `-` and `.`,
truncate to 40 characters, strip a trailing `-` or `.` left by truncation, fall back to `x` — inside
the configuration validator, and it puts the `REQ-GIT-009` branch-name rule set there too.
`worktree_storage_subpath` is rejected when it resolves to, or inside, the fixed requirement
checkout directory of `REQ-GIT-137`.
