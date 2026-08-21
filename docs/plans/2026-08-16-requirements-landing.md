# Die Landing-Lane — wie die Arbeit eines Requirement-Laufs auf den Branch kommt

**Stand:** 2026-08-16, auf `claude/next-epics-planning-r8xjmd`
**Vorgänger:** [2026-08-16-requirements-propagation.md](2026-08-16-requirements-propagation.md)
**Neue Requirement-IDs:** zwei — SWR-3420 (Produkt), SWR-3421 (technisch).
SWR-3419 ging von `draft` auf `approved`.

---

## 1. Der Befund

`RequirementFlow` deklariert seit dem ersten Slice dieses Epics einen Parameter
`integrate=`. **Keine Komposition hat je einen übergeben** — weder das Desktop
`_flow` noch der Headless-`run_requirement`. Die Integrationsstufe des Flows nahm
also bei jedem Lauf, der je stattgefunden hat, ihren `None`-Zweig.

`RequirementIntegrator` war dabei nie ein Stub: 659 Zeilen, zwölf Unit- und vier
Integrationstests, ein produktiv verdrahteter `IntegrationLog` und eine
Board-Projektion, die seine Zusammenfassung bereits anzeigt. Alles vorhanden,
nichts erreichbar — der eine Eintrag, den `UNREACHED_ENGINES` noch hielt.

Und darunter lag ein zweiter Befund, den erst das Verdrahten sichtbar gemacht
hat: **SWR-3409s drittes Kriterium wurde als Aussage über das Landen gelesen.**
Es sagt, ein Ein-Unit-Requirement überspringe die Integration — richtig, es gibt
nichts zu mergen. Gemeint war der Integrations-Worktree; verstanden wurde „und
also auch die Promotion". Die meisten Requirements erzeugen genau eine Unit. Die
Schlagzeile des Epics — die Arbeit eines Laufs erreicht die Basis — galt damit
nur für die Requirements, die zufällig geteilt wurden.

---

## 2. Was gebaut wurde

```
A1  execution/target.py       eine Antwort auf „welcher Branch"     SWR-3419
A2  workspace_checks_for      eine Komposition entscheidet „geprüft" SWR-3421
A3  integration_for           der Adapter, den es nie gab            SWR-3409
A4  _land_alone               eine verifizierte Unit landet auch     SWR-3420
A5  SWR-3409s Prosa           korrigiert auf das, was der Code tut
A6  UNREACHED_ENGINES         leer, und der Mechanismus benannt
```

**Der Target-Branch ist jetzt *ein* Wert.** Er wurde an drei Stellen unabhängig
beantwortet: der Unit-Worktree wurde aus `HEAD` des Checkouts geschnitten, eine
Integration promotete auf den Fingerprint, den ihr jemand übergab, und eine
Verifikation notierte den Branch, auf dem der Checkout gerade stand. Drei
Lesarten derselben Frage, alle richtig für ein Team auf seinem Default-Branch und
alle still falsch für eines, das auf `dev` stabilisiert.

Die Promotion hat dafür eine zweite Form bekommen. Ist das Ziel der Branch, den
der Checkout ausgecheckt hat, bleibt `merge --ff-only` richtig — es aktualisiert
auch den Arbeitsbaum, der Nutzer sieht das Ergebnis dort, wo er steht. Ist das
Ziel ein anderer Branch, ist es `fetch . <src>:<dst>`: gits eigener Weg, einen
nicht ausgecheckten Branch vorzurücken, der einen Nicht-Fast-Forward genauso
verweigert. Den Ziel-Branch auszuchecken, um zu mergen, würde den Baum unter dem
Nutzer wegziehen — das eine, was dieses Epic verspricht nicht zu tun.

---

## 3. Drei Dinge, auf die die Lane gestoßen ist

**Zwei Vokabulare für eine Einstellung.** `integration_branch_template` stand
seit Slice 1 in der Config und dokumentierte `{requirement_id}`; der Motor
formatiert `{req}` und `{id}`. Niemand hat es je gelesen, also hat es niemand
gemerkt — der erste Leser bekam einen `KeyError` mitten in einem Merge. Der
Default ist korrigiert, die dokumentierten Schreibweisen werden weiter
akzeptiert.

**Fünf Schalter von `requirements.execution` entscheiden weiterhin nichts.**
Gemessen über den ausgelieferten Quellcode, nachdem diese Lane zwei davon zum
Leben erweckt hat:

```
READ  integration_branch_template   (neu — diese Lane)
READ  target_branch                 (neu — diese Lane)
READ  retry_limit, decomposition
DEAD  branch_template, worktree_subpath, run_check_suite,
      run_reqtocode_verification, keep_failed_worktrees,
      unit_timeout_minutes
```

