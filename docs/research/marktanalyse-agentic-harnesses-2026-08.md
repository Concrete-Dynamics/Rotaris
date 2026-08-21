# Marktanalyse Agentic-Coding-Harnesses — Gap-Analyse für Rotaris

> Datum: 2026-08-03
> Quelle: Externe Marktrecherche über die OpenRouter-Top-Apps (Hermes Agent, Kilo Code,
> Claude Code, Cline, Pi, Codebuff, OpenClaw, Hello Minds/Ethoswarm, Sekai) plus
> begleitende Forschungsliteratur (arXiv 2604.14228, 2602.14690, 2605.29442, 2606.26300,
> 2606.22902, 2507.09063).
> Zweck: Ableitung des wichtigsten Learnings für Rotaris, Abgleich der P0-Must-haves
> mit dem Ist-Stand, priorisierte Empfehlung für schnelle Marktreife **und**
> Differenzierung.
>
> Dieses Dokument ist eine Analyse, kein Anforderungsdokument. Verbindliche Anforderungen
> entstehen erst durch Übernahme in [`docs/requirements/`](../requirements/README.md).
>
> **Statusstand:** Abschnitt 3 beschreibt den Ist-Stand vom 2026-08-03 und ist als
> Statusquelle überholt — alle vier kritischen P0-Lücken sind inzwischen geschlossen.
> Aktueller Abgleich und Arbeitsliste:
> [`docs/plans/2026-08-09-marktanalyse-offene-punkte.md`](../plans/2026-08-09-marktanalyse-offene-punkte.md).

---

## 1. Executive Summary

**Das wichtigste Learning: Rotaris besitzt mit ReqToCode bereits genau den USP, den
die Marktrecherche als stärkste verbleibende Differenzierung identifiziert — nutzt ihn
aber bisher nur intern als Entwicklungsdisziplin, nicht als Produktfeature.**

Die Recherche kommt zu zwei Kernaussagen:

1. Die verbreiteten Features (MCP, Skills, Subagenten, Multi-Provider, Checkpoints,
   Kontextdateien, Kompression) sind **kommodifiziert** — sie sind Eintrittskarte, kein
   Alleinstellungsmerkmal.
2. Die stärkste offene Differenzierung ist **requirements- und evidence-natives
   Agentic Development**: stabile Requirement-IDs, Verknüpfung zu Code/Tests/Commits,
   Completion Gates pro Akzeptanzkriterium, Drift-Erkennung.

Punkt 2 beschreibt fast wörtlich das, was ReqToCode (`src/rotaris_core/reqtocode/`,
`@traces`/`@verifies`, `docs/requirements/`-Store, Verifier, Diff, CI-Gate, Git-Hooks)
heute schon leistet — allerdings nur für das Rotaris-Repository selbst.

Gleichzeitig zeigt der P0-Abgleich (Abschnitt 3), dass die Marktreife derzeit an vier
Lücken hängt, die **nichts** mit Differenzierung zu tun haben, sondern Basisausstattung
sind:

| # | Lücke | Schwere |
| --- | --- | --- |
| 1 | Keine Sandbox, keine Allow/Ask/Deny-Berechtigungen für Terminal/Tools | **Kritisch** |
| 2 | Kein deterministischer Verifier (Build/Test/Lint-Gates) vor „fertig“-Meldung | **Kritisch** |
| 3 | Kein strukturierter JSON/Event-Stream im Headless-Modus, kein SDK | Hoch |
| 4 | Keine benutzerdefinierten Lifecycle-Hooks / deklarative Policies | Hoch |

Empfohlene Stoßrichtung: **Erst die vier P0-Lücken schließen (Marktreife), dann ReqToCode
produktisieren (Differenzierung).** Beides zahlt aufeinander ein: Der deterministische
Verifier (Lücke 2) ist zugleich das Fundament für Evidence-gated Completion, den Kern des
ReqToCode-USP.

---

## 2. Einordnung: Wo steht Rotaris im Wettbewerbsfeld?

