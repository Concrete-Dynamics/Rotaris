# Rotaris Requirement Management & Agentic Delivery — Zielbild

## 1. Vision

Rotaris soll Anforderungen nicht nur dokumentieren oder mit Code verknüpfen, sondern sie als aktiv verwaltbare, ausführbare und dauerhaft überprüfbare Einheiten des Softwareentwicklungsprozesses behandeln.

Der Nutzer erhält im Rotaris User Interface einen eigenen Bereich für Requirements. Dort sieht er Anforderungen aus seinem Projekt, kann sie verwalten, priorisieren, verändern und in einen agentischen Entwicklungsprozess überführen. Rotaris übernimmt anschließend die technische Umsetzung in isolierten Workspaces, verfolgt die Verbindung zwischen Requirement, Implementierung und Tests und erkennt automatisch, wenn eine bereits umgesetzte Anforderung durch spätere Änderungen wieder Arbeit erzeugt.

Damit entsteht ein geschlossener Kreislauf:

```text
Requirement
    ↓
Planning / Decomposition
    ↓
Agentic Implementation
    ↓
Code + Tests
    ↓
Traceability + Verification
    ↓
Done
    ↓
Requirement changes
    ↓
Impact Analysis
    ↓
Needs Update
    ↓
Agentic Re-Implementation
```

Die zentrale Idee ist, dass Requirements nicht außerhalb der Softwareentwicklung existieren, sondern ein dauerhaft mit der tatsächlichen Codebasis verbundenes Steuerungsmodell darstellen.

---

# 2. Grundprinzipien

## 2.1 Intern einheitlich, extern flexibel

Rotaris darf nicht voraussetzen, dass jedes Projekt seine Requirements im gleichen Format organisiert.

Ein Projekt kann Anforderungen beispielsweise enthalten als:

- Markdown-Dateien
- YAML- oder JSON-Spezifikationen
- strukturierte Spezifikationsdokumente
- Epics und einzelne Requirements
- Gherkin
- GitHub Issues
- externe Issue- oder Requirement-Systeme
- projektspezifische Eigenformate

Rotaris normalisiert diese Quellen auf ein internes, einheitliches Requirement-Modell.

```text
Customer Requirement Source
        ↓
Requirement Source Adapter
        ↓
Canonical Rotaris Requirement Model
        ↓
UI / ReqToCode / Agents / Verification
```

Dadurch bleibt die bestehende Arbeitsweise des Nutzers erhalten, während Rotaris intern zuverlässig mit Requirements arbeiten kann.

---

## 2.2 Das Requirement bleibt die fachliche Wahrheit

Ein Requirement beschreibt, was das System leisten soll.

Es darf nicht danach strukturiert werden müssen, wie groß oder klein ein Agenten-Run sein sollte.

Deshalb werden fachliche Requirements und ausführbare Arbeitseinheiten voneinander getrennt.

```text
Requirement
    ↓ 0..n
Execution Units
    ↓ 0..n
Runs
    ↓
Worktrees / Branches / Commits
```

Ein kleines Requirement kann genau eine Execution Unit erzeugen.

Ein großes Requirement oder Epic kann dagegen in mehrere Execution Units zerlegt werden, ohne dass dadurch künstlich mehrere fachliche Requirements entstehen.

---

## 2.3 Traceability ist ein Produktzustand

Traceability soll nicht lediglich ein Report oder ein technischer Check sein.

Sie wird Bestandteil des Requirement-Zustands.

Für jedes Requirement kann Rotaris jederzeit beantworten:

- Welche Codestellen implementieren es?
- Welche Tests verifizieren es?
- Sind diese Tests erfolgreich?
- Welche Requirement-Version wurde umgesetzt?
- Welcher Run hat sie umgesetzt?
- Welcher Worktree und Branch gehörten dazu?
- Ist die aktuelle Spezifikation noch dieselbe wie bei der letzten erfolgreichen Umsetzung?
- Wurde die Requirement-Implementierung inzwischen durch andere Änderungen möglicherweise ungültig?

ReqToCode bildet dafür die technische Grundlage. Requirements werden bereits strukturiert eingelesen, mit stabilen IDs und Content Hashes versehen und mit Implementation- sowie Test-Referenzen verbunden. 

---

# 3. Requirement-Domänenmodell

Rotaris unterscheidet mehrere voneinander unabhängige Dimensionen.

## 3.1 Requirement Lifecycle

Der Lifecycle beschreibt die fachliche Existenz einer Anforderung.

```text
draft
approved
deprecated
```

### draft

Die Anforderung existiert, ist aber noch nicht als vollständig umgesetzt und verbindlich bestätigt.

### approved

Die Anforderung ist gültig und wurde umgesetzt beziehungsweise soll als verbindlich umgesetzt gelten.

### deprecated

Die Anforderung ist nicht mehr der aktuelle Sollzustand.

