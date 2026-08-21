# Die Evidence-Achse — die Verifikation aufheben, und sie verfallen lassen

**Stand:** 2026-08-16, auf `feat/swr-3220-evidence-axis`
**Vorgänger:** [2026-08-15-requirements-board-adoption.md](2026-08-15-requirements-board-adoption.md)
**Neue Requirement-IDs:** vier — SWR-3220, SWR-3221, SWR-3615, SWR-3419 (letzteres `draft`)

---

## 1. Der Befund

Die Adoption hat die **Delivery**-Achse wahr gemacht. Die **Evidence**-Achse —
der Traceability-Ring, das was §2.3 des Zielbilds *„Traceability als
Produktzustand"* nennt — war weiterhin konstant. Nicht selten falsch:
**strukturell konstant, in jedem Workspace, für immer.**

Gemessen über die 1512 Requirements dieses Repositories:

```
health über alle Requirements:  {'Incomplete Traceability': 1424, 'Deprecated': 88}
fehlende Pflicht-Obligations:   {'verification': 1512, 'implementation': 170, 'test': 216}
```

Zwei Werte, und der zweite ist ein Lifecycle, keine Evidenz. `verification` ist
für **jeden** Requirement-Typ eine Pflicht-Obligation (`obligations.py:163`), und
`EvidenceInputs.verification` ist das, was sie erfüllt. Folglich waren
`RequirementHealth.HEALTHY`, `.VERIFICATION_FAILED` und der Stale-Pfad nach
`.NEEDS_UPDATE` im ausgelieferten Produkt **unerreichbar** — drei von sieben
Health-Werten konnten nie angezeigt werden.

### Vier Erzeuger, keiner hebt auf

| Erzeuger | Zustand | Beleg |
| --- | --- | --- |
| Unit-Verifikation (SWR-3410) | `UnitVerification.to_record()` geschrieben, außerhalb von Tests **nie gerufen** | `execution/verification.py:325`; der Flow behält nur einen String (`history.py:137`) |
| Adoption (SWR-3217) | berechnet das Executed/Passed-Overlay, gibt es dem Gate, **verwirft es** | `requirements_actions.py:3106` |
| SWR-3504 Re-Verifikation | `NoImpactResolver` wird **nie konstruiert**; `_verifier is None` | `change/outcomes.py:759, 871` |
| Completion-Verifier (SWR-2603/2606) | erzeugt `RequirementEvidence` — in den **Run-Report**, nie in den Requirement-Store | `verifier/requirement_evidence.py` |

Und ein Konsument: `CoverageEvidence` hatte bereits einen Parameter
`verifications=`, den kein ausgelieferter Code je übergeben hat.

Zwei weitere `approved` Requirements im selben Zustand: **SWR-3209**
(`evaluate_freshness` ohne Produktionsaufrufer, `staleness` immer leer) und
**SWR-3210** (`RequirementEvaluator` nie konstruiert).

---

## 2. Die Falle, die diesen Plan geformt hat

**Eine Verifikation zu persistieren, ohne ihren Verfall zu verdrahten, wäre eine
Verschlechterung gewesen, keine Verbesserung.** Ein gespeichertes Urteil, das
nie abläuft, malt den Ring **grün** über Code, der sich seitdem bewegt hat. Der
heute dauerhaft rote Ring irrt wenigstens in die vorsichtige Richtung.

Deshalb sind Persistenz (SWR-3220) und Verfall (SWR-3209) **ein** Commit, und
deshalb hat in `tests/unit/requirements/test_workspace_evidence.py` jeder Test
„jetzt kann es gesund sein" ein Geschwister, das die Gesundheit mit genanntem
Grund wieder wegnimmt.

---

## 3. Wo eine Verifikation gemessen werden darf — das Worktree-Problem

Ein vom Board gestartetes Requirement läuft in einem eigenen Worktree
(SWR-3405), und mehrere laufen parallel in mehreren (SWR-3406). Eine Suite, die
in einem dieser Bäume grün ist, sagt nichts über die anderen und nichts über den
Branch, auf dem sie alle landen: **zwei Requirements können einzeln grün und
zusammen rot sein.**

