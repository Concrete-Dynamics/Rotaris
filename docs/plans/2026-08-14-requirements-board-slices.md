# Requirements Board — Lieferplan in sechs vertikalen Slices

Umsetzungsplan zum Zielbild
[2026-08-14-requirements-board.md](2026-08-14-requirements-board.md).

Das Zielbild beschreibt **was** entstehen soll. Dieses Dokument beschreibt, in
welcher Reihenfolge, in welchen Schnitten, mit welcher Dateihoheit und an
welchen Stellen ein Review erzwungen wird. Es ist der Vertrag zwischen den
Slices — nicht die Spezifikation. Die Spezifikation sind die Requirements.

Sprache: dieser Plan ist deutsch, der Requirement-Store bleibt englisch. Das ist
die bestehende Konvention des Repositories (`docs/plans/` gemischt,
`docs/requirements/` durchgehend englisch), nicht eine neue Entscheidung.

---

## 1. Schritt 1 ist abgeschlossen: der Requirement-Bestand

Das Zielbild ist vollständig in den Requirement-Store übersetzt worden — **sechs
Epics, 90 Requirements**, alle `status: draft`, alle nach dem Format aus
[docs/requirements/README.md](../requirements/README.md) und
[TEMPLATE.md](../requirements/TEMPLATE.md), alle mit Akzeptanzkriterien und
Test-Portfolio. `python -m rotaris_core.reqtocode check` ist grün.

| Epic | Titel | Requirements | Slice |
| --- | --- | --- | --- |
| [SWR-3100](../requirements/3100-requirement-sources.md) | Requirement Sources and Canonical Model | SWR-3101 – SWR-3117 (17) | 1 |
| [SWR-3200](../requirements/3200-requirement-delivery-state.md) | Requirement Delivery State and Evidence | SWR-3201 – SWR-3216 (16) | 2 |
| [SWR-3300](../requirements/3300-requirement-board-ui.md) | Requirement Board UI | SWR-3301 – SWR-3315 (15) | 3 |
| [SWR-3400](../requirements/3400-requirement-execution.md) | Requirement Execution | SWR-3401 – SWR-3416 (16) | 4 |
| [SWR-3500](../requirements/3500-requirement-change-propagation.md) | Requirement Change Propagation | SWR-3501 – SWR-3514 (14) | 5 |
| [SWR-3600](../requirements/3600-requirement-board-workflow.md) | Requirement Board Workflow and Review | SWR-3601 – SWR-3612 (12) | 6 |

**Ein Epic pro Slice** ist kein Zufall, sondern die Grundlage der Dateihoheit:
Der Epic-Index ist eine geteilte Datei mit einem gemeinsamen `content_hash` über
alle darin genannten IDs. Ein Epic für alle sechs Slices hätte bedeutet, dass
jeder Status-Flip in jedem Slice den Hash für ~90 IDs invalidiert und
`reqtocode diff --strict` reihenweise Drift meldet. Mit sechs Epic-Indizes
berührt jeder Slice genau einen.

Aus demselben Grund liegt **eine Datei pro Requirement** vor, keine
Multi-ID-Spec-Datei (SWR-2330): Ein `draft → approved` in Slice 4 darf nicht den
Hash der Requirements aus Slice 1 verändern.

### 1.1 Abdeckungsmatrix — Zielbild → Requirements

Jeder Abschnitt des Zielbilds ist abgebildet. Abschnitte ohne eigene ID (§1,
§55, §56) sind Rahmen und werden von der Summe getragen.

| § | Thema | Requirements |
| --- | --- | --- |
| 2.1 | Intern einheitlich, extern flexibel | SWR-3101, 3102, 3103, 3104, 3115 |
| 2.2 | Requirement ≠ Arbeitseinheit | SWR-3401 |
| 2.3 | Traceability als Produktzustand | SWR-3206, 3207, 3208, 3211 |
| 3.1 | Requirement Lifecycle | SWR-3101, 3202 |
| 4 | Delivery State | SWR-3201, 3202, 3203 |
| 5 | current_hash / satisfied_hash | SWR-3107, 3204, 3502 |
| 6 | Change Detection | SWR-3501 |
| 7 | Agentische Impact Analysis | SWR-3503, 3504, 3505, 3506 |
| 8 | Requirement Source Adapter | SWR-3102, 3105 |
| 9 | Agent-assisted Adapter Discovery | SWR-3104, 3106 |
| 10 | Canonical Requirement Model | SWR-3101, 3107 |
| 11 | Requirements und Epics | SWR-3108, 3212, 3308 |
| 12 | Execution Units | SWR-3401 |
| 13 | Automatische Zerlegung | SWR-3404 |
| 14 | Technische Requirements | SWR-3411 |
| 15 | Agentic Requirement Flow | SWR-3413 |
| 16 | Requirement Snapshot | SWR-3402, 3403 |
| 17 | Worktree Isolation | SWR-3405 |
| 18 | Parallelisierung | SWR-3406, 3412 |
| 19 | Integration mehrerer Units | SWR-3409 |
| 20 | ReqToCode als Runtime | SWR-3103, 3216, 3311, 3410 |
| 21 | Evidence Model | SWR-3206 |
| 22 | Traceability Ring | SWR-3207, 3305 |
| 23 | Evidence Details | SWR-3208, 3306 |
| 24 | Requirement Relations | SWR-3109 |
| 25 | Superseding | SWR-3110, 3508 |
| 26 | Agentisches Superseding | SWR-3507 |
| 27 | Requirement Removal | SWR-3113, 3509 |
| 28 | Requirement Board (Menüpunkt) | SWR-3301 |
| 29 | Kanban View | SWR-3302, 3303 |
| 30 | Drag-and-Drop als Aktion | SWR-3601, 3602 |
| 31 | Requirement Card | SWR-3304, 3305 |
| 32 | Requirement Detail View | SWR-3307, 3313, 3612 |
| 33 | Requirement Editing | SWR-3111, 3605 |
| 34 | Requirement Creation | SWR-3112, 3606 |
| 35 | Requirement History | SWR-3114, 3205, 3214 |
| 36 | Revision History | SWR-3214, 3313 |
| 37 | Req-to-Code-to-Test Graph | SWR-3310 |
| 38 | Done-Semantik | SWR-3215, 3609 |
| 39 | Stale Evidence | SWR-3209, 3513 |
| 40 | Continuous Evaluation | SWR-3210, 3312 |
| 41 | Requirement Health | SWR-3211 |
| 42 | Agent Context | SWR-3407 |
| 43 | Agent Completion Contract | SWR-3408 |
| 44 | Review | SWR-3603, 3604 |
| 45 | Human-in-the-Loop | SWR-3506, 3512, 3607 |
| 46 | Konflikte | SWR-3511 |
| 47 | Dependency Management | SWR-3510 |
| 48 | Epic Progress | SWR-3212, 3308 |
| 49 | Priorisierung | SWR-3309, 3412 |
| 50 | Agent Scheduling | SWR-3412, 3608 |
| 51 | Auditierbarkeit | SWR-3213, 3514, 3610 |
| 52 | Kein zweites Jira | Scope-Aussage in Epic SWR-3600 |
| 53 | Kein zweites Requirement Repository | SWR-3114 |
| 54 | Bestehende Architektur als Grundlage | SWR-3103, 3405, 3406, 3409, 3410, 3416 |

Sieben Requirements entstammen keinem Abschnitt des Zielbilds, sondern der
Codebasis: SWR-3116/3117/3216/3315/3416 sind Naht-Requirements (§3.2),
SWR-3314 ist der Accessibility-Standard aus `apps/rotaris/AGENTS.md`, SWR-3415
und SWR-3611 sind die Fehler- und Neustartpfade, die jeder langlaufende
Agentenprozess in diesem Repository braucht (vgl. SWR-2817).

---

## 2. Schnittprinzip

**Vertikal, nicht horizontal.** Jeder Slice liefert einen benutzbaren Zustand
und seinen kompletten Testabschnitt — nicht „erst alle Modelle, dann alle
Services". Slice 2 endet mit einer beantwortbaren Frage („in welchem Zustand
ist Requirement X und warum"), Slice 3 mit einem sichtbaren Board, Slice 4 mit
einem laufenden Agenten.

