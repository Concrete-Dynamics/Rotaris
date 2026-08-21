# Requirements Board — Fertigstellung in acht Bahnen

**Stand:** 2026-08-15, nach `06eb698` auf `master`
**Vorgänger:** [2026-08-15-requirements-board-open-items.md](2026-08-15-requirements-board-open-items.md),
[2026-08-14-requirements-board-slices.md](2026-08-14-requirements-board-slices.md)
**Neue Requirement-IDs:** sechs (Tabelle unten)

Dieser Plan ist deutsch, der Requirement-Store bleibt englisch — die bestehende
Konvention des Repositories.

---

## 1. Warum es diesen Plan gibt

Die Requirements-Ansicht der ausgelieferten Anwendung zeigt keine Tafel, sondern
den Platzhalter des Controllers: `1493 requirement(s) evaluated`,
`Backlog 1493`, ein Knopf `Re-read requirements` — und darunter nichts.

Die Ursache ist **ein fehlender Aufruf**, und seine Reichweite ist der größte
Teil zweier Epics.

`RequirementsController.attach_view` wird in Produktionscode nie aufgerufen.
`main_window.py:207-214` baut den Controller und registriert `controller.surface`;
die Tafel selbst — `views/requirements.py:566`, rund 1760 Zeilen mit Spalten,
Drag-and-Drop, Move-Leiste, Filtern und den Detail-, Evidenz- und Graph-Flächen —
wird **ausschließlich in Tests** konstruiert, in elf davon. Ist `_view` `None`,
bleibt der Platzhalter dauerhaft sichtbar (`:899`), und jedes Schieben in die
Ansicht ist ein `getattr`, das nichts findet und still scheitert.

Weil `_pane_missing()` für eine Fläche ohne Ansicht `False` liefert (`:576-577`),
geben `install_review()` und `install_queue()` sofort `False` zurück. Review und
Queue waren damit ebenfalls unerreichbar, und mit der Queue auch
`follow_scheduling()` — die Grenzen des Schedulers banden nichts. Drei weitere
Flächen hatten **überhaupt keine Produktionsfabrik**: der Requirement-Editor, die
Blocker-Fläche, und ein Empfänger für `open_file_requested`, das in keiner der
beiden Verdrahtungstabellen stand.

Ergebnis: `New requirement`, `Edit`, `Blockers` und jeder Evidenz-Link waren
lebende Bedienelemente ohne Wirkung, und SWR-3301…SWR-3315 sowie
SWR-3601…SWR-3612 — alle `approved` — hatten keinen Weg, den ein Nutzer gehen
kann.

**Das ist genau der Defekttyp, für den Slice 7 existierte, eine Schicht weiter
außen.** Slice 7 hat geprüft, ob jedes Requirement eine *erreichbare
Implementierung* hat. Niemand hat geprüft, ob die Kompositionswurzel sie
erreicht. Die E2E-Tests haben die Lücke verdeckt, weil sie selbst zusammensetzten,
was das Fenster nicht zusammensetzt.

### Zwei Befunde, die aus derselben Untersuchung stammen

- **Alles liegt im Backlog.** `.rotaris/requirements/delivery/` existiert nicht,
  also fällt jede Karte auf `DEFAULT_DELIVERY_STATE` zurück
  (`delivery/state.py:88`). Am echten Arbeitsbereich gemessen, nach Bahn A:
  **1494 von 1494 Karten in einer Spalte.**
- **Die Tafel baut sich bei jedem Tastendruck neu.** `_search_changed` →
  `set_filter` → `_rebuild` zerstört und erzeugt jede Karte neu. Bei 1494 Karten
  ist das SWR-3302s viertes Akzeptanzkriterium — „ohne den UI-Thread
  einzufrieren" — nicht mehr erfüllt.

### Eine Korrektur am Vorgängerdokument

Posten 5 der offenen Posten behauptet, eine Spec-Datei könne nur *einen* Status
für alle ihre IDs führen, und schlägt vor, `2300-traceability.md` in 38 Dateien
zu zerlegen oder ReqToCode zu ändern. **Beides ist unnötig.**
`generator.py:173` liest `block.get("status", fields.get("status", ""))` — ein
`## SWR-<n>`-Block im Text überschreibt das Frontmatter —, und die Datei
**nutzt das bereits zweimal**: SWR-2300 steht auf `approved` (Zeile 12),
SWR-2301 auf `deprecated` (Zeile 19), und `swr.py:5822-5823` löst beide so auf,
während das Frontmatter weiter `draft` sagt. Posten 5 ist eine Änderung von vier
Zeilen.