Nach der Kategorisierung der Recherche ist Rotaris ein **Coding-Agent-Harness**
(Vergleichsgruppe: Kilo Code, Claude Code, Cline, Pi, Codebuff), mit zwei Oberflächen
(Rotaris-Desktop primär, Textual-TUI sekundär) und einem Headless-CLI-Modus.

Die Recherche bestätigt zwei bestehende Architekturentscheidungen von Rotaris:

- **Der Agentenloop selbst ist austauschbar.** Die Analyse zu Claude Code
  (arXiv 2604.14228) zeigt: Der Kern ist eine einfache Schleife; der Produktwert steckt
  in Berechtigungen, Kontextkompression, Sessionverwaltung, Erweiterbarkeit und
  Arbeitsisolation. Rotaris hat mit Ralph Loop + Scheduler + ChildManager genau diese
  Trennung — der Loop ist klein, die Substanz liegt in Orchestrierung, Session-Persistenz
  und Delegations-DAG.
- **Die empfohlene 8-Schichten-Architektur ist weitgehend deckungsgleich** mit der
  bestehenden Struktur (Interfaces → Control Plane → Orchestrator → Verifier →
  Context Engine → Execution Plane → Learning Layer → Event/Eval Store). Nur zwei
  Schichten sind bei Rotaris schwach besetzt: **Verifier** und **Event/Eval Store**
  (Details in Abschnitt 3).

Zusätzlich relevant: Die Studie über 2.926 Repositories (arXiv 2602.14690) zeigt, dass
Kontextdateien (`AGENTS.md`) das mit Abstand meistgenutzte Steuerungsinstrument sind —
Rotaris konsumiert diese bereits und folgt damit dem interoperablen De-facto-Standard.

---

## 3. P0-Abgleich: Must-haves vs. Ist-Stand

Bewertungslegende: ✅ vorhanden · 🟡 teilweise · ❌ fehlt.
Evidenz verweist auf Module unter `src/rotaris_core/` und Requirement-Epics unter
`docs/requirements/`.

### 3.1 Execution Kernel — ✅ (mit einer Teillücke)

| Anforderung (Recherche) | Ist-Stand | Evidenz |
| --- | --- | --- |
| Typisierte Toolaufrufe, strukturierte Fehler | ✅ | OpenHands-SDK-Tools, `tools/terminal_outcome.py` (Outcome-Klassifikation), `llm_errors.py` |
| Timeouts, Abbruch, Retry | ✅ | Scheduler-Harness, `orchestrator/scheduler_conversation.py` (graceful pause, ToolActivityRegistry), Usage-Limit-Fallback (SWR-901–908) |
| Nebenläufigkeitskontrolle | ✅ | ChildManager: Delegations-DAG, Zyklenerkennung, Tiefe ≤3, Fan-out ≤8, WaitBarrier |
| Schleifenerkennung | ✅ | Circuit Breaker (Epic 200, approved): Tool-/Message-Schwellen, Loop-Klassifikation, Eskalation |
| **Persistentes Eventprotokoll** | 🟡 | Session-Snapshots + `tracking/` existieren, aber kein durchgängiger, abfragbarer Event-Store mit Replay (siehe 3.8) |

### 3.2 Code- und Kontextmanagement — ✅

| Anforderung | Ist-Stand | Evidenz |
| --- | --- | --- |
| Hierarchische Projektregeln | ✅ | Layered Config (`~/.config/rotaris/` < `<workspace>/.rotaris/`), AGENTS.md-Konsum, Epic 400 (approved) |
| Gezieltes Nachladen, Repo-Suche | ✅ | `tools/search.py`, `read_file`/`write_file` mit Read-Ledger |
| Context Compaction | ✅ | Compressor-Agent, automatischer Trigger, Per-Modell-Schwellen (Epic 1400, approved) |
| Session-Resume | ✅ | Epic 1500 (approved), Schema-versionierte Snapshots, atomare Writes, PID-Lock |

### 3.3 Verifikation — ❌ **(kritische Lücke #2)**

Die Recherche ist hier eindeutig: *„ein Agent darf ‚fertig‘ nur anhand sichtbarer Evidenz
melden“*. Die Fehlerstudie über 20.000+ Sessions (arXiv 2605.29442) nennt falsches
Fertigmelden als eine der Top-Fehlerklassen.

