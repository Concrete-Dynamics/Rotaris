[Product directives](../directives.md) › PD-TOOLS-004

<a id="pd-tools-004"></a>

### PD-TOOLS-004 — a session approval of a file write covers that path

A session approval (REQ-TOOLS-052, "approve for session") granted to a call of `write_file` or `haet_edit`
(including its alias `haet`) SHALL match a later call when all three of these hold, whatever the rest of
its arguments:

- the later call names the **same tool**, the alias `haet` counting as `haet_edit`;
- it comes from the **same persona**;
- its path arguments — the argument keys REQ-TOOLS-018 considers, resolved against the workspace root as
  that requirement resolves them — resolve to **exactly the same set of paths** as the approved call's.

The `write_file` operation (REQ-TOOLS-135) is not part of the match: approving an `edit` of a path for the
session also covers a later `overwrite`, `insert` or `undo` of the same path from the same persona. A call
any of whose paths cannot be resolved never matches under this directive, and a call carrying none of
REQ-TOOLS-018's path keys falls back to the exact-argument match REQ-TOOLS-024 states.

Everything else REQ-TOOLS-024 fixes still governs: every other tool — `terminal`, `fetch`, `git_commit`,
the remaining public tools, every MCP tool and every plugin tool — is still matched on the command facet or
the exact argument set; the tool name is still compared case-insensitively; and the session rule's
description still reads `Approved for this session: <request summary>`.

**Why, and what it costs.** An agent whose edit is refused retries it with a different `old_string`, and
under the exact-argument rule no session approval could ever cover a retry. "Approve once" was the only
answer that did anything, and the user paid one approval per retry: a single edit loop on one file in run
`1ddeb71b` interleaved six approvals with its failures. With this directive one session approval covers
the loop. What is given up: approving one write to a path for the session now also approves, for that
persona, every later write to that path in the session, including an overwrite of the whole file. The grant
is still bounded by the path, the tool and the persona. MCP edit tools are left out because their arguments
declare no path the policy can read, so for them a path-scoped match could only be guessed.

> **Narrows:** REQ-TOOLS-024

