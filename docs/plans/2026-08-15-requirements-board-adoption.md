# Requirements-Tafel: bestehende Arbeit übernehmen statt behaupten

Nachfolgeplan zu [2026-08-15-requirements-board-finalization.md](2026-08-15-requirements-board-finalization.md).
Dort blieb genau eine Spur liegen — die Spalte, in der beim ersten Öffnen alle
1502 Requirements stehen. Dieser Plan löst sie.

## 1. Der eigentliche Defekt

Der Befund der Finalisierung war richtig, die Diagnose nicht. Es ist kein
Abbildungsproblem, sondern ein **Widerspruch zwischen zwei freigegebenen
Requirements**:

- **SWR-3201**: „A newly discovered requirement is `Backlog` **without a write**,
  and persists only once its state is first changed."
- **SWR-3302**, E2E-Zeile: „A user opens Requirements and sees their project's
  requirements **distributed over the delivery columns**."

Auf einem Projekt auf der grünen Wiese gilt beides. Auf einem **bestehenden**
Projekt — Rotaris' eigenem Repository und jedem Projekt, das Rotaris jemals
einführt — kann beides nicht zugleich gelten: Der ehrliche Lieferzustand von
Arbeit, die Rotaris nie gemacht hat, ist `Backlog`, und zwar für alles.

Jeder frühere Versuch hat SWR-3302 erfüllt, indem er SWR-3201 still verletzt hat.
Genau deshalb ist er an einer Wache aufgelaufen: an der `seed()`-Wache, an der
fehlenden Kante `Backlog → Done`, am schreibfreien Vertrag von SWR-3216 und an
`epics.py::derived_status`, das sich weigert, Herkunft zu erfinden. Die Wachen
waren keine Hindernisse, sondern der Entwurf, der der Diagnose widersprochen hat.

## 2. Was das Zielbild dazu sagt

Aus [2026-08-14-requirements-board.md](2026-08-14-requirements-board.md):

- **§4** — `Backlog` heißt „bekannt, soll aber aktuell **nicht agentisch
  umgesetzt** werden". Nicht „unbekannt", nicht „nicht implementiert".
- **§5, §7** — der `satisfied_hash` ist das, was eine spätere Änderung in
  sichtbare Arbeit verwandelt.
- **§52, §53** — kein zweites Jira, kein zweites Requirement-Repository.
- **§2.1, §8** — GitHub Issues und Jira sind bereits als **Source Adapter**
  vorgesehen (SWR-3102, SWR-3104, SWR-3115). Die spätere Anbindung ist eine
  Quellenfrage, und diese Hälfte ist schon spezifiziert.

Und der entscheidende Präzedenzfall, **SWR-3504** (freigegeben): Ein Ergebnis
`no behavioural impact` löst „a **verification of the existing implementation**
against the new requirement version" aus; besteht sie, „the new hash is adopted
as `satisfied_hash`… and the adoption is recorded with the verifying run".

**Rotaris kennt also bereits einen zulässigen Weg, auf dem ein Requirement ohne
implementierenden Lauf `Done` wird: den vorhandenen Code verifizieren.** Genau
das ist der Bestandsfall. Er braucht keine neue Philosophie, sondern nur, dass
dieser Weg auch bei der Übernahme offensteht und nicht erst nach einer Änderung.

## 3. Warum sich das nicht fälschen lässt

Das bestehende Tor aus SWR-3215 gegen ein handgebautes Requirement gerechnet:

| Bedingung | Antwort heute | Grund |
| --- | --- | --- |
| `units-finished` | **erfüllt** | null Units, trivial erfüllt |
| `implementation-traces` | **erfüllt** | die Coverage-Abfrage findet sie |
| `covering-tests` | **erfüllt** | die `@verifies`-Annotation ist da |
| `covering-tests-passed` | **offen** | `CoveringTest.executed` ist falsch, solange keine Suite die Datei ausgeführt hat |
| `completion-gate` | **offen** | kein liefernder Lauf |
| `integration-complete` | nicht anwendbar | null Units |
| `satisfied-hash-current` | **offen** | nichts hat eine gelieferte Fassung festgehalten |
| `no-unresolved-blocker` | **erfüllt** | — |

Fünf von acht antworten ohne jede Codeänderung richtig. Die drei offenen sind
genau die drei, die „ein Lauf hat das wirklich verifiziert" bedeuten — und
`CoveringTest.executed` (`verifier/requirement_evidence.py:139`) weigert sich,
einen Test als bestanden zu melden, den keine Suite ausgeführt hat.

**Das Modell lässt die Übernahme nicht lügen.** Also muss sie wirklich
verifizieren. Damit ist das Feature von der Konstruktion her ehrlich statt von
einem Versprechen her.

## 4. Die Lösung — vier Schichten

Jede Schicht trägt für sich; zusammen machen sie die Tafel am ersten Tag richtig.

```
Schicht 1  Gruppierungsachse   nur Darstellung, kein Schreibzugriff   SWR-3318
Schicht 2  Übernahme           ein Verifikationslauf → echtes Done    SWR-3217, SWR-3218
Schicht 3  Herkunft            die Naht für Jira/GitHub               SWR-3219, SWR-3118
Schicht 4  Das Angebot         die Tafel bietet an, führt nie aus     SWR-3614
```

