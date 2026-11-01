## Main's application log lines bypass the redaction pass

`packages/kernel/src/redaction.ts` is the one redaction pass, and the gate policy, the hooks, the MCP client, the terminal,
the session writer, the export and the model client all run their text through it before it is recorded. Main's
application log (`apps/desktop/src/main/app-log.ts`, PD-MONITOR-002) does not: `formatAppLogLine` writes the message as
given. Main holds the credentials (ADR-0029, ADR-0030) and leases bearer tokens to the run host; the lease path logs no
token today, but nothing structural keeps a later log line, a provider's error text or a URL with a key in its query from
reaching the log unredacted. Found 2026-11-01 by the read-only survey for [R-091](../../product/requests.md#r-091); no leak
observed.

## Specs

REQ-PROVIDER-035 (a derived key is never written to a log, an event or any file) and REQ-PROVIDER-017 (a corrupt
credential file is logged by provider id and never by its contents) state the outcome for credentials; REQ-TOOLS-016
states the redacted rendering for tool text. None names the application log, which is PD-MONITOR-002's; the directive
fixes its levels and fields, not its redaction. Not a contradiction of a requirement; a gap in a discipline the record
applies everywhere else.

## Relevant files

- `apps/desktop/src/main/app-log.ts` — `formatAppLogLine`, `createAppLog`, `standardStreamWriter`.
- `packages/kernel/src/redaction.ts` — the pass, and the shapes it knows.
- `apps/desktop/src/main/index.ts` — the `log` the whole of main writes through, and the child lines it forwards.

## Outcome — repaired 2026-11-01 (hardening plan hrd1, bundle D1 `ipc-bounds-and-redaction`)

`createAppLog` (`apps/desktop/src/main/app-log.ts`) runs every recorded message through `redact()` before it formats
the line: main's own lines and the `log` events both children send, since `logAt` is the one writer for all three
(`main/index.ts`). The pass runs after the threshold, so a line left out costs nothing, and before the message is split
into lines, so a PEM block spanning several is masked whole. Pinned by `app-log.test.ts` (a bearer, an assignment, a URL's
userinfo, a flag and a prefixed token, in main's line and in forwarded ones; a URL's key query; a plain line byte for
byte; a PEM block across lines), four cases red without the change.

Two things the repair met. **The pass missed a URL's key query**: `https://h/p?api_key=s` came through whole, because the
assignment layer took the URL as the value of `https:` and read nothing inside it; repaired in kernel, with its own note
([`an-assignment-inside-a-non-secret-assignments-value-is-not-masked.md`](an-assignment-inside-a-non-secret-assignments-value-is-not-masked.md)).
**Under the pass the credentials lines lost their content**: `credentials: leased for <ids> (workspace <root>)`,
REQ-PROVIDER-068's opening report, reads as an assignment of `credentials` and became `credentials: *** for <ids>`. The
run host's three lines now begin `credential lease:` and main's credential store's `credential store:`
(`run-host/launch.ts`, `dispatch.ts`, `host.ts`, `configuration.ts`; `main/index.ts`), and the readers follow:
`scripts/lib/priming-report.mjs` (which still reads the old form in an older log), `restated-facts.mjs`'s note, the
live run's lease check. No requirement fixes that wording. PD-MONITOR-002 is unchanged: it fixes the log's levels and
fields; the redaction is the pass's (REQ-TOOLS-171).
