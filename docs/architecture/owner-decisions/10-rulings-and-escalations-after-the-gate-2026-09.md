# Product-owner decisions on the architecture record — Rulings and escalations after the gate — 2026-09-16

Part 10 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Rulings and escalations after the gate — 2026-09-16

### ESC-41 — the exit-1 success conventions: REQ-TOOLS-112's test 4 against `git diff`, `diff` and `grep`

**Raised 2026-09-18, ~~not yet ruled.~~ Ruled 2026-10-06.** Found by the autopsy of run `cc6191a2` (logged as
[R-039](../../product/requests.md#r-039)): the run's `git diff --no-index` with differences exits 1
carrying the payload the caller asked for, and the observation classified it `shell_failure` / error.
`REQ-TOOLS-112`'s test 4 reads "a non-zero exit code → `shell_failure` / error" with no carve-out, and
the conventions predate the corpus: `git diff` exits 1 when differences were found, `diff` exits 1 on
a difference, `grep` exits 1 on no match. Each is an answer, not a failure.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** REQ-TOOLS-112's test 4 is amended with the carve-out as built: exit code 1 from `diff`, `git … diff …`, `grep`, `egrep`, `fgrep`, `rg` — and `findstr`, which the built list also names — classifies `success` / `info`, and every other non-zero exit is unchanged. [`PD-TOOLS-009`](../../product/directives/pd-tools-009.md#pd-tools-009) states it and narrows REQ-TOOLS-112, carrying the amendment with its back-pointer.

**What the build proceeds under.** The narrowed reading: exit 1 from a command whose leading tokens
name one of those conventions (`git … diff …`, `diff`, `grep`/`egrep`/`fgrep`/`rg`, head matched
case-insensitively per REQ-TOOLS-033) classifies `success` / info; every other non-zero exit still
classifies `shell_failure` / error, and a present `failure_kind` still outranks the map. The code is
`successExitOne` in `packages/agent-tools/src/terminal/classify.ts`, consulted before the generic
non-zero rule.

**What the ruling decides.** Whether `REQ-TOOLS-112`'s test 4 is amended with the named-convention
carve-out (what is built), or whether the blanket rule stands and the misclassification is recorded as
a known pitfall instead. The amendment would land in `REQ-TOOLS-112` alone; no other test of the
cascade moves.

### ESC-40 — `session_log_level`'s default and vocabulary: REQ-CLI-065's lowercase `info` against three requirements' uppercase `WARNING`

**Raised 2026-09-16. RULED 2026-09-18: domain 07 wins.** Found while reading the application log for R-026's sixth
finding: four live requirements fix the same configuration key, and one of them fixes it differently
in every part.

- **REQ-CONFIG-121** (domain 15): "`session_log_level` (string, default `WARNING`) … The documented
  vocabulary is `DEBUG`/`INFO`/`WARNING`/`ERROR`; the value is **not** validated against that list."
- **REQ-SESSION-142** (domain 07): "at the configured session log level (default WARNING; the strings
  DEBUG/INFO/WARNING/ERROR **and integer levels** accepted; an unknown string falls back to WARNING
  **and logs a warning**)".
- **REQ-MONITOR-238** (domain 02): "written at the configured session log level, **defaulting to
  warning**."
- **REQ-CLI-065** (domain 18): "`runtime.session_log_level`, whose value is one of `debug`, `info`,
  `warning`, and `error`, whose **default is `info`**, and whose **unrecognized values are treated as
  `info`**."

Three disagreements in one key, not one: the **default** (`WARNING` against `info`), the **vocabulary**
(uppercase with integers accepted against a lowercase closed set), and what an **unrecognised value**
does (fall back to `WARNING` with a warning against silently reading as `info`). The last is the one a
user would notice: under domain 18 a typo is quietly one level more verbose than intended; under domain
07 it is one level quieter and says so.

**What the build proceeds under.** Domain 07's reading, which is also domain 15's and domain 02's: the
default is `WARNING`, the parse is case-insensitive (`WARN` included), integer levels are accepted, and
an unknown string falls back to `WARNING` with a warning (`packages/engine/src/session-log.ts`,
`parseLogLevel`; `apps/desktop/src/run-host/configuration.ts`). Three requirements against one, and the
one is the CLI domain describing a key the desktop run host owns. **REQ-CLI-065's default of `info` is
not implemented and is not treated as a defect of the code** — it is treated as this escalation.

**What the ruling decides.** Whether the key's vocabulary is the uppercase set the other three name
(with domain 18 amended to cite it) or the lowercase closed set domain 18 states; and whether a
headless run is meant to default to a *more* verbose log than an attended one, which is the only
reading under which both defaults stand. If it is, the key needs two defaults and a requirement saying
which context selects which — nothing currently says so.

**RULED 2026-09-18: the uppercase set the other three name.** The default is `WARNING`, the parse
is case-insensitive (`WARN` included), integer levels are accepted, and an unknown string falls back
to `WARNING` with a warning — the behaviour `packages/engine/src/session-log.ts` already implements
under REQ-SESSION-142. REQ-CLI-065 is amended to cite that set instead of its own; no second default
is minted, headless or otherwise.

### OQ-62 — a provider-reported cost, ruled; the other two branches stated and left open

**Ruled 2026-09-16, one branch of three.** OQ-62 asked three separable questions and the owner's answer
to R-026 settles exactly one of them.

- **A provider-reported cost — RULED.** `REQ-MONITOR-166`'s qualifier set gains a fourth member for a
  figure the provider itself computed, and the adapter asks for and reads OpenRouter's `usage.cost`.
  The disposition is **`PD-MONITOR-001`** (`docs/product/directives.md`), not an amendment round,
  because it narrows a requirement the owner is choosing to govern rather than correcting one that is
  wrong. What makes this branch rulable ahead of the other two: carrying a figure the provider computed
  needs **exact decimal addition only and never a multiplication**, so `REQ-PROVIDER-121`'s one money
  rule is met without deciding what a *price* is — which is OQ-21's question and ADR-0031's spike. **Built
  the same day it was ruled** (`packages/model/src/reported-cost.ts`, `packages/engine/src/money.ts`); the
  first execution is reported into the directive and into ADR-0031 in place.
- **Discovery pricing — stated, not ruled.** `REQ-PROVIDER-072` admits pricing "only for
  `concrete-cloud`" and `discovery.ts` returns `pricing: {}` unconditionally, with a test pinning it.
  An amendment would land there. It stays blocked behind **OQ-21**, because carrying a per-token price
  is deciding what a price is.
- **Configured rates — unchanged, and deliberately unbuilt.** `effectivePricing()` has no call sites
  and keeps none until OQ-21 answers and ADR-0031 has had the spike it names. ADR-0031's first accepted
  consequence already rules the interim: if the float typing stands, the exactness is unattainable and
  that is "a specification defect to be recorded rather than a design to be built around".

**What this ruling does not do.** It does not make every run's cost non-zero. A provider that reports no
cost still yields `unknown`, which is what `REQ-MONITOR-166` provides for, and a configured rate still
produces nothing at all. The `0` the owner saw is closed for OpenRouter and open everywhere else.
