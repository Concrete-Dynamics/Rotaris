# Resolution Record — Domain 11, Application Startup, Distribution, and Updates — New requirements introduced

Part 4 of 5 of [domain 11's resolutions](../11-startup-distribution-updates.md), which indexes every part.

## New requirements introduced

| ID | Section | Why it exists |
| --- | --- | --- |
| REQ-STARTUP-153 | Re-running setup after first launch | Rescues the capability of the withdrawn console `setup` subcommands (REQ-STARTUP-098, REQ-STARTUP-099) and of the withdrawn automatic pre-step (REQ-STARTUP-100): machine setup is re-runnable from Settings after first launch, whole or one step at a time, reading and updating `setup/state.json`, never re-running a completed step, taking the same lock, and reporting tool, command, exit status and reason inside that surface. Reconciles this domain with REQ-NOTIFY-265 and REQ-CONFIG-397 |
| REQ-STARTUP-154 | Settings surface for machine setup | Open question 20 — a degraded capability warns at the point it is exercised, not only in the settings card |
| REQ-STARTUP-155 | Cross-cutting invariants | Open question 1 — the three startup and setup timing bounds, and an explicit statement of what is deliberately unbounded |
| REQ-STARTUP-156 | Release pipeline | Open question 5 — the closed set of release-acceptance criteria, and the rule that externally owned behavior is never a gate. Also carries the platform-scope half of open question 9 |
| REQ-STARTUP-157 | Opt-in diagnostics | Open question 16 — the diagnostics files are a private, self-describing format: names implementation-chosen and stable within a schema version, units fixed |
| REQ-STARTUP-158 | Product identity | Fifth reconciliation round — carries the one-version-per-release rule that REQ-STARTUP-001 stated in ecosystem-packaging terms, with no claim about the form the product is packaged in or the channel it is published through |
| REQ-STARTUP-159 | Product identity | Fifth reconciliation round — carries the self-containment claim that REQ-STARTUP-012 stated in ecosystem terms, technology-neutrally: same platform baseline, same blocked network, same first paint, same true release version on the About surface, same run-time data assets resolving from what was installed |
| REQ-STARTUP-160 | Product identity | Sixth reconciliation round — carries, as behavior of the **application**, the network disclosure that withdrawn REQ-STARTUP-144 had placed on a public marketing website: what the product contacts, when, and what those requests never carry, presented on the About and Legal surface, readable with all outbound access blocked, and never behind a dismissal, a hover or a modal |