Also wird eine Verifikation, deren Commit vom Target-Branch aus nicht erreichbar
ist, **abgelehnt** statt aufgezeichnet. Das macht die Regel strukturell statt
konventionell — dieselbe Form wie SWR-3609s „die UI kann `Done` nicht
erzwingen": Der Commit eines Unit-Worktrees ist nicht erreichbar, solange seine
Arbeit nicht gelandet ist, also gibt es keinen Aufrufer, der einen befördern
kann, indem er die richtige Funktion kennt.

Was die Frage *„hat das andere Requirement meines kaputt gemacht?"* beantwortet,
ist die Freshness, **pro Datei**: Landet B nach A's Verifikation, ist A's Commit
weiterhin erreichbar, aber der Diff seitdem enthält B's Dateien — und wo die A's
Traces oder Tests schneiden, wird A stale, mit genanntem Grund. Nicht still
grün, nicht pauschal rot.

Ein **manuell** gestarteter Lauf bleibt unberührt: er behält SWR-2602s
Post-Change-Verifikation im eigenen Workspace und schreibt keinen
Requirement-Record. Die Unterscheidung wird dort gezogen, wo der Flow komponiert
wird, nicht durch nachträgliches Beschnuppern eines Laufs.

---

## 4. Was gebaut wurde

```
SWR-3220  das Artefakt          Urteil + Baseline + Pro-Test-Ausgang, eine Datei
SWR-3221  der Pass             ein Suite-Lauf, ein Record pro gedecktem Requirement
SWR-3615  die Aktion           „Verify" — angeboten, nie ungefragt ausgeführt
SWR-3419  der Target-Branch    spezifiziert, bewusst nicht gebaut (`draft`)
```

**Das Artefakt (SWR-3220)** liegt unter
`.rotaris/requirements/verifications/<id>.json` und hält drei Dinge, weil sie
**ein** Ereignis sind: das Urteil (SWR-3208), die Sites, über denen gemessen
wurde (SWR-3209s Baseline), und was der Lauf mit jedem Covering-Test getan hat
(SWR-2606). Ein Payload ohne das zweite oder dritte ist **unlesbar** statt
degradiert — es als „der Lauf hat nichts gesehen" zu lesen, würde jeden späteren
Freshness-Vergleich Drift melden lassen, die nie stattgefunden hat.

Bewusst **getrennt vom Delivery-Record**: eine Verifikation darf für ein
Requirement in `Backlog` existieren — genau so erfährt ein Nutzer, dass etwas
bereits fertig ist, bevor er sich für die Adoption entscheidet. Sie auf den
Delivery-Record zu legen, würde einen Delivery-Record für ein Requirement
erzwingen, das nichts geliefert hat — was SWR-3201 verbietet und der Widerspruch
ist, den die Adoption gerade aufgelöst hat.

**Der Verfall.** `GitFreshness` fragt git **einmal pro verschiedenem verifiziertem
Commit**, nie einmal pro Requirement — nach einer Adoption teilen sich alle einen
Commit, also ist es ein `git diff` für das ganze Board.
`merge-base --is-ancestor` wird als **drei** Antworten gelesen: `0` erreichbar,
`1` wegrebased, **alles andere unbekannt**. Git liefert `128` für einen Commit,
den es gar nicht auflösen kann, und das als „kein Vorfahre" zu lesen würde einen
Workspace stale markieren, weil er geprunt wurde statt weil sich etwas bewegt hat.

---

## 5. Gemessen

Über die 1512 echten Requirements dieses Repositories, mit dem echten
Coverage-Sweep (die Suite ist synthetisch; dass ein Covering-Test wirklich
ausgeführt worden sein muss, belegen die Unit-Tests):

```
vorher   {'Incomplete Traceability': 1424, 'Deprecated': 88}
Pass     1200 verifiziert, 0 abgelehnt, 312 nicht erreicht
nachher  {'Incomplete Traceability': 230, 'Healthy': 1194, 'Deprecated': 88}
```