Sie bleibt aus Gründen der Historie, Traceability und ID-Stabilität erhalten.

Dieses Lifecycle-Modell entspricht dem bestehenden ReqToCode-Modell. 

---

# 4. Delivery State

Der Delivery State beschreibt, wo sich ein Requirement im agentischen Entwicklungsprozess befindet.

Er ist vollständig getrennt vom fachlichen Requirement Lifecycle.

Empfohlenes finales Zustandsmodell:

```text
Backlog
Ready
Running
Review
Needs Update
Blocked
Done
```

## Backlog

Das Requirement ist bekannt, soll aber aktuell nicht agentisch umgesetzt werden.

## Ready

Das Requirement ist zur Umsetzung freigegeben.

Der Übergang nach `Ready` bedeutet:

> Rotaris darf die Requirement-Umsetzung vorbereiten und ausführen.

## Running

Mindestens eine Execution Unit des Requirements befindet sich in aktiver agentischer Bearbeitung.

## Review

Die agentische Arbeit wurde abgeschlossen, muss aber noch ausgewertet, integriert oder vom Nutzer geprüft werden.

## Needs Update

Das Requirement war bereits umgesetzt, aber die aktuelle Spezifikation stimmt nicht mehr mit der zuletzt erfolgreich implementierten Requirement-Version überein.

Dieser Zustand ist insbesondere für nachträglich veränderte Requirements vorgesehen.

## Blocked

Rotaris kann die Umsetzung aktuell nicht sinnvoll fortsetzen.

Mögliche Gründe:

- Requirement ist widersprüchlich.
- Abhängigkeit fehlt.
- Requirement muss zerlegt werden.
- Agent benötigt Nutzerentscheidung.
- Merge oder Integration ist blockiert.
- Test- oder Build-Infrastruktur verhindert Fortschritt.
- Requirement-Quelle kann nicht zuverlässig interpretiert werden.

## Done

Die aktuelle Requirement-Version gilt als umgesetzt und verifiziert.

`Done` bezieht sich immer auf eine konkrete Requirement-Version.

---

# 5. Requirement-Version und Satisfied Hash

ReqToCode berechnet bereits einen Content Hash für Requirements. Dieser Mechanismus wird zu einem zentralen Bestandteil des Requirement Managements. 

Für jedes Requirement unterscheidet Rotaris mindestens:

```text
current_hash
satisfied_hash
```

### current_hash

Hash der aktuell gültigen Requirement-Spezifikation.

### satisfied_hash

Hash der Requirement-Version, deren Umsetzung zuletzt erfolgreich abgeschlossen und akzeptiert wurde.

Damit gilt:

```text
current_hash == satisfied_hash
→ Umsetzung entspricht der aktuellen Requirement-Version
```

```text
current_hash != satisfied_hash
→ Requirement muss neu bewertet werden
```

Ein Requirement, das vorher `Done` war und danach verändert wird, wird deshalb nicht wieder zu einem unbekannten Backlog-Item.

Es wechselt zu:

```text
Done
 ↓ Requirement changed
Needs Update
```

Damit bleibt sichtbar:

> Dieses Requirement wurde bereits umgesetzt, aber die Spezifikation hat sich anschließend geändert.

---

# 6. Requirement Change Detection

Der bestehende ReqToCode-Diff erkennt bereits:

- added
- removed
- modified
- status changed

und kann zusätzlich erkennen, wenn eine Requirement-Spezifikation verändert wurde, ohne dass die bisher zugeordneten Code- oder Teststellen angepasst wurden. 

Diese Funktion wird Teil des dauerhaften Requirement Managements.

Rotaris überwacht die Requirement-Quellen beziehungsweise wertet sie bei relevanten Repository-Änderungen erneut aus.

Bei einer Änderung wird nicht sofort davon ausgegangen, dass Code geändert werden muss.

Stattdessen erfolgt eine Impact Analysis.

---

# 7. Agentische Impact Analysis

Eine Textänderung an einem Requirement bedeutet nicht automatisch eine Verhaltensänderung.

Beispielsweise können sich ändern:

- Rechtschreibung
- Formulierung
- zusätzliche Dokumentation
- Akzeptanzkriterien
- funktionales Verhalten
- Edge Cases
- technische Einschränkungen
- Testanforderungen

Deshalb führt Rotaris bei Änderungen eines bereits umgesetzten Requirements eine Impact Analysis durch.

Mögliche Ergebnisse:

```text
No behavioral impact
Tests affected
Implementation affected
Implementation and tests affected
Requirement decomposition required
Human clarification required
```

### No behavioral impact

Die Änderung verändert das geforderte Verhalten nicht.

Rotaris kann die vorhandene Implementierung erneut verifizieren und anschließend den neuen Hash als `satisfied_hash` übernehmen.

### Tests affected