### Neue Ids

| Id | Epic | Typ | Aussage |
| --- | --- | --- | --- |
| SWR-3217 | 3200 | Produkt | Bestehende Arbeit wird nach Verifikation übernommen, nie behauptet |
| SWR-3218 | 3200 | technisch, `derived-from: SWR-3217` | Der Übernahmedurchlauf und seine Kante |
| SWR-3219 | 3200 | technisch, `derived-from: SWR-3204` | Eine erfüllte Lieferung nennt ihre Herkunft |
| SWR-3318 | 3300 | Produkt, `derived-from: SWR-3309` | Die Tafel gruppiert nach einer gewählten Achse |
| SWR-3614 | 3600 | Produkt | Die Tafel bietet die Übernahme an und führt sie nie ungefragt aus |
| SWR-3118 | 3100 | Produkt (`draft`) | Eine Quelle darf ihren eigenen Lieferzustand melden — spezifiziert, nicht gebaut |

## 5. Dateihoheit

| Schicht | Dateien |
| --- | --- |
| 1 | `delivery/projection.py`, `views/requirements.py`, `services/requirements_bridge.py` |
| 2 | `delivery/adoption.py` *(neu)*, `delivery/state.py`, `delivery/transitions.py`, `services/requirements_actions.py` |
| 3 | `delivery/satisfied.py`, `delivery/store.py` |
| 4 | `services/requirements_controller.py`, `views/requirements.py` |

## 6. Akzeptanzkriterien der Gesamtarbeit

- Beim Öffnen eines Workspace wird weiterhin **keine einzige** Lieferdatei
  geschrieben (SWR-3201).
- `allowed_targets(Backlog)` enthält für keinen Akteur `Done` — Ziehen auf
  `Done` bleibt strukturell unmöglich (SWR-3609).
- Ein Requirement, dessen deckende Tests nicht liefen oder fehlschlugen, wird
  nicht übernommen und bleibt in `Backlog`.
- Eine Übernahme ist pro Requirement rücknehmbar; was Rotaris selbst geliefert
  hat, ist es nicht.
- Nach der Übernahme führt eine Textänderung an einem übernommenen Requirement
  über SWR-3502 nach `Needs Update` — die Änderungsfortpflanzung läuft damit
  erstmals über den Bestand.

## 7. Gemessen an diesem Repository

Über die eigenen 1508 Requirements, mit der echten Coverage-Auswertung:

| | vorher | nachher |
| --- | --- | --- |
| Lieferspalten | `backlog: 1508` | `backlog: 459`, `ready: 21`, `done: 1028` |
| Epic-Karten | alle `Backlog` | `Ready: 21`, `Done: 13`, `Backlog: 2` |
| Übernommen | — | 1015; 369 abgelehnt, 124 nicht betrachtet |

Die Ablehnungen sind benannt: 326-mal fehlt eine Implementierungsspur, 191-mal
ein deckender Test. Nicht betrachtet wurden 36 Epics und 88 deprecated
Requirements. Jede übernommene Lieferung sagt `adopted from verification run`
statt `delivered by run`, und ihr `satisfied_hash` steht — eine Textänderung
daran läuft ab jetzt über SWR-3502 nach `Needs Update`.

**Bekannte Lücke, bewusst offen gelassen.** Die Gesundheitsachse bleibt nach der
Übernahme auf `Incomplete Traceability`, weil die Evidenzauswertung ihre
`verification`-Pflicht aus den Aufzeichnungen des Verifiers liest und die
Übernahme dort nichts hinterlässt — sie schreibt in den Lieferspeicher. Die
Lieferachse stimmt damit, die Karte zeigt `Done`, aber der Ring bleibt
zurückhaltend. Das ist keine Falschaussage, aber eine unvollständige: eine
Übernahme sollte zusätzlich einen Verifikationsdatensatz hinterlassen. Gehört zu
SWR-3207/SWR-3208 und nicht in diesen Plan.

Vor der Übernahme trennt die Gesundheitsachse übrigens genauso wenig wie die
Lieferachse (zwei Spalten): Jedes Requirement schuldet eine Verifikation, keines
hat eine. Die Achsen, die ein Projekt am ersten Tag wirklich aufteilen, sind
**Epic** (36 Spalten) und **Lifecycle** (3) — das Angebot sagt deshalb genau das.

## 8. Was bewusst nicht gebaut wird

Die externe Hälfte von Schicht 3 (Jira/GitHub melden ihren Zustand) wird
**spezifiziert und nicht implementiert**. SWR-3118 bleibt `draft`. Gebaut wird
nur das Vokabular — `DeliveryOrigin` mit seinen drei Mitgliedern —, damit ein
späterer Adapter an eine vorhandene Aufzählung andockt, statt sie zu ersetzen.
Ein Rückschreiben von Zuständen nach Jira ist ausdrücklich nicht Teil dieses
Plans.