**Exklusive Dateihoheit.** Für jede Datei gibt es genau einen Slice, der sie
anlegt oder ändert. Geteilte Dateien sind erlaubt — aber nur zwischen Slices,
die **niemals gleichzeitig laufen**. Der einzige parallele Schnitt ist 3 ∥ 4,
und die beiden teilen keine einzige Datei: Slice 3 ist komplett
`apps/rotaris/`, Slice 4 ist komplett `src/rotaris_core/` + `tests/`.

**Naht-Requirements statt Merge-Konflikte.** Drei Dateien in diesem Repository
sind Kollisionsmagneten: `src/rotaris_core/config/schema.py` (54 KB, validiert),
`apps/rotaris/src/rotaris/views/main_window.py` (124 KB, verdrahtet jede View)
und `apps/rotaris/tests/test_views.py` (116 KB). Der Plan berührt sie
kontrolliert:

| Datei | Regel | Requirement |
| --- | --- | --- |
| `config/schema.py` | Slice 1 landet den **vollständigen** `requirements:`-Block für alle sechs Slices. Kein späterer Slice erweitert ihn. | SWR-3117 |
| `views/main_window.py` | Slice 3 fügt **einmalig** Controller-Konstruktion und View-Registrierung hinzu. Slice 6 fasst die Datei nicht an; alles Weitere hängt am `RequirementsController`. | SWR-3315 |
| `tests/test_views.py`, `test_services.py` | Werden nicht erweitert. Jeder Slice legt eigene Testdateien an. | — |
| `src/rotaris_core/reqtocode/**` | Wird von keinem Slice geändert, nur gelesen (`coverage.py`, `diff.py`, `layout.py`, `generator.py`). | — |

**Nachtrag nach der Umsetzung.** Fünf Dateien sind außerhalb dieser Tabellen
geändert worden. Vier davon sind sachlich richtig und bleiben; sie stehen hier,
weil ein Vertrag, der eine unvollständige Liste behauptet, kein Vertrag ist:

| Datei | Von | Warum |
| --- | --- | --- |
| `src/rotaris_core/config/loader.py` | Slice 1 | `requirements` muss in `_FIELD_MERGE_TOP_LEVEL_KEYS`, sonst lädt der Block aus SWR-3117 gar nicht |
| `src/rotaris_core/requirements/execution/reader.py` | Slice 4 | die Projektion braucht einen Leser über den Ausführungszustand |
| `src/rotaris_core/requirements/execution/store.py` | Slice 4 | dito, die Persistenz dazu |
| `apps/rotaris/src/rotaris/services/requirements_bridge.py` | Slice 6 (Slice-3-Datei) | `WorkspaceBoard.project()` **ist** der Bewertungspfad, den SWR-3502 verlangt; einen zweiten gibt es nicht |
| `apps/rotaris/src/rotaris/views/git.py` | Slice 6 | Navigationsziel für SWR-3612 |

**Der Projektionsvertrag ist die Entkopplung.** Slice 3 (Board) und Slice 4
(Ausführung) laufen parallel, obwohl die Karte Ausführungsdaten anzeigt
(SWR-3304: „2 execution units", „last run"). Das funktioniert, weil **Slice 2
die vollständige Form der Projektion definiert** (SWR-3216) — inklusive der
Ausführungsfelder, die dort zunächst leer bleiben. Slice 3 rendert sie, Slice 4
füllt sie. Diese Form zu ändern ist nach Gate 2 eine Vertragsänderung und
braucht beide Slices am Tisch. Deshalb ist Gate 2 das wichtigste Gate im Plan.

---

## 3. Abhängigkeitsordnung

```text
Phase A        Phase B        Phase C            Phase D        Phase E
┌────────┐    ┌────────┐    ┌──────────────┐    ┌────────┐    ┌────────┐
│Slice 1 │───▶│Slice 2 │───▶│Slice 3 ∥ 4   │───▶│Slice 5 │───▶│Slice 6 │
│Sources │    │Delivery│    │Board │ Exec  │    │Change  │    │Workflow│
└────────┘    └────────┘    └──────────────┘    └────────┘    └────────┘
         G1            G2                  G3            G4           G5
```

| Slice | Braucht | Warum |
| --- | --- | --- |
| 1 Sources | — | Fundament: ohne kanonisches Modell gibt es nichts zu verwalten |
| 2 Delivery | 1 | Delivery State und Evidence hängen an Requirement-ID und Hash |
| 3 Board UI | 1, 2 | Rendert ausschließlich die Projektion aus SWR-3216 |
| 4 Execution | 1, 2 | Schreibt Delivery State und Snapshots; braucht keinen UI-Code |
| 5 Change | 2, 4 | Impact-Ergebnisse erzeugen Execution Units (SWR-3505) |
| 6 Workflow | 3, 4, 5 | Aktionen lösen Läufe aus, Review zeigt Ergebnisse, Blocker kommen aus 5 |

Slice 5 könnte theoretisch parallel zu Slice 6 anlaufen, wenn Slice 6 mit
Review beginnt. Der Plan tut das **nicht**: beide würden Blocker-Payloads
gleichzeitig definieren, und der Gewinn (ein Slice Laufzeit) rechtfertigt den
Vertragskonflikt nicht.

---

## 4. Slice 1 — Requirement Sources and Canonical Model

**Epic:** [SWR-3100](../requirements/3100-requirement-sources.md) · **Branch:**
`feat/swr-3100-requirement-sources` · **Requirements:** SWR-3101 – SWR-3117

**Ziel.** Rotaris kann die Requirements eines beliebigen Projekts lesen,
normalisieren, hashen, in Beziehung setzen und zurückschreiben — ohne UI, ohne
Delivery, ohne Agenten. Am Ende beantwortet ein Skript: „welche Requirements hat
dieses Repository, mit welchen IDs, Hashes und Relationen".

### Dateihoheit — neu angelegt

```text
src/rotaris_core/requirements/__init__.py
src/rotaris_core/requirements/model.py            SWR-3101, 3108
src/rotaris_core/requirements/hashing.py          SWR-3107
src/rotaris_core/requirements/relations.py        SWR-3109, 3110
src/rotaris_core/requirements/registry.py         SWR-3115, 3116
src/rotaris_core/requirements/tombstones.py       SWR-3113
src/rotaris_core/requirements/writeback.py        SWR-3111, 3112
src/rotaris_core/requirements/sources/__init__.py
src/rotaris_core/requirements/sources/base.py     SWR-3102, 3105
src/rotaris_core/requirements/sources/reqtocode.py SWR-3103
src/rotaris_core/requirements/sources/declarative.py SWR-3104
src/rotaris_core/requirements/sources/discovery.py SWR-3106

tests/unit/requirements/__init__.py
tests/unit/requirements/test_model.py
tests/unit/requirements/test_source_protocol.py
tests/unit/requirements/test_reqtocode_source.py
tests/unit/requirements/test_declarative_source.py
tests/unit/requirements/test_source_capabilities.py
tests/unit/requirements/test_source_discovery.py
tests/unit/requirements/test_hashing.py
tests/unit/requirements/test_hierarchy.py
tests/unit/requirements/test_relations.py
tests/unit/requirements/test_writeback.py
tests/unit/requirements/test_creation.py
tests/unit/requirements/test_tombstones.py
tests/unit/requirements/test_no_second_store.py
tests/unit/requirements/test_registry.py
tests/unit/requirements/test_index_refresh.py
tests/unit/config/test_requirements_config.py
tests/integration/test_requirement_sources.py
tests/integration/test_requirement_writeback.py
tests/integration/test_requirement_source_discovery.py
```

### Dateihoheit — geteilte Dateien, hier exklusiv geändert

