# Offene Posten nach Slice 7 — Requirements Board

**Stand:** 2026-08-15, nach `2827640` auf `feat/swr-3100-requirement-delivery-spec`
**Vorgänger:** [2026-08-14-requirements-board-slices.md](2026-08-14-requirements-board-slices.md)
**Neue Requirement-IDs:** zwei, und nur für Posten 1 und 2 (Begründung dort)

---

## Woher diese Liste kommt

Slice 7 hat gefragt, ob jedes `approved` Requirement des Epics an einem
ausgelieferten Verhalten ablesbar ist. Die Antwort war siebenmal nein, und beim
Beheben sind Dinge aufgefallen, die weder in den Plan noch in den Slice gehörten
— teils weil sie älter sind als das Epic, teils weil sie eine Datenmodell-Frage
aufwerfen, die man nicht am Gate unter drei parallelen Lanes entscheidet.

Alle acht Posten sind **belegt, nicht vermutet**. Wo eine Zeilennummer steht, ist
sie nachgeprüft; wo eine Zahl steht, ist sie gezählt. Zwei Zahlen aus der
Slice-7-Diskussion waren zu klein und sind hier korrigiert.

Die Posten sind nach Schaden sortiert, nicht nach Aufwand. Posten 1 und 2 sind
Produktfehler an `approved` Requirements. Posten 3 bis 5 sind echte, aber
begrenzte Lücken. Posten 6 bis 8 sind Hygiene.

---

## 1 — Die Läufe zweier Auslieferungszyklen liegen unter einer Unit-Id

**Schaden: hoch. Betrifft SWR-3401, SWR-3414. Braucht eine neue technische ID.**