Richtig bleibt der teure Teil des Befunds: alle 38 IDs teilen den
`content_hash 72fa0fa4aca0f355`, also treibt jede Änderung an der Datei alle 38
in die Drift.

---

## 2. Neue Requirement-IDs

| ID | Typ | Datei | Bahn |
| --- | --- | --- | --- |
| SWR-3316 | technisch, `derived-from: SWR-3301` | `3300-requirement-board-ui/` | A |
| SWR-3217 | Produkt | `3200-requirement-delivery-state/` | B |
| SWR-3317 | technisch, `derived-from: SWR-3302` | `3300-requirement-board-ui/` | C |
| SWR-3417 | technisch, `derived-from: SWR-3401` | `3400-requirement-execution/` | D |
| SWR-3613 | Produkt | `3600-requirement-board-workflow/` | E |
| SWR-3418 | technisch, `derived-from: SWR-3405` | `3400-requirement-execution/` | H |

Posten 4, 6, 7 und 8 brauchen keine: 6 und 7 sind reine Testarbeit, 4 ist eine
festgehaltene Entscheidung, und 8 ändert Innenleben von Modulen, die bereits
`@traces` tragen (`judge.py:73,125`).

---

## 3. Reihenfolge

```
A  Produktionskomposition ─┬─▶ C  virtualisierte Tafel ─▶ Gate 1
B  Delivery-State-Saat    ─┘

D  Zyklus-Identität (1) ─┬─▶ F  Queue-Zählung (4): erst nach D bewerten
E  Vorschlagsfläche (2)  ─┘                            ─▶ Gate 2

G  Traceability-Status (5) ─▶ SWR-2318 bauen

H  Posten 3, 6, 7, 8 — unabhängig, jederzeit
```

Jede Bahn läuft in einem eigenen Worktree nach AGENTS.md § 1, mit eigenem
`uv sync --all-packages` vor dem ersten Test. Bahnen mergen in den
Epic-Integrationszweig, nicht nach `master`.

---

## 4. Bahn A — Die Fläche setzt sich selbst zusammen · SWR-3316

**Zweig:** `feat/swr-3316-requirements-area-composition` · **Status: erledigt**

**Ziel.** Das Fenster baut weiterhin nur den Controller und registriert die
Fläche; die Fläche installiert ihre eigenen Oberflächen.

### Dateihoheit — neu angelegt

```text
docs/requirements/3300-requirement-board-ui/SWR-3316-requirements-area-composition.md
```

### Dateihoheit — geteilte Dateien, hier exklusiv geändert

| Datei | Änderung |
| --- | --- |
| `services/requirements_controller.py` | `install_board`, `install_editor`, `install_blockers`, `open_file`, `editing`/`attach_editing`, `open_file_requested` in `ACTION_SIGNALS` |
| `services/requirements_actions.py` | `workspace_editing()` — die eine Produktionskomposition des Editors |
| `views/requirements.py` | `pane(key)` als Lesehälfte zu `attach_pane`; das nie gesendete `queue_control_requested` entfernt |
| `views/requirement_queue.py` | Steuerzeile auf zwei Reihen — siehe unten |
| `apps/rotaris/tests/test_requirements_board.py` | E2E nimmt die Tafel vom Controller statt selbst eine zu bauen; vier neue Tests |
| `apps/rotaris/tests/test_requirements_board_actions.py` | Test, dass ein Evidenz-Link etwas erreicht |
| `apps/rotaris/tests/test_requirements_editing.py` | `_desktop` verdrahtet nichts mehr von Hand |

**Verboten in Bahn A:** jede Änderung an `views/main_window.py`.

### Was die Verdrahtung freigelegt hat

- **Die Queue passte nicht ins unterstützte Fenster.** Ihre Steuerzeile forderte
  **1041 Punkte** Mindestbreite — mehr als die 1000 des gesamten unterstützten
  Fensters. Da alle Flächen einen Stapel teilen, machte allein das Installieren
  der Queue die *Tafel* bei 1000×680 unbrauchbar. Die Zeile ist jetzt zwei
  Zeilen; die Fläche fordert 661 und liegt damit unter der Detailfläche (676).
