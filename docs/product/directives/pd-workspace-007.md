[Product directives](../directives.md) › PD-WORKSPACE-007

<a id="pd-workspace-007"></a>

### PD-WORKSPACE-007 — the status strip's path link and flag explanations follow the shell domain

*Renumbered before landing: built as `PD-WORKSPACE-006` on its branch, it took the next free number, `PD-WORKSPACE-007`, when `PD-WORKSPACE-005` (the project-setup banner, OQ-171) landed on `main` first; its citations followed.*

Where the workspace domain and the shell domain, which owns the status strip (REQ-SHELL-047), state the strip differently,
the shell domain's statement SHALL govern:

- A workspace-path link that cannot open the folder raises REQ-SHELL-040's transient error naming the path attempted;
  REQ-WORKSPACE-019's "a failure to open SHALL be silent" no longer governs.
- The `unsaved settings` flag's explanation conveys that the Settings view holds edits not yet saved and that **runs keep
  using the last saved values** until they are saved (REQ-SHELL-041), not that runs use the values on screen.
- The mode, redaction and circuit-breaker flags' explanations are REQ-SHELL-041's sentences word for word, and
  REQ-WORKSPACE-022's "exactly the following and no more" does not bound them.

Everything else in REQ-WORKSPACE-019 and REQ-WORKSPACE-022 still governs: the link's name and tooltip, the five flags and
their conditions, the mode flag's value vocabulary, the file-access pair's fixed sentences, and each flag's explanation as
both its tooltip and its accessible description.

**As built.** `workspace.openFolder` (`apps/desktop/src/main/commands/workspace.ts`, `apps/desktop/src/main/open-folder.ts`),
`apps/desktop/src/renderer/strip-facts.ts` and `statusStripSafetyFlags` (`packages/ui/src/composer.ts`). *On Windows (2026-10-21, the Windows ARM64 session's D2, the window 1,440 CSS px wide): the strip's workspace link opened an Explorer window on the workspace 653, 622 and 1,402 ms after the click, against the 5 s bound, and main logged "opened the workspace folder: <path>". The negative case (the folder renamed away) was not run.*

**Why, and what it costs.** OQ-191: the two domains disagree in five statements, two of them opposite claims (a silent
failure against a reported one, the values on screen against the last saved values; the product's runs read the saved
configuration). REQ-SHELL-047 makes the shell domain the strip's owner, and its resolution 7 is the later decision. The owner
let the shell's five statements stand and asked for the workspace domain to match them. What it costs: the redaction
sentence does not say that redaction cannot be turned off, and the three sentences say more than the workspace domain's
bound allowed.

> **Narrows:** REQ-WORKSPACE-019, REQ-WORKSPACE-022

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-191.*