Ist-Stand:

- `ralph/completion_classifier.py` klassifiziert Completion **LLM-basiert** — das ist
  eine Heuristik, keine Evidenz.
- Der Orchestrator-Prompt enthält eine Verifikationsphase (SWR-1801, Phase 3) — das ist
  **Prompt-Disziplin**, nicht deterministisch erzwungen.
- Der ReqToCode-Verifier (`reqtocode/verifier.py`) erzwingt Traceability — aber nur für
  das eigene Repo, nicht als Feature für Nutzerprojekte.

Was fehlt: ein deterministischer Verifier-Schritt, der nach Codeänderungen Build, Tests,
Linter und Typechecker des **Zielprojekts** ausführt und dessen Ergebnis (a) in den
`ChildReportArtifact` einfließt und (b) die Completion-Klassifikation hart gated. Die
Infrastruktur dafür existiert bereits: Terminal-Tool mit Outcome-Klassifikation,
`ChildReportArtifact.tests`/`errors`-Felder, SummaryAgent.

### 3.4 Sichere Ausführung — ❌ **(kritische Lücke #1)**

| Anforderung | Ist-Stand | Evidenz |
| --- | --- | --- |
| Dateisystem-Regeln | 🟡 | `PathAuth` zentralisiert (SWR-2111–2115), `allow_outside_workspace`-Flag — aber nur Pfad-Ebene |
| **Sandbox (Prozess/Container)** | ❌ | Terminal läuft unsandboxed; SWR-2116 fordert lediglich eine **Warnung**. Docker-Image (SWR-2102) ist `draft` |
| **Allow/Ask/Deny-Modi** | ❌ | Es gibt nur per-Persona-Tool-Allowlists (`config/schema.py`), keine Laufzeit-Nachfrage, keine Kommando-Patterns, keine Policy-Stufen |
| Netzwerkregeln | ❌ | Keine Egress-Kontrolle für `fetch`/Terminal |
| Secret-Isolation | ✅ | `SecretStr` strukturell — Keys erscheinen nie in Dumps/Logs/Transkripten |
| Audit-Logging | 🟡 | Transkript + Session-Snapshots ja; kein dediziertes, vollständiges Audit-Log der Tool-Entscheidungen |

Das ist die gefährlichste Lücke für Marktreife: Jeder direkte Wettbewerber (Claude Code,
Cline, Kilo, Codebuff) hat Permission-Modi als Kernfeature. Ein Harness, der autonome
Ralph-Loops ohne Sandbox und ohne Ask-Modus fährt, ist für fremde Nutzer faktisch nicht
vertretbar einsetzbar.

### 3.5 Git-native Arbeitsweise — 🟡

| Anforderung | Ist-Stand | Evidenz |
| --- | --- | --- |
| Isolierte Worktrees | ✅ | Epic 2400 (approved): Worktree-Isolation pro Session, Rotaris-Toggle, Session-Metadaten bleiben im Hauptworkspace |
| Diff-Anzeige | 🟡 | Git-View in Rotaris vorhanden (SWR-2402 f.), aber kein zentrales Diff-Review über parallele Agenten hinweg (Kilo-„Agent Manager“-Niveau) |
| Commits | ✅ | `tools/git_commit.py` mit PathAuth-Wiring |
| **Checkpoints + Rollback pro Agentenschritt** | ❌ | Kein automatischer Checkpoint vor riskanten Änderungen, kein Ein-Klick-Rollback (Cline-Checkpoint-Niveau) |

### 3.6 Erweiterbarkeit — 🟡

| Anforderung | Ist-Stand | Evidenz |
| --- | --- | --- |
| MCP | ✅ | Discovery/Resolution in `config/`, Unavailability-Handling, TUI-Anzeige (Epic 1700, approved) |
| Skills | ✅ | `skills/`, Epic 400 (approved) |
| Eigene Tools | ✅ | `TOOL_NAME_MAP`-Registrierung, Custom-Tool-Plugins per Persona |
| Agentenprofile | ✅ | Personas in `agents.yaml`: Prompt, Toolset, Modell, MCP pro Rolle |
| **Benutzerdefinierte Hooks** | ❌ | Nur der interne `RalphIterationObserver`-Seam. Kein nutzerkonfigurierbares Pre/Post-Tool- oder Lifecycle-Hook-System (Claude-Code-Hooks-Niveau) |