Das Verhalten bleibt im Wesentlichen bestehen, aber Testanforderungen oder Akzeptanzkriterien wurden verändert.

Es wird eine entsprechende Execution Unit erzeugt.

### Implementation affected

Code muss angepasst werden.

Das Requirement wird wieder ausführbar.

### Implementation and tests affected

Code und Verifikation müssen aktualisiert werden.

### Requirement decomposition required

Die neue Requirement-Version ist zu groß oder enthält mehrere unabhängig ausführbare Teile.

Rotaris erzeugt mehrere Execution Units.

### Human clarification required

Die Änderung ist nicht ausreichend eindeutig, enthält einen Widerspruch oder erfordert eine Produktentscheidung.

Das Requirement wechselt auf `Blocked`.

---

# 8. Requirement Source Adapter

Rotaris verwendet einen Adapter-Layer für unterschiedliche Requirement-Quellen.

Ein Source Adapter besitzt konzeptionell Funktionen wie:

```text
discover()
read()
revision()
```

Optional:

```text
create()
update()
delete()
```

Damit können Adapter unterschiedliche Fähigkeiten besitzen.

Beispielsweise:

```text
Markdown Adapter
read/write

Jira Adapter
read/write

Legacy Specification Adapter
read-only
```

Die UI zeigt dem Nutzer die Fähigkeiten der aktuellen Requirement-Quelle an.

---

# 9. Agent-assisted Adapter Discovery

Für unbekannte Requirement-Strukturen kann Rotaris einen Discovery-Agenten einsetzen.

Der Ablauf:

```text
Unknown requirement structure
        ↓
Repository analysis
        ↓
Requirement source detected
        ↓
Proposed mapping
        ↓
Validation
        ↓
Persisted adapter configuration
```

Der Agent soll möglichst zuerst einen deklarativen Adapter erzeugen.

Beispiel:

```json
{
  "type": "markdown",
  "glob": "specs/**/*.md",
  "id": "frontmatter.id",
  "title": "heading",
  "status": "frontmatter.state"
}
```

Nur wenn eine deklarative Abbildung nicht möglich ist, wird ein programmatischer Adapter benötigt.

Der erzeugte Adapter wird anschließend persistent und deterministisch verwendet.

Es wird nicht bei jedem Start erneut ein improvisiertes Agenten-Skript erzeugt.

---

# 10. Canonical Requirement Model

Unabhängig von der Originalquelle arbeitet Rotaris intern mit einem kanonischen Modell.

Ein Requirement enthält konzeptionell unter anderem:

```text
Requirement
- id
- title
- description
- lifecycle
- source
- source_path
- current_hash
- satisfied_hash
- type
- parent
- children
- relations
- trace obligations
- test obligations
- delivery state
- evidence health
- execution history
```

Die Originalquelle bleibt dabei führend.

Rotaris muss jederzeit nachvollziehen können, woher ein Requirement stammt.

---

# 11. Requirements und Epics

Rotaris unterstützt hierarchische Requirement-Strukturen.

Beispielsweise:

```text
Epic
 ├── Requirement A
 ├── Requirement B
 └── Requirement C
```

Ein Epic kann in der UI ebenfalls als Karte oder gruppierendes Element dargestellt werden.

Der Umsetzungsfortschritt eines Epics wird aus seinen untergeordneten Requirements berechnet.

Ein Epic muss nicht als ein einzelner Agenten-Run umgesetzt werden.

---

# 12. Execution Units

Eine Execution Unit ist eine von Rotaris erzeugte ausführbare Arbeitseinheit.

Sie gehört immer zu einem fachlichen Requirement.

Beispiel:

```text
Requirement SWR-4102
"Offline synchronization"

Execution Units:
- EU-1 Data model
- EU-2 Synchronization engine
- EU-3 Conflict resolution
- EU-4 UI integration
- EU-5 Test portfolio
```

Die Execution Units sind Arbeitsartefakte von Rotaris.

Sie verändern nicht automatisch die fachliche Requirement-Struktur.

---

# 13. Automatische Requirement-Zerlegung

Rotaris kann erkennen, dass ein Requirement nicht sinnvoll in einem Agentenlauf umgesetzt werden sollte.

Dabei werden berücksichtigt:

- Umfang der betroffenen Komponenten
- Anzahl unabhängiger Änderungen
- technische Abhängigkeiten
- erwartete Testoberfläche
- Architekturgrenzen
- Kontextgröße
- Parallelisierbarkeit
- mögliche Merge-Konflikte

Der Agent erzeugt daraus einen Decomposition Plan.

Dieser enthält:

```text
Requirement
 ├── Execution Unit A
 ├── Execution Unit B
 ├── Execution Unit C
 └── Execution Unit D
```

Execution Units können Abhängigkeiten besitzen:

```text
A → B
A → C
B + C → D
```

