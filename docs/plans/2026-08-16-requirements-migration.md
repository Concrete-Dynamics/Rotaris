# Die Migrations-Lane — was mit dem Code passiert, den ein ersetztes Requirement zurücklässt

**Stand:** 2026-08-16, auf `claude/next-epics-planning-r8xjmd`
**Vorgänger:** [2026-08-16-requirements-removal.md](2026-08-16-requirements-removal.md)
**Neue Requirement-IDs:** zwei — SWR-3517 und SWR-3518, beide technisch aus SWR-3507.
SWR-3507 und SWR-3508 waren bereits `approved` und haben jetzt einen Produktionspfad.

---

## 1. Der Befund

Die Ausführungshälfte von SWR-3507/3508 war vollständig geschrieben und
vollständig getestet: `approve_migration`, `ApprovedMigration`,
`MigrationApproval`, `MigrationExecutor`, `MigrationExecution`,
`SupersedingCompletion`, `CompletionResult` — **mit null ausgelieferten
Aufrufern**. Das Planen lief: Schritt 7 des Propagation-Passes ruft
`plan_migration` und legt einen `AnalysisRecord` ab.

Drei Dinge standen dazwischen, und nur das erste stand im Plan.

**Kein `TraceEditor` wurde ausgeliefert.** Das Protokoll existierte, jede
Implementierung war ein Test-Fake.

**Der Plan überlebte die Lesung nicht, die ihn erzeugt hat.** `to_record()`
flacht die Worklist zu Prosa ab, und niemand liest sie zurück — also war
`plan.digest`, der Wert, den eine Freigabe unterschreibt, nach dem Ende dieser
Lesung nicht mehr herleitbar. Neu planen ist ein Modellaufruf *und* eine andere
Antwort.

**Der naive Rewrite hätte dieses Repository zerstört.** `Reference.line` zeigt
auf die Zeile des *Symbols*, nicht auf die des `@traces(`. Gemessen über `src/`,
`apps/` und `tests/`: 8522 Annotations-Aufrufstellen, davon **2121 mit mehr als
einer ID**, **53 über mehrere Zeilen umbrochen**, **1 in Aufrufform**. Die Zeile
zu löschen hätte einer Geschwister-ID die Annotation mitgenommen, ein `@traces(`
ohne schließende Klammer hinterlassen oder eine ausführbare Anweisung entfernt.

---

## 2. Was gebaut wurde

```
C1  conventions.py        eine Lesung der Annotations-Grammatik   SWR-3517
C2  SourceTraceEditor     der Rewrite, der die Formen kennt       SWR-3507
C3  MigrationPlanStore    die Worklist überlebt ihre Lesung       SWR-3518
C4  RISKY_MIGRATION       die Frage, die es im Vokabular gab      SWR-3512
C5  MigrationRunHost      eine gewöhnliche Execution-Unit         SWR-3507
C6  SupersedingCompletion `deprecated` im selben Commit           SWR-3508
```

**Nichts Neues erfunden, wo es etwas gab.** `DecisionTrigger.RISKY_MIGRATION`
existierte, war mit „a migration that can lose work if it is wrong (SWR-3507)"
annotiert, parkte bereits in `Review`, und `require_human` war bereits das, was
eine Freigabe zu einer menschlichen Handlung macht. Die Frage wird durch den
`PendingDecisionStore` gestellt und über die Blocker-Fläche beantwortet, die das
Desktop schon rendert.

**Und es ist eine gewöhnliche Unit.** Der Flow legt einen Worktree an, bevor er
irgendeinen Host anfasst, wiederholt Fehlschläge, verifiziert das Ergebnis,
schreibt die Historie und landet den Branch über den Integrator der Landing-Lane.
Eine Migration außerhalb davon hätte jedes dieser Dinge neu herleiten müssen. Der
`agent` der Unit benennt die Worklist statt eines Prompts, die Komposition
verteilt danach — der Rest ist die Pipeline, die jede andere Unit auch nimmt.

**Zwei Schreibvorgänge, ein Commit.** Die Annotations-Rewrites (SWR-3507) und das
`status: deprecated` (SWR-3508) sind dieselbe Änderung: ein als ersetzt
markiertes Requirement, dessen Code es noch beansprucht, ist genau der
halbmigrierte Zustand, den beide Requirements verhindern sollen. Sie landen
gemeinsam oder gar nicht, und sie erreichen die Basis nur, wenn die Suite im
Worktree grün war.

---

## 3. Vier Dinge, auf die die Lane gestoßen ist