### 3.7 Programmatic API — ❌ **(Lücke #3)**

- Headless-Background-Modus existiert (Epic 1800, approved; `cli/background.py`).
- Aber: **kein strukturierter JSON/Event-Stream auf stdout**, kein `--output-format
  json`, kein Python-SDK, das dieselbe Runtime programmatisch exponiert.
- Folge: keine CI-Integration, keine Skriptbarkeit, keine Einbettbarkeit — genau der
  Kanal, über den Cline und Codebuff Adoption bei Teams gewinnen.

Aufwandseinschätzung: vergleichsweise klein. Die Eventquellen existieren
(IterationObserver, ChildReportArtifact, Terminal-Outcomes, Token-Usage) — es fehlt nur
ein Serialisierungs-Layer auf stdout.

### 3.8 Observability — 🟡

| Anforderung | Ist-Stand | Evidenz |
| --- | --- | --- |
| Token-/Kostenmetriken | ✅ | `cost.py`, `tracking/`, Token-Panel (SWR-1419); Kostenwerte kommen ausschließlich aus OpenHands/Config-Pricing |
| Tool-Traces | 🟡 | Im Transkript enthalten, aber nicht als abfragbare Struktur |
| **Session-Replay, exportierbare Trajektorien** | ❌ | Kein Replay, kein Trajektorien-Export für Evals/Debugging |
| Fehlerursachen/Wiederholungen | 🟡 | Diagnostics (Epic 1500) vorhanden, aber nicht aggregiert auswertbar |

### 3.9 Modellabstraktion — ✅

Stärkstes P0-Feld von Rotaris: 30+ Provider via litellm (`models.yml`), Modellregistry
(Epic 800), per-Persona-Modellzuweisung, Usage-Limit-Erkennung mit Same-Class-Fallback
und Wait-State (SWR-901–908), separates günstiges Modell für SummaryAgent/Compressor.
Adaptives (lernendes) Routing fehlt — ist laut Recherche aber Differenzierung, kein P0.

### 3.10 Interaktion und Steuerung — ✅

Todo-Ledger mit Phasen, Steering Injection in laufende Kinder, `ask_questions`-Tool,
Message-Limit-Gates mit Bestätigungsmodal (SWR-909–918), Intent-Classification-Gate
(SWR-1802), Rotaris-Session-Browser und Agent-Monitor (SWR-1414–1418). Deckt die
P0-Anforderung ab.

### 3.11 Zusammenfassung P0-Matrix

| P0-Bereich | Status |
| --- | --- |
| Execution Kernel | ✅ (Eventprotokoll 🟡) |
| Kontextmanagement | ✅ |
| **Verifikation** | ❌ |
| **Sichere Ausführung** | ❌ |
| Git-native Arbeitsweise | 🟡 |
| Erweiterbarkeit | 🟡 (Hooks ❌) |
| **Programmatic API** | ❌ |
| Observability | 🟡 |
| Modellabstraktion | ✅ |
| Interaktion/Steuerung | ✅ |

---

## 4. Differenzierungs-Abgleich: die 7 Kandidaten der Recherche

