## The application log prints the level as text and filters on nothing

`apps/desktop/src/main/index.ts` writes the application log through one closure —
`const log = (m: string) => console.log(...)` — and the two places that forward a child process's
diagnostics into it print the level **inside the message**: `run host ${e.level}: ${e.message}` and
`workspace service ${e.level}: ${e.message}`. Nothing reads `e.level`. A `debug` line and an `error`
line reach the log identically, and the only way to lose a line is for its sender not to send it.

Seen on run `a26918e8`'s launch log (2026-09-16): about eighty lines of one MCP server's handshake
validation, plus about fifty-five lines of the same server's startup noise. The repair that landed an
hour later (`15414d7`) moved a child's stderr to `debug` and stopped the run host flattening `debug`
into `info` — so those lines now read `run host debug:` rather than `run host info:`, which is what
that repair claimed and all it claimed. They are still in the log.

**Measured after the repair, 2026-09-16.** The built app driven against a throwaway workspace with one
scripted run (`pnpm app:drive`, bundled runtime present): 195 lines of application log, **141** of them
`run host debug: mcp code_intelligence stderr:` and **0** at `info`, 44 carrying serena's own `INFO`
records. The level moved; the volume did not.

## Specs

**No requirement is contradicted, and that is the finding.** The application log is a named surface in
`REQ-TOOLS-171`, `REQ-HOOKS-102/138`, `REQ-SANDBOX-071` and `REQ-LIBRARY-035/047/124`, but each of those
fixes *what* is written to it and none fixes a level or a filter. Every level requirement in the corpus
— `REQ-CONFIG-121`, `REQ-SESSION-142`, `REQ-MONITOR-238`, `REQ-CLI-065` — governs the **per-session**
log at `<session_dir>/evidence/debug.log` instead.

Raised as **OQ-63** in `docs/architecture/open-questions.md`, with what the build proceeds under (the
log keeps every level). Recorded here as well because a reader of the code meets this before they meet
the open question.

## Relevant files

- `apps/desktop/src/main/index.ts` — the `log` closure, and the two forwarders that print `e.level`
  into the message rather than reading it.
- `packages/mcp/src/transport.ts` — a child server's stderr, now forwarded at `debug`.
- `apps/desktop/src/run-host/mcp.ts` — the run host's log adapter, which no longer flattens `debug`.


## Half repaired — 2026-09-22, and the half that remains is OQ-63's

The note's title names two things and only one of them is an open question. **"Prints the level as text"
is repaired; "filters on nothing" is not, and must not be here.**

`apps/desktop/src/main/index.ts` now has `logAt(level, source, message)` beside the `log` closure, and the
two forwarders pass the level as a VALUE rather than interpolating it into the message:

```ts
svc.link.onEvent((e) => { if (e.kind === 'log') logAt(e.level, 'workspace service', e.message); });
// …
else if (e.kind === 'log') logAt(e.level, 'run host', e.message);
```

**The rendered line is byte-identical.** `run host debug: mcp code_intelligence stderr: …` still reads
exactly that, so every reader, grep and proof that matches on it is untouched — which is why this could
be done without ruling anything. What changed is that the level is now a value the log HAS, so a
threshold is one predicate in one function rather than a parse of a formatted string in two places.

**No threshold was added, and adding one would have been the wrong thing to do.** What a packaged build's
diagnostics are worth after an incident is **OQ-63**, the build proceeds under "the log keeps every
level", and the 141 `run host debug:` lines this note measured would all still be written today. The
volume half of the note stays open until that question is ruled; the mechanism half — "nothing reads
`e.level`" — is no longer true.

Measured: `pnpm check` green (2,119 passed); `pnpm overview-proof` and `pnpm rows-proof` exit 0 with the
log lines unchanged in shape.

