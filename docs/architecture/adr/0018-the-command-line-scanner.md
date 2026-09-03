# ADR-0018 — A purpose-built shell scanner, not a shell parser and not regular expressions

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-04)
- **Depends on:** ADR-0001
- **Security-relevant.**

## Context

`REQ-TOOLS-033`: matching is **token-by-token, never against raw text**. Pattern and command segment
are each split under shell tokenisation rules; the i-th pattern token glob-matches the i-th command
token; a trailing `*` matches any number of further tokens including zero; without it the token counts
must be equal. The **first token of a segment folds case; every later token is case-sensitive**,
identically on every platform and every backend — so `rm -rf *` fires on `RM -rf /`, and `git status`
fires on neither `git status-check` nor `git STATUS`. `REQ-TOOLS-039` consequently lists both spellings
where both are wanted (`rmdir /s *` and `rmdir /S *`).

`REQ-TOOLS-035` and `REQ-TOOLS-038`: compound lines decompose on `&&`, `||`, `;;`, `;`, `|`, `&` and
newline, longest operator first, respecting single and double quotes and backslash escapes; each
segment matches independently; **the introducing operator is retained with the segment**, because the
pipe-to-shell matcher needs to know a segment followed `|` specifically.

`REQ-TOOLS-036` closes the "unconfident" predicate: command substitution (`$(...)` or backticks
outside single quotes, **including inside double quotes**); untokenizable text; no command after
redirection stripping; an indirection head from `eval`, `exec`, `source`, `.`, `xargs`, `env`, `nohup`,
`time`; or a shell head from `sh`, `bash`, `zsh`, `dash`, `ksh`, `fish`, `cmd`, `powershell`, `pwsh`
with `-c` / `-Command` / `/c` / `/C` or with no arguments. Redirection tokens end the matched token
stream.

`REQ-TOOLS-037`: decomposition **never raises**; an unparseable line still yields exactly one segment,
classified unconfident, so every input produces something for the escalation matcher.
`REQ-TOOLS-034`: a non-tokenizable or empty *pattern* is a policy-build-time error.

`REQ-TOOLS-094` and `REQ-SANDBOX-043`: the network-command catalogue is closed and exhaustive,
evaluated as a pattern matcher over segments; one matching segment settles the line; a bare `curl` or
bare `npx` matches. It is a permission **heuristic** and explicitly not an enforcement boundary.

## Alternatives considered

**A — An off-the-shelf shell parser or lexer.** Gets quoting and escaping right without new code and
is the obvious reuse. Against: `REQ-TOOLS-037` requires the decomposer **never to raise** and to yield
exactly one unconfident segment on unparseable input; general parsers raise, and wrapping one in a
catch that fabricates a segment reproduces most of the work anyway. `REQ-TOOLS-035` requires the
introducing operator retained per segment — a detail no general lexer exposes. And `REQ-TOOLS-036`'s
redirection rule and its detection of `$( )` and backticks *including inside double quotes* are product
rules, not shell rules. A library would end up driven and post-processed to the point where it
contributes only its quote state machine.

**B — Regular expressions over the raw command line.** Rejected outright by `REQ-TOOLS-033`, which
defines matching token-by-token and states the failing consequences. Recorded because it is the cheap
path someone will propose when the scanner needs a small change.

**C — A small purpose-built scanner producing (introducing operator, tokens, unconfident reason)
tuples per segment.** Chosen.

## Decision

One scanner that walks the line once tracking single-quote, double-quote and backslash state; emits
operator boundaries longest-first; collects tokens per segment; stops the matched token stream at the
first redirection token; and records a reason when a segment is unconfident.

It exposes exactly two entry points: `decompose(line)` for command lines, **never throwing**, and
`tokenizePattern(text)` for rule patterns, throwing `REQ-TOOLS-034`'s error. Glob matching per token is
a small `*`/`?` matcher rather than a translation to a regular expression, so a `*` in a pattern token
cannot acquire regex semantics. The first token compares case-folded and every later token does not.

The required behaviour is a **closed specification, not "POSIX shell semantics"**. Every edge the
specification cares about is enumerated; every edge it does not care about is not required to be
right. Owning the scanner makes the never-raises property structural, makes the unconfident reason
available for diagnostics, and makes the whole thing table-testable against the worked consequences the
requirements already state.

One scanner serves the network catalogue, the nine starter rules of `REQ-TOOLS-039` and any future
matcher, so a change to tokenisation changes all of them at once. That is desirable and must be
stated: the scanner has one behaviour, versioned by its tests.

## Consequences accepted

1. **We own a security-relevant parser.** It must be fuzzed against the invariant that `decompose`
   never throws and always returns at least one segment, and property-tested in the fail-closed
   direction: any input the scanner is unsure about classifies unconfident, never
   confident-and-empty.
2. **One POSIX-shaped scanner serves every platform, including the PowerShell backend.** A PowerShell
   line using a backtick escape or a `$( )` subexpression will be classified unconfident and therefore
   *ask* in the supervised presets, because `REQ-TOOLS-036`'s list is fixed and platform-independent.
   That is over-triggering rather than under-triggering, and it is the fail-closed direction the
   domain requires — but it is real friction for Windows users and belongs in the `terminal` tool's
   description rather than being discovered.
3. `REQ-TOOLS-094`'s catalogue is a heuristic. On native Windows, where ADR-0022 shows there is no
   confinement backend at all, it is the **only** egress control for terminal commands. That
   consequence is recorded in ADR-0023 and is user-visible.

## Revisit if

A requirement asks for platform-native tokenisation — a PowerShell-shaped scanner on Windows — which
`REQ-TOOLS-033`'s "identically on every platform and every backend" currently forbids; or the
unconfident predicate stops being closed.

## First execution — 2026-09-03

*Recorded under GD-10.*

**Built and run:** `packages/agent-tools/src/scanner.ts` — one walk tracking quote and backslash state,
operators split longest-first with the introducing operator kept, redirection ending the matched stream,
the closed unconfident predicate, `decompose` never throwing, `tokenizePattern` throwing `REQ-TOOLS-034`'s
error, a `*`/`?` glob per token with the first token case-folded. Consequence 1's obligation is met in the
form it asked for: a deterministic 2,000-input fuzz over the operator and quote alphabet asserts never-throws
and at-least-one-segment, and that a non-blank segment yielding no token fires the escalation matcher.
`REQ-TOOLS-094`'s catalogue is compiled through the same scanner and tested on the worked examples
(`date && curl …` settles the line; a bare `curl` and a bare `npx` match; `curling` does not).

**Consequence 2 observed as stated:** `pwsh -Command Get-Date` and `cmd /c dir` classify unconfident and
therefore ask under the supervised presets — the over-triggering direction. It is stated in the `terminal`
tool's description as the record asked.

**Found: nothing.**

**Second execution, 2026-09-03, beside the hooks.** Not reused for REQ-HOOKS-025: that definition divides
at six separators (no `;;`), treats a backslash as an ordinary character and `?`/`[` as literals, so the
hook matcher is a second tokenizer in `config/command-pattern.ts`, kept apart on purpose. Nothing changed here.
