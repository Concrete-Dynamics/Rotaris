# Notiz: Priorisierung Marktreife (2026-08-03)

> Analyse-Notiz ohne Frontmatter — vom ReqToCode-Tooling ignoriert.
> Herleitung: [docs/research/marktanalyse-agentic-harnesses-2026-08.md](../research/marktanalyse-agentic-harnesses-2026-08.md).
> Bei Aufschreiben der Notiz waren alle unten genannten Requirements `status: draft`
> (geplant, nicht implementiert). Inzwischen ausgeliefert und `status: approved`:
> Epic 2600 (Verifier), Epic 2800 (Projekt-Initialisierung — inklusive der
> technischen Requirements SWR-2806/2807), P0 #3 (JSON-Event-Stream,
> SWR-1828/1829), P1 #4 (OS-Level-Sandbox SWR-2507 und Netz-Policy SWR-2505)
> sowie — mit der Epic-Runde P1-Marktreife am 2026-08-08 — P1 #5 (User-Hooks,
> Epic 2700), P1 #6 (Python-SDK, SWR-1830) und P1 #7 (Checkpoints + Rollback,
> SWR-2436/2437). Damit ist die P1-Liste dieser Notiz vollständig ausgeliefert.
>
> **Korrektur zu #4:** Die Notiz nannte das Thema „Container-Sandbox". Gebaut
> wurde bewusst *keine* Container-Sandbox, sondern eine **OS-Level-Sandbox als
> Per-Command-Wrapper** (Apple Seatbelt auf macOS, bubblewrap auf Linux/WSL2,
> auf nativem Windows nicht verfügbar → WSL2) — dasselbe Verfahren, das Codex
> CLI und Claude Code ausliefern. Begründung in SWR-2507.

## Leitidee

Erst Marktreife (P0: Basisausstattung, die jeder Wettbewerber hat), dann
Differenzierung (ReqToCode-Produktisierung, Evidence-gated Completion pro
Akzeptanzkriterium, Mission Control). Der Verifier (Epic 2600) ist bewusst P0:
er schließt eine Marktreife-Lücke **und** ist das Fundament des späteren USP.

## Oberflächen-Priorität: Rotaris primär, TUI sekundär

Die **Rotaris-Desktop-App ist die primäre, vermarktete Oberfläche und selbst
ein USP** — das gesamte Wettbewerbsfeld (Claude Code, Cline, Kilo, Pi,
Codebuff) ist Terminal-/IDE-first; eine native Desktop-Supervisor-Oberfläche
hat dort niemand. Konsequenzen für die Priorisierung:

- Neue interaktive Features landen **zuerst in Rotaris**; TUI-Parität ist
  optionaler Follow-up, nie Acceptance-Bestandteil (so formuliert in SWR-2504
  Approval-Flow und SWR-2437 Rollback: TUI deferred, Fail-safe-Fallback statt
  TUI-Pflicht-UI).
- **TUI-only-Requirements werden hinten angestellt (P2/Backlog):** die
  bestehenden TUI-Epics (1000-tui-core, 1100-tui-input, 1200-tui-transcript
  sowie die TUI-Panel-Anteile von 1400) sind implementiert und bleiben im
  Wartungsmodus — Bugfixes ja, keine neuen TUI-only-Features vor Abschluss von
  P0/P1.
- Headless/CLI ist davon unberührt (eigener Kanal für CI/Automatisierung,
  SWR-1828–1830).

## P0 — Marktreife-Blocker (Reihenfolge = empfohlene Umsetzungsreihenfolge)