Rotaris kann unabhängige Units parallel ausführen.

---

# 14. Technische Requirements

Wenn während einer Umsetzung echte neue technische Verpflichtungen entstehen, können daraus eigene technische Requirements entstehen.

Dies ist zu unterscheiden von reinen Execution Units.

Rotaris unterstützt bereits technische Requirements mit `type: technical` und `derived-from`. 

Beispiel:

```text
Product Requirement
SWR-4102 Offline synchronization

Derived Technical Requirement
SWR-4121 Deterministic merge journal
derived-from: SWR-4102
```

Ein technisches Requirement ist eine echte, dauerhaft nachvollziehbare Requirement-Entität.

Eine Execution Unit dagegen ist lediglich eine Umsetzungsaufteilung.

---

# 15. Agentic Requirement Flow

Wenn ein Nutzer ein Requirement nach `Ready` verschiebt, startet der vollständige agentische Flow.

```text
Ready
 ↓
Requirement snapshot
 ↓
Impact / scope analysis
 ↓
Decomposition if required
 ↓
Execution Unit creation
 ↓
Worktree creation
 ↓
Agent run
 ↓
Implementation
 ↓
Tests
 ↓
ReqToCode verification
 ↓
Review
 ↓
Integration
 ↓
Done
```

---

# 16. Requirement Snapshot

Jeder Agentenlauf arbeitet gegen eine konkrete Requirement-Version.

Beim Start werden mindestens gespeichert:

```text
requirement_id
requirement_hash
source_revision
base_commit
execution_unit_id
session_id
```

Wenn das Requirement während des Runs geändert wird, arbeitet der Run weiterhin gegen den ursprünglichen Snapshot.

Der Run darf anschließend nicht automatisch die neue Requirement-Version auf `Done` setzen.

Stattdessen erkennt Rotaris:

```text
run_requirement_hash != current_requirement_hash
```

und markiert die Karte beispielsweise als:

```text
Review
Specification changed during execution
```

Anschließend erfolgt eine neue Impact Analysis.

---

# 17. Worktree Isolation

Jede agentische Umsetzung findet in einem isolierten Git Worktree statt.

Rotaris besitzt bereits Infrastruktur für session-spezifische Worktrees sowie konfliktfreie Branch-Namen. 

Konzeptionell:

```text
Requirement
    ↓
Execution Unit
    ↓
Session
    ↓
Worktree
    ↓
Branch
```

Beispielsweise:

```text
rotaris/req/SWR-4102/eu-01
```

oder:

```text
rotaris/req/SWR-4102/abc123
```

Die genaue Branch-Namensstrategie ist konfigurierbar.

---

# 18. Parallelisierung

Mehrere unabhängige Requirements beziehungsweise Execution Units können parallel ausgeführt werden.

Rotaris besitzt bereits eine Run-Koordination für mehrere unabhängige Sessions. 

Dadurch kann das Requirement Board gleichzeitig darstellen:

```text
SWR-4102 → running
SWR-4108 → running
SWR-4110 → review
SWR-4111 → ready
```

Jeder Run besitzt einen eigenen isolierten Arbeitsbereich.

---

# 19. Integration mehrerer Execution Units

Wenn mehrere Execution Units zum selben Requirement gehören, müssen deren Ergebnisse kontrolliert zusammengeführt werden.

Rotaris besitzt bereits eine agentengestützte Worktree-Integration, bei der mehrere Session-Branches in einem separaten Integrations-Worktree zusammengeführt und erst anschließend auf die Basis übernommen werden. 

Dieser Mechanismus kann für Requirement-basierte Multi-Run-Umsetzungen verwendet werden.

```text
EU-1 branch ─┐
EU-2 branch ─┼→ Integration Worktree → Verification → Requirement branch/base
EU-3 branch ─┘
```

---

# 20. ReqToCode als Requirement Runtime

ReqToCode wird zum technischen Rückgrat des gesamten Systems.

Es übernimmt:

- Requirement Parsing
- stabile IDs
- Requirement Hashing
- Traceability
- Implementation References
- Test References
- Drift Detection
- Requirement Diff
- Lifecycle Checks
- Orphan Code Detection
- Orphan Test Detection
- Verification

Der bestehende Verifier trennt Implementation Traces bereits von Test Coverage und liefert konkrete Referenzstellen zurück. 

Die UI arbeitet auf diesen strukturierten Informationen.

Sie parst keine CLI-Ausgabe.

---

# 21. Evidence Model

Ein Requirement besitzt mehrere erwartete Evidenztypen.

Beispielsweise:

```text
Implementation Evidence
Test Evidence
Verification Evidence
Execution Evidence
Integration Evidence
```

Je nach Requirement können unterschiedliche Evidenzen verpflichtend sein.

---

# 22. Traceability Ring

Auf jeder Requirement-Karte befindet sich eine kompakte Visualisierung der Evidence Health.