| Datei | Änderung | Danach angefasst von |
| --- | --- | --- |
| `src/rotaris_core/config/schema.py` | `requirements:`-Block, vollständig für alle Slices (SWR-3117) | niemandem |
| `src/rotaris_core/config/defaults.py` | Defaults des Blocks; Persona für Source Discovery | Slice 4, 5 (sequentiell) |
| `docs/requirements/3100-requirement-sources.md` + Ordner | `draft → approved` | niemandem |

**Verboten in Slice 1:** jede Datei unter `apps/`, jede Datei unter
`src/rotaris_core/reqtocode/`, jede Datei unter `src/rotaris_core/verifier/`.

### Akzeptanzkriterien

1. Alle Requirements SWR-3101 – SWR-3117 sind `approved`, mit `@traces` und
   `@verifies` je Requirement, und `reqtocode check` ist grün.
2. Das Test-Portfolio jedes Requirements ist implementiert — Unit, Integration
   und der hermetische E2E-Flow, wo die Tabelle einen fordert.
3. Der ReqToCode-Store dieses Repositories lädt vollständig durch den
   eingebauten Adapter: eine kanonische Requirement pro deklarierter ID, Hashes
   identisch zum `content_hash` in `swr.py`, keine Duplikate.
4. Eine deklarative Quelle über einem synthetischen `specs/`-Baum liefert
   zweimal hintereinander byte-identische Ergebnisse (Determinismus, SWR-3104).
5. Ein Edit über die Write-Back-Strecke ändert genau eine Datei und lässt nicht
   modelliertes Frontmatter unangetastet; ein fehlgeschlagener Write lässt die
   Datei byte-identisch (SWR-3111).
6. Unter `<workspace>/.rotaris/requirements/` liegt kein Requirement-Text
   (SWR-3114) — als Test, nicht als Zusicherung.
7. Der `requirements:`-Config-Block ist vollständig: jedes Feld, das Slice 2–6
   laut Requirements liest, existiert und hat einen dokumentierten Default.
8. Voller Qualitäts-Gate-Durchlauf grün (§10), keine Datei außerhalb der
   Hoheitstabelle geändert (`git diff --name-only` gegen die Tabelle geprüft).

### ▸ Gate 1 — Code Review „Contract"

Nach Slice 1, vor Slice 2. Review auf dem Branch, durch mich oder eine:n
Teammate:in: `/code-review` auf `feat/swr-3100-requirement-sources`; für die
Vollversion `/code-review ultra` — die läuft in der Cloud, ist
kostenpflichtig und muss **vom Menschen** ausgelöst werden, ich kann sie nicht
starten.

Prüffragen, die dieses Gate rechtfertigen:

- Ist das Adapter-Interface (SWR-3102) klein genug, dass ein read-only-Adapter
  es erfüllt, und groß genug, dass Slice 5 Change Detection darauf bauen kann?
- Ist die Hash-Definition (SWR-3107) stabil gegen Formatierung und empfindlich
  gegen Bedeutung? Ein Fehler hier vergiftet `satisfied_hash`, Snapshots und
  Change Detection gleichzeitig.
- Ist der Config-Block wirklich vollständig? Jedes nachgereichte Feld ist ein
  Merge in `schema.py` zu einem Zeitpunkt, an dem zwei Slices parallel laufen.
- Wird irgendwo Requirement-Text persistiert (SWR-3114)?

---

## 5. Slice 2 — Requirement Delivery State and Evidence

**Epic:** [SWR-3200](../requirements/3200-requirement-delivery-state.md) ·
**Branch:** `feat/swr-3200-delivery-state` · **Requirements:** SWR-3201 – SWR-3216

**Ziel.** Zu jedem Requirement ist beantwortbar: in welchem Delivery State es
ist, welche Spezifikationsversion zuletzt geliefert wurde, welche Evidenz
existiert, ob sie aktuell ist, was fehlt — und die Antwort kommt als eine
strukturierte Projektion, nicht als CLI-Ausgabe.

### Dateihoheit — neu angelegt

```text
src/rotaris_core/requirements/delivery/__init__.py
src/rotaris_core/requirements/delivery/state.py        SWR-3201, 3202
src/rotaris_core/requirements/delivery/transitions.py  SWR-3203
src/rotaris_core/requirements/delivery/satisfied.py    SWR-3204
src/rotaris_core/requirements/delivery/store.py        SWR-3205
src/rotaris_core/requirements/delivery/obligations.py  SWR-3206
src/rotaris_core/requirements/delivery/evidence.py     SWR-3207, 3208
src/rotaris_core/requirements/delivery/staleness.py    SWR-3209
src/rotaris_core/requirements/delivery/evaluation.py   SWR-3210
src/rotaris_core/requirements/delivery/health.py       SWR-3211
src/rotaris_core/requirements/delivery/epics.py        SWR-3212
src/rotaris_core/requirements/delivery/audit.py        SWR-3213
src/rotaris_core/requirements/delivery/history.py      SWR-3214
src/rotaris_core/requirements/delivery/completion.py   SWR-3215
src/rotaris_core/requirements/delivery/projection.py   SWR-3216

tests/unit/requirements/test_delivery_state.py
tests/unit/requirements/test_delivery_transitions.py
tests/unit/requirements/test_satisfied_hash.py
tests/unit/requirements/test_delivery_store.py
tests/unit/requirements/test_evidence_obligations.py
tests/unit/requirements/test_evidence_health.py
tests/unit/requirements/test_evidence_detail.py
tests/unit/requirements/test_evidence_staleness.py
tests/unit/requirements/test_evaluation_triggers.py
tests/unit/requirements/test_requirement_health.py
tests/unit/requirements/test_epic_progress.py
tests/unit/requirements/test_requirement_audit.py
tests/unit/requirements/test_revision_history.py
tests/unit/requirements/test_done_conditions.py
tests/unit/requirements/test_board_projection.py
tests/integration/test_requirement_delivery.py
tests/integration/test_requirement_evidence_health.py
tests/integration/test_requirement_evaluation.py
```

### Nur gelesen, nicht geändert

`rotaris_core/reqtocode/coverage.py` (SWR-2336), `rotaris_core/verifier/
requirement_evidence.py` (SWR-2606), `verifier/evidence.py` (SWR-2603),
`verifier/gate.py` (SWR-2604), `rotaris_core/requirements/**` aus Slice 1.

**Verboten in Slice 2:** `apps/`, `config/schema.py` (der Block steht schon),
alles unter `src/rotaris_core/requirements/`, was Slice 1 angelegt hat.

### Akzeptanzkriterien

1. SWR-3201 – SWR-3216 `approved`, Portfolio implementiert, `reqtocode check`
   grün.
2. Die Übergangsmatrix (SWR-3203) ist vollständig tabellengetrieben getestet:
   jede erlaubte Kante einmal, jede verbotene einmal, jede Ablehnung nennt ihre
   Vorbedingung.
3. Ein Requirement mit vollständiger Traceability und fehlschlagendem Test
   projiziert `failed`, nicht `satisfied` — der Kernfall aus §22 des Zielbilds.
4. Ein Requirement, dessen Test existiert aber nicht lief, projiziert `stale`
   und ist von `satisfied` unterscheidbar.
5. `Done` ist ohne aufgezeichneten Hash unerreichbar (SWR-3204), und die
   Abschlussbedingungen (SWR-3215) nennen jede unerfüllte Bedingung einzeln.
6. Die Projektion (SWR-3216) ist über dem echten Store dieses Repositories
   gebaut, seiteneffektfrei, serialisierbar und enthält **alle** Felder, die
   Slice 3 rendert und Slice 4 füllt — inklusive der zunächst leeren
   Ausführungsfelder.
7. Ein Guard-Test belegt: die Projektion schreibt nichts.
8. Voller Qualitäts-Gate-Durchlauf grün, keine Datei außerhalb der Hoheit.

### ▸ Gate 2 — Code Review „Vertrag" (das wichtigste Gate)

Nach Slice 2, **vor** dem parallelen Phase-C-Start. Ab hier arbeiten zwei Slices
gleichzeitig gegen dieselbe Projektionsform; eine Änderung daran kostet danach
beide.

Prüffragen:

- Ist die Projektionsform (SWR-3216) vollständig für Karte, Detail-View, Ring,
  Graph **und** Ausführung? Fehlende Felder sind der teuerste Fund dieses
  Gates — und der billigste, wenn er jetzt kommt.
- Ist die Übergangsmatrix so, dass Slice 4 (System-Aktor) und Slice 6
  (User-Aktor) beide nur durch sie schreiben können?
- Ist `satisfied_hash` gegen den Snapshot-Hash definiert, nicht gegen den
  Hash zum Akzeptanzzeitpunkt (SWR-3204)? Der Unterschied ist genau der Fall
  aus §16 des Zielbilds.
- Sind Evidence-Health-Regeln rein und ohne Repository testbar?
- Persistenz: atomar, versioniert, parallel-schreibsicher (SWR-3205)?

---

## 6. Slice 3 — Requirement Board UI  ‖  parallel zu Slice 4

**Epic:** [SWR-3300](../requirements/3300-requirement-board-ui.md) · **Branch:**
`feat/swr-3300-board-ui` · **Requirements:** SWR-3301 – SWR-3315

**Ziel.** Der Nutzer sieht seine Requirements: siebter Menüpunkt, Kanban-Board,
Karten mit Traceability-Ring, Evidence-Ansicht, Detail-View, Epic-Karten,
Filter, Graph. Ausschließlich lesend — jede schreibende Aktion ist Slice 6.

### Dateihoheit — neu angelegt

```text
apps/rotaris/src/rotaris/views/requirements.py            SWR-3301, 3302, 3303, 3309, 3312
apps/rotaris/src/rotaris/views/requirement_detail.py      SWR-3307, 3313
apps/rotaris/src/rotaris/views/requirement_graph.py       SWR-3310
apps/rotaris/src/rotaris/widgets/requirement_card.py      SWR-3304, 3308
apps/rotaris/src/rotaris/widgets/evidence_ring.py         SWR-3305, 3306
apps/rotaris/src/rotaris/services/requirements_bridge.py  SWR-3311, 3312
apps/rotaris/src/rotaris/services/requirements_controller.py SWR-3315
apps/rotaris/src/rotaris/models/requirements_state.py     SWR-3304, 3307

apps/rotaris/tests/test_requirements_board.py
apps/rotaris/tests/test_requirements_card.py
apps/rotaris/tests/test_requirements_ring.py
apps/rotaris/tests/test_requirements_evidence_view.py
apps/rotaris/tests/test_requirements_detail.py
apps/rotaris/tests/test_requirements_graph.py
apps/rotaris/tests/test_requirements_a11y.py
```

### Dateihoheit — geteilte Dateien, hier exklusiv geändert

| Datei | Änderung |
| --- | --- |
| `apps/rotaris/src/rotaris/views/chrome.py` | `NAV_ITEMS` + `("requirements", "◈", "Requirements")` zwischen Mission und Git |
| `apps/rotaris/src/rotaris/views/main_window.py` | **einmalig**: Controller konstruieren, View registrieren, `VIEW_ORDER` erweitern — mehr nicht |
| `apps/rotaris/src/rotaris/models/store.py` | Requirements-State-Feld + Signal |
| `apps/rotaris/src/rotaris/theme.py` | Ring- und Health-Tokens (kein hartcodiertes Farbwert in Views) |
| `apps/rotaris/src/rotaris/widgets/__init__.py` | Re-Export der neuen Primitives |
| `apps/rotaris/tests/fakes.py` | `FakeRequirementsBridge` |
| `apps/rotaris/tests/test_accessibility_sweep.py` | sechs → sieben Primärviews |
| `apps/rotaris/tests/test_chrome.py`, `test_main_window.py` | Nav-Erwartungen sechs → sieben |
| `apps/rotaris/AGENTS.md` | § Product scope: „six primary views" → sieben, Liste ergänzt |

**Verboten in Slice 3:** alles unter `src/`, alles unter `tests/` (Repo-Wurzel),
`apps/rotaris/tests/test_views.py`, `test_services.py`.

### Akzeptanzkriterien

1. SWR-3301 – SWR-3315 `approved`, Portfolio implementiert, `reqtocode check`
   grün.
2. Der Accessibility-Sweep läuft über sieben Views und ist grün — ohne
   Ausnahmeeinträge für die neue View (SWR-3314).
3. Board, Karte, Ring, Evidence-Ansicht, Detail-View und Graph sind bei
   1000×680 vollständig bedienbar: kein Clipping, keine unerreichbare Aktion,
   keine gewachsene Fenster-Mindestgröße.
4. Ein Guard-Test belegt: kein Modul unter `apps/rotaris/src/` startet einen
   `reqtocode`- oder Verifier-Prozess, parst dessen Ausgabe oder rechnet Health
   selbst aus (SWR-3311).
5. Ein zweiter Guard-Test belegt: die Erweiterung in `main_window.py` besteht
   aus Konstruktion und Registrierung; alle Signalverbindungen der Requirements-
   Fläche hängen am Controller (SWR-3315).
6. Ein Board über mehrere hundert Requirements rendert, ohne den Qt-Thread zu
   blockieren; eine Neubewertung aktualisiert einzelne Karten und erhält
   Auswahl und Scrollposition (SWR-3312).
7. Alle Ausführungsfelder der Projektion werden gerendert und degradieren
   sauber, solange Slice 4 sie leer lässt.
8. Voller Qualitäts-Gate-Durchlauf grün inkl. Rotaris-Desktop-Suite, kein TUI-
   File geändert (`git status --short src/rotaris_core/tui`).

---

## 7. Slice 4 — Requirement Execution  ‖  parallel zu Slice 3

**Epic:** [SWR-3400](../requirements/3400-requirement-execution.md) · **Branch:**
`feat/swr-3400-execution` · **Requirements:** SWR-3401 – SWR-3416

**Ziel.** Ein Requirement, das auf `Ready` steht, wird zerlegt, bekommt
Worktrees, wird von Agenten implementiert, verifiziert, integriert — und
hinterlässt eine Ausführungshistorie. Vollständig ohne Desktop, headless
testbar.

### Dateihoheit — neu angelegt

```text
src/rotaris_core/requirements/execution/__init__.py
src/rotaris_core/requirements/execution/units.py          SWR-3401
src/rotaris_core/requirements/execution/snapshot.py       SWR-3402, 3403
src/rotaris_core/requirements/execution/decomposition.py  SWR-3404
src/rotaris_core/requirements/execution/worktrees.py      SWR-3405
src/rotaris_core/requirements/execution/context.py        SWR-3407
src/rotaris_core/requirements/execution/contract.py       SWR-3408
src/rotaris_core/requirements/execution/integration.py    SWR-3409
src/rotaris_core/requirements/execution/verification.py   SWR-3410
src/rotaris_core/requirements/execution/derivation.py     SWR-3411
src/rotaris_core/requirements/execution/scheduler.py      SWR-3406, 3412
src/rotaris_core/requirements/execution/flow.py           SWR-3413, 3415
src/rotaris_core/requirements/execution/history.py        SWR-3414
src/rotaris_core/requirements/execution/run_seam.py       SWR-3416

tests/unit/requirements/test_execution_units.py
tests/unit/requirements/test_run_snapshot.py
tests/unit/requirements/test_run_completion.py
tests/unit/requirements/test_decomposition.py
tests/unit/requirements/test_unit_worktrees.py
tests/unit/requirements/test_unit_scheduling.py
tests/unit/requirements/test_agent_context.py
tests/unit/requirements/test_completion_contract.py
tests/unit/requirements/test_unit_integration.py
tests/unit/requirements/test_unit_verification.py
tests/unit/requirements/test_derived_requirements.py
tests/unit/requirements/test_requirement_scheduler.py
tests/unit/requirements/test_requirement_flow.py
tests/unit/requirements/test_execution_history.py
tests/unit/requirements/test_unit_failure.py
tests/unit/requirements/test_run_seam.py
tests/integration/test_requirement_execution.py
tests/integration/test_requirement_decomposition.py
tests/integration/test_requirement_integration.py
tests/integration/test_requirement_scheduling.py
```