| # | Thema | Requirements | Begründung |
| --- | --- | --- | --- |
| 1 | Permission-System Allow/Ask/Deny | SWR-2501, SWR-2502, SWR-2503, SWR-2504, SWR-2508 ([Epic 2500](2500-secure-execution.md)) | Gefährlichste Lücke; ohne Permission-Modi ist ein autonomer Harness für fremde Nutzer nicht vertretbar. SWR-2508 (Ask-Default ohne Sandbox) war die Sofortmaßnahme, solange SWR-2507 fehlte, und bleibt für Hosts ohne Sandbox-Backend (nativ Windows) in Kraft. |
| 2 | Deterministischer Verifier | SWR-2601, SWR-2602, SWR-2603, SWR-2604, SWR-2605 ([Epic 2600](2600-completion-verifier.md)) | „Fertig“ nur mit Evidenz — Top-Fehlerklasse laut Forschung; zugleich Fundament für Evidence-gated Completion (USP). |
| 3 | Headless JSON-Event-Stream — **implementiert (2026-08-07)** | SWR-1828, SWR-1829 ([Epic 1800](1800-cli-headless.md)) | Kleinster Aufwand, sofortiger CI-/Automatisierungs-Nutzen; Eventquellen existierten bereits. Schema (SWR-1829) vor SDK gebaut. `--output-format stream-json` auf beiden Entry Points; Exit-Code und `result`-Event stammen aus einem `RunResult`. SWR-1830 (SDK) ist seit 2026-08-08 nachgezogen, siehe P1 #6. |

## P1 — direkt danach (Marktreife-Vervollständigung)

| # | Thema | Requirements | Begründung |
| --- | --- | --- | --- |
| 4 | OS-Level-Sandbox (Per-Command-Wrapper) — **implementiert (2026-08-07)** | SWR-2507; dazu Netz-Policy SWR-2505, Audit-Log SWR-2506 ([Epic 2500](2500-secure-execution.md)) | Hebt die Ask-Default-Einschränkung aus SWR-2508 auf, sobald die Sandbox konfiguriert **und** verfügbar ist; Docker-Distribution (SWR-2102) separat. Ausgeliefert als Seatbelt/bubblewrap-Wrapper statt Container. Grenzen: auf nativem Windows nicht lauffähig (→ WSL2), Terminal-Egress nur als binärer Kernel-Schalter. |
| 5 | User-Hooks — **implementiert (2026-08-08)** | SWR-2701, SWR-2702, SWR-2703, SWR-2704; dazu SWR-2815 (Trust-Gate) und SWR-2816 (Scope-Fallback) ([Epic 2700](2700-lifecycle-hooks.md)) | Deterministische Orchestrierung; baut auf Observer-Seam, Pattern-Syntax aus SWR-2502 wiederverwendet. Der Observer-Seam hatte keine Session-Hooks — `on_session_start`/`on_session_end` wurden ergänzt. Zwei Sicherheits-Eigenschaften kamen erst beim Bauen dazu: Workspace-Hooks aus einem Clone laufen nur nach ausdrücklichem Votum (SWR-2815), und eine abgelehnte Workspace-Liste schaltet die eigenen globalen Hooks nicht ab (SWR-2816). Hooks laufen **hinter** der Permission-Engine, sind also kein Ersatz für Deny-Regeln. |
| 6 | Python-SDK — **implementiert (2026-08-08)** | SWR-1830 ([Epic 1800](1800-cli-headless.md)) | Konsumiert den Event-Stream aus #3; nach stabilem Schema gebaut. Der Run-Lebenszyklus lag entgegen der Requirement-Formulierung nicht in `ralph/bootstrap.py`, sondern in `cli/background.py::run_background`; er wurde nach `rotaris_core.run_host.execute_run` extrahiert, das CLI und SDK gemeinsam aufrufen. |
| 7 | Checkpoints + Rollback — **implementiert (2026-08-08)** | SWR-2436, SWR-2437; dazu SWR-2817 (Recovery hängengebliebener Run-Status) ([Epic 2400](2400-git-worktrees.md)) | Vervollständigt „git-native“; Worktrees existierten bereits. Checkpoint-Refs werden mit der Session gelöscht. Zusätzlich nötig: eine hart abgestürzte Session blieb dauerhaft `running` und blockierte Restore und Integration — SWR-2817 erkennt das (nur lesend) und repariert es auf ausdrückliche Aktion. TUI-Listing bleibt bewusst offen (Rotaris primär, CLI-Subcommand als Ersatz). |
| 8 | Projekt-Initialisierung + Serena-MCP — **implementiert (2026-08-06)** | SWR-2800, SWR-2801, SWR-2802, SWR-2803, SWR-2804, SWR-2805; dazu die technischen SWR-2806, SWR-2807 ([Epic 2800](2800-project-initialization.md)) | Symbolische Code-Intelligenz und ein geführtes Erst-Setup sind bei Claude Code (`/init`) und Cline Basisausstattung; der Erstkontakt eines neuen Nutzers mit einem Workspace entscheidet über den Eindruck. Das Task-Register ist bewusst erweiterbar, damit spätere Setup-Schritte ohne UI-Änderung andocken. SWR-2806/2807 waren seit dem Bau implementiert, wurden aber erst am 2026-08-08 auf `approved` gesetzt. |