Die Darstellung sollte keine bloße Anzahl von `@traces` oder Tests messen.

Stattdessen werden erwartete Verpflichtungen dargestellt.

Beispiel:

```text
Implementation trace     satisfied
Test trace               satisfied
Latest verification      failed
```

Der Ring kann daraus segmentiert werden.

Empfohlene Bedeutung:

```text
Green
Evidence vorhanden und erfolgreich verifiziert

Orange
Evidence vorhanden, aber veraltet, ungeprüft oder stale

Red
Verifikation schlägt fehl

Grey / Empty
Erwartete Evidence fehlt oder ist nicht erforderlich
```

Damit kann ein Requirement vollständige Traceability besitzen, aber trotzdem rot anzeigen, wenn seine Tests fehlschlagen.

---

# 23. Evidence Details

Ein Klick auf den Ring öffnet die Evidence-Ansicht.

Beispielsweise:

```text
Implementation
✓ src/auth/service.py:84
✓ src/auth/session.py:121

Tests
✓ tests/auth/test_login.py:44
✕ tests/e2e/test_auth_flow.py:92

Verification
Last run: failed
Commit: 18fa23b
Requirement hash: 83af...
```

Damit ist Traceability nicht nur eine abstrakte Kennzahl, sondern direkt navigierbar.

---

# 24. Requirement Relations

Requirements können Beziehungen zu anderen Requirements besitzen.

Das Modell sollte mindestens unterstützen:

```text
parent
derived-from
supersedes
depends-on
```

Optional beziehungsweise langfristig:

```text
refines
conflicts-with
related-to
```

---

# 25. Superseding

Wenn ein neues Requirement ein bestehendes ersetzt, wird das alte Requirement nicht gelöscht.

Beispiel:

```text
SWR-1421
Old authentication flow

SWR-1537
Unified authentication flow
supersedes: SWR-1421
```

Das alte Requirement erhält fachlich den Lifecycle:

```text
deprecated
```

Die Reverse-Beziehung wird berechnet:

```text
SWR-1421
superseded-by: SWR-1537
```

Die Source of Truth sollte nur auf einer Seite gespeichert werden.

Beispielsweise:

```yaml
supersedes: SWR-1421
```

Mehrere Requirements können ersetzt werden:

```yaml
supersedes:
  - SWR-1421
  - SWR-1422
  - SWR-1428
```

---

# 26. Agentisches Superseding

Superseding bedeutet nicht nur, dass ein Requirement historisch markiert wird.

Rotaris muss die bestehenden Implementation- und Test-Referenzen des ersetzten Requirements analysieren.

```text
New Requirement
      ↓
supersedes
      ↓
Old Requirement
      ↓
Existing traces and tests
      ↓
Migration worklist
```

Der Agent muss entscheiden, welche bestehende Implementierung:

- entfernt,
- angepasst,
- übernommen,
- migriert,
- neu zugeordnet

werden muss.

Damit wird Superseding zu einem expliziten Change-Propagation-Mechanismus.

---

# 27. Requirement Removal

Wird ein Requirement vollständig entfernt, muss Rotaris weiterhin erkennen können, dass seine ID existiert hat.

IDs dürfen nie wieder verwendet werden.

ReqToCode sieht dafür bereits ein Tombstone-Konzept für entfernte IDs vor. 

Ein Entfernen erzeugt außerdem eine Impact Analysis auf vorhandene:

- Code Traces
- Test Traces
- technische Requirements
- Abhängigkeiten
- Superseding-Beziehungen

---

# 28. Requirement Board

Der zentrale UI-Bereich wird ein eigener Menüpunkt:

```text
Overview
Workspace
Mission
Requirements
Git
Library
Settings
```

Die bestehende Rotaris UI verwendet bereits getrennte Views in einer zentralen View-Navigation, wodurch sich der Requirements-Bereich konzeptionell sauber ergänzen lässt. 

---

# 29. Kanban View

Die primäre Darstellung ist ein Kanban-ähnliches Board.

```text
┌ Backlog ─┬ Ready ─┬ Running ─┬ Review ─┬ Needs Update ─┬ Done ─┐
│          │         │          │         │                │      │
│ SWR-401  │ SWR-420 │ SWR-433  │ SWR-428 │ SWR-390        │ ...  │
│          │         │          │         │                │      │
└──────────┴─────────┴──────────┴─────────┴────────────────┴──────┘
```

`Blocked` kann entweder eine eigene Spalte sein oder als klar hervorgehobener Sonderzustand erscheinen.

---

# 30. Drag-and-Drop als Workflow-Aktion

Das Verschieben einer Karte ist eine fachliche Aktion.

Beispiel:

```text
Backlog → Ready
```

bedeutet:

> Requirement zur agentischen Umsetzung freigeben.

```text
Needs Update → Ready
```

