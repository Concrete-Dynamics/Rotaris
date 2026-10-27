# Architecture proposals — MODEL slice — Part 2 — Open questions

Part 4 of 8 of [the model proposal](../model.md), which indexes every part.

## Part 2 — Open questions

These are places where the specification is genuinely silent or where two live requirements
disagree. None is invented requirement; each is raised so the gap is decided rather than guessed.

- **OQ-1 — The provider catalog attribute set is declared closed but is extended by three other
  requirements.** `REQ-PROVIDER-002` fixes the attribute set and `REQ-PROVIDER-003` rejects a build
  that violates it. `REQ-CONFIG-370` names `service_name`, `operator_name` and `destination_host`
  as catalog fields and spells the hosted connection mode `rotaris-cloud` where `REQ-PROVIDER-002`
  spells it `hosted-cloud`; `REQ-CONFIG-371` requires a quick-start URL on the entry;
  `REQ-MONITOR-021` requires a declared concurrency-quota property. **Ask:** is
  `REQ-PROVIDER-002`'s set to be extended with these four (recommended, since three other domains
  depend on them), and which spelling of the hosted mode is canonical? A single spelling matters
  because `REQ-CONFIG-371` branches on it to decide availability.
- **OQ-2 — Per-token prices: float in the format, exact decimal in the arithmetic.**
  `REQ-PROVIDER-072` maps the hosted provider's decimal-string prices to floating-point, and the
  snapshot format types them `<float>`, while `REQ-PROVIDER-121` states that no monetary amount —
  "including the per-token pricing carried through discovery (REQ-PROVIDER-072)" — is computed in
  binary floating point anywhere. The same format block already types `image_cost_per_image` as a
  decimal string. **Recommended reading, subject to confirmation:** the price is carried and
  persisted as a decimal string like the image price, and `<float>` in `REQ-PROVIDER-072` and in
  the format block is the defect, because a value that has already been through a binary float
  cannot afterwards be made exact. Confirm before implementation; this changes a persisted format.
- **OQ-3 — Per-provider concurrency defaults are stated twice, differently.** `REQ-CONFIG-095`
  gives `deepseek` → 3 and `claude-code` → 2 by name; `REQ-MONITOR-021` gives a uniform automatic
  cap of 2 to any provider whose catalogue entry declares the quota-sharing property and explicitly
  refuses to hold a list of names; `REQ-PROVIDER-049` disclaims holding one too. **Ask:** does the
  catalogue property carry a *number* (letting DeepSeek declare 3) or a *boolean* (making the cap
  uniformly 2 and `REQ-CONFIG-095`'s figure of 3 stale)? A number resolves both cleanly.
- **OQ-4 — Do tool calls made by a `claude-code`-backed agent pass through the product's permission
  engine and event stream?** `REQ-PROVIDER-117` says the product "invokes the Claude Agent SDK
  installed locally; traffic goes through that SDK", `REQ-PROVIDER-049` describes an external
  local-runtime subprocess, and `REQ-MCP-043` requires the normalized server description to be
  produced "for every agent backend the product supports". No requirement states whether the
  approval flow of domain 05, the `tool.start` / `tool.finish` events of `REQ-EVENTS-041`, and the
  transcript rows of domain 03 are produced for tool calls that the external runtime performs
  itself. This is the largest unresolved question in the slice; it decides whether `claude-code` is
  a model or a whole agent, and it is likely an **ESCALATE** (see ADR-MODEL-01, alternative C).
- **OQ-5 — Does a spawned MCP `stdio` child inherit the parent process environment?**
  `REQ-MCP-087` and `REQ-MCP-090` fix the precedence among the sources of the `env` map but never
  say whether the resulting map replaces or overlays the parent environment. Servers launched via
  `npx` / `uvx` plainly need `PATH`, and `REQ-MCP-037` judges availability by a `PATH` lookup, so
  some inheritance is implied — but "some" is not a contract, and the official MCP SDK's default is
  a curated safe subset rather than the full parent environment, which would be a third behavior.
  **Ask:** state the rule explicitly.
- **OQ-6 — The `builtin:code-intelligence` sentinel must do more than serve stdio.**
  `REQ-MCP-033` describes the sentinel argv branch only as an MCP server on standard streams, but
  `REQ-MCP-036` derives a command line from the same entry and `REQ-MCP-099` runs it with the
  runtime's `create`, `index` and memory subcommands. **Recommended reading:** the sentinel branch
  is a general pass-through to the bundled runtime, and `REQ-MCP-033` describes what happens when
  the remaining arguments select the server. Confirm, because it changes what the packaged binary's
  early-argv branch must do.
- **OQ-7 — What "shipped model-capability metadata" is.** `REQ-PROVIDER-137` and
  `REQ-PROVIDER-149` both draw on metadata the product ships that knows, per model, whether a
  reasoning-effort parameter is supported, which levels are disclaimed, and whether images are
  accepted. Nothing states where it comes from, how it is keyed, or how it is updated. Treating it
  as build data alongside the known-limits table of `REQ-PROVIDER-079` is the obvious reading, but
  it is a third table of third-party model facts and its update policy should be decided
  deliberately.
- **OQ-8 — `REQ-PROVIDER-013`'s "no diagnostic anywhere" versus ordinary logging.** The 30-second
  non-interactive attempt that fails before contacting a provider must produce the failure result
  and nothing else — no traceback, warning, or other diagnostic in the log or the interface. Every
  other failure path in the domain records a per-provider last error (`REQ-PROVIDER-057`).
  **Ask:** does the last-error record count as "shown anywhere in the interface"? Read literally it
  does, so this one path must skip it.

---