| # | Differenzierungskandidat | Rotaris-Ist | Bewertung |
| --- | --- | --- | --- |
| 1 | **Requirements-natives Development** | **ReqToCode existiert**: stabile SWR-IDs, `@traces`/`@verifies`, Verifier, `diff`, CI-Gate, Git-Hooks, shrink-only Baselines, technische Requirements mit `derived-from` | **Größter Hebel.** Heute nur Eigennutzung; nicht als Produktfeature für Nutzerprojekte verfügbar (an das `rotaris_core`-Package gekoppelt, Python-only, Epic 2300 `draft`) |
| 2 | Deterministische Orchestrierung (Hooks/Policies) | ❌ nur interner Observer-Seam | Folgt direkt aus P0-Lücke #4 |
| 3 | Verifier-gesteuerte Fertigstellung | 🟡 LLM-Klassifikator + Prompt-Phase, ReqToCode-Gate nur intern | Folgt direkt aus P0-Lücke #2; ReqToCode liefert den Evidenz-Typ „Requirement-Coverage“ bereits |
| 4 | Adaptive Modellwahl | 🟡 statisch + 429-Fallback | Bewusst nachgelagert — Infrastruktur (Tracking, Outcomes) entsteht mit dem Event-Store |
| 5 | Auditierbares Lernen | 🟡 `improvement/`-Modul + Improvement-Loop (Epic 1600, approved) sammelt Verbesserungen | Näher am Ziel als die meisten Wettbewerber; fehlend: Versionierung + Eval-Gate + Rollback für gelernte Skills |
| 6 | Reproduzierbare Umgebungen | ❌ | Bewusst nachgelagert (SetupBench-Problem ist real, aber nicht kaufentscheidend für die Kernzielgruppe) |
| 7 | Supervisor-Oberfläche („Mission Control“) | 🟡 Rotaris: Session-Browser, Agent-Monitor mit Baumnavigation, Worktree-Anzeige, Token-Panel | **Bereits heute ein USP:** das gesamte Vergleichsfeld ist Terminal-/IDE-first — eine native Desktop-Supervisor-App hat kein Wettbewerber. Ausbauen mit Requirement-Coverage-, Kosten-pro-Agent- und Diff-Konflikt-Sichten; die TUI bleibt sekundär (Wartungsmodus) |

**Schlüsselerkenntnis:** Rotaris muss die Differenzierung nicht erfinden — sie liegt in
Kandidat 1 + 3 + 7, und alle drei bauen auf demselben vorhandenen Fundament (ReqToCode +
ChildReportArtifact + Rotaris) auf. Die Kombination „Anforderung → Task → Codeänderung →
Test → Evidenz, sichtbar in einer Supervisor-UI“ hat kein Wettbewerber im Feld.

Daraus folgt eine Oberflächen-Strategie: **Rotaris ist die primäre, vermarktete
Oberfläche**; neue interaktive Features landen zuerst dort. Die Textual-TUI bleibt
sekundär im Wartungsmodus — TUI-only-Arbeit wird hinter P0/P1 zurückgestellt (siehe
[NOTE-marktreife-priorisierung.md](../requirements/NOTE-marktreife-priorisierung.md)).

---

## 5. Empfohlene Roadmap

Leitplanke: *schnell Marktreife* (Phase 1) *plus Abhebung* (Phase 2). Die Reihenfolge
innerhalb der Phasen ist Priorität.

### Phase 1 — Marktreife (P0-Lücken schließen)