### Geteilte Dateien, hier geändert (sequentiell, nie parallel)

| Datei | Änderung | Vorher/nachher |
| --- | --- | --- |
| `src/rotaris_core/config/defaults.py` | Personas für Decomposition und Requirement-Execution | Slice 1 vorher, Slice 5 nachher |

### Nur gelesen, nicht geändert

`session/worktrees.py` (`GitWorktreeService`, `IntegrationPlan`),
`session/manager.py`, `verifier/runner.py`, `verifier/suite.py`,
`verifier/requirement_evidence.py`, `orchestrator/**`.

**Verboten in Slice 4:** alles unter `apps/`. Wenn die Ausführung eine
Desktop-Fläche brauchen sollte, ist das ein Befund für Gate 3 und wird in
Slice 6 gebaut — nicht hier eingeschmuggelt.

### Akzeptanzkriterien

1. SWR-3401 – SWR-3416 `approved`, Portfolio implementiert, `reqtocode check`
   grün.
2. Ein Unit-Lauf ist **headless** startbar: der Integrationstest importiert
   `rotaris` (Desktop) nicht und erzeugt trotzdem Worktree, Lauf und
   Terminalzustand (SWR-3416).
3. Kein Unit-Lauf schreibt in den Basis-Checkout; zwei Units eines Requirements
   erzeugen zwei Branches und zwei Worktrees (SWR-3405).
4. Ein Requirement, das während seines Laufs editiert wird, landet in `Review`
   mit beiden Hashes — nicht in `Done` (SWR-3403). Dieser Test ist der
   Kernbeleg des Slices.
5. Ein Lauf, dessen Tests nicht liefen, kann nicht `complete` melden; ein
   feindliches Modell-Payload kann die runner-eigenen Felder nicht setzen
   (SWR-3408).
6. Drei Unit-Branches integrieren über einen Integrations-Worktree und landen
   erst nach erfolgreicher Verifikation auf der Basis; ein Konflikt lässt die
   Basis unberührt und nennt die kollidierenden Units (SWR-3409).
7. Der Scheduler hält abhängige Units zurück, nennt für jeden zurückgehaltenen
   Kandidaten den Grund, und Priorität überstimmt niemals eine Abhängigkeit
   (SWR-3412).
8. Voller Qualitäts-Gate-Durchlauf grün, keine Datei unter `apps/` geändert.

### ▸ Gate 3 — Code Review „Integration" (gemeinsam)

Nach dem Merge **beider** Phase-C-Branches in den Epic-Branch, nicht nach dem
ersten. Reviewgegenstand ist der zusammengeführte Zustand, nicht die zwei
Branches einzeln.

Prüffragen:

- Rendert das Board die von Slice 4 gefüllten Ausführungsfelder korrekt, oder
  hat einer der beiden Slices den Vertrag stillschweigend anders gelesen?
- Ist die Übergangsmatrix aus Slice 2 der einzige Schreibpfad geblieben —
  auch aus dem Flow-Controller heraus?
- Kollidieren Requirement-Worktrees mit Session-Worktrees (`.rotaris/worktrees/`)
  oder mit `.claude/worktrees/`? Branch-Namensraum geprüft?
- Läuft der volle Test-Durchlauf parallel (`-n auto`) stabil, oder hat die
  Requirement-Ausführung ein neues Serialisierungsbedürfnis eingeführt
  (`@pytest.mark.serial`)?
- Hält Slice 3 sich an „nur lesend"? Kein verstecktes Schreiben in den
  Delivery-Store.

---

## 8. Slice 5 — Requirement Change Propagation

**Epic:** [SWR-3500](../requirements/3500-requirement-change-propagation.md) ·
**Branch:** `feat/swr-3500-change-propagation` · **Requirements:** SWR-3501 – SWR-3514

**Ziel.** Der Kreislauf schließt sich: geänderte, ersetzte und gelöschte
Requirements erzeugen präzise zugeschnittene Arbeit statt Stille oder
Neu-Implementierung.

### Dateihoheit — neu angelegt

```text
src/rotaris_core/requirements/change/__init__.py
src/rotaris_core/requirements/change/detection.py     SWR-3501, 3502
src/rotaris_core/requirements/change/impact.py        SWR-3503
src/rotaris_core/requirements/change/outcomes.py      SWR-3504, 3505, 3506
src/rotaris_core/requirements/change/superseding.py   SWR-3507, 3508
src/rotaris_core/requirements/change/removal.py       SWR-3509
src/rotaris_core/requirements/change/dependencies.py  SWR-3510
src/rotaris_core/requirements/change/conflicts.py     SWR-3511
src/rotaris_core/requirements/change/decisions.py     SWR-3512
src/rotaris_core/requirements/change/propagation.py   SWR-3513
src/rotaris_core/requirements/change/records.py       SWR-3514

tests/unit/requirements/test_change_detection.py
tests/unit/requirements/test_needs_update.py
tests/unit/requirements/test_impact_analysis.py
tests/unit/requirements/test_impact_outcomes.py
tests/unit/requirements/test_superseding.py
tests/unit/requirements/test_removal_impact.py
tests/unit/requirements/test_dependencies.py
tests/unit/requirements/test_conflicts.py
tests/unit/requirements/test_human_in_the_loop.py
tests/unit/requirements/test_evidence_propagation.py
tests/unit/requirements/test_analysis_records.py
tests/integration/test_requirement_change.py
tests/integration/test_requirement_impact.py
tests/integration/test_requirement_superseding.py
tests/integration/test_requirement_removal.py
```

### Geteilte Dateien, hier geändert (sequentiell)

| Datei | Änderung |
| --- | --- |
| `src/rotaris_core/config/defaults.py` | Personas für Impact- und Migrationsanalyse (letzte Änderung dieser Datei im Plan) |

### Nur gelesen

`reqtocode/diff.py` (SWR-2332), `reqtocode/coverage.py`, alles aus Slice 1, 2, 4.

**Verboten in Slice 5:** `apps/`, `reqtocode/**` schreibend.

### Akzeptanzkriterien

1. SWR-3501 – SWR-3514 `approved`, Portfolio implementiert, `reqtocode check`
   grün.
2. Die Klassifikation der eingebauten Quelle stimmt mit `reqtocode diff` über
   demselben Inhalt überein — als Test, nicht als Behauptung (SWR-3501).
3. Eine reine Umformulierung eines gelieferten Requirements führt zu **keinem**
   Code-Lauf: Verifikation, Hash-Übernahme, zurück auf `Done` (SWR-3504).
4. Eine geänderte Akzeptanzbedingung erzeugt Test- **und** Implementierungs-Unit
   mit korrekter Abhängigkeit (SWR-3505).
5. Ein widersprüchlicher Change blockiert mit einer konkreten Frage; keine Unit,
   kein Lauf, bis sie beantwortet ist (SWR-3506).
6. Ein Superseding erzeugt eine Migrationsliste, in der **jede** Trace und
   **jeder** Test der ersetzten Requirements genau einmal mit zugewiesener
   Aktion vorkommt; nach Ausführung zeigt kein `@traces` mehr auf eine entfernte
   Requirement (SWR-3507).
7. Ein gelöschtes Requirement wird tombstoned, seine Abhängigen werden als
   dangling gemeldet — und nichts wird automatisch gelöscht (SWR-3509).
8. Ein gelöschter Test holt sein Requirement aus `Done`, **ohne** dass eine
   Textanalyse läuft (SWR-3513).
9. Voller Qualitäts-Gate-Durchlauf grün.

### ▸ Gate 4 — Code Review „Sicherheit"

Nach Slice 5. Dieser Slice enthält die einzigen Pfade des Plans, die auf
Agenten-Urteil hin fremden Code ändern oder löschen. Reviewschwerpunkt ist
entsprechend nicht Stil, sondern Schadensbegrenzung.

Prüffragen:

- Kann eine Migration (SWR-3507) Code entfernen, ohne dass ein Mensch die Liste
  gesehen hat? Wenn ja: Fehler.
- Ist „nicht klassifizierbar" wirklich als eigener Zustand behandelt, oder
  fällt es auf `keep` bzw. `remove` durch?
