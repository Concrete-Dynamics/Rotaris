# Die Propagation-Lane — was das Board *tut*, wenn sich die Welt bewegt

**Stand:** 2026-08-16, auf `feat/swr-3515-propagation-lane`
**Vorgänger:** [2026-08-16-requirements-board-evidence-axis.md](2026-08-16-requirements-board-evidence-axis.md)
**Neue Requirement-IDs:** vier — SWR-3515, SWR-3516, SWR-3222, SWR-3616

---

## 1. Der Befund

Zwei Lanes haben den Zustand des Boards wahr gemacht: die Adoption die
**Delivery**-Achse, die Evidence-Lane die **Evidence**-Achse. Beide handelten
vom *Wissen*.

Epic 3500 handelt vom *Handeln* — und handelte nicht. Von vierzehn Requirements
hatten drei einen Produktionspfad (SWR-3502, SWR-3503, SWR-3514). Elf standen auf
`approved` und waren nur von ihren eigenen Tests erreichbar. Und der komplette
Block `requirements.change` — fünf Schalter, die ein Nutzer in `agents.yaml`
setzen kann — wurde von **nichts** gelesen.

Verhalten: Ein geliefertes Requirement, dessen Text sich bewegt, erreicht `Needs
Update` (SWR-3502 ✅), eine Impact-Analyse läuft, schreibt einen `AnalysisRecord`
und druckt eine Notice-Zeile (SWR-3503 ✅) — **und dann sitzt es dort.**
`plan_outcome`, das diesen Befund in Arbeit übersetzt, wurde nie gerufen.

**Warum genau jetzt.** `EvidencePropagator` konsumiert
`Mapping[str, Sequence[StalenessFinding]]`, und bis vor einer Woche war dieser
Input in jedem Workspace leer: `evaluate_freshness` hatte keinen
Produktionsaufrufer. Die Evidence-Lane hat ihn erzeugt — und
`WorkspaceBoard._evaluate` berechnete ihn seither in genau der Schleife, in der
er verworfen wurde. SWR-3504s `Reverifier` hatte keine Implementierung, weil
nichts eine Requirement-scoped Suite laufen lassen konnte; `verification_host`
kann es jetzt.

---

## 2. Die eine Regel

Sechs Regeln dieses Epics wollen einen Delivery-State bewegen, also musste
*einmal* beantwortet werden, was passieren darf, während jemand nur hinsieht:

> **Einen Anspruch wegnehmen ist automatisch. Einen gewähren wird angeboten.**

Aus `Done` heraus und nach `Blocked` hinein darf ein Board-Read — beides ist
Rotaris, das zugibt, etwas nicht mehr zu wissen, und beides kostet einen
Vergleich. Nach `Done` oder nach `Ready` hinein nie: beides sind Ansprüche, und
beide kosten entweder einen Suite-Lauf oder einen Agenten-Lauf. Das ist es, was
ein Board davon abhält, das Geld eines Nutzers auszugeben, weil er einen Tab
geöffnet hat.

Die eine Ausnahme ist die Erklärung des Nutzers selbst:
`requirements.scheduling.mode: automatic` — derselbe Schalter, der die Queue
schon selbst Arbeit aufnehmen lässt, Default `manual`.

**Die Engine war bereits einverstanden**, was zu prüfen und nicht anzunehmen war:
`propagate_evidence` liefert `target=None` für `EvidenceAction.REVERIFY`. Ein
gewöhnlicher Commit unter einem Trace nimmt kein `Done` weg — nur eine
*verschwundene* Site oder eine *fehlgeschlagene* Verifikation.

---

## 3. Was gebaut wurde

```
P1  change_host.py       eine Evaluation, in der Engine, ohne Display   SWR-3515
P2  EvidencePropagator   ein gelöschter Test nimmt Done weg             SWR-3513
P3  WorkspaceReverifier  eine Messung, zwei Lesarten                    SWR-3222
P4  plan_outcome         was die Änderung kostet, wird angenommen       SWR-3616, 3505, 3506, 3504, 3516
P5  relation_blockers    Widerspruch und Zyklus, beidseitig, benannt    SWR-3511, SWR-3510
P6  das Board            drei Kinds erreichen eine wartende Oberfläche
```

**Das Offer wird abgeleitet, nicht gespeichert.** `plan_outcome` ist rein und die
Analyse liegt bereits als `AnalysisRecord` — ein zweiter Store für den Plan wäre
eine zweite Wahrheit. Was ein Board *zeigt*, kommt aus dem Record (eine
Dateilesung, kein `git show` pro Karte); der Plan wird erst beim Annehmen
rekonstruiert, und genau dort verdient `AnalysisInputs.matches` den Docstring,
mit dem es geschrieben wurde: ein Requirement, das zwischen Lesen und Klick
erneut editiert wurde, wird **abgelehnt**.

---

## 4. Drei Dinge, auf die die Lane gestoßen ist

**Der Zustandsautomat hatte keine Kante `Needs Update → Done`.** SWR-3504 und
SWR-3513 sagen beide, das Requirement kehre nach `Done` zurück, und keines von
beiden konnte es: der Zug wurde als illegale Kante abgelehnt. Er reist jetzt über
eine eigene Map in der Form, die SWR-3218 für die Adoption gebaut hat — nur für
die neue Ursache `reverified`, nie von `allowed_targets` gelesen, system-only,
und abgelehnt ohne die Delivery, die wieder-ausgesprochen wird. Anders als bei
der Adoption ist diese Map **additiv**: aus `Running` zu adoptieren wäre falsch,
egal was die Matrix sagt; aus `Review` zu re-verifizieren ist ein gewöhnliches
`Review → Done`, das nur sagt, warum.