`branch_template` ist derselbe Defekt in derselben Form wie
`integration_branch_template` — inklusive desselben Vokabular-Bruchs
(`{requirement_id}` in der Beschreibung, `{req}` in `BranchStrategy`). Benannt
statt beiläufig mitrepariert: er gehört zu SWR-3405, nicht hierher.

**Ein zweiter Auslieferungszyklus startet jetzt von woanders.** Das ist die
Folge des Landens, und sie ist im Testkorpus aufgeschlagen, nicht im Code:
`test_requirement_board_promise` fuhr zweimal denselben Agenten-Double, der
unabhängig von seiner Aufgabe dieselben Bytes schrieb. Solange nichts landete,
war der zweite Worktree aus einer Basis geschnitten, die diese Dateien nicht
hatte — die identische Schreiboperation war also eine echte Änderung. Seit die
erste Unit landet, ist sie es nicht mehr: „nothing committed", ein Retry, ein
zweiter Fehlschlag. Der Double schreibt jetzt, was zu seiner Aufgabe passt, so
wie ein Agent es täte, der ein *geändertes* Requirement umsetzt.

Bemerkenswert ist, was das Produkt dabei richtig gemacht hat: ein Lauf, der
nichts committet, wird als solcher gemessen und nicht stillschweigend als Erfolg
verbucht (SWR-3408). Vor dem Landen konnte dieser Fall gar nicht auftreten.

**Eine Stufe sagte den falschen Grund.** `_integrate` meldete „a single completed
unit needs no integration", auch wenn gar kein Integrator konfiguriert war — zwei
verschiedene Übersprünge in einem Satz. Die Unit-Zahl entscheidet nichts mehr im
Flow; der Integrator besitzt diese Unterscheidung, weil nur er sie richtig
treffen kann.

---

## 4. Gemessen

Der Reachability-Guard über den ausgelieferten Quellcode:

```
vorher   ENGINES 11 erreichbar, UNREACHED_ENGINES 1 (RequirementIntegrator)
nachher  ENGINES 12 erreichbar, UNREACHED_ENGINES 0
```

Der `xfail(strict=True)` **wurde rot, bevor der Eintrag gelöscht wurde** — das
ist der Beleg, dass die Verdrahtung echt ist und nicht der Tabelle nachgibt.

Neu über die echte Komposition getestet, was vorher kein Test tat: ein
`RequirementFlow` mit einem `integrate=` aus `integration_for`, über ein echtes
Git-Repository. Ein Lauf hinterlässt seine Arbeit auf dem Branch des Nutzers; ein
Lauf, den nichts verifiziert hat, hinterlässt sie auf seinem eigenen. Und Units
forken aus `dev` und landen auf `dev`, während der Checkout auf `feature/x`
stehen bleibt — mitsamt der uncommitteten Arbeit des Nutzers.

---

## 5. Was bewusst **nicht** gebaut wurde

- **Agentengestützte Konfliktauflösung.** SWR-3409s Text sagte, die Integration
  nutze „die bestehende agent-gestützte Worktree-Integration" wieder. Sie tat es
  nie: sie bricht beim ersten Konflikt ab und benennt die kollidierenden Units
  und Dateien. Sechzehn Tests halten dieses Verhalten fest, und es erfüllt das
  zweite Akzeptanzkriterium. **Der Text wurde auf den Code korrigiert, nicht
  umgekehrt** — ein Modell in die Schleife eines Merges zu setzen, der danach auf
  den Branch eines Nutzers fast-forwardet, ist eine größere Zusage als dieses
  Requirement macht, und sie braucht eine eigene Entscheidung darüber, was
  passiert, wenn der Agent den Konflikt schlimmer macht.
- **`branch_template` verdrahten.** Siehe §3.
- **Lane B und C.** Removal-Report (SWR-3509) und Migrations-Ausführung
  (SWR-3507/3508) — die zweite und dritte Lane dieses Plans.

---

## 6. Offene Posten

1. **SWR-3509 — Removal-Report.** Rein lesend, entgegen der Einordnung der
   Propagation-Lane: alle vier Akzeptanzkriterien sind benennen, berichten,
   unter dem Tombstone aufbewahren, nichts automatisch löschen.
2. **SWR-3507/3508 — die Migration ausführen.** Die einzige Lane, die in die
   Quelldateien des Nutzers schreibt. Sie landet über den Integrator dieser Lane.
3. **Die Adoptions-Komposition in die Engine ziehen.** Unverändert.
4. **Zielgerichtete Verifikation.** Unverändert.
