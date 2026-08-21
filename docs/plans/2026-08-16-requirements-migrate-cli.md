# Die Erreichbarkeits-Lane — `requirements migrate`, und die Antwort, die antwortet

**Stand:** 2026-08-16, auf `claude/next-epics-planning-r8xjmd`
**Vorgänger:** [2026-08-16-requirements-migration.md](2026-08-16-requirements-migration.md)
**Neue Requirement-IDs:** keine. Diese Lane macht erreichbar, was bereits
`approved` ist — SWR-3507, SWR-3508, SWR-3512, SWR-3416.

---

## 1. Der Befund: das Feature war vollständig und unerreichbar

Nach den Lanes A–C existierte die Superseding-Migration von Anfang bis Ende: ein
Worklist wird geplant, persistiert, freigegeben, in einem eigenen Worktree
ausgeführt, dort verifiziert und über den Integrator gelandet.

**Niemand konnte sie auslösen.** `accept_migration` — die einzige Funktion, die
aus einem geplanten Worklist geänderten Code macht — hatte auf keiner Oberfläche
einen Aufrufer. Der Wächter, der genau das finden soll
(`test_engines_are_reachable.py`), greift nicht: er läuft über *Konstruktionen*,
und eine Host-Funktion ist keine Engine.

Der Desktop wäre der zweite Weg gewesen, und der endete einen Schritt vor dem
Ziel — siehe 1.1.

### 1.1 Eine beantwortete Frage wurde nie beantwortet

`PendingDecisionStore.record_answer` hatte genau **einen** ausgelieferten
Aufrufer: `_close_migration_question`, aus Lane C. Der Antwortpfad des Boards
war bis zum letzten Schritt vollständig und ließ ihn dann fallen:

```
RequirementBlockerPanel.answered(req_id, option_name)   widgets/requirement_blockers.py
  → RequirementsController.answer_blocker
    → RequirementsActions.answer_blocker
      → perform(ANSWER_BLOCKER, target=blocked_from, reason=answer)
```

`perform` schob die Karte mit `Cause.BLOCKER_CLEARED` aus `Blocked` und schrieb
eine Audit-Zeile. Den Decision-Store fasste es nie an. Zwei Folgen, beide real:

- **Die Frage war permanent.** `open_decisions` las sie bei jedem Board-Read
  erneut, und die „ist schon offen"-Sperre in `_ask_about_migration` unterdrückte
  danach jedes erneute Stellen — das Worklist konnte nie wieder angeboten werden.
- **Die gewählte Option wurde verworfen.** Sie kam als Freitext in `reason` an,
  und nichts verzweigte darauf. „carry out the migration" und „leave the code as
  it is" taten dasselbe: Karte bewegen, Code nicht ändern.

### 1.2 `DecisionError` wurde nirgends gefangen

`require_human` wirft ihn für einen System-Actor **und für einen unbenannten
Nutzer**. In `src/` und `apps/` gab es kein einziges `except DecisionError`;
`accept_migration` fing nur `MigrationApprovalError`. Beide Oberflächen setzen
den Actor auf `""` vorbelegt. Die erste Freigabe ohne Namen war ein Traceback —
aus einer Funktion, deren ganzes Thema „diese Entscheidung erreicht einen
Menschen" ist.

### 1.3 `CoverageEvidence.for_repository` las das falsche Layout

`coverage_map(repo_root)` ohne Layout fällt auf `DEFAULT_LAYOUT` zurück, das
`src/rotaris_core` heißt — richtig für dieses Repository und falsch für jedes
andere. In einem fremden Workspace fand der Sweep des Boards **null** Sites.

Das war als „nächste Lane" notiert und stellte sich als **Voraussetzung** heraus:
`accept_migration` leitet den Digest des Worklists aus genau diesem Sweep neu ab
und verweigert bei Abweichung. Ein Sweep des falschen Baums findet nichts, und
damit wäre *jede* Freigabe in einem fremden Projekt mit „die Sites haben sich
bewegt" abgelehnt worden — bei einem Projekt, in dem sich nichts bewegt hat.

`analyse_removals` macht denselben Aufruf seit der Removal-Lane richtig, mit
Kommentar. Die Begründung stand also schon im Repository, eine Ebene daneben.

### 1.4 Nicht behoben, mit Beleg festgehalten

- **33 tote Config-Felder.** Der Sweep meldete 36; drei sind Fehlalarm
  (`RequirementPersonaConfig.source_discovery` / `impact_analysis` /
  `migration_analysis` werden dynamisch über `getattr(config.requirements.
  personas, job)` gelesen). Die übrigen 33 sind deklariert, dokumentiert,
  vorbelegt — und werden von nichts gelesen, gegen SWR-3117s eigenen Satz
  „Later slices read the block". Darunter alle fünf `scheduling`-Schalter und
  fünf der sechs `human_in_the_loop`-Schalter.
