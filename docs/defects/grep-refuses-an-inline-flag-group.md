# Grep refuses an inline flag group

Reported by the owner, 2026-09-15, as a failure that recurs every session: an agent asks `grep` for a
case-insensitive match, writes the pattern the way every search tool it has met accepts it —
`(?i)needle` — and the call fails. The orchestrator's own state line from that run reads:

> inline flag rejected 5× — same error, no change attempted between calls. Engine disallows inline
> flag groups; alternation itself untested because parse fails at the group.

That sentence holds both halves of the defect. The tool refuses a pattern it should accept, **and**
the refusal tells the caller nothing it can act on, so the next attempt is identical to the last one
and the run burns five calls on one search.

## What happens

`grepTool` (`packages/agent-tools/src/tools/search.ts`) compiled the caller's pattern with a bare
`new RegExp(a.pattern)`, and `renderRead`'s `grep` filter (`packages/agent-tools/src/tools/files.ts`)
did the same. The host engine has no inline flag-setter group at all:

```
new RegExp('(?i)needle')  →  SyntaxError: Invalid regular expression: /(?i)needle/: Invalid group
```

So the observation is `Invalid regex pattern: Invalid regular expression: /(?i)needle/: Invalid group`.
The message names the whole pattern and the word "group", which reads to a caller as *your group is
malformed* — and the group is the one part of the pattern that is not malformed anywhere else. There
is also no `-i`-style parameter on either schema (REQ-TOOLS-138 fixes `grep`'s to `pattern`, `paths`
and `max_matches`), so at the moment of the refusal **there was no way to run a case-insensitive
search at all**, and nothing in the error said so.

The dialect was never chosen. It is whatever the host engine happened to be, inherited by writing
`new RegExp` and never stated in a requirement, an ADR or a comment.

## Specs

No requirement's text is contradicted outright — this is a gap the implementation filled by accident
— but two hold the reason it is a defect rather than a preference:

- **REQ-STARTUP-058** pins **ripgrep** in the machine-tool manifest (minimum 14.1.0, provisioned
  15.2.0, capability `search`). The product's declared search accelerator accepts `(?i)`.
- **REQ-TOOLS-141** — "Observable results (filters, format, ordering, caps) are identical whether or
  not an external search accelerator is present on the host." A pattern the accelerator accepts and
  the in-process path refuses is a difference an observer can see, so the in-process dialect must be
  at least the accelerator's, not the host engine's.
- **REQ-TOOLS-138** fixes the refusal's shape (`Invalid regex pattern: <detail>`) but says nothing
  about which patterns are invalid; the `<detail>` slot is where guidance belongs.
- **REQ-TOOLS-134** gives `read_file` the same `grep` filter, so it carries the same defect.

## Relevant files

- `packages/agent-tools/src/tools/search.ts` — `grepTool`: compiled the caller's pattern directly.
- `packages/agent-tools/src/tools/files.ts` — `renderRead`: the `read_file` `grep` filter, same call.
- `packages/agent-tools/src/tools/tools.test.ts` — the grep tests asserted the refusal of `(` and
  nothing about the dialect, so nothing was red.

## Repaired — 2026-09-15

`compileSearchPattern` (`search.ts`) is now the single place either tool turns a caller's pattern into
a `RegExp`. It reads the leading `(?flags)` groups off the front — `(?i)`, `(?im)`, `(?i)(?m)` alike —
translates `i`, `m`, `s` and `u` to RegExp flags, and compiles what remains. Scoped modifiers
(`(?i:needle)`) the host engine already understands and they are left where they stand. It is never
compiled with `g`: the result is reused across every line of every file, and `lastIndex` would carry
between them.

Two refusals are deliberate rather than permissive:

- A flag with no counterpart is **refused, not dropped**. `(?x)` (free-spacing) changes what the rest
  of the pattern means; a silently ignored flag returns matches the caller did not ask for, which is
  worse than an error it can read.
- A flag group **part-way through** the pattern still fails — the host engine has no such construct
  and faking it would mean rewriting the pattern — but the detail now ends with where the flag
  belongs: "Inline flags are read only at the start of the pattern — write (?i)needle, or scope them
  as (?i:needle)." That sentence is the whole point of the repair's second half: it is what lets the
  next attempt differ from the last one.

Regression evidence is in `tools.test.ts` ("a leading inline flag group sets the flag instead of
failing to parse"): the lowercase pattern misses, `(?i)`, `(?i)(?m)`, `(?im)` and `(?i:…)` all hit,
`(?i)` alone is consumed as a flag rather than matched as text, `(?x)` is refused by name, a misplaced
group carries the hint, and `read_file`'s filter is exercised on both paths.
