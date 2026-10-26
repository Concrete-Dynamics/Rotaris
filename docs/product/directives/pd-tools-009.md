[Product directives](../directives.md) › PD-TOOLS-009

<a id="pd-tools-009"></a>

### PD-TOOLS-009 — exit 1 from a diff or a search is an answer, not a failure

REQ-TOOLS-112's test 4 ("a non-zero exit code → `shell_failure` / error") SHALL NOT apply to exit code 1 from a command
whose leading tokens name a convention that uses exit 1 for an answer: `diff`; `git` with a token `diff` anywhere after it,
whitespace-separated and case-insensitive (`git diff`, `git --no-pager diff`, `git diff --no-index`, and also a token that is
not the subcommand, as in `git log --grep diff`; not `git difftool`, whose token is not `diff`); and the searches `grep`, `egrep`,
`fgrep`, `rg` and `findstr`. The head is matched case-insensitively, as REQ-TOOLS-033 matches it. Such an observation
SHALL classify `success` / `info`. Every other non-zero exit still classifies `shell_failure` / error, a test earlier in the
cascade still decides first (a present `failure_kind` among them), and no other test of the cascade moves.

**As built.** `successExitOne` in `packages/agent-tools/src/terminal/classify.ts`, consulted before the generic non-zero
rule. `findstr`, the Windows search, is in the built list beside the four ESC-41 names.

**Why, and what it costs.** ESC-41: run `cc6191a2`'s `git diff --no-index` with differences exited 1 carrying the payload
the caller asked for, and was classified a failure the agent then had to explain away. `git diff`, `diff` and `grep` use
exit 1 for "differences found" and "no match", conventions older than the specification. What it costs: exit 1 from those
commands is never an error, including the rare case where one of them really did fail with 1; a failure that exits 2 or
more is still an error.

> **Narrows:** REQ-TOOLS-112

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of ESC-41.*
