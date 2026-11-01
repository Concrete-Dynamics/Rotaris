## Main's application log lines bypass the redaction pass

`packages/kernel/src/redaction.ts` is the one redaction pass, and the gate policy, the hooks, the MCP client, the terminal,
the session writer, the export and the model client all run their text through it before it is recorded. Main's
application log (`apps/desktop/src/main/app-log.ts`, PD-MONITOR-002) does not: `formatAppLogLine` writes the message as
given. Main holds the credentials (ADR-0029, ADR-0030) and leases bearer tokens to the run host; the lease path logs no
token today, but nothing structural keeps a later log line, a provider's error text or a URL with a key in its query from
reaching the log unredacted. Found 2026-11-01 by the read-only survey for [R-091](../product/requests.md#r-091); no leak
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
