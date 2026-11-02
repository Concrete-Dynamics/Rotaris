## The application log masks the word after "token" in the product's own stall line

Since main's application log runs every line through the one redaction pass (2026-11-01, hardening plan bundle D1,
`docs/archive/defects/mains-application-log-lines-bypass-the-redaction-pass.md`), the pass's scheme layer (the value after
`Bearer`, `Basic` or `token`) reads the product's own prose as a credential. The stall line the engine writes for an
imposed wait, `… has no model event or token for 3 seconds; the wait is the run's own and not a stall (OQ-173)`, reaches
the log as `… has no model event or token *** 3 seconds; …`, losing the word `for`. A third-party server's stderr that the
run host forwards loses words the same way (Serena's `Will record tool usage statistics with token count estimator`
reads `token *** estimator`). Nothing is leaked and no proof reads either line; the log is only less legible where the
word `token` precedes another word.

The other product line the pass met in the hardening sweep of 2026-11-02, the run host's `configuration: loaded …;
auth_provider=<id>; …`, came out `auth_provider=***` on every launch and was repaired in the same bundle by writing that
field `sign-in=<id>` (`apps/desktop/src/run-host/configuration.ts`, pinned by `configuration.test.ts`). The stall line
is not repaired the same way here: its text is also the stored issue's message, which
`apps/desktop/scripts/lib/stall-issue-cadence.mjs` and the live run read word for word, so rewording it is a change to a
user-visible message, not to a log label. Noticed 2026-11-02 surveying the proof logs of the hardening bundle D1.

## Specs

None contradicted. REQ-TOOLS-171 names application log files among the surfaces the one pass backs and fixes the
algorithm, the scheme layer included; REQ-TOOLS-172 fixes the secret-looking names. The cost is legibility of
diagnostic prose, which no requirement states. Whether the stall wording should avoid `token <word>` (and whether other
product lines carry `token`, `auth` or `key` before a value-shaped word) is the record's question, not this note's repair.

## Relevant files

- `packages/kernel/src/redaction.ts` — `layerSchemes`, the value after `bearer|basic|token`.
- `packages/engine/src/children/stall.ts` — the imposed-wait line, `has no model event or token for ${silentS} seconds`.
- `apps/desktop/src/main/app-log.ts` — `createAppLog`, which runs every recorded line through `redact()`.
- `apps/desktop/scripts/lib/stall-issue-cadence.mjs`, `apps/desktop/scripts/live-run.mjs` — readers of the stall wording from the store.