**Das Completion-Gate hat den Restore abgelehnt — zu Recht.** SWR-3215s
Bedingungen sind für einen *liefernden Lauf* geschrieben. Ein Restore hat davon
nichts und soll es nicht haben. Sie trotzdem zu lesen hätte einen Restore für
jedes **adoptierte** Requirement unmöglich gemacht — das hat einen Delivery-Record
und gar keine Execution-Records, und ist auf jedem echten Board die größte
Gruppe. Also ersetzt der Restore die *Lesart*, die dem Gate gegeben wird; das
Gate selbst bleibt unangetastet.

**Und der Zug wurde als `run-failed` aufgezeichnet.** `propagation.py` sagte seit
zwei Slices, eine eigene Ursache wäre eine Änderung, und `run-failed` sei die
nächstgelegene. Dies ist der erste Build, in dem ein Nutzer es lesen konnte — und
„der Lauf ist fehlgeschlagen" über einem gelöschten Test schickt ihn auf die
Suche nach einem Lauf, den es nie gab. Es heißt jetzt `evidence-lost`.

---

## 5. Gemessen

Über die 1516 echten Requirements dieses Repositories. Die Suite ist synthetisch
(dass ein Covering-Test wirklich ausgeführt worden sein muss, belegen die
Unit-Tests); alles andere ist der ausgelieferte Pfad — der echte Coverage-Sweep,
die echte Freshness über echtes git, die echten Stores, die echte
Transitionsfunktion.

```
1+2  verify + adopt      1023 adoptiert, 369 abgelehnt, 124 nicht betrachtet
                         delivery: {'Done': 1023}
3    evaluate            0 Zeilen, delivery unverändert
4    einen Covering-Test gelöscht (tests/unit/requirements/test_decision_store.py):
     5 Requirements verlassen Done — SWR-3205, 3213, 3512, 3516, 3611,
     jedes benennt die Datei und sagt „the requirement text did not change"
     delivery: {'Done': 1018, 'Needs Update': 5}
5    Datei zurück, evaluate   → weiterhin Needs Update
     Datei zurück, verify     → alle 5 zurück auf Done
```

Schritt 3 ist der Guard, den diese Lane am nötigsten hatte: eine Evaluation über
einen unveränderten Workspace bewegt nichts. Schritt 4 bewegt *genau* die fünf
Requirements, die diese eine Datei deckt, und keins der 1018 anderen. Und die
Datei zurückzulegen genügt nicht — der Weg zurück kostet eine Verifikation.

**Die Messung hat eine falsche Akzeptanzbedingung gefunden.** SWR-3222 sagte, ein
per Re-Verifikation gewährtes `Done` habe „einen Verifikations-Record, der
denselben Lauf nennt" — und die naheliegende Lesart ist die Delivery, was falsch
ist. Ein Restore *spricht die bestehende Delivery erneut aus* (SWR-3204), also
nennt `satisfied.run_id` weiterhin den liefernden Lauf. Was übereinstimmen muss,
sind der **Audit-Eintrag**, der das `Done` gewährt hat, und der
Verifikations-Record. Der Text ist korrigiert und der Test hält es fest.

---

## 6. Was bewusst **nicht** gebaut wurde

Die Grenze dieser Lane: sie ändert Delivery-States und bietet Arbeit an — sie
schreibt nie in die Quelldateien oder Branches des Nutzers.

- **SWR-3507 / SWR-3508 — die Migration ausführen.** `MigrationExecutor`,
  `TraceEditor` und `LifecycleWriter` schreiben `@traces`-Annotationen an ihren
  Stellen um und setzen `status: deprecated` in der Quelle. Die Worklist zu
  *planen* läuft bereits; sie auszuführen ist eine eigene Lane mit eigenem
  Review-Gate.
- **SWR-3509 — Removal-Impact.** Derselbe Grund, und es braucht das Vokabular,
  das SWR-3507 ausführt. `report_dangling_dependents` ist deshalb der eine
  Schalter von `requirements.change`, der noch nichts entscheidet — benannt
  statt weggelassen.
- **SWR-3501s `SourceChangeDetector`.** Der kontinuierliche Klassifikator über
  alle Quellen. Was diese Lane braucht, ist der Delivered-vs-Current-Vergleich,
  den `assess_specification` bereits leistet.
- **SWR-3409 / SWR-3419 — das Landen und der Target-Branch.** Unverändert aus §6
  der Evidence-Lane: `RequirementIntegrator` bleibt der einzige Eintrag in
  `UNREACHED_ENGINES`. Die funktionierende Schleife bleibt *von Hand landen →
  Verify drücken*.

**Der Guard ist geschrumpft.** `NoImpactResolver`s `xfail(strict=True)` wurde in
dem Moment rot, in dem es konstruiert wurde, und hat seinen Eintrag
herausgezwungen — genau dafür steht er dort. Sechs Engines sind in die
erreichbare Tabelle gewandert.

Und der Config-Guard wurde strenger, nachdem er aus dem falschen Grund grün war:
einen Schalter zu *nennen* ist nicht, ihn zu lesen. Er verlangt jetzt, dass der
ausgelieferte Code auf dem Wert *verzweigt*.

---

## 7. Offene Posten

1. **SWR-3409 verdrahten** — eigene Lane, eigenes Review-Gate.
2. **SWR-3507/3508/3509** — alles, was in die Quelle des Nutzers schreibt.
3. **Die Adoptions-Komposition in die Engine ziehen.** `adopt_workspace` liegt
   weiterhin im Desktop-Paket. Der Verifikations-Pass und jetzt auch der
   Propagation-Pass liegen in `rotaris_core`; die Adoption ist der Ausreißer, und
   die Messung oben musste sie deshalb aus `apps/rotaris` importieren.
4. **Zielgerichtete Verifikation.** Unverändert aus der Evidence-Lane.