bedeutet:

> Geänderte Requirement-Version erneut umsetzen.

```text
Review → Done
```

bedeutet:

> Ergebnis akzeptieren, sofern alle verpflichtenden Gates erfüllt sind.

Ein Drop kann also technische Aktionen auslösen.

---

# 31. Requirement Card

Eine Karte zeigt nur die wichtigsten Informationen:

```text
SWR-4102
Offline synchronization

APPROVED
NEEDS UPDATE

◕ Traceability

2 execution units
Last run: 18 min ago

Specification changed
```

Mögliche zusätzliche Informationen:

- Priority
- Parent Epic
- Dependency
- Run Activity
- Blocker
- Assigned Agent
- Last Changed
- Test Health

---

# 32. Requirement Detail View

Ein Klick auf eine Karte öffnet einen Detail Drawer oder eine Detailseite.

Diese enthält:

## Requirement

- ID
- Titel
- Beschreibung
- Requirement Source
- aktueller Hash
- Lifecycle
- Delivery State

## Relations

- Parent Epic
- Children
- Derived Requirements
- Supersedes
- Superseded By
- Dependencies

## Execution

- Execution Units
- aktive Runs
- vergangene Runs
- Worktrees
- Branches
- Commits

## Traceability

- Implementation Sites
- Test Sites
- fehlende Evidenzen
- stale Evidenzen

## Verification

- Test Results
- Build Results
- ReqToCode Result
- letzte erfolgreiche Verifikation

## History

- Requirement revisions
- frühere satisfied hashes
- Runs pro Version
- Superseding-Historie

---

# 33. Requirement Editing

Kann der verwendete Source Adapter schreiben, können Requirements direkt in Rotaris bearbeitet werden.

Rotaris schreibt die Änderungen anschließend in die ursprüngliche Requirement-Quelle zurück.

Wenn der Adapter read-only ist, zeigt Rotaris:

```text
Source is read-only
```

und ermöglicht stattdessen die Navigation zur Originalquelle.

---

# 34. Requirement Creation

Neue Requirements können über Rotaris erstellt werden.

Dabei berücksichtigt Rotaris:

- bestehende Requirement-Struktur
- ID-Konvention
- Parent Epic
- Source Adapter
- Requirement Template
- technische beziehungsweise Produkt-Requirement-Klassifikation

Falls das Quellformat projektspezifisch ist, erzeugt der Adapter das passende native Artefakt.

---

# 35. Requirement History

Rotaris führt keine zweite fachliche Wahrheit neben Git oder der ursprünglichen Requirement-Quelle.

Die Requirement-Historie wird aus:

- Source revisions
- Git commits
- Requirement hashes
- Run metadata

zusammengeführt.

Zusätzlich speichert Rotaris operative Metadaten wie:

```text
satisfied_hash
last_successful_run
last_verified_commit
delivery_state
execution history
```

---

# 36. Requirement Revision History

Die UI kann beispielsweise darstellen:

```text
SWR-4102

Revision A
hash: 100a
implemented by run 72
commit: a34fd1
Done

Revision B
hash: 204b
implemented by run 88
commit: c720ac
Done

Revision C
hash: 331c
current
Needs Update
```

Damit ist sichtbar, welche Version der Spezifikation zu welcher Implementierung geführt hat.

---

# 37. Requirement-to-Code-to-Test Graph

Zusätzlich zum Kanban kann Rotaris eine graphische Traceability-Ansicht anbieten.

```text
Requirement
 ├── Implementation A
 ├── Implementation B
 ├── Test A
 ├── Test B
 └── Technical Requirement C
```

Über Relationen entsteht ein größerer Graph:

```text
Epic
 ↓
Product Requirement
 ↓
Technical Requirement
 ↓
Code
 ↓
Tests
```

Diese Ansicht eignet sich insbesondere für:

- Impact Analysis
- Audits
- Reviews
- große Codebasen
- Legacy-Systeme

---

# 38. Done-Semantik

Ein Requirement darf nur `Done` sein, wenn die für dieses Requirement geltenden Abschlussbedingungen erfüllt sind.

Dazu können gehören:

```text
Agent execution completed
Required implementation traces exist
Required tests exist
Required tests pass
ReqToCode verifier passes
Integration completed
Current hash equals satisfied hash
No unresolved blockers
```

Ein Requirement kann daher beispielsweise fachlich `approved` sein, aber operativ `Needs Update`.

---

# 39. Stale Evidence

Auch ohne Requirement-Änderung kann Evidence veralten.

Beispielsweise:

- Implementierung wurde später verändert.
- Test wurde entfernt.
- Test schlägt nach einer anderen Änderung fehl.
- Trace wurde verschoben.
- Dependency wurde geändert.

Deshalb unterscheidet Rotaris:

```text
Requirement freshness
Evidence freshness
Verification health
```

