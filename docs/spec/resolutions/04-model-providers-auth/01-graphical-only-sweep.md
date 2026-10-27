# Resolution Record — Domain 04, Model Providers, Sign-In, and Model Routing — Graphical-only sweep

Part 1 of 3 of [domain 04's resolutions](../04-model-providers-auth.md), which indexes every part.

## Graphical-only sweep

The draft carried three sections written entirely around a shell or text-mode surface — "CLI:
Sign-In Command", "CLI: Sign-Out, Provider Management, Catalog Refresh", and "Terminal-UI Surfaces"
— plus a scatter of shell clauses inside otherwise in-scope requirements. Every capability those
surfaces carried was rescued into the desktop before the surface was withdrawn; nothing a user could
do was lost. Section headings were retitled to match ("Provider Sign-In Flow", "Sign-Out, Provider
Management, Catalog Refresh", "Retired Terminal-UI Surfaces").

| Withdrawn shell/text-mode requirement | What it carried | Capability now carried by |
| --- | --- | --- |
| REQ-PROVIDER-042 | Coming-soon gating of the hosted provider in the sign-in menu | REQ-PROVIDER-142 (provider chooser), REQ-PROVIDER-043 (desktop health check and add-provider dialog) |
| REQ-PROVIDER-056 | `providers delete` with a confirmation flag and exit codes | REQ-PROVIDER-141 (provider settings, delete with confirmation) |
| REQ-PROVIDER-093 | `login [PROVIDER] [--reauth] [-w PATH]`, exit codes | REQ-PROVIDER-142 (sign-in and re-authentication actions, workspace scope) |
| REQ-PROVIDER-094 | Provider menu, label adjustments, arrow-key selector | REQ-PROVIDER-142 (provider chooser, catalog order, label rules, cancellation) |
| REQ-PROVIDER-101 | `logout [PROVIDER]`, `run --logout`, interactive selector, exit codes | REQ-PROVIDER-143 (sign-out action and its provider list) |
| REQ-PROVIDER-103 | `providers list` printed lines and the provider-set union rule | REQ-PROVIDER-140 (provider list view) |
| REQ-PROVIDER-104 | `providers set-key` | REQ-PROVIDER-141 (API-key field, validated save) |
| REQ-PROVIDER-105 | `providers set-base-url` | REQ-PROVIDER-141 (base-URL field, re-discovery on change) |
| REQ-PROVIDER-106 | `providers validate` / `reauth` / `delete` aliases | REQ-PROVIDER-141 (validate, re-authenticate, delete actions) |
| REQ-PROVIDER-109 | `models refresh [--provider ID]`, progress and summary text, exit code | REQ-PROVIDER-147 (catalogue refresh action, per-provider and bulk) |
| REQ-PROVIDER-111 | Terminal Provider Settings modal | REQ-PROVIDER-141 (desktop provider settings) |
| REQ-PROVIDER-112 | Terminal Startup Models modal (Ctrl+P) | REQ-PROVIDER-144 (startup model assignment editor) |
| REQ-PROVIDER-113 | Terminal rich model picker sub-screen | REQ-PROVIDER-145 (model picker) |
| REQ-PROVIDER-114 | Terminal Runtime Models modal (Ctrl+M) | REQ-PROVIDER-146 (runtime model override selection) |
| REQ-PROVIDER-115 | Terminal slash commands `/logout`, `/model` | REQ-PROVIDER-143 (sign-out action), REQ-PROVIDER-146 (composer `/model`) |
| REQ-PROVIDER-138 | `run --logout` short-circuit | REQ-PROVIDER-143 (sign-out is its own action and never carries a task) |
| REQ-PROVIDER-139 | Exit-code contract for every subcommand | Nothing to rescue: the product exposes no process exit status to a user. Outcome reporting is REQ-PROVIDER-142, REQ-PROVIDER-143, REQ-PROVIDER-147 |
| REQ-PROVIDER-015 | Legacy directory adoption | Withdrawn under binding decision B; no capability, a clean-room product has no earlier directory |

Shell-surface clauses struck from requirements that otherwise survive: REQ-PROVIDER-013 (stdout and
stderr as diagnostic venues), REQ-PROVIDER-035 (`rotaris-cli login codex --reauth` in a user
message), REQ-PROVIDER-039 ("return to the terminal" in the callback success page),
REQ-PROVIDER-044 / REQ-PROVIDER-046 / REQ-PROVIDER-050 / REQ-PROVIDER-052 (command names inside
sign-in instructions and error messages), REQ-PROVIDER-095 / REQ-PROVIDER-096 / REQ-PROVIDER-097 /
REQ-PROVIDER-099 / REQ-PROVIDER-100 (the sign-in sequence, rewritten as the
desktop flow it now is), REQ-PROVIDER-102 (exit codes), REQ-PROVIDER-110 ("both CLI frontends"),
REQ-PROVIDER-118 (its citation of CLI sign-out). Legacy-identifier clauses struck under decision 6:
REQ-PROVIDER-009 and REQ-PROVIDER-041 (the `geraet-cloud` alias), REQ-PROVIDER-024 and
REQ-PROVIDER-025 ("from earlier builds"), REQ-PROVIDER-089 (legacy thinking booleans),
REQ-PROVIDER-128 ("credentials from before the field existed").

One further clause was struck for a different reason: REQ-PROVIDER-037 took the hosted-cloud issuer
and API base from environment variables alone, which a desktop application launched from a desktop
launcher cannot rely on. Under the configuration-surface split, both are now configuration values on
the layered YAML surface, with the environment variables retained as an override where they happen
to be present.