- **Ein E2E-Test riss den Prozess ab.** `test_a_user_creates_a_requirement…`
  ließ eine laufende Auswertung in den Teardown laufen, weil er als einziger
  seiner Nachbarn kein `controller.shutdown()` rief. Vorher unsichtbar, weil die
  Auswertung nie startete; jetzt behoben.

### Akzeptanzkriterien

1. Fenster bauen, `Requirements` wählen → eine Tafel mit den Requirements des
   Projekts, ohne dass irgendwer eine Ansicht angehängt hat.
2. Der Fensterkonstruktor baut keine Tafel und liest keinen Requirement-Store.
3. Jede Fläche wird beim ersten Gebrauch gebaut, ein zweiter Gebrauch
   wiederverwendet sie.
4. Wer eine eigene Fläche anhängt, behält sie.
5. Mit allen Flächen installiert klippt bei 1000×680 nichts.
6. Kein Bedienelement der Tafel ist ohne Wirkung.

### Nachweis am echten Arbeitsbereich

Über die Produktionskomposition, nicht über einen Test:

```text
before opening: controller.view = None
after opening:  controller.view = RequirementsView
evaluated: available=True cards=1494
cards realised on the board: 1494
panes: ('board', 'detail', 'evidence', 'graph')
view visible=True size=884x541   min hint width=758
```

---

## 5. Bahn B — Der erste Blick zeigt die wirkliche Lage · SWR-3217

> **Status: nicht gebaut. Die Bahn ist dreimal an bestehenden, zugesagten
> Entscheidungen aufgelaufen — alle drei nachgeprüft, nicht vermutet.**
>
> 1. **Ein AST-Wächter über `src/` verbietet jede Schreibtür.**
>    `tests/unit/requirements/test_delivery_store.py:539` läuft über `src/` und
>    `apps/rotaris/src/` und behauptet: `DeliveryStore.seed` hat **null**
>    Aufrufstellen, `moved_to` nur `transitions.py`, `update_record` genau zwei.
>    `seed()`s eigener Docstring sagt: „Nothing under `src/` calls this, and a
>    guard test … keeps it that way."
> 2. **Die Übergangsmatrix kennt die Kanten nicht.** `LEGAL_TRANSITIONS`
>    (`transitions.py:108-128`) hat weder `Backlog → Done` noch
>    `Backlog → Needs-Update`; der Kommentar sagt ausdrücklich, dass die
>    Abwesenheit der Punkt ist. `Done` verlangt zusätzlich eine
>    `SatisfiedDelivery` aus dem Snapshot eines echten Laufs plus ein
>    Completion-Gate — eine Saat hat beides nicht.
> 3. **SWR-3216 verbietet den Aufrufort.** Die Projektions-API ist „side-effect
>    free", und Tests behaupten, dass ein Aufruf nichts schreibt.
>
> Daraufhin wurde auf „ableiten, nichts persistieren" umgeschwenkt — und das ist
> an derselben Wand ein viertes Mal aufgelaufen, an der aufschlussreichsten
> Stelle: `epics.py::derived_status` (`:247-284`) tut bereits genau das für
> Epics, und **weigert sich, Provenienz zu erfinden**. Ohne ehrliches
> `changed_at`/`changed_by` liefert es pristine `Backlog` zurück, statt einen
> Zustand zu behaupten, den niemand herbeigeführt hat.
>
> Damit ist die eigentliche Frage keine technische mehr: `Done` bedeutet in
> diesem System *Rotaris hat geliefert und ein Completion-Gate hat zugestimmt*.
> Ein von Hand implementiertes Requirement erfüllt das nicht, und es in `Done`
> zu zeigen wäre genau die zweite Antwort, die SWR-3311 verbietet. **Backlog ist
> für nie ausgelieferte Requirements vermutlich richtig — die Beschwerde ist
> nicht, dass die Zustände falsch sind, sondern dass eine Spalte mit 1498 Karten
> nichts zeigt.** Das ist eine Produktfrage (wonach gruppiert die Tafel beim
> ersten Öffnen?), keine Zustandsfrage, und sie gehört entschieden, bevor hier
> Code entsteht.