## Danach — Differenzierung (Phase 2, gestartet 2026-08-09)

Statusabgleich und Arbeitsliste:
[docs/plans/2026-08-09-marktanalyse-offene-punkte.md](../plans/2026-08-09-marktanalyse-offene-punkte.md),
Wellenschnitt in
[docs/plans/2026-08-09-phase2-parallelisierungsplan.md](../plans/2026-08-09-phase2-parallelisierungsplan.md).

Erste Requirement-Runde geschrieben (alle `draft`, Implementierung läuft):

| Thema | Requirements |
| --- | --- |
| ReqToCode-Produktisierung, Schritt 1 | SWR-2335 (Layout als Datum), SWR-2336 (öffentliche Coverage-Abfrage), SWR-2337 (Annotations-Konventions-Seam); Backlog neu geschnitten: SWR-2303, 2311, 2315, 2316, 2317, 2318 ([Epic 2300](2300-traceability.md)) |
| Event-Store, Replay, Trajektorien-Export | SWR-2901–2903 ([Epic 2900](2900-event-store.md)) |
| Event-Abdeckung der P1-Features | SWR-1831 ([Epic 1800](1800-cli-headless.md)) |
| Auditierbares Lernen (Historie + Rollback) | SWR-1640–1642 ([Epic 1600](1600-improvement-loop.md)) |

Noch ohne Requirements: Evidence-gated Completion pro Akzeptanzkriterium (auf
Epic 2600 aufbauend), Rotaris Mission-Control-Sichten (Requirement-Coverage,
Kosten pro Agent, Diff-Überschneidungen paralleler Worktrees).

**SWR-2102 (Docker-Image) ist am 2026-08-09 ausdrücklich zurückgestellt** —
Distributions-, kein Sicherheitsthema; die Sandbox liegt in SWR-2507.

## Bewusst zurückgestellt

Adaptives Modell-Routing, Environment-Bootstrapping, Remote-Plattform
(Epic 2200 bleibt `draft`), zusätzliche Subagenten-Mechanik — Begründungen in
der [Marktanalyse, Abschnitt 5](../research/marktanalyse-agentic-harnesses-2026-08.md).

## Abhängigkeiten (Kurzform)

- SWR-2504 (Approval-UI) ← SWR-2501/2503 (Engine + Modi)
- SWR-2508 ← SWR-2503; entfällt als Einschränkung nur dort, wo SWR-2507 wirklich
  greift — d. h. auf macOS/Linux/WSL2 mit vorhandenem Backend, nicht auf nativem
  Windows
- SWR-2602 (Verifier-Lauf) nutzt Terminal-Pfad → respektiert SWR-2501/2507 automatisch
- SWR-2604 (Gate) ← SWR-2603 (Report-Feld) ← SWR-2602
- SWR-1829 (Schema) referenziert Events aus SWR-2506/2602/2604 — Stream kann
  vorher mit Kern-Events starten, Schema ist additiv versioniert
- SWR-1830 (SDK) ← SWR-1828/1829
- SWR-2702 (Tool-Hooks) nutzt Pattern-Syntax aus SWR-2502
