[Product directives](../directives.md) › PD-CONFIG-012

<a id="pd-config-012"></a>

### PD-CONFIG-012 — the Settings view is Setup and twelve pages in run order, and a page is a ledger

1. **Pages.** The Settings view SHALL present, in place of the thirteen categories as navigation entries, a **Setup** page and twelve pages under four headings, in this order: *Before a run* — Models, Personas, Instructions, Initialization; *While it runs* — Delegation, Permissions, Tools; *After it ends* — Review, Session store, Traceability; *This application* — Appearance, About. What each category held stands on a page: Models (the providers, the model slots, Dictation); Personas (the roles, the playbook catalogue); Instructions (the instruction files, the portable skills); Initialization (project initialization); Delegation (delegation strategy, run-start mode, depth cap, fan-out limit, per-agent timeout, iteration cap, compression threshold, circuit breaker, keep going, the advanced runtime card); Permissions (permission mode, access outside the workspace, the redaction statement, the security policy); Tools (the tool servers with web-search setup, code intelligence and the stored secrets, the hooks, the tool inventory, the plugins statement); Review (the improvement loop and its timeout); Session store (backup, restore, a new store); Traceability (the four operations); Appearance (theme, motion, agent pop-out, panel sizes, the transcript and tool-row display settings); About (as it was, with Diagnostics).
2. **Setup.** The Setup page SHALL hold no setting. It lists what blocks a run or waits on the user, each with one act that opens the page concerned — a configuration that did not load, no signed-in model provider, a session store that is missing or failed its check, a declared web search whose key is unresolved, a project initialization that failed or has not run — then what a configuration file states in place of a built-in default, then what the workspace holds. With nothing stored and nothing asked for, the Settings view opens on Setup.
3. **Addresses.** REQ-CONFIG-269's thirteen identifiers SHALL remain the vocabulary a notice, a command and a stored preference address Settings by; each opens the page that holds what the category held (`runtime` opens Delegation, `project` Session store, `interface` and `display` Appearance, `skills` Instructions, `hooks`, `mcp` and `plugins` Tools). A page's own identifier opens that page.
4. **Explanations.** A row's explanation, and a page's or a section's introduction, SHALL be closed until asked for: by the row's own control, which names what it explains and states whether it is open, or by the page's control, which opens every one. A closed explanation stays in the document. What an act does to the user's data (the session store's rows) is never closed.
5. **Origin.** Where the configuration reports it, a row SHALL state where its value comes from by a glyph with its words — set for this workspace, set in the global configuration, fixed — and nothing for a built-in default.
6. **Find.** A field above the page list SHALL find a setting by the words of its name and open the page that holds it.
7. **A navigation entry needing attention** carries a warning glyph, and its accessible description states what waits.

**Why, and what it costs.** The owner asked for the Settings view to be changed "more fundamentally", chose the run-order structure from three drawn and independently scored structures, asked for the Setup page of the second with it, and then for less text, "hide behind icons and omit useless text" ([R-106](../requests.md#r-106)). The mock he approved is `.ui-review/r-105/mocks/a3-run-order.html`; the independent scoring of the three is in [the Settings brief's part 2](../../design/briefs/settings/02-pages-2026-11-18.md).

What it costs:

- **A person who knew the thirteen categories relearns twelve pages.** Runtime's rows stand on three pages and Project's cards on three; Find and the kept identifiers are what carry the old names.
- **An explanation costs a press.** The page's control opens all of them at once; the reviewer asked for captions to stay visible and the owner chose otherwise.
- **`runtime` and `project` each name one page of the several their rows went to.** A notice that means the initialization card names the page itself.
- **Origin is shown only where the snapshot reports it**: the runtime mapping's keys, the slots and the roles. The delegation strategy, the circuit breaker, the compression threshold and the display keys carry no origin and show none.
- **PD-CONFIG-008's four headings are no longer drawn**; they remain the grouping of the category vocabulary.

> **Narrows:** REQ-CONFIG-268, REQ-CONFIG-271, REQ-CONFIG-320
> **Extends:** REQ-CONFIG-269, REQ-CONFIG-270

The cases narrowed, stated exhaustively. REQ-CONFIG-268: that the thirteen categories are the view's navigation entries; their identifiers, labels and order stand as the address vocabulary. REQ-CONFIG-271: the fallback when nothing valid is stored is Setup. REQ-CONFIG-320: the Runtime rows' one order holds within each page and across the three pages taken in their order, except that the iteration cap and the compression threshold stand with the delegation limits; every row, label, range and confirmation governs as written. REQ-CONFIG-270's bar stands on every page; clean, its status is stated to assistive technology and not drawn.

*Raised by the owner, 2026-11-18, in conversation, over three drawn structures and a reviewer's scores; logged as [R-106](../requests.md#r-106). Minted by the agent that built it (`claude-fable-5-2`). The owner chose the structure and worded the requests; the agent worded this directive.*