**Ziel.** Ein Requirement, das Rotaris nie bewegt hat, liegt heute im Backlog —
auch die mehreren hundert, deren Code geschrieben, annotiert und grün ist.

Beim ersten Lesen wird gesät: wo der Delivery-Store keinen Satz führt, wird der
Zustand aus dem abgeleitet, was die Maschine ohnehin berechnet hat —
ReqToCode-Status und Evidenz-Gesundheit — und über den bestehenden Schreibpfad
festgeschrieben, mit einem Auditeintrag, der die Saat als solche benennt.

Der Vorschlag für die Abbildung, im Requirement zu begründen: `deprecated` →
`done`; `approved` mit erfüllter Evidenz → `done`; `approved` mit veralteter
oder fehlender Evidenz → `needs-update`; `draft` → `backlog`.

**Die eine Wache, auf die es ankommt:** gesät wird einmal, nur wo kein Satz
existiert. Ein Requirement, das ein Nutzer bewegt hat, darf nie neu gesät
werden — das ist der einzige Weg, auf dem diese Funktion echte Arbeit zerstören
könnte.

---

## 6. Bahn C — Eine Tafel, die 1494 Karten erträgt · SWR-3317

**Ziel.** `_rebuild` erzeugt jede Karte neu, und `_search_changed` ruft es pro
Zeichen. Statt des gestückelten Neuaufbaus virtualisiert `_Column`:

- die Spalte hält die geordneten `card_ids` und erzeugt Widgets nur für das
  sichtbare Band plus etwas Vorlauf, geführt von ihrer vorhandenen Bildlaufleiste;
- Widgets werden über `set_card` wiederverwendet — der Pfad, den der Delta-Zweig
  schon benutzt — statt zerstört und neu gebaut;
- eine Filteränderung rechnet `card_ids` neu und zeichnet das Band, ohne Abriss;
- das Suchfeld entprellt in diese Neuberechnung hinein.

**Bewusst zu entscheiden:** `card_widgets` und `populating`/`pending_count` sind
öffentlich und werden quer durch die Tafel-Tests gelesen. Was `card_widgets`
nach der Virtualisierung bedeutet, wird entschieden und die Leser werden in
derselben Änderung nachgezogen — nicht kaputtgelassen.

Zusätzlich: `install_review` liest `project_detail` **synchron auf dem
Qt-Thread**. Bei 1494 Requirements ist das ein sichtbarer Hänger beim ersten
Klick auf ein Review; gehört auf den Worker der Bridge.

---

## 7. Bahn D — Eine Identität je Auslieferungszyklus · SWR-3417 *(Posten 1)*

`mint_unit_id` leitet Ids aus `(req_id, key)` ab, ohne Zyklusanteil
(`units.py:107-139`); `plan_units` liefert `discarded=()` (`:610-619`), und
`UnitStore.save` ersetzt die ganze Datei (`store.py:160-181`). Der erste
`_save_units` des zweiten Zyklus löscht damit die `run_ids` des ersten.

**Empfehlung des Vorgängerdokuments übernommen: ein Feld `cycle: int = 0` auf
`ExecutionUnit`, kein Diskriminator in der Id.** Die Id ist an **fünf** Stellen
Schlüssel, nicht an vier: Eindeutigkeit in `RequirementUnits`, der Verbund
Historie↔Units (`history.py:566-574` → `units.py:539-548`),
`FlowProgress.unit_runs` (`flow.py:501`), der Git-Namensraum
(`run_seam.py:139-157`, `worktrees.py:239-259, 336-348`) und die
Scheduler-Identität (`scheduler.py:196-198, 294-296, 330-332, 349-351`). Die
fünfte entscheidet: `schedule_now`s Rückfallpfad muss dieselbe Id prägen wie der
Flow (`requirements_actions.py:2040-2043` sagt das ausdrücklich).

**Achtung bei der Migration:** die Serialisierung ist handgeschrieben, nicht
`model_dump_json`. `unit_payload` (`store.py:79-100`) und `unit_from_payload`
(`:103-123`) brauchen das Feld beide.

Die Probe `cycles.py`, die das Vorgängerdokument als wiederverwendbar nennt,
**existiert im Repository nicht** — die Sequenz ist als Test zu schreiben.

---

