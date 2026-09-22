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


## Resolved — the escalation was ruled and the corpus amended, 2026-09-18

Found still open on 2026-09-22 and closed on reading its own escalation. **ESC-40 was ruled four days
after this note was written**, and the note was never moved:

> **RULED 2026-09-18: the uppercase set the other three name.** The default is `WARNING`, the parse is
> case-insensitive (`WARN` included), integer levels are accepted, and an unknown string falls back to
> `WARNING` with a warning — the behaviour `packages/engine/src/session-log.ts` already implements under
> REQ-SESSION-142. REQ-CLI-065 is amended to cite that set instead of its own; no second default is
> minted, headless or otherwise.

The amendment round the ruling owed has landed too. `docs/spec/18-cli-headless.md`'s **REQ-CLI-065** now
carries *"Amended 2026-09-18 under ESC-40"*, cites the uppercase vocabulary, and keeps its falsified
lowercase reading quoted beside the replacement rather than deleted;
`docs/spec/resolutions/18-cli-headless.md` row 17 records the same.

So all three disagreements this note names are settled in the specification, in the direction the code
already took. Verified against the code on 2026-09-22:

- `parseLogLevel` upper-cases, maps `WARN` to `WARNING`, accepts integer levels on the
  40/30/20 ladder, and returns `unknown session log level '<v>'; using WARNING` for anything else
  (`packages/engine/src/session-log.ts:13-25`);
- `RuntimeSection`'s registered default is `'WARNING'` (`packages/config/src/sections/runtime.ts:80`).

**Nothing was repaired, because nothing was broken.** The note recorded a contradiction in the
specification, the escalation it raised was ruled, and the ruling chose the reading the code implements.
It is filed here rather than deleted so that the sequence — contradiction, escalation, ruling, amendment —
stays readable from the defect that started it.