1. **Permission-System: Allow/Ask/Deny** (Lücke #1a)
   Policy-Schicht vor jedem Tool-Dispatch: Kommando-Patterns für Terminal, Pfad-Scopes
   (auf `PathAuth` aufsetzen), Netz-Zugriff. Drei Modi (autonom/ask/restriktiv),
   konfigurierbar pro Persona und Workspace. Ask-Modus braucht UI-Flows in Rotaris/TUI —
   das Modal-Muster existiert bereits (`MessageLimitConfirmScreen`, SWR-912).
2. **Deterministischer Verifier** (Lücke #2)
   Konfigurierbare Check-Suite pro Workspace (Build/Test/Lint/Typecheck, Auto-Detection
   mit Override in `.rotaris/`). Läuft nach jeder Iteration mit Codeänderung; Ergebnis
   wird Pflichtfeld im `ChildReportArtifact` und hartes Gate im
   `completion_classifier`. Maximal n Reparaturversuche, dann Eskalation — genau das
   Policy-Beispiel der Recherche.
3. **Headless JSON-Event-Stream + minimales SDK** (Lücke #3)
   `rotaris-cli run --output-format stream-json`: Iteration-, Child-, Tool-, Verifier- und
   Kosten-Events seriell auf stdout. Dieselben Events als Python-Iterator im SDK.
   Kleinster Aufwand der vier Punkte, sofortiger CI-Nutzen.
4. **Sandbox-Ausführung** (Lücke #1b)
   Docker-basierte Terminal-Sandbox als Opt-in (SWR-2102 von `draft` zu `approved`
   entwickeln), langfristig Default für autonome Loops. Bis dahin: Ask-Modus als
   Pflicht-Default außerhalb einer Sandbox.
5. **Benutzerdefinierte Hooks** (Lücke #4)
   Pre/Post-Tool- und Lifecycle-Hooks (Shell-Kommandos + exit-code-Semantik), deklariert
   in der Workspace-Config. Baut auf dem Observer-Seam auf; zusammen mit 1. und 2. ergibt
   das die „deterministische Orchestrierung“ aus der Recherche fast geschenkt.

### Phase 2 — Differenzierung (auf Phase 1 aufbauend)

6. **ReqToCode produktisieren**
   Vom internen Werkzeug zum Feature: eigenständiges Paket/Subkommando ohne Kopplung an
   das `rotaris_core`-Package, Annotation-Konventionen pro Stack (SWR-2303 sieht
   Auto-Detection bereits vor), `rotaris-cli reqtocode init` für fremde Repos. Epic 2300
   von `draft` zu einem produktfähigen Schnitt weiterentwickeln.
7. **Evidence-gated Completion pro Akzeptanzkriterium**
   Verifier-Ergebnisse (Punkt 2) + `@verifies`-Coverage je SWR verknüpfen: Ein Task gilt
   erst als abgeschlossen, wenn jedes berührte Akzeptanzkriterium benannte Evidenz hat
   (Testlauf, Check, Review-Artefakt). Scope-Drift-Erkennung: Codeänderungen ohne
   Requirement-Bezug werden im Report ausgewiesen.
8. **Rotaris als Mission Control ausbauen**
   Ergänzende Sichten auf vorhandene Daten: Requirement-Coverage pro Session, Kosten pro
   Agent/Task, Diff-Überschneidungen paralleler Worktree-Sessions, wartende
   Ask-Entscheidungen. Kein neues Backend nötig — Daten kommen aus Punkten 1–3 und 6–7.
9. **Event-Store + Trajektorien-Export**
   Den JSON-Event-Stream (Punkt 3) persistieren und abfragbar machen: Session-Replay,
   Export für Evals. Fundament für spätere adaptive Modellwahl (Differenzierung #4) und
   auditierbares Lernen im Improvement-Loop (#5).

### Bewusst zurückgestellt

- **Adaptives Modell-Routing** — erst sinnvoll mit Event-Store-Historie (Punkt 9).
- **Reproduzierbare Umgebungen / Environment-Bootstrapping** — reales Problem
  (SetupBench), aber nicht kaufentscheidend; Worktree-Isolation deckt den häufigsten
  Fall (paralleles Arbeiten im selben Repo) bereits ab.
- **Remote-Plattform (Epic 2200, `draft`)** — Web/PWA/Push erst nach Phase 1; ein
  unsicherer Harness wird durch Remote-Zugriff nur riskanter.
- **Mehr Subagenten-Mechanik** — die Recherche warnt explizit: unkontrollierter Schwarm
  ist Kosten-, keine Wertquelle. Der Delegations-DAG mit Tiefen-/Fan-out-Limits ist
  bereits auf dem richtigen Kontrollniveau.

---

## 6. Fazit

Die Marktposition lässt sich in einem Satz fassen, der direkt an die Empfehlung der
Recherche anschließt:

> **Rotaris ist der requirements- und evidence-native Agentic-Development-Harness:
> Änderungen werden nachvollziehbar aus Anforderungen abgeleitet, gegen überprüfbare
> Kriterien validiert und behalten vollständige Traceability über Agenten, Code und
> Tests — sichtbar und steuerbar in einer Desktop-Mission-Control.**

Kein Wettbewerber im untersuchten Feld besetzt diese Position. Die Voraussetzung dafür
ist allerdings, dass die vier P0-Lücken (Permissions/Sandbox, deterministischer
Verifier, JSON-Event-Stream/SDK, Hooks) geschlossen werden — sie sind 2026
Basisausstattung, und ohne sie wird der USP nie evaluiert, weil das Produkt die
Eintrittskriterien der Zielgruppe nicht erfüllt.