`mint_unit_id` leitet Ids aus `(req_id, key)` ab — bewusst, damit ein Neuplanen
nach einem Neustart byte-identische Ids liefert (`units.py:27`, „Ids are derived,
not drawn"). Seit Slice 7 ein Requirement mehr als einmal ausgeliefert werden
kann, prägt der zweite Zyklus dieselbe Id wie der erste. Folge:

- `ExecutionHistory` ist append-only und hält beide Zyklen unter einer `unit_id`,
  ohne Marker, der sie trennt.
- Die Karte zeigt die Läufe des zweiten Zyklus (aus dem Unit-Satz), die
  Historiendatei hält beide vermischt.
- `RequirementUnits.run_ids` — der Leser, um den es SWR-3401s viertem Kriterium
  und SWR-3414 geht — wird beim ersten `_save_units` des zweiten Zyklus
  überschrieben, weil `plan_units` ein frisches Objekt mit `discarded=()` liefert
  und `UnitStore.save` (`store.py:161`) die Datei vollständig ersetzt.

Bemerkenswert: `store.py:164` dokumentiert genau die Eigenschaft, die verletzt
wird — *„a discarded unit still owns its id … a file that dropped it would let
the next plan hand that id to different work"*. Der Flow hält diese Zusage nicht.
Der Docstring beschreibt eine Absicht, keine Eigenschaft.

**Der Fehler ist älter als Slice 7** und war unsichtbar, solange niemand zweimal
ausliefern konnte. Er ist erst jetzt beobachtbar.

**Umsetzung.** Ein Zyklus-Diskriminator, und die Wahl zwischen zwei Formen ist
die eigentliche Arbeit:

- *In der Id* (`…-c7ab2972#2`): trennt Historie sauber, bricht aber die
  Übereinstimmung zwischen Queue und Flow, wenn nicht beide Seiten denselben
  Zyklus kennen. `schedule_now`s Fallback prägt heute ohne `taken`, damit die
  Queue dieselbe Unit benennt wie der Flow — das muss erhalten bleiben.
- *Als Feld auf `ExecutionUnit`* (`cycle: int`): lässt die Id in Ruhe, verlangt
  aber eine Migration des `UnitStore`-Formats und einen Leser in Projektion und
  Historie.

Meine Empfehlung ist das Feld, weil die Id an vier Stellen als Schlüssel
verwendet wird und ein Schlüsselwechsel jede davon berührt. Aber das ist eine
Empfehlung, keine Entscheidung — sie gehört an den Anfang der Umsetzung, nicht
in diesen Plan.

**Verifikation.** Zwei vollständige Zyklen über die echte Komposition, danach
`ExecutionHistory.load(req_id)` mit unterscheidbaren Läufen pro Zyklus und eine
Karte, die die Läufe beider zeigt. Die Probe `cycles.py` aus dem Gate-6-Review
fährt genau diese Sequenz und ist wiederverwendbar.

**Risiko.** Formatmigration am Unit-Store. `SESSION_SCHEMA_VERSION` hat gezeigt,
dass Pydantic-Defaults hier der Migrationsmechanismus sind — ein neues Feld mit
Default ist rückwärtskompatibel, eine Id-Änderung nicht.

---

## 2 — SWR-3411 verspricht eine Fläche, die es nicht gibt

**Schaden: hoch, weil `approved`. Betrifft SWR-3411. Braucht eine neue ID nur,
wenn die Fläche eigene Kriterien bekommt.**

Der Anforderungstext sagt: *„Rotaris states the difference where the proposal is
**presented**: a unit is a work split and disappears; a technical requirement is
permanent."* Die E2E-Zeile des Testportfolios sagt: *„A user is **offered** a
derived technical requirement after a run and **accepting** it updates the
project's store."*

Beides existiert nicht. `derive_technical_requirements`
(`requirements_actions.py:1785`) schreibt die Anforderung direkt über den
Quellpfad und hängt einen `WRITE_BACK`-Auditeintrag an; bei
`confirm_source_writes: true` (`config/schema.py:1897`) wird nichts geschrieben,
sondern nur berichtet. Es gibt kein Angebot und kein Annehmen.

Das ist exakt der Defekttyp, für den Slice 7 existierte — ein `approved`
Requirement, dessen Akzeptanzzeile keinen Pfad hat —, nur eine Ebene feiner: die
Verdrahtung steht, die *Nutzerinteraktion* fehlt.

**Umsetzung.** Eine Vorschlagsfläche im Review-Bereich, die den vom Lauf
erzeugten Vorschlag zeigt, den Unterschied zwischen Unit und technischer
Anforderung benennt, und beim Annehmen den Schreibpfad auslöst. Der Schreibpfad
selbst ist fertig und erreichbar (`RequirementWriteBack` hat seit Slice 7 einen
Produktionskonstruktor), es fehlt der Auslöser.

**Zuerst zu klären, vor jedem Code:** ist `confirm_source_writes: true` der
richtige Schalter für diese Fläche, oder soll ein Vorschlag *immer* angeboten und
nie automatisch geschrieben werden? Die vier Akzeptanzkriterien schweigen dazu,
und die Antwort entscheidet, ob das eine Config-Verzweigung ist oder eine
Änderung am Vorgabeverhalten.

**Verifikation.** Die E2E-Zeile des Portfolios wörtlich: ein Lauf, ein
angebotener Vorschlag, ein Annehmen, ein geänderter Store — durch die
Produktionskomposition.

---

## 3 — Requirement-Worktrees reißen auf Windows die 260-Zeichen-Grenze

**Schaden: mittel, aber der Nutzer wird zum falschen Werkzeug geschickt.**

Beim Gate-Lauf von Slice 7 aufgetaucht, kein Testartefakt:

```
error: unable to create file docs/requirements/3400-requirement-execution/SWR-3416-headless.md: Filename too long
fatal: Could not reset index file to revision 'HEAD'.
```

Der Lauf verbraucht beide Versuche und meldet erschöpfte Wiederholungen. Der
Requirement-Baum eines Projekts sieht typischerweise so aus
(`docs/requirements/<epic>/<SWR-id>-<slug>.md`), und ein Worktree unter einem
tiefen Workspace-Pfad reicht.

Im Test entschärft durch `git config core.longpaths true` auf dem Fixture-Repo,
mit Begründung im Code. **Im ausgelieferten Code wird es nirgends gesetzt** —
`grep -rn longpaths src/` findet nichts.

**Zu entscheiden.** Setzt Rotaris `core.longpaths` auf den Worktrees, die es
selbst anlegt, oder ist das Sache der Umgebung? Für „selbst setzen" spricht, dass
die Fehlermeldung einen Nutzer sonst zu git führt und nicht zu Rotaris; dagegen
spricht, dass Rotaris damit eine Repository-Einstellung des Nutzers ändert.

Ein Mittelweg wäre, den Fehler zu *erkennen* und zu übersetzen: „Der Pfad ist für
Windows zu lang; `git config --global core.longpaths true` oder ein kürzerer
Workspace-Pfad." Das ändert nichts am Repository und behebt die eigentliche
Beschwerde, nämlich dass der Nutzer nicht weiß, was los ist.

**Verifikation.** Ein Lauf unter einem Pfad jenseits von 260 Zeichen, mit einer
Meldung, die Rotaris erklärt und nicht git.

---

## 4 — Die Queue zählt eine Wiederauslieferung als eine Unit

**Schaden: gering, selbstkorrigierend. Betrifft SWR-3406, SWR-3412.**

Der Platzhalter-Kandidat, den `schedule_now` für ein Requirement ohne Units
bildet, steht für *eine* Unit. Teilt der Flow es danach in mehrere, ist es für
einen Planungsdurchgang gegen `max_concurrent_units` zu niedrig gezählt, und
`avoid_file_conflicts` hat nichts zu prüfen, bis der Flow die echten Units
schreibt.

Das galt immer schon für die Erstfreigabe und ist im Docstring von `schedule_now`
als solches dokumentiert. Neu ist, dass die in Slice 7 erweiterte Bedingung
(`planned.units and live.outstanding`) denselben Platzhalter auf einem zweiten
Weg erreichbar macht — bei einer Wiederauslieferung.

**Warum es nicht trivial ist.** Es zu schließen hieße, dass die Queue eine
Aufteilung kennt, bevor der Flow sie geplant hat. Entweder die Zerlegung wandert
vor die Planungsentscheidung (teuer: ein Modellaufruf pro Queue-Lesung), oder die
Queue lernt, eine geschätzte Anzahl zu führen und später zu korrigieren.

**Ehrliche Einschätzung:** dieser Posten ist ein Kandidat für „bewusst so
lassen". Er korrigiert sich beim nächsten Lesen selbst, und beide Auswege sind
teurer als der Schaden. Er steht hier, damit die Entscheidung getroffen und nicht
vergessen wird.

---

## 5 — SWR-2318 und SWR-2335/2336/2337 stehen auf `draft`

**Schaden: mittel, und es ist ein Werkzeugproblem, kein Codeproblem.**

`docs/requirements/2300-traceability.md` führt **38 IDs unter einem einzigen
`status: draft`** (verifiziert: die `req-id`-Liste im Frontmatter geht von
SWR-2300 bis SWR-2337). Darin:

- **SWR-2318** — die Store-Hälfte der Tombstones, deren Gegenstück SWR-3113 ist.
  Ungebaut.
- **SWR-2335/2336/2337** — implementiert, aber weiterhin `draft`, weil sie sich
  den Status mit 35 anderen teilen.

Solange die Datei einen Status für 38 Requirements führt, kann keines davon
einzeln auf `approved` gehen. Das ist keine Nachlässigkeit, sondern eine
Eigenschaft des Formats.

**Umsetzung, zwei Wege.**

- *Die Datei aufteilen* — je ein Requirement je Datei, wie es die 3000er-Epics
  tun. Sauber, und es macht `diff --strict` für diese IDs erst benutzbar. Teuer:
  38 Dateien, und der geteilte `content_hash` bedeutet, dass die Aufteilung
  Drift für alle 38 meldet.
- *Mehrere Status je Datei erlauben* — eine Änderung an ReqToCode selbst.
  Billiger im Einzelfall, aber es fügt dem Format eine Form hinzu.

Erst danach ist SWR-2318 überhaupt sinnvoll zu bauen, weil sein Status sonst
nicht ausdrückbar ist.

**Verifikation.** `reqtocode check` grün, `diff --strict` ohne Drift, und die
Baselines byte-identisch — Letzteres ist bei einer Aufteilung der schwierige
Teil.

---

## 6 — 33 Test-Doubles sind als `-> object` annotiert

**Schaden: gering. Reine Hygiene, aber es ist die Sorte, die sich vermehrt.**

**Korrigierte Zahlen** (die aus der Slice-7-Diskussion waren zu klein): über die
Testdateien, die dieser Branch berührt, stehen **33 `-> object` und 90
`type: ignore` in 32 Dateien**. Im gesamten Testbaum sind es 61 beziehungsweise
472.

Das Muster ist überall dasselbe: ein Test-Double wird als `-> object` annotiert,
um einen Laufzeit-Import des echten Rückgabetyps zu vermeiden, und der Aufrufer
bekommt dann ein `type: ignore[arg-type]`, weil der deklarierte Seam-Typ nicht
passt. Jede dieser Dateien hat bereits `from __future__ import annotations` und
einen `TYPE_CHECKING`-Block — der präzise Typ wäre ohne Laufzeit-Import zu haben
gewesen. `-> object` hat nichts gekauft.

**Umsetzung.** Entweder die Doubles unter `TYPE_CHECKING` präzise annotieren,
oder — besser für den `run_agent`-Seam — den Seam auf ein `Protocol` mit
`-> AgentRunResult` ziehen, was alle Aufrufer auf einmal erledigt.

**Warum nicht in Slice 7:** 32 Testdateien am Gate anzufassen, um eine
zertifiziert grüne Lage gegen eine kosmetische Verbesserung zu tauschen, ist der
falsche Handel. Als eigener Durchgang mit eigenem Testlauf ist es risikoarm.

**Ausdrücklich keine Vertuschung.** Die Archäologie über die zehn Commits des
Epics hat das geprüft: 24 Unterdrückungen über fünf Gate-Fix-Commits gegen 218 in
den Feature-Commits, jede in einer Routinekategorie mit genanntem Grund, null
`skip`, null geleerte Testkörper, Assertions überall netto stark positiv.

---

## 7 — Zwei Tests scheitern an der Terminal-Darstellung

**Schaden: gering, aber sie verrauschen jeden Gesamtlauf.**

- `tests/integration/test_cli.py::test_run_help_lists_expected_flags`
- `tests/unit/test_todo_pane.py::test_todo_pane_renders_markdown_checkboxes_per_task_status`

**Mechanismus belegt, nicht vermutet:** `--background` *steht* in der Hilfe. Rich
schiebt ANSI-Sequenzen mitten in den Flag-Text, sodass ein Teilstring-Test ihn
nicht findet; nach dem Strippen der Sequenzen ist er da. Beide Module hat dieses
Epic nie berührt, und `app.py` ist gegenüber `master` bis auf zwei Zeilen
`register()` unverändert.

**Nicht mit `NO_COLOR=1` lösen.** Das behebt diese zwei und bricht dafür vierzehn
Textual-Snapshot-Tests — geprüft.

**Umsetzung.** Die Assertions ANSI-strippen, bevor sie vergleichen. Zwei Zeilen
pro Test.

**Warum nicht in Slice 7:** fremde Tests anzupassen, damit das eigene Gate grün
aussieht, ist die falsche Bewegung — auch wenn die Anpassung hier richtig wäre.
Als eigener Commit mit eigener Begründung ist sie sauber.

---

## 8 — Die Format-Leiter wird pro Frage neu abgelaufen

**Schaden: sehr gering. Bewusste Nicht-Entscheidung, hier festgehalten.**

`StructuredJudge` wird pro Frage neu gebaut (`analysts.py`), also überlebt das
Wissen „dieser Provider mag kein `json_schema`" die Frage nicht. Slice 7 hat den
Reparaturversuch auf die Sprosse festgenagelt, unter der gefragt wurde — das war
ein Kohärenzfehler und ist behoben. Was bleibt, ist **eine verschwendete
Rundreise pro Frage** bei einem Provider, der strikte Schemata ablehnt.

Der Ort für dauerhaftes Provider-Wissen wäre die Closure aus
`deferred_completion`, die den LLM-Handle ohnehin memoisiert.

**Bewusst nicht gebaut:** in einem Slice, der Schulden abbauen soll, neuen
Zustand einzuführen, um einen Aufruf pro Analyse zu sparen, ist der falsche
Handel. Steht hier, damit die Entscheidung nachlesbar ist statt vergessen.

---

## Reihenfolge

```
1 (Zyklus-Identität) ──┐
                       ├─▶ 4 (Queue-Zählung) — erst danach sinnvoll zu bewerten
2 (SWR-3411-Fläche) ───┘

5 (Traceability-Status) ──▶ SWR-2318 bauen

3, 6, 7, 8 — unabhängig, jederzeit
```

Posten 1 und 2 sind die einzigen, die ein Gate rechtfertigen. Sie hängen nicht
voneinander ab und können parallel laufen: Posten 1 fasst
`requirements/execution/{units,store,history}.py` an, Posten 2 den Review-Bereich
des Desktops.

Posten 4 sollte **nach** Posten 1 bewertet werden — nicht weil er davon abhängt,
sondern weil eine zyklusbewusste Unit-Identität die Frage „wie viele Units wird
das?" möglicherweise ohnehin beantwortbar macht.

Posten 3, 6 und 7 sind je ein Nachmittag und brauchen keine Lane.

---

## Was **nicht** auf dieser Liste steht

- **Der Standort von `decomposition_for`.** Er liegt in `cli_host.py`, obwohl ihn
  beide Konsumenten rufen. Geprüft und bewusst so gelassen:
  `execution/decomposition.py` ist das Entscheidungsmodul, dessen ganzer Sinn
  eine aus genannten Fakten berechnete Begründung ist, und ein Builder, der
  Konfiguration liest und Provider-Handles zurückstellt, nähme ihm diesen
  Charakter. Die Begründung steht im Docstring der Funktion.
- **Die beiden Decomposition-Builder.** Kollabiert in Slice 7 auf einen, nachdem
  verglichen statt angenommen wurde. Der eine echte Unterschied — die injizierte
  Uhr — wurde zur Naht gemacht statt eliminiert.
- **Die Erreichbarkeits-Guards selbst.** Sie sind nach fünf Fehlalarmen dicht,
  und die fünf Mechanismen stehen im Vorgängerplan. Kein offener Posten.