**Ruled 2026-09-23 — OQ-63, by [`PD-MONITOR-002`](../../product/directives.md#pd-monitor-002), [R-048](../../product/requests.md#r-048).** The
application log carries each line's level as a field and records `info` and above; `ROTARIS_APP_LOG_LEVEL`
restores `debug`, and no configuration key reaches it. Under the directive the 141 `run host debug:` lines
measured above are not recorded by default. The note stays open until the directive is built.

## Repaired 2026-09-27 ([R-055](../../product/requests.md#r-055))

Both halves of the title are now false: [`PD-MONITOR-002`](../../product/directives.md#pd-monitor-002) is built.
The level, the threshold and the line live in one pure unit, `apps/desktop/src/main/app-log.ts`: `appLogThreshold`
reads `ROTARIS_APP_LOG_LEVEL` (`debug`, `info`, `warning`, `error` in any casing; anything else `info`, with a warning
line when a value was given but not taken), `createAppLog` is the predicate, and `formatAppLogLine` writes the level
in a column of its own. `index.ts` reads the variable once at module evaluation and builds `logAt` over it; `log` is
main's own line at `info` unless the caller names a level. A line reads, before and after:

```
[main 2026-09-16T10:00:00.000Z] run host debug: mcp code_intelligence stderr: INFO …
[main 2026-09-16T10:00:00.000Z] instance claimed (pid 1, host h)

[main 2026-09-27T10:00:00.000Z] debug   run host: mcp code_intelligence stderr: INFO …
[main 2026-09-27T10:00:00.000Z] info    instance claimed (pid 1, host h)
```

and at the default threshold the first of the two new lines is not written. The level type is the child protocol's
own (`Extract<ProcessEvent, { kind: 'log' }>['level']`), so a forwarded line's level reaches the predicate without a
mapping, and a level the protocol adds fails to compile until the rank table has it. The protocol's `warn` is
written `warning`, the directive's word, so the variable accepts what the column shows.

What else changed with it: main's uncaught-exception and unhandled-rejection lines, the refused launch (previously
`console.error('[main] launch refused: …')`, on stderr and in a shape of its own), a failed hand-over, a renderer or
child process gone for any reason but `clean-exit`, the run host or a workspace service exiting with any status but 0,
and a `shutdown` either did not answer within its bound at quit are written at `error` (0 is not proof of an orderly
`shutdown`: Electron reports 0 for a child it tears down at quit, measured on a scratch Electron 44.1.1 app, which is
why the silent `.catch` on the quit path now says what did not answer); a dialog or review that could not be presented
is `warning`; main's own line about the run host's handshake reads `run host hello:` rather than `run host:`, which is
now a forwarded line's source; the collaborators whose port already tells a warning apart — the improvement
coordinator, initialization, the credential store, the settings store and the provider service — now reach the log at
`warning` instead of having the level dropped, which is how REQ-LIBRARY-035(b)'s warning arrives as one. Readers of
the old shape were updated in the same change: `questions-proof.mjs` (the probe-at line, anchored after the stamp),
`slice-proof.mjs` (the intent line, reading both shapes because it replays stored logs) and `live-run.mjs`'s filter;
`code-intel-proof.mjs` and `mcp-proof.mjs` read `debug` lines and now launch with `ROTARIS_APP_LOG_LEVEL=debug`.
`AGENTS.md` says how to drive the app at `debug`.

Evidence: `apps/desktop/src/main/app-log.test.ts` (14 cases: every accepted word in three casings, unset and
unrecognized values, the column, a stack's every line, a final line break, the four thresholds, a forwarded line
filtered by its child's level, and 141 dropped `debug` lines that are neither stamped nor written);
`improvements.test.ts` now pins the REQ-LIBRARY-035(b) line at `warn`. A driven launch with one scripted run wrote 72
application-log lines at the default (66 `info`, 6 `warning`, 0 `debug`) and 69 with the variable at `debug`: the same
lines plus the code-intelligence child's two `debug` lines, less five of the first launch's own driving. At `warning`,
a run host killed with SIGKILL wrote `run host exited (9)` and `CHILD PROCESS GONE (… killed, exit 9)`, both `error`,
and one stopped with SIGSTOP before the last window closed wrote the unanswered-`shutdown` line at `error`. The 141
lines this note measured could not be reproduced here — the container runs as root without the bundled runtime, so the
child dies at its first line of stderr (`the-code-intelligence-server-dies-when-the-app-runs-as-root.md`).
`questions-proof`, whose reader is anchored after the stamp, passed against the build (run as root through a copy that
adds `--no-sandbox`). `pnpm check`: the two failures it has without this change, and none other.