## 8. Bahn E — Ein abgeleitetes Requirement wird angeboten · SWR-3613 *(Posten 2)*

SWR-3411 ist `approved` und verspricht in seiner E2E-Zeile, dass ein Vorschlag
*angeboten* und durch *Annehmen* geschrieben wird. Beides fehlt:
`derive_technical_requirements` schreibt entweder direkt durch oder berichtet
nur, und ihr einziger Aufrufer schickt das Ergebnis nach `logging.info`
(`requirements_actions.py:2549`).

Die Review-Fläche hat dafür nichts: `REVIEW_ELEMENTS` ist ein geschlossenes
Tupel aus elf Elementen, `REVIEW_DECISIONS` kennt sechs Entscheidungen, keine
davon betrifft ein abgeleitetes Requirement.

**Die offene Frage des Vorgängerdokuments ist durch den Requirement-Text
entschieden:** ein Vorschlag wird **immer** angeboten und **nie** automatisch
geschrieben. `confirm_source_writes` gilt für diesen Pfad damit nicht mehr — die
Begründung des Schalters („der Schreibvorgang ist bereits eine Nutzeraktion")
wird erst wahr, wenn es ein Angebot gibt.

---

## 9. Bahn F — Queue-Zählung *(Posten 4)*

**Empfehlung: bewusst so lassen und die Entscheidung festhalten.** Der Posten
korrigiert sich beim nächsten Lesen selbst, und beide Auswege kosten mehr als
der Schaden. Der Docstring bei `:1950-1965` beschreibt den Handel bereits
ehrlich; ihm fehlt nur das Datum der Entscheidung. Neu zu bewerten erst, wenn
Bahn D die Aufteilung früher kennbar macht.

---

## 10. Bahn G — Vier Requirements dürfen sagen, was sie sind *(Posten 5)*

**Zweig:** `feat/swr-2318-requirement-tombstones` · **Status: erledigt**

Wie vorhergesagt drei zusätzliche Zeilen, nicht 38 Dateien: unter den
Überschriften `## SWR-2335`, `## SWR-2336` und `## SWR-2337` je `status:
approved` — der Mechanismus, den dieselbe Datei in Zeile 12 und 19 schon
benutzt. Alle drei trugen längst echte `@traces` **und** `@verifies`; sie
standen nur auf `draft`, weil niemand wusste, dass sie etwas anderes sagen
dürfen. 1284 → 1288 `approved`.

**SWR-2318 war tatsächlich ungebaut** und ist jetzt gebaut, weil sein Status
erst nach dem Obigen ausdrückbar war:

- `src/rotaris_core/reqtocode/tombstones.py` — der Retired-Ids-Katalog.
- `regenerate_if_stale` **sieht** Löschungen: das Modul, das gerade ersetzt
  wird, ist der Bestand der letzten Generierung, also ist eine Id darin, die der
  Store nicht mehr führt, gelöscht. Das ist der einzige Moment, in dem das
  Werkzeug es beobachten kann — niemand muss daran denken.
- `parse_requirements` weist einen Store zurück, der eine bestattete Id
  beansprucht, und nennt Datum und alten Titel. Dort geprüft und nicht in einem
  Kommando, damit `check`, `generate`, `diff` und der Verifier alle ablehnen.
- `RepoLayout.tombstone_path`, von `with_requirements_dir` mitgeführt wie die
  drei Baselines, also gilt es auch für ein fremdes Repository (SWR-2335).

Der Katalog ist **append-only** — anders als die shrink-only-Ratschen daneben:
eine zurückgezogene Id bleibt für immer zurückgezogen, und der erste Eintrag zu
einer Id gewinnt, damit ein zweiter Lauf das Datum nicht neu schreibt. Die
Vorgängergeneration wird mit `ast` gelesen, nicht mit einem regulären Ausdruck,
weil der Generator Titel mit `repr()` schreibt und ein Titel mit Anführungszeichen
jedes Muster schlagen würde.

Ein Commit, ein Bearbeiter, keine anderen Requirement-Änderungen gleichzeitig:
die 38 geteilten `content_hash`-Einträge treiben sonst fremde Bahnen in die
Drift.

---

## 11. Bahn H — Die unabhängigen Posten

**Posten 3 — Windows-Pfadlänge · SWR-3418.**
`GitWorktreeService.create_for_session` (`session/worktrees.py:83-111`) führt
`git worktree add` aus; `_git` (`:495-499`) hebt git's stderr wörtlich an, es
reist über `IsolationError` in `failure_reason` und wird nirgends übersetzt. Der
Nutzer liest `Filename too long` und wird zu git geschickt. Übersetzen, nicht
das Repository des Nutzers ändern. Nebenbefund: die Wiederholungsschleife
verbraucht die Versuche **nicht** — `_is_branch_collision` (`:27-38`) trifft nur
Zweigkollisionen, ein Pfadfehler fliegt sofort.

**Posten 6 — `-> object`-Doubles.** Gezählt: 61 Vorkommen in 31 Dateien, 472
`type: ignore` in 119 Dateien über beide Testwurzeln. Zuerst die
`run_agent`-Naht, weil sie Aufrufer im Bündel erledigt.
`tests/integration/test_requirement_board_promise.py:188` annotiert sein Double
bereits präzise und braucht an der Aufrufstelle **keine** Unterdrückung — das
ist die Zielform.

**Posten 7 — die zwei „roten" Tests. Die Diagnose des Vorgängerdokuments hält
nicht.** Nachgemessen auf `master` bei `06eb698`:

```text
uv run python -m pytest tests/integration/test_cli.py::test_run_help_lists_expected_flags \
    tests/unit/test_todo_pane.py::test_todo_pane_renders_markdown_checkboxes_per_task_status
2 passed
```

Beide sind **grün**, und der volle Kernlauf dieser Bahn meldet 5514 grün, 0 rot.
Rot werden sie nur unter einer schmalen Terminalbreite — mit `COLUMNS=60`
scheitert der CLI-Test reproduzierbar, weil Rich die Optionstabelle dann umbricht
und abschneidet, sodass `--unsafe-outside-workspace` als Teilstring nicht mehr
vorkommt. Die Ursache ist die **Breite**, nicht eine ANSI-Sequenz mitten im Text;
`tests/unit/test_todo_pane.py:12-18` setzt zudem **bereits** `no_color=True`.

Der Posten ist damit kein „Assertions ANSI-strippen", sondern: die Breite im
Test festnageln, statt sie von der Umgebung erben zu lassen. Weiterhin richtig
bleibt die Warnung, **nicht** `NO_COLOR=1` zu setzen — das bricht vierzehn
Textual-Snapshots.

**Posten 8 — die Format-Leiter.** `StructuredJudge` wird je Frage neu gebaut
(`analysts.py:229`) und besitzt seine Leiter (`judge.py:149-154`).
`deferred_completion` memoisiert genau eine Sache, den LLM-Handle, und wird an
zwei der vier Aufrufstellen selbst je Aufruf neu gebaut
(`requirements_actions.py:1777, 1865`). Zuerst den Neuaufbau je Aufruf beheben —
er ist die größere Verschwendung und das, was das Memo überhaupt lohnend macht.

---

## 12. Qualitäts-Gate pro Bahn

Wie AGENTS.md § 3, in dieser Reihenfolge: ReqToCode `check` → `ruff format` +
`ruff check` → `mypy` (beide Pakete) → Unit + Integration → Rotaris-Desktop
(parallel, dann seriell).

Ein Gate ist nur grün gegen die Baseline vor der Bahn. **Die Baseline ist
vollständig grün** — nachgemessen in Bahn A: Kern 5514 grün / 0 rot / 12
übersprungen, Desktop 875 grün plus 1 seriell. Die beiden Tests, die das
Vorgängerdokument als vorbestehend rot führt, sind es nicht; siehe Posten 7.

---

## 13. Was **nicht** auf dieser Liste steht

- **Ein Dateibetrachter in Rotaris.** `open_file` übergibt an die Anwendung des
  Systems und nennt die Zeile, statt einen Sprung zu versprechen, den es nicht
  einlösen kann. Es gibt keine In-App-Fläche für Dateien und keine konfigurierte
  Editor-Zeile; beides zu erfinden ist eine eigene Entscheidung, keine
  Verdrahtung.
- **`views/main_window.py`.** Unverändert, in jeder Bahn. Das ist SWR-3315s
  Zusage und der Grund, warum diese Arbeit überhaupt teilbar ist.