- Führt eine Requirement-Löschung irgendwo zu automatischem Löschen von Code
  oder Tests (SWR-3509)?
- Ist die Impact-Analyse read-only — kein Schreibzugriff auf Quelle, Code oder
  Tests (SWR-3503)?
- Sind die Analyse-Records vollständig genug, um eine Entscheidung Monate
  später zu rekonstruieren (SWR-3514)?
- Terminiert die Propagation? Kann eine Bewertung eine Bewertung auslösen?

---

## 9. Slice 6 — Requirement Board Workflow and Review

**Epic:** [SWR-3600](../requirements/3600-requirement-board-workflow.md) ·
**Branch:** `feat/swr-3600-board-workflow` · **Requirements:** SWR-3601 – SWR-3612

**Ziel.** Das Board wird schreibend: Karten verschieben löst Arbeit aus, Review
entscheidet, Requirements lassen sich in Rotaris bearbeiten und anlegen, die
Queue ist sichtbar und steuerbar.

### Dateihoheit — neu angelegt

```text
apps/rotaris/src/rotaris/services/requirements_actions.py   SWR-3601, 3602, 3609, 3610
apps/rotaris/src/rotaris/views/requirement_review.py        SWR-3603, 3604
apps/rotaris/src/rotaris/views/requirement_queue.py         SWR-3608
apps/rotaris/src/rotaris/widgets/requirement_editor.py      SWR-3605, 3606
apps/rotaris/src/rotaris/widgets/requirement_blockers.py    SWR-3607

apps/rotaris/tests/test_requirements_board_actions.py
apps/rotaris/tests/test_requirements_review.py
apps/rotaris/tests/test_requirements_editing.py
apps/rotaris/tests/test_requirements_blockers.py
apps/rotaris/tests/test_requirements_scheduling_ui.py
apps/rotaris/tests/test_requirements_recovery.py
```

### Geteilte Dateien, hier geändert (sequentiell nach Slice 3)

| Datei | Änderung |
| --- | --- |
| `apps/rotaris/src/rotaris/services/requirements_controller.py` | Aktions-, Review- und Queue-Verdrahtung |
| `apps/rotaris/src/rotaris/views/requirements.py` | Drop-Ziele und Tastatur-Äquivalent |
| `apps/rotaris/src/rotaris/views/requirement_detail.py` | Editier- und Blocker-Einstieg |
| `apps/rotaris/src/rotaris/models/requirements_state.py` | Aktions- und Queue-Zustand |
| `apps/rotaris/src/rotaris/models/store.py` | Queue-Signal |

**Verboten in Slice 6:** `views/main_window.py` (das ist der ganze Zweck von
SWR-3315), alles unter `src/`, alles unter `tests/` (Repo-Wurzel).

### Akzeptanzkriterien

1. SWR-3601 – SWR-3612 `approved`, Portfolio implementiert, `reqtocode check`
   grün.
2. `main_window.py` ist gegenüber Slice 3 **unverändert** — als Diff-Prüfung im
   Review, nicht als Zusicherung.
3. Ein Drop auf `Ready` startet nachweislich einen Lauf; ein abgelehnter Drop
   zeigt den Grund der Engine und lässt die Karte zurückspringen (SWR-3601,
   3602).
4. Ein Guard-Test belegt: kein Desktop-Modul schreibt den Delivery-Store direkt;
   `Done` ist über die UI nicht erzwingbar (SWR-3609).
5. Die Review-Fläche unterscheidet sichtbar, was der Agent behauptet, von dem,
   was Rotaris gemessen hat (SWR-3603).
6. Ein Edit an einem gelieferten Requirement erzeugt `Needs Update` über den
   normalen Bewertungspfad — kein Sonderweg (SWR-3605).
7. Nach einem Neustart mit drei persistierten Units zeigt das Board zwei
   abgeschlossen und eine unterbrochen, mit erhaltener Arbeit; kein Requirement
   fällt auf `Backlog` zurück (SWR-3611).
8. Kein Transcript, kein Agent-Tree und keine Worktree-Liste ist in der
   Requirements-View nachgebaut; die Navigation führt in Workspace, Mission und
   Git (SWR-3612).
9. Accessibility-Sweep grün, voller Qualitäts-Gate-Durchlauf grün.

### ▸ Gate 5 — Code Review „Abnahme"

Nach Slice 6, vor dem Merge des Epic-Branches nach `master`. Gegenstand ist der
**gesamte** Epic-Branch, nicht der letzte Slice.

Prüffragen:

- Ist jeder der 56 Abschnitte des Zielbilds an einem lauffähigen Verhalten
  ablesbar, oder gibt es `approved` Requirements ohne echte Wirkung?
- Sind alle 90 Requirements `approved`, oder sind welche still auf `draft`
  liegen geblieben? `draft` erzwingt nichts — das ist der leiseste Weg, den Plan
  zu unterlaufen.
- Ist die Baseline-Verschuldung (`traceability-baseline.txt`,
  `orphan-baseline.txt`, `orphan-test-baseline.txt`) unverändert oder kleiner?
  Ein neuer Eintrag ist ein Abbruchkriterium.
- Ist der Produktversprechen-Test da: Requirement ändern → Board zeigt
  `Needs Update` → Freigabe → Lauf → Review → `Done` mit neuem
  `satisfied_hash`? Dieser eine Durchlauf ist die Abnahme des Epics.
- Versionen gebumpt (`pyproject.toml` beider Pakete), `uv.lock` synchron?

---

## 10. Qualitäts-Gate pro Slice

