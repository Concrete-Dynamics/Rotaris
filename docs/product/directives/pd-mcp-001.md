[Product directives](../directives.md) › PD-MCP-001

<a id="pd-mcp-001"></a>

### PD-MCP-001 — the bundled code-intelligence server's manual tool is described in the product's own words

The binding manifest of REQ-MCP-116 SHALL carry, beside the runtime's identifiers, a description **written by the
product** for the bundled code-intelligence runtime's usage-instruction tool (the tool REQ-MCP-015 places in the READ tier
as "usage-instruction retrieval"), keyed by that capability and not by the runtime's name. The text SHALL be neutral: it
says what the tool returns and that the server's other tools work without it, and it SHALL NOT instruct the agent to call
the tool first or at all.

Wherever the product hands that tool's description to a model — the persona's MCP section of REQ-MCP-101 and the tool's
definition in the model's tool listing — the product-written text SHALL be used in place of the description the server
reports, for the server whose entry launches the bundled runtime through the reserved command token, whatever the tool is
renamed to (REQ-MCP-005). Every other tool of that server, and every tool of every other server, keeps its server's own
description as REQ-MCP-101 states.

Everything else stands: the tool stays in the READ tier and in every built-in grant REQ-MCP-014 and REQ-MCP-015 give it; it is
listed, granted, renamed, disabled and called exactly as before; and REQ-MCP-101's rendering — order, formatting, the
description rule for an empty string — is unchanged.

**Why, and what it costs.** The runtime describes the tool imperatively ("IMPORTANT: If you have not yet read the manual,
call this tool immediately …"), every agent's prompt carried it word for word, and agents obeyed: in the live run of
2026-09-29 it was called three times and again in the duress run, each call returning 7.1 to 7.5 thousand characters that
every later request of that agent re-sent — about 60,000 input tokens over 33 requests in one run — and each agent's first
step went to a manual about a tool it might not need. Agents that need the manual can still fetch it. What is given up: the
model no longer reads the runtime's own account of when the manual is worth reading, and a later runtime release that
rewords its description is not seen until the product's text is revisited.

> **Narrows:** REQ-MCP-101
> **Extends:** REQ-MCP-116

*Raised by the owner, 2026-10-06, ruling OQ-115 as recommended; logged as [R-071](../requests.md#r-071).*

> **First execution, 2026-10-06, built under [R-071](../requests.md#r-071) (fin21):** the rule held as written. The text lives in
> the manifest's generator (`apps/desktop/scripts/code-intelligence/manifest.mjs`, `PRODUCT_DESCRIPTIONS`), which emits it as
> `productDescriptions` and refuses one that names no capability of the tiers; the module was regenerated against the bundled
> runtime on this host (serena-agent 1.7.0, Python 3.13.15, 24 tools listed) and `--check` compares it byte for byte as before.
> `filterServerTools` (`packages/config/src/mcp/persona.ts`) is where the description is put, for an entry whose command is the
> reserved token — the test REQ-MCP-102 already uses to tell the bundled server — matched on the reported name's candidate
> spellings, so the persona surface, the prompt section, the executor's definition and the narrowing after a list update all
> carry it. **What was measured.** Two cases in `config/src/mcp/mcp.test.ts`, the surface case red without the change: the
> manifest's text for the capability and none for another tool, the bundled server's usage tool described anew and its other
> tool not, the same name on a user's server keeping its own words, the section rendering the product's text and the
> imperative only under the other server. `code-intel-proof`'s discovery step now asserts the section against the built app.
> **What was not measured.** A live run against a real model; the next one shows whether agents still open with the manual.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: whether agents still open
> with the manual. They do not. The usage-instruction tool (`initial_instructions`) was offered with the product's text in every
> agent request of the three packs, 144 of 144, 188 of 188 and 188 of 188, and called **0 times** in any of them. The MCP calls
> made were memory and diagnostics tools only: `list_memories` ×4 and `get_diagnostics_for_file` ×1 at `552d346`'s default pack;
> `list_memories` ×7, `read_memory` ×3, `write_memory` ×3 and `edit_memory` ×1 in its duress pack; `get_diagnostics_for_file`
> ×3, `list_memories` ×4, `read_memory` ×1 and `write_memory` ×1 at `0bc3eee`. Held as written. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
