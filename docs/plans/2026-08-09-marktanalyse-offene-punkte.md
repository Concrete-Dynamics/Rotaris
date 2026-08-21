# Marktanalyse — offene Punkte, Statusbericht (2026-08-09)

> Bezugsdokument: [`docs/research/marktanalyse-agentic-harnesses-2026-08.md`](../research/marktanalyse-agentic-harnesses-2026-08.md) (2026-08-03)
> Priorisierungsnotiz: [`docs/requirements/NOTE-marktreife-priorisierung.md`](../requirements/NOTE-marktreife-priorisierung.md)
> Stand: `master` @ `6a8456d`, 2026-08-09.
>
> **Bearbeitungsstand 2026-08-09 (Spec-Vorlauf S0 erledigt):** H1 ✅ (Epic-2500-Frontmatter
> auf `approved`) · H2 ✅ (Epic-2300-Triage: 7 IDs `deprecated`, 6 neu geschnitten, dazu
> SWR-2335–2337) · H3 ✅ **zurückgestellt** (SWR-2102 Docker-Image, Nutzerentscheidung) ·
> H4 ✅ nachgeprüft (Kriterien gelten bereits, kein Code nötig; Flip nach Guard-Test) ·
> O4/O5/O7 haben jetzt Requirements (SWR-2901–2903, SWR-1831, SWR-1640–1642) ·
> T2 bewusst offen. Welle 1 der Implementierung läuft.
>
> Zweck: Abgleich, welche Punkte der Marktanalyse **umgesetzt**, welche **noch offen**,
> welche **nicht requirement-abgedeckt** und welche **nicht ausreichend getestet** sind —
> als Arbeitsliste für die nächste Runde. Dieses Dokument ist ein Bericht, kein
> Anforderungsdokument; verbindlich werden Punkte erst durch Requirements unter
> [`docs/requirements/`](../requirements/README.md).

---

## 1. Datenbasis

| Quelle | Ergebnis |
| --- | --- |
| `python -m rotaris_core.reqtocode check` | **OK** — 1338 Requirements (1154 approved, 906 traced, 1032 test-covered); Baseline-Schuld: **1 trace / 44 test / 0 orphan / 27 orphan-test** |
| Status-Scan über den generierten `META`-Block (`reqtocode/swr.py`) | 103 × `draft`, 81 × `deprecated`, Rest `approved` |
| `@verifies`-Scan über `tests/` + `apps/rotaris/tests/` für alle P0/P1-SWRs | jede ausgelieferte Marktreife-Anforderung hat Unit- **und** Integrations-/Flow-Abdeckung (Details in Abschnitt 5) |
| Event-Schema-Scan (`src/rotaris_core/events/schema.py`) | 14 Eventtypen; **keine** Hook-, Checkpoint-, Completion-Gate- oder Approval-Request-Events |

---

## 2. P0-Matrix: Analyse (2026-08-03) vs. heute

| P0-Bereich (Analyse §3) | Analyse | Heute | Evidenz / Rest |
| --- | --- | --- | --- |
| Execution Kernel | ✅ (Eventprotokoll 🟡) | ✅ (Eventprotokoll weiterhin 🟡) | Stream existiert (SWR-1828/1829), **Store/Replay fehlt** → O4 |
| Kontextmanagement | ✅ | ✅ | unverändert |
| **Verifikation** | ❌ | ✅ | Epic 2600, SWR-2601–2605 `approved` |
| **Sichere Ausführung** | ❌ | ✅ (2 dokumentierte Grenzen) | Epic 2500, SWR-2501–2509 `approved`; Grenzen → T1, T2 |
| Git-native Arbeitsweise | 🟡 | ✅ / Diff-Review 🟡 | SWR-2436/2437 (Checkpoints + Rollback); **kein agentenübergreifendes Diff-Review** → O6 |
| Erweiterbarkeit (Hooks) | 🟡 (Hooks ❌) | ✅ | Epic 2700 + SWR-2815/2816 |
| **Programmatic API** | ❌ | ✅ (Schema-Lücke) | SWR-1828/1829/1830; **Hooks/Checkpoints fehlen im Schema** → O5 |
| Observability | 🟡 | 🟡 **unverändert** | kein Replay, kein Trajektorien-Export, keine aggregierte Fehlerauswertung → O4 |
| Modellabstraktion | ✅ | ✅ | unverändert |
| Interaktion/Steuerung | ✅ | ✅ | unverändert |

**Alle vier als kritisch markierten P0-Lücken der Analyse sind geschlossen.** Was offen
blieb, ist die gesamte Phase 2 (Differenzierung) plus die in Abschnitt 2 der Analyse
bereits als „schwach besetzt" bezeichnete Schicht **Event/Eval Store**.

