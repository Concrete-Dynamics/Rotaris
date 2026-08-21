# Die Removal-Lane — was ein verschwundenes Requirement hinterlässt

**Stand:** 2026-08-16, auf `claude/next-epics-planning-r8xjmd`
**Vorgänger:** [2026-08-16-requirements-landing.md](2026-08-16-requirements-landing.md)
**Neue Requirement-IDs:** eine — SWR-3119 (technisch, aus SWR-3113).
SWR-3509 war bereits `approved` und hat jetzt einen Produktionspfad.

---

## 1. Der Befund, und warum er größer war als „ein fehlender Aufrufer"

Die Propagation-Lane hat SWR-3509 zusammen mit SWR-3507/3508 zurückgestellt —
„alles, was in die Quelle des Nutzers schreibt". Das war für SWR-3509 falsch, und
seine vier Akzeptanzkriterien genügen, um es zu sehen: benennen, berichten, unter
dem Tombstone aufbewahren, **nichts automatisch löschen**. `RemovalAnalyzer` hält
einen Analysten und eine Uhr — keine Quelle, keinen Store, keinen Pfad, keinen
Trace-Editor. Es gibt in ihm nichts, was etwas löschen könnte.

Der eigentliche Grund, warum das Requirement keinen Produktionspfad hatte, liegt
zwei Schichten tiefer: **eine Entfernung war außerhalb einer einzigen Sitzung gar
nicht feststellbar.**

`RequirementRegistry` faltet Tombstones, indem sie ihren vorigen Snapshot mit dem
neuen Read vergleicht. Sowohl das Log als auch der Snapshot lagen nur in der
Instanz, und **jede ausgelieferte Konstruktion übergab keines von beidem**. Der
erste Refresh jedes Prozesses verglich also gegen nichts, `observe` sah kein „war
da, ist nicht mehr da" — und es wurde nie ein Tombstone geprägt, den man hätte
persistieren können. Ein `rotaris-cli`-Aufruf lebt für genau einen Refresh.

---

## 2. Was gebaut wurde

```
B1  memory.py            beide Hälften überleben den Prozess       SWR-3119
B2  analyse_removals      Schritt 8 des Passes                     SWR-3509
B3  change/__init__       removal.py war nicht einmal exportiert
    der Guard             RemovalAnalyzer + der fünfte Schalter
```

**Die Baseline ist ein Wert, den dieses Repository schon hatte.**
`RequirementBaseline` (SWR-3501) ist „die Requirement-Menge, die die letzte
Auswertung einer Quelle gesehen hat" — Identität, Hashes, Lifecycle und
Provenienz, kein Titel und keine Beschreibung (SWR-3114). Einen zweiten Wert
danebenzustellen wären zwei Antworten auf eine Frage gewesen. Sie zieht auch
bereits die Unterscheidung, die entscheidet, ob ein Erstöffnen eine Katastrophe
ist: `evaluated` trennt „nie ausgewertet" von „ausgewertet und leer".

---

## 3. Vier Dinge, auf die die Lane gestoßen ist

**Die Faltung hatte zwei Gestalten.** Ein Live-Read hält vollständige
Requirements, eine persistierte Baseline nur Hashes. Zwei Typen hätten einen Pfad
hinterlassen, der nie ausgeführt wird — und der nie ausgeführte wäre die
prozessübergreifende Entfernung gewesen, also genau die einzige Art, die eine CLI
je sehen kann. Beide Seiten sprechen jetzt `BaselineEntry`.

**`last_title` wäre still verschwunden.** Eine Baseline darf keinen Titel tragen,
also hätte die Faltung über Baselines jedem Tombstone den Namen genommen. Statt
einen Pfad pro Gestalt einzuführen, nimmt `observe` die Titel entgegen, die der
Aufrufer ohnehin im Speicher hält; eine von der Platte gelesene Entfernung hat
keinen und sagt das, statt einen zu erfinden.

**Ein Guard war längst unerreichbar.** Beim Verbreitern der Signatur fiel
`observe`s Prüfung weg, dass eine ID einer anderen Quelle nicht die Entfernung
*dieser* Quelle ist. Sie wurde eine Schicht weiter außen wieder eingebaut — und
ließ sich nicht testen, weil `SourceRead` **validiert**, dass jedes Requirement
seine eigene Quelle nennt, und sonst wirft. Der Zweig war nie erreichbar. Die
Wiedereinführung ist weg, und der Test fragt jetzt den Validator, der die
Eigenschaft wirklich durchsetzt.