Das System sollte nicht ausschließlich auf Requirement-Hash-Änderungen reagieren.

---

# 40. Continuous Traceability Evaluation

Bei relevanten Repository-Ereignissen aktualisiert Rotaris die Requirement-Evidence.

Beispielsweise bei:

- Commit
- Merge
- Requirement Edit
- Test Run
- Agent Run Completion
- Worktree Integration
- Branch Switch
- Repository Refresh

Dadurch bleibt das Board synchron mit dem tatsächlichen Repository-Zustand.

---

# 41. Requirement Health

Aus Lifecycle, Delivery und Evidence ergibt sich eine kompakte Requirement Health.

Beispielsweise:

```text
Healthy
Needs Update
Incomplete Traceability
Verification Failed
Blocked
Superseded
Deprecated
```

Diese Health ist eine abgeleitete Darstellung.

Sie ersetzt nicht die zugrunde liegenden Zustände.

---

# 42. Agent Context

Ein Requirement-Agent erhält einen strukturierten Kontext.

Mindestens:

```text
Requirement snapshot
Requirement relations
Current implementation traces
Current tests
ReqToCode findings
Relevant architecture context
Execution unit
Base revision
Worktree information
Acceptance conditions
```

Bei einem geänderten Requirement zusätzlich:

```text
Old requirement version
New requirement version
Requirement diff
Affected traces
Affected tests
```

Bei Superseding zusätzlich:

```text
Superseded requirements
Existing traces of superseded requirements
Migration obligations
```

---

# 43. Agent Completion Contract

Ein Agent darf eine Execution Unit nicht allein deshalb als erfolgreich melden, weil Code geschrieben wurde.

Die Completion Conditions umfassen:

- gewünschte Änderung implementiert
- relevante Tests aktualisiert
- Tests ausgeführt
- ReqToCode aktualisiert
- Traceability hergestellt
- Worktree sauber
- Änderungen nachvollziehbar
- kein bekannter Requirement Drift

Der Agent liefert anschließend ein strukturiertes Resultat an Rotaris zurück.

---

# 44. Review

Die Review-Phase zeigt dem Nutzer:

```text
Requirement
Execution Units
Changed Files
Traceability changes
Test results
Agent summary
Potential risks
Branch / worktree
```

Der Nutzer kann:

- akzeptieren
- erneut ausführen
- Agenten nacharbeiten lassen
- Requirement ändern
- Integration ablehnen
- Worktree behalten

---

# 45. Human-in-the-Loop

Rotaris soll möglichst autonom arbeiten, aber Entscheidungen mit echter Produktbedeutung nicht stillschweigend treffen.

Beispiele für erforderliche Nutzerinteraktion:

- widersprüchliche Requirements
- unklarer Scope
- konkurrierende Requirements
- Breaking Changes
- unklare Superseding-Beziehung
- riskante Migration
- nicht entscheidbare Architekturentscheidung

Solche Requirements wechseln auf `Blocked` oder `Review`.

---

# 46. Konflikte zwischen Requirements

Wenn zwei gültige Requirements sich widersprechen, darf der Agent nicht einfach eines auswählen.

Rotaris erkennt oder markiert:

```text
conflicts-with
```

und zeigt den Konflikt als Blocker.

Der Nutzer entscheidet, welches Requirement geändert, deprecated oder superseded werden soll.

---

# 47. Dependency Management

Requirements beziehungsweise Execution Units können voneinander abhängen.

Beispiel:

```text
SWR-4201
depends-on: SWR-4102
```

Rotaris kann dadurch verhindern, dass ein abhängiges Requirement vorzeitig ausgeführt wird.

Im Board erscheint:

```text
Blocked by SWR-4102
```

Nach Abschluss der Dependency kann es automatisch ausführbar werden.

---

# 48. Epic Progress

Ein Epic aggregiert:

- Anzahl Requirements
- Delivery States
- Traceability Health
- Verification Health
- aktive Runs
- Blocker

Beispielsweise:

```text
Authentication Epic

12 Requirements

8 Done
2 Running
1 Needs Update
1 Blocked

Traceability 92 %
```

---

# 49. Priorisierung

Requirements können über bestehende Metadaten oder eine Rotaris-Projektion priorisiert werden.

Beispielsweise:

```text
Critical
High
Normal
Low
```

Diese Priorität kann beeinflussen:

- Board Sorting
- automatische Scheduling-Reihenfolge
- Agent Capacity
- Parallelisierung

Sie verändert jedoch nicht die fachliche Requirement-Semantik.

---

# 50. Agent Scheduling

Rotaris kann mehrere `Ready` Requirements automatisch nacheinander oder parallel verarbeiten.

Dabei berücksichtigt der Scheduler:

- Dependencies
- verfügbare Agenten
- Worktree-Konflikte
- Dateikonfliktwahrscheinlichkeit
- Requirement-Priorität
- Execution-Unit-Abhängigkeiten
- Ressourcenlimits