## 3. Differenzierungs-Kandidaten (Analyse §4)

| # | Kandidat | Analyse | Heute | Requirement vorhanden? |
| --- | --- | --- | --- | --- |
| 1 | Requirements-natives Development (ReqToCode produktisieren) | größter Hebel, nur Eigennutzung | **unverändert** — weiterhin nur für dieses Repo, an `rotaris_core` gekoppelt | Epic 2300 existiert, ist aber Alt-Spec — 13 IDs `draft`, kein Produktisierungs-Schnitt → **O1** |
| 2 | Deterministische Orchestrierung (Hooks/Policies) | ❌ | ✅ erledigt | Epic 2500 + 2700 |
| 3 | Verifier-gesteuerte Fertigstellung | 🟡 | ✅ auf Check-Suite-Ebene; **nicht pro Akzeptanzkriterium** | SWR-2604 deckt die Suite; Evidence-gating je SWR fehlt → **O2** |
| 4 | Adaptive Modellwahl | 🟡 | 🟡 unverändert | bewusst zurückgestellt (braucht O4) |
| 5 | Auditierbares Lernen | 🟡 | 🟡 unverändert | Epic 1600 hat Approval-Gate, aber **keine Versionierung / kein Eval-Gate / kein Rollback** gelernter Skills → **O7** |
| 6 | Reproduzierbare Umgebungen | ❌ | ❌ | bewusst zurückgestellt |
| 7 | Supervisor-Oberfläche (Mission Control) | 🟡 | 🟡 — Approval-, Sandbox-, Checkpoint- und Hook-UI kamen dazu, die vier genannten Auswertungs-Sichten nicht | **O3** |

---

## 4. Offene Punkte — Implementierung (keine Requirements vorhanden)

Reihenfolge = empfohlene Bearbeitung. Alle sieben Punkte haben **heute kein
Requirement**, das sie beschreibt; der erste Arbeitsschritt ist jeweils das Schreiben
der Requirements (ID-Konvention: [`requirements/README.md`](../requirements/README.md);
freie Blöcke unten je Punkt genannt).

### O1 — ReqToCode produktisieren (Analyse §5 Punkt 6, Differenzierung #1)

Der als stärkster Hebel identifizierte Punkt ist **komplett unangetastet**. Der Verifier,
`diff`, die Baselines, die Reverse-Enforcement-Regeln und die Git-Hooks existieren, aber:

- gekoppelt an das `rotaris_core`-Package (`python -m rotaris_core.reqtocode`), nicht als
  eigenständiges Paket/Subkommando nutzbar,
- Annotationen sind Python-only (`@traces`/`@verifies`); die per-Stack-Konvention aus
  SWR-2315/2316 ist nie gebaut worden,
- kein `rotaris-cli reqtocode init` für fremde Repos.

Zusätzliche Altlast: **Epic 2300 ist kein sauberer Ausgangspunkt.** 13 IDs stehen auf
`draft` und beschreiben den *abgelösten* Matrix-Generator (SWR-2302, 2303, 2307, 2308,
2309, 2311, 2312, 2314, 2315, 2316, 2317, 2318, 2323). Sie erben aus dem Frontmatter
`trace: required` / `test: required`, werden wegen `status: draft` aber nicht erzwungen —
unsichtbare Spec-Schuld. Erster Schritt: je ID entscheiden **deprecate** (durch ReqToCode
abgelöst: 2302, 2307–2309, 2312, 2314, 2323) vs. **neu schneiden** (bleiben inhaltlich
relevant: 2303 Annotation je Stack, 2315 Stack-Detection, 2316 Konvention je Stack, 2317
Strict-Mode/CI, 2318 Tombstone-Log, 2311 Uncovered-Detection).

Freie IDs: SWR-2335 ff. im 2300er-Block.

### O2 — Evidence-gated Completion pro Akzeptanzkriterium (Analyse §5 Punkt 7)

SWR-2604 gated Completion gegen die **Check-Suite** des Zielprojekts. Der in der Analyse
beschriebene Schritt fehlt: Verknüpfung der Verifier-Evidenz mit der `@verifies`-Coverage
**je berührtem Requirement**, plus **Scope-Drift-Erkennung** (Codeänderungen ohne
Requirement-Bezug werden im `ChildReportArtifact` ausgewiesen). Baut auf O1 und SWR-2603.

Freie IDs: SWR-2606 ff. (Epic 2600).

### O3 — Rotaris Mission Control: die vier Auswertungs-Sichten (Analyse §5 Punkt 8)