Vor jedem Gate, auf dem Slice-Branch, in dieser Reihenfolge (Details in
[AGENTS.md § Workflow](../../AGENTS.md#workflow--worktree-merge-verify-fix-forward)):

```bash
uv run python -m rotaris_core.reqtocode check --fix && uv run python -m rotaris_core.reqtocode check
uv run python -m rotaris_core.reqtocode diff --strict
uv run ruff format src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'
uv run ruff check   src/ tests/ apps/rotaris/src/ apps/rotaris/tests/ --exclude 'tests/fixtures/files/large.py'
uv run mypy src/rotaris_core/ && uv run mypy apps/rotaris/src/rotaris/
uv run pytest -q --timeout=120 -n auto
uv run pytest apps/rotaris/tests -q --timeout=120 -p no:textual-snapshot -n auto -m "not serial"
uv run pytest apps/rotaris/tests -q --timeout=120 -p no:textual-snapshot -m serial
```

Ein Gate ist nur grün gegen die Baseline vor dem Slice. Vorbestehende
Fehlschläge werden benannt, nicht mitgezählt — und nicht stillschweigend
geerbt.

Jeder Slice läuft in einem eigenen Worktree mit eigenem `uv sync --all-packages`
(AGENTS.md § 1). Für Claude-Code-Sessions: `.claude/worktrees/<branch-name>`.

---

## 11. Branch- und Merge-Strategie

```text
master
  └── feat/swr-3100-requirement-board          (Epic-Integrationsbranch)
        ├── feat/swr-3100-requirement-sources   → Merge nach G1
        ├── feat/swr-3200-delivery-state        → Merge nach G2
        ├── feat/swr-3300-board-ui        ┐
        ├── feat/swr-3400-execution       ┘     → beide mergen, dann G3
        ├── feat/swr-3500-change-propagation    → Merge nach G4
        └── feat/swr-3600-board-workflow        → Merge nach G5
                                                → Epic-Branch nach master
```

Nach AGENTS.md § 4: Slice-Branches mergen in den Epic-Branch, **nicht** nach
`master`; nur der Epic-Branch geht nach `master`. Kein Merge eines roten
Branches, kein Merge aus dem Worktree heraus.

`swr.py`-Konflikte sind beim Zusammenführen zweier Slices erwartbar: eingehende
Datei nehmen, `reqtocode check --fix` neu laufen lassen, Ergebnis committen.

---

## 12. Risiken und offene Punkte

| Risiko | Wirkung | Umgang |
| --- | --- | --- |
| Projektionsvertrag unvollständig | Slice 3 und 4 driften parallel auseinander | Gate 2 mit genau dieser Prüffrage; Ausführungsfelder in Slice 2 mitdefinieren |
| `main_window.py` als Merge-Punkt | Konflikte über vier Slices | SWR-3315: eine einzige Berührung in Slice 3 |
| Impact-Analyse als Modell-Urteil | falsche „no behavioural impact" | SWR-3504 adoptiert den Hash erst **nach** bestandener Verifikation |
| Superseding entfernt lebenden Code | Datenverlust im Kundenrepo | SWR-3507: Liste vor Ausführung sichtbar; Gate 4 |
| Requirement-Worktrees vs. Session-Worktrees | Branch-/Pfadkollisionen | eigener Namensraum `rotaris/req/…`, Prüfung in Gate 3 |
| Board-Performance bei großen Stores | UI friert | SWR-3116 (inkrementell, off-thread), SWR-3312 |
| Parallele Sessions vergeben dieselben SWR-IDs | ID-Kollision beim Merge | bekanntes Repo-Verhalten: der ankommende Branch nummeriert um, `master` behält seine ID |

Zwei Vorbedingungen, die **nicht** Teil dieses Plans sind und vor Slice 1
geprüft gehören:

1. **SWR-2335, SWR-2336, SWR-2337 stehen auf `draft`, sind aber implementiert**
   (`reqtocode/layout.py`, `coverage.py`, `conventions.py` samt Tests
   existieren). Slice 1 und 2 bauen auf ihnen auf. Solange sie `draft` sind,
   erzwingt ReqToCode nichts für sie — sie können still regressieren. Den Status
   zu korrigieren ist eine eigene, kleine Aufgabe.
2. **SWR-2318 (Tombstones) ist `draft` und nicht implementiert.** SWR-3113
   verlangt für die eingebaute Quelle den Eintrag in das Retired-IDs-Log. Wenn
   SWR-2318 bis Slice 1 nicht existiert, liefert SWR-3113 nur den
   Rotaris-seitigen Tombstone und der Store-seitige Teil bleibt offen — das ist
   ein bewusst zu treffender Beschluss, kein Versehen.

---

## 13. Slice 7 — Verdrahtung, Härtung, Plan-Abgleich

Nicht geplant, sondern gefunden. Gate 5 hat einen Defekttyp aufgedeckt, den die
fünf Gates davor nicht abbilden konnten, weil er kein Fehler *im* Code ist:
**`approved` Requirements ohne Produktionspfad.** Die Engines existieren, sind
unit-getestet, und werden von keinem ausgelieferten Code je konstruiert. Der
Nachweis lief jeweils über einen Test, der sich die fehlende Komposition selbst
gebaut hat. Damit steht in `swr.py` `approved`, wo im Produkt nichts passiert —
genau das, was ReqToCode verhindern soll.

Slice 7 fügt nichts hinzu, was nicht schon spezifiziert wäre. **Keine neuen
Requirement-IDs:** jede Lücke ist ein Akzeptanzkriterium, das in einem bereits
`approved` Requirement wörtlich steht und unerfüllt ist.

| Paket | Inhalt | IDs |
| --- | --- | --- |
| W1 | Persona-Auflösung (`requirements/analysis/persona.py`) und `StructuredJudge` (`analysis/judge.py`) — beides fehlte komplett | SWR-3117 |
| W2 | Die fünf Modell-Protokolle des Epics hatten **null** Implementierungen; dazu `Decomposer` und `ImpactAnalyzer` in die Produktionskomposition | SWR-3106, 3404, 3411, 3503, 3507 |
| W3 | `RequirementScheduler` wird konstruiert, liest `RequirementSchedulingConfig` und füllt `decision=` in der Projektion | SWR-3406, 3412, 3510, 3608 |
| W4 | `rotaris-headless requirements run` als zweiter Konsument des Run-Seams | SWR-3416, 3408 |
| W5 | Session trägt Requirement und Unit; davor die Auflösung, dass ein Requirement-Lauf seine Session im Basis-Workspace registriert statt im Worktree | SWR-3612 |
| W6 | `DeliveryStore.update` → `update_record`, damit der Guard-Test ihn sehen kann | SWR-3203, 3205 |
| W7 | Dieser Abschnitt und der Nachtrag in §2 | — |

### Dateihoheit

Neu: `src/rotaris_core/requirements/analysis/**`,
`requirements/execution/cli_host.py`, `cli/commands/requirements.py`.
Geändert: `cli/argparse_app.py`, `cli/app.py`, `delivery/store.py`,
`delivery/transitions.py`, `session/{state,persistence,manager}.py`,
`run_host.py`, `requirements_bridge.py`, `requirements_actions.py`,
`models/state.py`, `services/config_service.py`, `run_coordinator.py`,
`views/{workspace,dashboard,main_window}.py`.

Reihenfolge: W1 → W2; W3, W4, W5 unabhängig davon. Einzige echte Kollision ist
`requirements_actions.py`, das W2, W3 und W5 berühren — die drei laufen
sequentiell, nie parallel.

### Akzeptanzkriterien

1. Ein Guard-Test zählt die fünf Modell-Protokolle und die Engines
   (`ImpactAnalyzer`, `Decomposer`, `DeliveryScheduler`, `RequirementDerivation`)
   auf und verlangt für jedes mindestens eine Produktionsimplementierung **und**
   eine Produktionskonstruktion. **Dieser Test ist der Grund für den ganzen
   Slice** — er hätte den Befund vor Gate 5 aufgedeckt.

   Er hat allerdings **fünfmal** aus dem falschen Grund bestanden, bevor er
   trug, und alle fünf Male war es derselbe Fehler in anderer Kleidung: eine
   Implementierung wurde über etwas identifiziert, das andere Dinge auch haben.

   1. Der Methodenname allein — `classify` gehört auch `CircuitBreaker`, also
      sahen alle fünf Protokolle implementiert aus.
   2. Ein Eigenaufruf des deklarierenden Moduls — `DeliveryScheduler.decide`
      ruft sein eigenes `schedule()`, und das galt als Konsument.
   3. Methodenname plus „die Datei nennt das Protokoll" — alle sechs Analysten
      liegen in einem Modul, dessen Docstring alle fünf Protokolle nennt, also
      erfüllte `DecompositionAnalyst` das `DerivationModel`.
   4. Methodenname plus Argumenttyp — das tötete Fall 3, ließ aber den
      **Konsumenten** herein: `ImpactAnalyzer.analyse(request: ImpactRequest)`
      trifft die Signatur von `ImpactModel` exakt, weil eine Engine gegen genau
      das Urteil geschrieben ist, das sie konsumiert. Das war kein einfacher
      Fehler, sondern ein Zeitzünder — `DerivationModel` wäre in dem Moment grün
      geworden, in dem `RequirementDerivation` verdrahtet wird, während der
      Analyst darum weiter ungebaut geblieben wäre.
   5. Der Sprung über eine Fabrik matchte einen nackten Funktionsnamen —
      `super().__init__(...)` ist ein Attributaufruf, also hatte `__init__` 147
      Aufrufstellen in 81 Modulen, und ein Provider, der nur in einer `__init__`
      gebaut wird, wäre über einundachtzig unbeteiligte Module „erreichbar"
      gewesen.

   Identifiziert wird eine Implementierung deshalb über **Methode, Argumenttyp
   und Rückgabetyp zusammen**, und die Signatur steht nicht in der Tabelle,
   sondern wird von der `Protocol`-Deklaration gelesen — eine kopierte Tatsache
   driftet von ihrer Quelle, eine gelesene nicht. Der Rückgabetyp ist der
   Diskriminator, der Fall 4 tötet, und er tut es aus einem Grund statt zufällig:
   eine Implementierung gibt die rohe Nutzlast zurück, die das Protokoll
   verspricht (`Mapping[str, object]`), ein Konsument sein eigenes Domänenobjekt
   (`ImpactAnalysis`). Der Ort wäre der falsche Filter gewesen: `HeuristicAnalyst`
   liegt im selben Modul wie sein Protokoll und implementiert es legitim.

   Gegen Fall 5 wird nur noch über Funktionen auf Modulebene gesprungen, und
   sobald die Kette einer Funktion folgt, zählen Attributaufrufe nicht mehr —
   eine Fabrik wird importiert und beim nackten Namen gerufen.
2. Vier freigegebene Requirements mit Abhängigkeiten werden in
   Abhängigkeitsordnung abgearbeitet (SWR-3412), zwei abhängige in richtiger
   Reihenfolge (SWR-3510) — durch die Produktionskomposition, nicht durch Fakes.
3. `rotaris-headless requirements run <ID>` erzeugt Worktree, Lauf und
   Terminalzustand; die bestehenden Import-Guards bleiben grün (kein `rotaris`,
   kein PySide6 im frischen Interpreter).
4. Ein requirement-gestarteter Lauf erscheint in der Session-Liste des
   Basis-Workspace und nennt Requirement und Unit.
5. `Done` ist ohne Completion-Gate nicht persistierbar; `update_record` hat
   außer `apply_transition` und `seed()` keinen Aufrufer im ausgelieferten Code.
6. `tests/integration/test_requirement_board_promise.py` fährt das
   Produktversprechen durch die **echte** Komposition, ohne sich fehlende Teile
   selbst zu bauen. Dass er das tat, war Gate-5-Blocker 6.
7. Voller Qualitäts-Gate-Durchlauf grün (§10), Baseline-Schuld unverändert oder
   kleiner.

### Was Gate 6 gefunden hat

Zwei der Befunde sind in Slice 7 geschlossen worden, zwei bleiben offen. Beide
Gruppen stehen hier, weil ein Plan, der nur die erledigten Dinge nennt, dieselbe
Lüge erzählt wie ein `approved` ohne Pfad.

**Geschlossen — ein Requirement konnte nur einmal ausgeliefert werden.**
Festgehalten als `@pytest.mark.xfail(strict=True)`, gefunden beim Umbau des
Produktversprechens auf die echte Komposition. `schedule_now` las den Unit-Satz
des *vorigen* Zyklus, um zu entscheiden, ob der *nächste* starten darf: nach der
ersten Auslieferung hält er eine `FINISHED`-Unit, ist also weder leer (der
Fallback für unzerlegte Requirements greift nicht) noch startbar (der Scheduler
wählt nichts), und die Freigabe wurde mit „the scheduler selected nothing for it"
abgelehnt. Das machte SWR-3502 hohl. Die Reparatur ist eine Bedingung — der
Fallback fragt jetzt, ob eine lebende Unit noch *Arbeit schuldet*, statt ob die
Menge leer ist.

Zwei Sackgassen wurden auf dem Weg gemessen, und beide sehen richtig aus. Die
abgeschlossenen Units bei der Freigabe zu verwerfen entsperrt den Lauf — aber das
nächste `_save_units` des Flows schreibt einen frisch geplanten Satz mit
`discarded=()` und wirft genau die Historie weg, die der Discard schützen sollte.
Und die Id-Kollision, die eine zyklusbewusste Identität zu erzwingen schien,
tritt nie ein, weil der Flow über `plan_units` neu plant statt über `added()`.
Zwei Prüfer haben hier korrekt gemessen und sich widersprochen, weil sie
verschiedene Pfade maßen — der eine einen, den der Flow nie nimmt.

**Geschlossen — headless und Desktop komponierten verschiedene Flows.**
`cli_host.py` übergab weder `decomposer=` noch `assess=`. Die Lesefrage kam vor
der Codefrage und hat sie entschieden: SWR-3413 listet die Zerlegung als Stufe
*des Flows* und fordert ausdrücklich, dass nichts darin die Anwesenheit des
Nutzers braucht; SWR-3404 setzt die Bewertung „vor die Ausführung" ohne
Einschränkung auf eine Oberfläche; und SWR-3416 ist aus SWR-3413 *abgeleitet* und
lizenziert einen zweiten Konsumenten, keinen reduzierten Flow. Es gibt also keine
Lesart, in der der headless Weg absichtlich einteilig ist. Verdrahtet, und der
Import-Guard hält: 1,04 s frischer Interpreter, null openhands, null litellm,
null Qt — weil `deferred_completion` zur Kompositionszeit keinen `LLM` baut.

**Offen — acht Posten, und sie haben einen eigenen Plan:**
[2026-08-15-requirements-board-open-items.md](2026-08-15-requirements-board-open-items.md).

Kurz, damit dieser Abschnitt für sich lesbar bleibt: die Läufe zweier
Auslieferungszyklen liegen unter einer Unit-Id ohne Marker (älter als Slice 7,
unsichtbar solange niemand zweimal ausliefern konnte); SWR-3411 verspricht eine
Vorschlagsfläche — *„A user is offered … and accepting it updates the store"* —,
die es nicht gibt; Requirement-Worktrees reißen auf Windows die
260-Zeichen-Grenze; die Queue zählt eine Wiederauslieferung für einen Durchgang
als eine Unit; SWR-2318 und SWR-2335/2336/2337 hängen an einer Datei mit 38 IDs
unter einem `status`; 33 Test-Doubles sind als `-> object` annotiert; zwei Tests
scheitern an ANSI-Sequenzen in der Terminal-Darstellung; und die Format-Leiter
des Judge wird pro Frage neu abgelaufen.

Zwei Zahlen dieses Abschnitts waren in der ersten Fassung zu klein und stehen im
neuen Plan korrigiert: es sind 33 `-> object` und 90 `type: ignore` über 32
Dateien dieses Branches, nicht 25 über vierzehn.

**Korrektur zu einer Vermutung, die dieser Abschnitt beinahe als Befund geführt
hätte.** Die Annahme war, ein `fix: address gate review findings`-Commit habe
eine Diagnose stummgeschaltet, statt sie zu beheben. Die Prüfung über alle zehn
Commits widerlegt das: 24 Unterdrückungen über die fünf Gate-Fix-Commits gegen
218 in den Feature-Commits, jede in einer Routinekategorie mit genanntem Grund,
null `pytest.mark.skip`, null geleerte Testkörper, und bei den Assertions jeder
Gate-Fix deutlich netto positiv (+91/+116/+70/+59/+52). Die vier größten
Entfernungen wurden einzeln nachverfolgt: jede war eine Verschärfung. Bei
`ad031549` sah ein gelöschter repo-weiter Hash-Test am schlimmsten aus und
erwies sich als Aufspaltung des Invariants mit Verschärfung von
`len({hash}) == 1` auf `== len(declared)`. Das Muster existiert in diesem Repo
(`9e92a3de` leerte sechs Testkörper), aber nicht in diesem Epic.

### ▸ Gate 6 — Code Review „Erreichbarkeit"

Nach Slice 7. Eine einzige Prüffrage trägt dieses Gate: **ist jedes `approved`
Requirement des Epics an einem ausgelieferten Verhalten ablesbar, oder gibt es
noch Engines, die nur Tests kennen?** Der Weg dorthin ist nicht Stil, sondern
`grep` über die Konstruktoren und die Frage, wer sie im Produkt ruft.

Zusätzlich: laufen die neuen Modell-Aufrufe erstmals in Pfaden, die vorher nie
gefeuert haben — sind Timeout und sicherer Fallback überall da, wo ein hängender
Provider sonst ein Requirement blockiert?

---

## 14. Nicht im Scope

- Adapter für konkrete externe Systeme (Jira, GitHub Issues, Azure DevOps). Der
  Plan liefert das Interface (SWR-3102), die deklarative Quelle (SWR-3104) und
  die Discovery (SWR-3106) — nicht die einzelnen Konnektoren.
- Mehrbenutzerbetrieb, Rollen und Rechte auf dem Board.
- Nicht-Python-Annotationskonventionen (SWR-2316) — die Requirement-Seite ist
  quellenunabhängig, die Trace-Seite bleibt vorerst ReqToCodes bestehende
  Konvention.
- TUI-Parität. Die Requirements-Fläche ist Desktop-only; `rotaris_core.tui`
  wird von keinem Slice angefasst.