- **`requirements.board` ist aus einem Grund tot, den niemand aufgeschrieben
  hat.** Seine acht Felder sind tot, weil das Board Filter und Sortierung in
  `QSettings` hält — „ein Board-Filter ist eine Eigenschaft der Person, nicht des
  Workspace". Das ist vertretbar; nur verspricht der Config-Block weiterhin das
  Gegenteil. Entweder der Block geht oder die Begründung kommt hinein.
- **`blocker_from_decision`** (`widgets/requirement_blockers.py`) ist definiert,
  in `__all__` exportiert und wird von nichts aufgerufen: das Board erreicht
  Decisions über `open_decisions` → `BoardEntry.blockers` → `build_blockers`.

---

## 2. Was diese Lane gebaut hat

### 2.1 `answer_decision` — die Verzweigung liegt in der Engine

Eine Funktion in `change_host.py`, die die offene Frage lädt, die Option prüft
und tut, was die Option bedeutet: `MIGRATION_APPROVED` auf einer
`RISKY_MIGRATION` ruft `accept_migration`, alles andere wird als Antwort
verbucht und schließt die Frage.

Schließen und Handeln sind **ein** Aufruf. Eine Oberfläche, die erst die Antwort
verbucht und dann entscheidet, was daraus folgt, dürfte „ja" aufschreiben und
nichts tun — genau der Zustand, den diese Lane repariert. Und die Freigabe ist
es, die die Frage schließt, auf ihrer *anderen* Seite: eine abgelehnte Freigabe
lässt die Frage offen, statt ein Board mit nichts zum Klicken zurückzulassen.

Die Optionsnamen sind jetzt Konstanten (`MIGRATION_APPROVED`,
`MIGRATION_DECLINED`), die der Fragende **und** der Antwortende lesen. Vorher
suchte `_close_migration_question` per `name.startswith("carry out")` — eine
Umformulierung entfernt davon, die Frage zu schließen und nichts zu tun.

### 2.2 `requirements migrate` auf beiden Oberflächen

`migration_offer` und `pending_migrations` in `execution/cli_host.py`, jeder
Laufzeit-Import im Funktionskörper (der Import-Wächter in
`test_cli_requirements.py` prüft, dass die CLI weder SDK noch Qt hereinzieht).
Darüber je ein Typer- und ein argparse-Kommando, die sich in nichts als der
Argumentanalyse unterscheiden.

Exit-Codes nach der Konvention der Gruppe: `0` Antwort — auch eine leere Liste;
`1` die Freigabe lief und ergab kein prüfbares Ergebnis (Sites haben sich
bewegt); `2` kein Store, kein solches Requirement, nichts wartend, kein
`--actor`.

Zwei Aufrufe statt einem, absichtlich: `evaluate` plant und fragt, `migrate`
gibt frei und plant die Unit, `run` führt sie aus. Das ist es, was SWR-3507s
„inspectable before any code changes" von einer Zusage zu einer Eigenschaft
macht, die ein Nutzer prüfen kann — über Prozessgrenzen hinweg.

### 2.3 Der Antwortpfad des Boards

`RequirementActions._answer_blocker`, angesteuert aus `perform` neben seinen
beiden Geschwistern `ACCEPT_PROPOSAL` und `ACCEPT_CHANGE_WORK` — damit „the
single entry every write goes through" wahr bleibt. Ein Blocker ohne gespeicherte
Frage (Run, Dependency) verhält sich exakt wie vorher; nur Decisions haben eine
zweite Hälfte bekommen.

`ChangeWorkPort` wurde um `question` und `answer` erweitert; die
Produktionsimplementierung `WorkspaceChanges` bringt beide mit und bezahlt den
Sweep erst beim Antworten, nicht beim Zeichnen einer Spalte.

### 2.4 Der Wächter

`accept_migration` und `answer_decision` stehen jetzt in `ENGINES` — mit dem
Kommentar, warum sie dort nötig waren: die Regel läuft über Konstruktionen, und
eine Host-Funktion ohne Aufrufer war für sie unsichtbar.

---

## 3. Was als Nächstes ansteht

- **Adoption in die Engine.** `adopt_workspace` ist weiterhin Desktop-only und
  wurde durch sechs aufeinanderfolgende Plandokumente wortgleich als „nächstes"
  mitgeschleppt.
- **Der Propagation-Report erreicht eine Oberfläche.** `PropagationReport` trägt
  `moved`, `decayed`, `analysed`, `migrations` und `removals`; beim Nutzer
  ankommt nur die Summenzeile, das Board zeigt nichts davon.
- **Die 33 toten Config-Felder** aus 1.4, requirementweise.