*Raised by the owner, 2026-09-23; logged as [R-048](../requests.md#r-048).*

> **First execution, 2026-09-27, built under [R-057](../requests.md#r-057):** the rule held as written; building it
> found that it is silent on when the approved call's paths are resolved, and that the policy's existing path
> resolution does not do what REQ-TOOLS-018 says. The persona needed nothing: it was already carried on every call
> and stored in every grant. **When:** the grant resolves its paths once, when it is made, and a later call's paths
> are resolved when it is evaluated. Resolving both at evaluation would let a link retargeted after the approval
> carry the grant to a file the user never approved; a test pins a retargeted link asking again, and a link to the
> approved file matching. **How:** each path is joined to the workspace root first (`resolveInWorkspace`) and then
> handed to the gate's real-path resolver. The path scope of REQ-TOOLS-018 skips the join and hands the resolver the
> raw argument, which the run host resolves against its process directory, dropping a character when none of the
> path exists there; that is recorded as
> [`path-scope-resolves-a-relative-path-against-the-process-directory.md`](../../defects/fixed/path-scope-resolves-a-relative-path-against-the-process-directory.md)
> and not changed here. **Which tool:** the name alone does not say it. A persona's MCP surface prefixes a server's
> tool only when its name is already taken, so a server's own `write_file` reaches a persona whose public set lacks
> one as plain `write_file`, and the first build, keyed on the name, scoped its approval by path against the
> directive's "every MCP tool". The independent review found it; the gate now takes a `publicTool` predicate from the
> run host, true only when the callable map holds the very executor `executorsFor` built for the name, and only the
> public `write_file` and `haet_edit` are scoped by path, on the grant and on the later call alike, so a public
> `haet_edit` grant does not reach a server's `haet` through the alias. The policy's other readers still take such a
> tool for the public one by name; that is recorded as
> [`an-mcp-tool-offered-under-a-public-name-is-ruled-as-that-public-tool.md`](../../defects/fixed/an-mcp-tool-offered-under-a-public-name-is-ruled-as-that-public-tool.md)
> and not changed here. **Readings taken where the text leaves room**, each the most literal one found: a call with
> an unresolvable path never matches and does not fall back to the exact match, so an approval whose own path did
> not resolve covers nothing, not even the identical call; a path key whose value is neither a string nor a list of
> strings counts as unresolvable; the fallback for a call with no path key is REQ-TOOLS-024 whole, so it compares
> tool names without folding `haet`; resolved paths compare as exact strings, so two spellings differing only in
> case are two paths; and a path named twice counts once. The rule is `resolvedPathSet` and `approvalMatches` in
> `packages/agent-tools/src/policy.ts`, and `PolicyContext.grant` takes the root and the resolver, which the gate
> passes. One unit assertion had pinned the old reading, a `write_file` grant refusing a call with an extra
> argument; it now pins the same on an MCP edit tool, which REQ-TOOLS-024 still governs alone. The tests name a
> stand-in for it, because REQ-MCP-116 lets the code-intelligence server's real tool names be written only in its
> manifest, and `code-intelligence.test.ts` failed the first `pnpm check` on `replace_content` written in a test.
> Measured by unit tests only: nine `PD-TOOLS-004` cases in `policy.test.ts` over a real temporary directory with a
> copy of the run host's resolver, and one in `gate.test.ts` taking an edit and two retries, one through the
> alias, through the gate on one approval while another persona and another path each ask again. With `policy.ts` restored to its
> previous text (and a stub for the one new export the tests import) all ten fail, the gate case by its 30-second
> timeout waiting for an approval nobody answered; two of them, the unresolvable-path and no-path-key cases, fail
> only on the new `paths` field, because their negatives hold under the old, narrower rule too. The repair of the
> review added three: one in `policy.test.ts` (a server's `write_file`, and a server's `haet` beside a public
> `haet_edit`), one in `gate.test.ts` (a server's `write_file` asking again for another content on the approved
> path), and one in `run-host/tools.test.ts` building the real port twice — once with a stand-in MCP host offering
> `write_file` to a persona without it, once with the public `write_file` — and answering the approvals through the
> port. With the `publicTool` check taken out of `policy.ts` all three fail; with the run host's predicate true for
> any served name the port case fails, and with it false for every name the port case fails on its public half, by
> the test's timeout waiting for an approval nobody answered. These three were not run against `policy.ts`'s text
> from before the directive. The built app was
> not driven and no live run was made, so the loop of run `1ddeb71b` has not been replayed against a real model. The
> row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **2026-09-28, under [R-062](../requests.md#r-062):** the two defects the first execution recorded and left are repaired,
> and the links above now point at their notes in `fixed/`. The path scope of REQ-TOOLS-018 joins each path to the
> workspace root before the resolver, as this directive's `resolvedPathSet` did from the start, and `realPathOf` no
> longer drops a character from a relative path. The `publicTool` predicate this directive introduced is now read by
> the policy's class rules and by the plan gate's two enforcement points, so an MCP tool offered under a public name
> is neither allowed by `ask:read-only-tool` or the fetch pair nor let through the hold. ADR-0016 carries the
> execution note; nothing in this directive's own rule changed.

> **Built-app execution, 2026-10-13, plan fin42:** the first execution said "the built app was not driven";
> `pnpm approvals-proof`'s `session` launch now drives the rule through real dialogs, under `ask` with
> `delegation_strategy: single` so the entry role writes. The root creates `NOTES.md` and the dialog is answered
> "Approve for this session" (`session rule 'session:allow:1' added`); it reads the file and edits it, and the edit —
> another operation on the same path by the same persona — is allowed by `session:allow:1` (`session-rule`) with no
> approval request and no dialog, and reaches the disk. One `write_file` dialog was shown in the launch. With the
> path-scoped arm of `approvalMatches` (`packages/agent-tools/src/policy.ts`) taken out, the edit asks again and the proof
> fails on a second `write_file` dialog. The launch then leaves its terminal call's dialog to the 8 s timeout and reads the
> away mark in the audit (a `timeout` decision and one `user_away` entry, `after_seconds: 8`). The rule held as written.
> **Still not measured:** run `1ddeb71b`'s loop against a real model; `live-run.mjs`'s new `approvals` scenario asks a
> real model for three writes of one file at the asking default and is the orchestrator's to run. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