Keine der vier genannten Sichten existiert: **Requirement-Coverage pro Session**,
**Kosten pro Agent/Task**, **Diff-Überschneidungen paralleler Worktree-Sessions**,
**wartende Ask-Entscheidungen als Übersicht** (der Einzeldialog aus SWR-2504 ist da, eine
Queue/Übersicht nicht). Kein neues Backend nötig — Daten stammen aus SWR-2506 (Audit-Log),
`cost.py`/`tracking/`, den Worktree-Metadaten und O1/O2.

Hinweis: **Der 2000er-Block ist voll** (SWR-2099 ist vergeben, 100/100 belegt). Neue
Desktop-Requirements brauchen einen neuen Block — Vorschlag **2900** für Phase-2-Differenzierung.

### O4 — Event-Store, Session-Replay, Trajektorien-Export (Analyse §5 Punkt 9, §3.1, §3.8)

Der Stream (SWR-1828/1829) **emittiert** nur; nichts persistiert ihn abfragbar. Damit
bleiben drei Analyse-Befunde unverändert offen: kein Replay, kein Trajektorien-Export für
Evals, keine aggregierte Auswertung von Fehlerursachen/Wiederholungen. Es ist zugleich die
Voraussetzung für Differenzierung #4 (adaptives Routing) und #5 (auditierbares Lernen).

Freier Block: 2900 ff.

### O5 — Event-Schema-Lücke für die P1-Features (klein, hoher Nutzen)

`events/schema.py` kennt 14 Eventtypen (Session, Iteration, Child, Tool, Permission,
Verifier, Usage, Error, Result). **Nicht im Stream**: Hook-Ausführung (SWR-2701–2704),
Checkpoint-Erstellung/Rollback (SWR-2436/2437), Completion-Gate-Entscheidung und
Repair-Eskalation (SWR-2604/2605 — es gibt nur `verifier.result`), sowie ausstehende
Approval-Requests (nur die *Entscheidung* wird gestreamt, nicht die Anfrage). Diese
Features emittieren Timeline-Events, sind für SDK/CI-Konsumenten aber unsichtbar.
SWR-1829 ist additiv versioniert — das ist ein Schema-Zusatz, kein Umbau.

Freie IDs: SWR-1831 ff. (Epic 1800).

### O6 — Diff-Review über parallele Agenten hinweg (Analyse §3.5)