Die 312 ohne Record sind die, deren Covering-Tests die Suite nicht ausgeführt
hat; die verbleibenden 230 „Incomplete Traceability" fehlen `implementation`
(170) oder `test` (216). **Sechs verifizierte Requirements bleiben unhealthy** —
sie haben eine Verifikation und trotzdem keine Implementierungs-Trace, was genau
das ist, was die Achse sagen soll.

Der Target-Branch der Messung war `feat/swr-3220-evidence-axis`, nicht `master`.
Das ist kein Zufall, sondern SWR-3419s Punkt: der Branch wird gelesen, nicht
angenommen.

---

## 6. Was dabei aufgefallen ist und **nicht** gebaut wurde

Slice 7 hat einen Reachability-Guard für `approved` Requirements ohne
Produktionspfad gebaut, über vier Engines. Diesen Guard um SWR-3221 zu erweitern
hat **zwei weitere** gefunden, die nichts konstruiert:

- **`RequirementIntegrator`** (SWR-3409) — weder das Desktop-`_flow` noch
  `cli_host` übergibt `integrate=`. Die Integrationsstufe des Flows ist immer der
  `None`-Zweig. **Nichts, was ein Requirement-Lauf produziert, erreicht von
  selbst die Basis.** Für ein Single-Unit-Requirement überspringt SWR-3409s
  drittes Kriterium die Integration ohnehin — es gibt also heute überhaupt keinen
  Landing-Schritt.
- **`NoImpactResolver`** (SWR-3504) — der „verifiziere die bestehende
  Implementierung"-Pfad, auf dem die ganze Begründung der Adoption ruht. Ein
  umformuliertes Requirement erreicht `Needs Update`, und nichts holt es zurück.

Beide stehen als `xfail(strict=True)` in
`tests/unit/requirements/test_engines_are_reachable.py`. Sie wegzulassen hätte
das Schweigen des Guards als „alles ist erreichbar" lesbar gemacht — die Lesart,
die diese beiden überhaupt erst `approved` ohne Pfad hat bleiben lassen.

**Warum hier nicht gebaut:** Branches auf den Basis-Checkout eines Nutzers zu
befördern ist nichts, was man am Ende einer Evidence-Lane anschraubt. Es braucht
eine eigene Lane mit eigenem Review-Gate — es ist der einzige Pfad im ganzen
Epic, der fremde Arbeitsstände zusammenführt.

**Was das für heute bedeutet:** die vollständige, funktionierende Schleife ist
*Arbeit landet (heute von Hand über die Git-View, SWR-3612) → Verify drücken →
Ring stimmt*. Genau das liefert SWR-3615. Wenn SWR-3409s Integrator eines Tages
konstruiert wird, ruft er denselben `verify_requirements` mit dem Target, auf das
er gerade befördert hat — die Naht steht.

---

## 7. Offene Posten

1. **SWR-3409 und SWR-3504 verdrahten** — siehe §6. Eigene Lane.
2. **Die Adoptions-Komposition in die Engine ziehen.** `adopt_workspace` liegt
   weiterhin im Desktop-Paket, was bedeutet: Adoption ist Desktop-only. Der
   Verifikations-Pass liegt jetzt in `rotaris_core` und ist von beiden Seiten
   erreichbar — die Adoption ist damit der Ausreißer.
3. **Zielgerichtete Verifikation.** Heute läuft immer die ganze Suite. „Verifiziere
   dieses eine Requirement" würde einen Check *synthetisieren* statt den zu
   laufen, den der Workspace deklariert hat — der Grund, warum sein Urteil
   überhaupt etwas wert ist. Andockbar an denselben Pass, bewusst später.
4. **Zwei Kern-Tests flaken unter `-n auto`** — `test_tui_workflows` einmal,
   `improvement/test_rollback` einmal, über zwei volle Läufe, jeweils grün in
   Isolation. Keiner der beiden Bereiche wird von dieser Lane berührt. Bekanntes
   Parallelverteilungs-Flake, benannt statt mitgezählt.