**Die Coverage des Boards kann die erste Akzeptanzbedingung nicht erfüllen.**
`swept.coverage` ist nach den Requirements verschlüsselt, die der Store *aktuell*
führt — eine entfernte ID ist per Definition nicht darunter. Dort nachzusehen
beantwortet „jede Trace und jeder Test der entfernten ID wird benannt" mit
*nichts*. `coverage_map` antwortet, weil es nach Nummer verschlüsselt und
absichtlich Nummern enthält, die Code referenziert und kein Requirement mehr
deklariert — dieselbe Menge, die SWR-2333s Orphan-Regel von der anderen Seite
sichtbar macht.

**Und das Default-Layout ist Rotaris' eigenes.** `DEFAULT_LAYOUT` nennt
`src/rotaris_core`. Für jedes andere Projekt hätte der Sweep gemeldet, ein
Requirement mit Implementierung in `src/` habe gar keinen Code. Der
Removal-Sweep liest jetzt `load_layout(workspace)` (SWR-2335).

---

## 4. Gemessen

Der Config-Guard über den ausgelieferten Quellcode:

```
vorher   4 von 5 requirements.change-Schaltern verzweigen
nachher  5 von 5
```

`report_dangling_dependents` war der letzte, der nichts entschied — benannt statt
weggelassen, seit der Propagation-Lane, mit einer Notiz, die ihn „die eine Regel
dieses Epics, die in die Quelle des Nutzers schreibt" nannte. Diese Notiz war
falsch, und sie steht jetzt korrigiert im Guard.

Der Reachability-Guard: `RemovalAnalyzer` ist in `ENGINES` gewandert und wird von
`change_host.analyse_removals` erreicht.

End-to-end über die CLI, mit zwei getrennten Aufrufen als zwei Prozessen: der
erste liest und hinterlässt seine Erinnerung, der Nutzer löscht die Datei, der
zweite benennt die ID, ihre Herkunftsdatei und den Code, der sie noch
beansprucht. Vor SWR-3119 sah der zweite Aufruf nichts.

---

## 5. Was bewusst **nicht** gebaut wurde

- **Eine Desktop-Fläche für den Removal-Report.** Beim Verfolgen der Zeilen kam
  heraus, dass `bridge.evaluated_lines` — die **gesamte** Ausgabe des
  Propagation-Passes, fünf Requirements' Zeilen plus jetzt Removals — eine
  Property ist, die in der App **nichts rendert**. Das ist eine echte
  Produktlücke, deutlich größer als Removals, und die erste Fläche dafür
  innerhalb dieser Lane zu bauen hieße, die unfertige UI-Arbeit der
  Propagation-Lane zu übernehmen. SWR-3509s E2E ist über die CLI erfüllt, die
  SWR-3416 ausdrücklich als öffentliche Produktgrenze führt.
- **`CoverageEvidence.for_repository` auf `load_layout` umstellen.** Derselbe
  Defekt wie oben, aber im Evidence-Sweep des Boards und älter als diese Lane.
  Benannt statt beiläufig mitrepariert.
- **`RemovalLedger` persistieren.** Kein zweiter Store: `RemovalImpact.to_record`
  liefert bereits einen `AnalysisRecord`, und der wird unter derselben ID
  abgelegt, die auch der Tombstone trägt. „Unter dem Tombstone aufbewahrt" heißt
  ein Store, nicht zwei, die sich widersprechen können.

---

## 6. Offene Posten

1. **SWR-3507/3508 — die Migration ausführen.** Die einzige verbleibende Lane,
   die in die Quelldateien des Nutzers schreibt. Sie landet über den Integrator
   der Landing-Lane.
2. **Der Propagation-Report erreicht keine Desktop-Fläche.** Siehe §5.
3. **`CoverageEvidence.for_repository` liest Rotaris' Layout.** Siehe §5.
4. **Die Adoptions-Komposition in die Engine ziehen.** Unverändert.
5. **Zielgerichtete Verifikation.** Unverändert.