Git-View (SWR-2005) und Datei-Diffs im Transkript (SWR-2419) existieren; ein zentrales
Review über parallele Worktree-Sessions inklusive Konflikterkennung („Agent-Manager"-Niveau)
nicht. Überschneidet sich mit der dritten Sicht aus O3 — sinnvoll gemeinsam zu schneiden.

### O7 — Auditierbares Lernen vervollständigen (Differenzierung #5)

Epic 1600 sammelt Verbesserungen und hat ein Approval-Gate (SWR-1618). Es fehlen die drei
Bausteine, die die Analyse als Rest benennt: **Versionierung** gelernter Skills/Memories,
**Eval-Gate** vor Übernahme, **Rollback**. Der Checkpoint-Mechanismus (SWR-2436/2437) und
O4 liefern die Bausteine.

Freie IDs: SWR-1640 ff. (Epic 1600).

---

## 5. Offene Punkte — Traceability und Spec-Hygiene

| # | Punkt | Wirkung |
| --- | --- | --- |
| H1 | **`2500-secure-execution.md` Frontmatter steht auf `status: draft`**, obwohl alle neun Kind-Requirements `approved` sind (2600/2700 stehen korrekt auf `approved`) | dieselbe Klasse Fehler, die für Epic 2800 in der P1-Runde korrigiert wurde; verfälscht jede Status-Auswertung über `META` |
| H2 | **`2300-traceability.md` Frontmatter `status: draft` + `trace/test: required`** — 13 Body-IDs erben die Pflichtflags, ohne dass der Verifier sie erzwingt | unsichtbare Spec-Schuld; blockiert einen sauberen Start von O1 |
| H3 | **SWR-2102 (Docker-Image)** bleibt `draft` | Distribution, nicht Sandbox — die Analyse führte es unter Phase-1 #4; die NOTE hat es bewusst abgetrennt. Entscheidung nötig: bauen oder deprecaten |
| H4 | **SWR-2118–2121 (Secret-Redaction-Cleanup)** bleiben `draft` | Sicherheitsnahe Hygiene im P0-Bereich „Sichere Ausführung": Phantom-Toggle/Dead-Code für ein Feature, das strukturell immer aktiv ist |
| H5 | Die Marktanalyse selbst (§3) ist als Statusquelle **überholt** | Analyse-Dokument bleibt datiert stehen; dieser Bericht ist ab jetzt die Statusquelle (Verweis im Analyse-Header ergänzt) |

Restliche `draft`-Requirements ohne Marktanalyse-Bezug (nicht Teil dieser Arbeitsliste,
der Vollständigkeit halber): SWR-167–175 (Plan/Auto-Mode-Gate), SWR-401–417
(Lint/Format-Toolchain), SWR-507/533/534/536/563, SWR-715, SWR-812–818/833/843/850,
SWR-1059/1064/1174/1230/1544, SWR-1633–1637, SWR-2045–2055 (Skill-Force-Load),
SWR-2200–2215 (Remote-Plattform — bewusst zurückgestellt), SWR-2428–2432 (Desktop).

---

## 6. Offene Punkte — Tests

Der Verifier ist grün, und jede ausgelieferte Marktreife-Anforderung hat Unit- **und**
Integrations-/Flow-Abdeckung (`test_permission_denial_e2e.py`, `test_verifier_gate_e2e.py`,
`test_verifier_repair_e2e.py`, `test_hooks_user_flow.py`, `test_tool_hooks_flow.py`,
`test_checkpoint_user_flow.py`, `test_python_sdk.py`, `test_headless_stream.py`,
`test_sandboxed_terminal.py`, `test_fetch_egress_policy.py` plus die Rotaris-UI-Tests).
Offen bleiben:

| # | Lücke | Detail |
| --- | --- | --- |
| T1 | **SWR-2507 Sandbox nie end-to-end auf einem echten Host verifiziert** | In der Spec dokumentiert: auf dem Windows-Host des Maintainers nie durchlaufen; nativ Windows nicht unterstützt (→ WSL2). Es braucht einen verifizierten Lauf auf WSL2 **und** macOS plus ein festgehaltenes manuelles Testprotokoll — automatisierte Tests können den Kernel-Teil nicht ersetzen |
| T2 | **SWR-2505 Terminal-Egress ist ein binärer Kernel-Schalter** | Per-Host-Filterung fürs Terminal ist bewusst vertagt; `fetch` filtert pro Host. Entweder als Requirement nachziehen oder die Grenze im Nutzer-Doc explizit machen |
| T3 | **Baseline-Schuld: 44 `test` + 27 `orphan-test` + 1 `trace`** | Alt-Schuld, shrink-only. Betroffen u. a. SWR-1802 (Intent-Gate), SWR-1507–1530 (Sessions), SWR-2064/2067 (Desktop). Keine Marktanalyse-Anforderung darunter, aber jede bezahlte Zeile schrumpft die Ratchet dauerhaft |
| T4 | **SWR-2509 nur durch Rotaris-UI-Tests abgedeckt** | Der Mid-Session-Pfad `change_session_permission_mode` ist über SWR-2503 integrationsgetestet; für SWR-2509 selbst existiert keine Core-seitige Abdeckung |

---

## 7. Bewusst zurückgestellt (nicht bearbeiten)

Unverändert gegenüber Analyse §5: adaptives Modell-Routing (braucht O4),
Environment-Bootstrapping/reproduzierbare Umgebungen, Remote-Plattform
(Epic 2200 bleibt `draft`), zusätzliche Subagenten-Mechanik. TUI-only-Arbeit bleibt im
Wartungsmodus (Rotaris primär).

---

## 8. Empfohlene Arbeitsreihenfolge

> Die parallelisierbare Ausführung dieser Reihenfolge — Wellen, Dateibesitz, Gates —
> steht in [`2026-08-09-phase2-parallelisierungsplan.md`](2026-08-09-phase2-parallelisierungsplan.md).

1. **H1 + H2** — Spec-Hygiene zuerst (klein, entblockt O1 und macht Status-Auswertungen ehrlich).
2. **O5** — Event-Schema-Zusatz für Hooks/Checkpoints/Gate/Approval-Request. Kleinster
   Aufwand, macht die gerade gelieferten P1-Features für CI/SDK sichtbar.
3. **O1** — ReqToCode produktisieren. Der eigentliche USP; alles Weitere in Phase 2 hängt daran.
4. **O2** — Evidence-gated Completion pro Akzeptanzkriterium (auf O1 + SWR-2603/2604).
5. **O4** — Event-Store + Replay/Export (Fundament für #4 und #5 der Differenzierung).
6. **O3 + O6** — Mission-Control-Sichten inklusive agentenübergreifendem Diff-Review
   (verzehrt O1–O4 als Datenquellen; neuer ID-Block 2900).
7. **O7** — auditierbares Lernen vervollständigen.
8. **T1** parallel zu allem, sobald ein WSL2-/macOS-Host verfügbar ist; **T2/T3/T4** als
   laufende Nebenarbeit; **H3/H4** als Entscheidung im Rahmen der nächsten Sicherheitsrunde.
