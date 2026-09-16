## Two requirements fix `session_log_level`'s default, vocabulary and fallback differently

Four live requirements fix the same configuration key, and one of them fixes every part of it
differently from the other three.

- `REQ-CONFIG-121`: default **`WARNING`**, documented vocabulary `DEBUG`/`INFO`/`WARNING`/`ERROR`, the
  value **not** validated against that list.
- `REQ-SESSION-142`: default **WARNING**, the four strings **and integer levels** accepted, an unknown
  string falling back to WARNING **and logging a warning**.
- `REQ-MONITOR-238`: "defaulting to **warning**".
- `REQ-CLI-065`: one of `debug`, `info`, `warning`, `error`, default **`info`**, unrecognised values
  **treated as `info`**.

Three disagreements in one key: the default, the vocabulary, and what an unrecognised value does. The
last is the one a user would notice — under domain 18 a typo is silently one level more verbose than
intended, under domain 07 it is one level quieter and says so.

The code implements domain 07's reading: `parseLogLevel` upper-cases, accepts `WARN` and integers, and
falls back to `WARNING` with a warning; `RuntimeSection`'s default is `'WARNING'`. `REQ-CLI-065`'s
`info` default is therefore not implemented anywhere, which is a consequence of the contradiction rather
than a defect of the code.

Same shape as `docs/defects/fixed/…`'s predecessor
`two-requirements-fix-the-composer-setup-refusal-differently.md`: two live requirements, no precedence
rule between their domains, and a build that had to pick one to compile.

## Specs

`REQ-CLI-065` against `REQ-CONFIG-121`, `REQ-SESSION-142` and `REQ-MONITOR-238`. Raised as **ESC-40** in
`docs/architecture/owner-decisions.md`, which states the reading the build proceeds under and what a
ruling has to decide. An escalation, not a defect of the code: nothing here can be repaired without
choosing which requirement is wrong, and that is the owner's choice.

## Relevant files

- `packages/engine/src/session-log.ts` — `parseLogLevel`, the fallback and the accepted forms.
- `packages/config/src/sections/runtime.ts` — `session_log_level`'s registered default, `'WARNING'`.
- `apps/desktop/src/run-host/configuration.ts` — where the parsed level reaches the runtime posture.