Damit kann aus dem Requirement Board langfristig eine agentische Delivery Queue werden.

---

# 51. Auditierbarkeit

Für jedes Requirement muss vollständig nachvollziehbar sein:

```text
Wer oder was hat die Spezifikation geändert?
Wann wurde sie geändert?
Welche Requirement-Version wurde umgesetzt?
Welcher Agenten-Run hat sie umgesetzt?
Welche Dateien wurden verändert?
Welche Tests verifizieren sie?
Wann wurde sie zuletzt erfolgreich geprüft?
Welcher Commit entspricht dem satisfied_hash?
Welche Requirements wurden dadurch ersetzt?
```

Diese Auditierbarkeit ist ein wesentlicher Vorteil gegenüber klassischem Task Management.

---

# 52. Kein zweites Jira

Der Requirements-Bereich soll kein generischer Projektmanagement-Klon werden.

Der Mehrwert entsteht aus der direkten Verbindung:

```text
Requirement
↔ Code
↔ Tests
↔ Agent Runs
↔ Git
```

Planung ist nur dort Bestandteil des Produkts, wo sie die Softwareumsetzung steuert.

---

# 53. Kein zweites Requirement Repository

Rotaris soll Anforderungen nicht zwangsläufig in eine eigene proprietäre Datenbank verschieben.

Die vorhandene Requirement-Quelle bleibt führend.

Rotaris baut darüber:

- Normalisierung
- Delivery State
- Execution
- Traceability
- Verification
- Historie

---

# 54. Bestehende Rotaris-Architektur als Grundlage

Das Zielbild kann auf vorhandenen Komponenten aufbauen.

Bereits vorhanden sind unter anderem:

- strukturierter ReqToCode Requirement Store
- Requirement Content Hashes
- Implementation- und Test-Traceability
- Requirement Diff und Drift Detection
- konfigurierbare Repository Layouts
- mehrere parallele Runs
- Session-basierte Worktrees
- konfliktfreie Branch-Erzeugung
- agentische Integration mehrerer Worktrees

Damit ist das Feature konzeptionell eine neue Orchestrierungs- und Projektionsschicht über bereits vorhandenen Kernmechanismen und kein vollständig separater Entwicklungsworkflow.  

---

# 55. Gesamtmodell

Das vollständige Zielmodell lässt sich folgendermaßen zusammenfassen:

```text
                 ┌────────────────────────┐
                 │ Requirement Source     │
                 │ Markdown / Jira / ...  │
                 └───────────┬────────────┘
                             │
                    Source Adapter
                             │
                             ▼
                 ┌────────────────────────┐
                 │ Canonical Requirement  │
                 └───────────┬────────────┘
                             │
          ┌──────────────────┼────────────────────┐
          │                  │                    │
          ▼                  ▼                    ▼
     ReqToCode          Requirement UI       Relations
          │                  │                    │
          │                  ▼                    │
          │            Delivery State             │
          │                  │                    │
          │                  ▼                    │
          │             Execution Plan            │
          │                  │                    │
          │          ┌───────┴────────┐           │
          │          ▼                ▼           │
          │     Execution Unit   Execution Unit    │
          │          │                │           │
          │          ▼                ▼           │
          │        Run              Run           │
          │          │                │           │
          │          ▼                ▼           │
          │      Worktree         Worktree        │
          │          └───────┬────────┘           │
          │                  ▼                    │
          │          Integration Worktree         │
          │                  │                    │
          └──────────────────┼────────────────────┘
                             ▼
                    Verification
                             │
                             ▼
                    Evidence Health
                             │
                             ▼
                            Done
                             │
                    Requirement changes
                             │
                             ▼
                       Needs Update
```

---

# 56. Produktziel

Das finale Produkt soll es einem Entwickler oder Team ermöglichen, eine Codebasis auf einer höheren Abstraktionsebene zu steuern.

Der Nutzer sagt nicht nur:

> „Ändere diese Datei.“

Er verwaltet:

> „Diese Anforderungen sollen gelten.“

Rotaris stellt anschließend dauerhaft sicher, dass zwischen diesen Anforderungen und der tatsächlichen Software eine nachvollziehbare, ausführbare und überprüfbare Verbindung besteht.

Ein Requirement wird dadurch zu einer langlebigen Steuerungseinheit für Softwareentwicklung:

```text
Specification
→ Planning
→ Agentic execution
→ Implementation
→ Verification
→ Traceability
→ Change propagation
```

Die eigentliche Vision ist damit ein **Requirement-driven Agentic Software Engineering System**:

Ein System, in dem Anforderungen nicht nur beschrieben werden, sondern den gesamten Lebenszyklus ihrer Umsetzung, Verifikation und späteren Weiterentwicklung steuern.