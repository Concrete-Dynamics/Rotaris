# ADR-0042 — The desktop preference store stays a closed typed registry over an explicitly rooted per-user file — Decision

Part 3 of 9 of [ADR-0042](../0042-the-desktop-preference-store.md), which indexes every part.

## Decision

**Alternative C, with DATA's typed registry, unchanged by SR-4 and confirmed against it.** The two
proposals differed only in the root: DATA proposed the application-data directory, UI proposed explicit
resolution driven by the benchmark's redirection obligation. **UI's resolution is adopted**, because
`REQ-UIBENCH-046` makes leaving the user's stored settings byte-identical an acceptance criterion and
gives exactly one portable mechanism to achieve it; an explicit, testable rule makes that a one-line
guarantee on all three platforms.

- **Root resolution runs before the first preference read**, in main, before any window exists, and the
  resolved root is recorded in diagnostics. Recording it is not decoration: it is how a benchmark run
  that silently wrote into the user's real settings would be caught.
- **A typed key registry** mirrors `REQ-SHELL-006`'s key table exactly: key, type, default, owning
  requirement. **Reading an unregistered key is a compile error, not a runtime fallback.** That is the
  strongest form of "a key that does not appear in that table does not exist", and no package gives it.
  It is also the mechanism that makes `REQ-STARTUP-111`'s acceptance criterion — that no entry names
  update checking, an endpoint, a release source or an update channel — checkable by **reading the
  registry** rather than by searching the codebase.
- **Writes are atomic** through the primitive of ADR-0004. **The theme key is written synchronously,
  flushed, before the call returns.** Ordinary keys may be debounced; the composer draft uses the
  400 ms debounce with its four named flush points.
- **Tolerant coercion is per type and per key, not global**, and the registry entry carries it. Three
  distinct rules coexist by requirement and must not be collapsed into one.
- **Structured values serialise deterministically** — sorted keys, in byte order per `REQ-GIT-057`'s
  ordering rule, which the whole record uses.
- **Prompt history and stash are not in this store.** They are per workspace, at the path
  `REQ-CHAT-045` names, in the byte-exact format it fixes, sharing the atomic-write helper and nothing
  else.

### What SR-4 does and does not touch

- **Nothing moves.** The store is a per-user file and stays one, for the four reasons under alternative
  D. The registry, the root resolution, the debounces and the theme's synchronous flush are all
  unchanged.
- **The prompt-history file also stays a file**, and it is worth showing the work because it is the one
  item here that SR-4's table does not name. Only the application reads it, so the principle's first
  clause is met — but it is not high-volume, not queried and not transactional, and
  `REQ-CHAT-045` fixes its **path and its bytes** as observables, down to indentation, key order and the
  trailing newline. A specification that fixes a file's bytes has decided it is a file. If that byte
  format is ever withdrawn under the standing direction, the question reopens; until then it is settled
  by the requirement rather than by preference.
- **ADR-0004 rule 1 survives and still binds this store.** Preference and prompt files are replaced by
  rename, and on Windows an ordinary open reader still blocks that rename, so every read stays
  open-read-close within one call. **Rule 3 and constraint D-28** — the writer's-handle
  close-stage-rename-reopen discipline for append-and-compact files — never applied here and are
  dissolved product-wide; nothing in this store appends.
- **The debounces here are not the debounce SR-4 dissolves.** SR-4 removes the ten-second debounced
  whole-file *session state* save, which existed because every save rewrote a whole JSON document and
  which collided with `REQ-MONITOR-218`'s "no delay floor of any size". The 400 ms composer-draft write,
  the 200 ms draft publish and `REQ-SHELL-069`'s 250 ms divider debounce are **normative figures serving
  named requirements**, not workarounds for a file format, and they are untouched. So is the theme's
  rule that it is written synchronously and flushed with no debounce at all (`REQ-SHELL-131`) — which is
  now the only durable-write-on-a-gesture path left in the product's file stores and must not acquire a
  debounce by being grouped with its neighbours.

### What SR-1 requires of whoever implements it — a constraint this store owns the reason for

`REQ-UIBENCH-039` makes each benchmark iteration **a process the product starts**, and `REQ-UIBENCH-037`
establishes that nothing outside the product can start one. Under SR-1 a second launch of the
application surfaces the running instance rather than starting a rival process. **If the single-instance
gate treats a benchmark iteration as a second launch, `REQ-UIBENCH-046` breaks silently**: the iteration
would rendezvous with the running instance, its redirected `XDG_CONFIG_HOME` and benchmark-private
variable would never be consulted, and the measurement would run against — and write into — the user's
real preferences, which is the exact outcome `REQ-UIBENCH-038`, `REQ-UIBENCH-039` and `REQ-UIBENCH-046`
exist to prevent. The failure is silent because the run still completes and still reports numbers.

The obligation this places on the single-instance mechanism is therefore stated here, where the
requirement it protects lives: **the gate must admit a process the product itself started as an
iteration**, and it must do so by something the parent sets rather than by anything a user could set.
`REQ-UIBENCH-039`'s benchmark-private variable is already exactly such a marker, already required to
exist, and already private to the implementation. Two checks make the arrangement testable:

1. an iteration's resolved preference root is recorded in diagnostics (above), so a leak is visible in
   the run's own output rather than only in the user's settings file; and
2. `REQ-UIBENCH-046`'s byte-identity assertion over the user's real store is a test, not a hope.

This is raised as an open question against the SR-1 mechanism rather than decided here, because the gate
is not this ADR's to design and because "which processes the gate admits" is a decision with a security
flavour that deserves its own hearing.