**Eine Verweigerung ist die richtige Antwort, und sie stoppt von selbst.** Der
Editor gibt eine nicht angewandte `TraceEdit` zurück, wenn er eine Stelle nicht
mit Sicherheit identifizieren kann. Das ist kein weicher Fehlschlag:
`MigrationExecution.completed` ist falsch, solange eine Bearbeitung offen ist,
und `SupersedingCompletion` verweigert die Deprecation einer unvollständigen
Ausführung. Eine Stelle, die der Editor raten müsste, hält also die ganze
Migration an — ohne dass dieses Modul etwas entscheidet.

**Die Aufrufform wird verweigert, und zwar absichtlich.** ReqToCode annotiert
sich selbst, indem es den Dekorator auf einen Namen anwendet. Diese Zeile zu
entfernen löscht, was ein Modul *tut*, nicht was es beansprucht — und keine
Worklist-Zeile verlangt das.

**Der Config-Text war stärker als die Config.** `confirm_migration_worklist`
sagte: „Off would let an agent delete living code." Das kann es nicht:
`MigrationApproval` läuft durch `require_human` und weist jeden Akteur ab, der
kein benannter Mensch ist — eine Eigenschaft des Typs, nicht der Einstellung. Der
Schalter entscheidet, ob eine geplante Worklist ihr Requirement mit einer offenen
Frage parkt; ausgeschaltet wird sie trotzdem geplant und gespeichert, sie
unterbricht nur das Board nicht. Der Text steht korrigiert.

**Der ganze Block `human_in_the_loop` war tot.** Sechs Schalter, keiner gelesen.
Diese Lane liest den einen, den sie braucht; die anderen fünf — `escalate`,
`require_review_before_done`, `allow_force_done`, `confirm_source_writes`,
`answer_timeout_minutes` — sind im Guard namentlich als bewusst abwesend
vermerkt, statt ihn für Arbeit rot zu machen, die niemand getan hat.

---

## 4. Gemessen

Der Editor im Trockenlauf über dieses Repository:

```
11842 annotierte IDs
  11751 behandelt (99,23 %)   6354 als einzige ID ihrer Annotation
                              5397 als eine von mehreren
                              (davon 511 in über mehrere Zeilen umbrochenen)
     91 verweigert            ausschließlich Aufrufform (Selbst-Annotation)
```

Der Reachability-Guard:

```
vorher   13 Engines erreichbar
nachher  17 — MigrationExecutor, SupersedingCompletion, SourceTraceEditor,
              MigrationPlanStore
```

Und ein neuer Schalter-Guard über `requirements.human_in_the_loop`, mit einem
Eintrag und fünf benannten Auslassungen.

End-to-end über ein echtes Repository: eine genehmigte Worklist zeigt danach
`SWR-601` in Implementierung und Test, `status: deprecated` in der Quelldatei des
ersetzten Requirements, **beides in einem Commit**, den Checkout des Nutzers
unverändert, und der echte ReqToCode-Sweep findet keine Referenz mehr auf die
stillgelegte ID.

---

## 5. Was bewusst **nicht** gebaut wurde

- **`adapt`- und `migrate`-Units.** Sie werden über das Feld
  `MigrationExecution.handed_to_units` berichtet, das es dafür schon gibt, aber
  nicht erzeugt. Ein Modell in die Schleife einer Migration zu setzen, die danach
  auf dem Branch des Nutzers landet, ist eine größere Zusage als SWR-3507s
  viertes Kriterium macht.
- **`SupersededStanding`.** Weiterhin ohne Produktionskonsumenten; das Board
  beantwortet „schedulable", „zählt für den Fortschritt" und „sichtbar" aus
  Lifecycle (`delivery/state.py:411`), Epic-Fortschritt (`delivery/epics.py:149`)
  und Health (`delivery/health.py:87`). Drei Pfade, die sich zufällig einig sind.
- **Eine Desktop-Fläche für die Migrations-Frage.** Sie erscheint in der
  Blocker-Fläche, die SWR-3607 schon rendert, weil `RISKY_MIGRATION` nach
  `Review` parkt und der `PendingDecisionStore` die offene Frage hält. Eine
  eigene Review-Zeile mit einem eigenen `BoardAction` wäre mehr Fläche für
  dieselbe Entscheidung.

---

## 6. Offene Posten

1. **`adapt`/`migrate` als Agenten-Units.** Siehe §5.
2. **Fünf tote Schalter in `human_in_the_loop`.** Siehe §3.
3. **`SupersededStanding` verdrahten oder entfernen.** Siehe §5.
4. **Der Propagation-Report erreicht keine Desktop-Fläche.** Unverändert aus der
   Removal-Lane.
5. **Die Adoptions-Komposition in die Engine ziehen**, und **zielgerichtete
   Verifikation**. Unverändert.
