# Bug: Orchestrator wird bei aktivem `wait_for_tasks` mehrfach force-closed

## Scope

Dieser Report analysiert das dreifache Force-Close des Orchestrators während
Session `20260709-154816-ba1193672b0c` (Plan-01-Baseline-Implementierung).

Betroffene Komponenten:

- `src/rotaris_core/orchestrator/scheduler_conversation.py` — `graceful_pause_conversation()`
- `src/rotaris_core/tools/wait_for_tasks.py` — `WaitForTasksExecutor`
- `src/rotaris_core/orchestrator/scheduler.py` — Pause-Integration

## Beobachtetes Verhalten

Der Orchestrator-Child (`please-plan-and-complete-the-whole-01-baseline-plan`) wurde
in Iteration 1 **dreimal** vom Graceful-Pause-Mechanismus nach jeweils 30s Wartezeit
hart beendet (force-close). Der Child lief insgesamt 742 Sekunden, produzierte
substantielle Arbeit (delegierte 4 Kinder, plante 6 Phasen mit TODOs), wurde aber
durch den Force-Close auf `partial` herabgestuft.

### Debug-Log-Auszug (`evidence/debug.log`)

```
15:53:02 Graceful pause: tools still active for please-plan-and-complete-the-whole-01-baseline-plan after 30.0s; force-closing conversation.
15:54:04 Graceful pause: tools still active for please-plan-and-complete-the-whole-01-baseline-plan after 30.0s; force-closing conversation.
15:54:34 Graceful pause: tools still active for please-plan-and-complete-the-whole-01-baseline-plan after 30.0s; force-closing conversation.
```

### Timeline-Kontext

| Zeit     | Ereignis                                                                   |
| -------- | -------------------------------------------------------------------------- |
| 13:50:30 | Orchestrator delegiert 3 Coding-Agenten parallel                           |
| 13:50:36 | Orchestrator ruft `wait_for_tasks` (bg_6958a397, bg_0fb9f61c, bg_3b0a6013) |
| 13:52:31 | Erstes Kind (`extend-platform-contracts-v2`) beendet                       |
| 13:53:02 | **Force-Close #1** — erstes Kind fertig, aber 2 weitere laufen noch        |
| 13:53:34 | `create-api-contracts-package` beendet                                     |
| 13:54:04 | **Force-Close #2** — `create-service-contracts-package` noch aktiv         |
| 13:54:04 | `create-service-contracts-package` beendet                                 |
| 13:54:34 | **Force-Close #3** — Orchestrator noch in Nachverarbeitung                 |

## Root Cause

### Design-Konflikt: `wait_for_tasks` ↔ `graceful_pause_conversation`

Der `wait_for_tasks`-Executor blockiert den Conversation-Thread des Orchestrators
für die gesamte Dauer, die die delegierten Kinder brauchen (hier: ~3.5 Minuten).
Der Graceful-Pause-Mechanismus in `scheduler_conversation.py` erkennt das aktive
Tool (`wait_for_tasks`) im `ToolActivityRegistry`, wartet 30s auf dessen Abschluss
und force-closed dann die Conversation.

Das Problem: `wait_for_tasks` ist **per Design langlaufend** — es soll Minuten
blockieren, bis alle Kinder fertig sind. Der Pause-Mechanismus behandelt es aber
wie ein normales Tool, das nach 30s "hängt".

### Warum wurde überhaupt eine Pause angefordert?

Der Orchestrator ist nach dem Delegieren der Kinder im `wait_for_tasks`-Zustand.
Das Child-Management (Scheduler) erkennt, dass der Orchestrator selbst keine
aktive Arbeit mehr macht (nur wartet) und versucht, ihn zu pausieren — was aber
wegen des blockierenden `wait_for_tasks`-Tools nicht gelingt.

### Kaskade

1. `wait_for_tasks` blockiert den Orchestrator-Thread
2. Pause wird angefordert → `graceful_pause_conversation()` wartet 30s
3. Tool ist noch aktiv → Force-Close
4. Orchestrator wird als `partial` (herabgestuft von `failed`) markiert
5. Ralph-Loop startet Iteration 2 mit frischem Orchestrator
6. Iteration 2 findet alle Arbeiten bereits erledigt → `succeeded` in 34s

**Netto-Verschwendung**: ~12 Minuten Orchestrator-Zeit in Iteration 1, die durch
den Force-Close verloren gingen. Iteration 2 war ein reiner Verifikationslauf.

## Reproduktion

Jeder Run, bei dem der Orchestrator delegiert und dann via `wait_for_tasks` auf
mehrere langlaufende Kinder wartet, während eine Pause (z.B. durch User-Interrupt
oder Scheduling-Entscheidung) angefordert wird.

## Empfohlene Fix-Richtung

### Option A: `wait_for_tasks` aus Tool-Activity-Tracking ausnehmen

In `scheduler_conversation.py::ToolActivityRegistry` das `wait_for_tasks`-Tool
nicht als "aktives Tool" zählen, das eine Pause blockiert. Der Orchestrator ist
in diesem Zustand sicher pausierbar — er tut nichts außer Warten.

### Option B: `wait_for_tasks` Pause-Signal erkennen lassen

Der `WaitForTasksExecutor` könnte periodisch prüfen, ob eine Pause angefordert
wurde, und sich selbst unterbrechen (mit einem speziellen Rückgabewert, der dem
Orchestrator signalisiert "Pause requested, resume later").

### Option C: Pause-Timeout für Wait-Barrier-Tools verlängern

Statt 30s könnte der Pause-Mechanismus für bekannte langlaufende Tools wie
`wait_for_tasks` ein deutlich längeres Timeout (z.B. 5 min) verwenden.

Empfohlen: **Kombination aus A und B** — das Tool aus dem Activity-Tracking
ausnehmen UND die Fähigkeit einbauen, auf Pause-Signale zu reagieren.

## Fix Implementiert (2026-07-09)

### Änderungen

1. **`src/rotaris_core/orchestrator/child_run.py`** — `_log_tool_call_timing`:
   `tool_started` und `tool_finished` für `tool_name == "wait_for_tasks"` werden
   nicht mehr an `ToolActivityRegistry` gemeldet. Der `wait_for_tasks`-Call bleibt
   damit für `graceful_pause_conversation` unsichtbar.

2. **`src/rotaris_core/orchestrator/scheduler_conversation.py`**:
   - **Idempotence guard**: Modul-Level `_graceful_pause_inflight`-Set verhindert,
     dass mehrere `graceful_pause_conversation`-Aufrufe für denselben
     `canonical_name` parallel laufen. Nur der erste Aufruf startet einen
     Poll-Thread; nachfolgende Aufrufe kehren sofort zurück.
   - **Registry-Cleanup**: In allen drei Pfaden (immediate pause, tools-finished
     pause, force-close) wird `registry.clear(canonical_name)` aufgerufen, bevor
     die Pause/Close-Aktion dispatched wird. Dies ist ein Safety-Net für Tool-Leaks
     (wie den ursprünglichen `wait_for_tasks`-Race).

3. **`src/rotaris_core/orchestrator/scheduler_drain.py`** — `_run_wait_barrier_if_requested`:
   `self._tool_activity.clear(parent_record.canonical_name)` wird aufgerufen,
   bevor der Scheduler in die `asyncio.wait`-Schleife geht. Der Parent ist zu
   diesem Zeitpunkt bereits pausiert; der Scheduler übernimmt das Warten.

### Tests

6 neue Unit-Tests in `tests/unit/test_scheduler_conversation.py`:

- `test_graceful_pause_clears_registry_when_no_tools_active`
- `test_graceful_pause_clears_registry_after_tool_wait`
- `test_graceful_pause_clears_registry_on_force_close`
- `test_graceful_pause_skips_duplicate_calls_for_same_name`
- `test_graceful_pause_idempotence_per_name_allows_different_names`

Bestand: 14/14 tests, lint clean, scheduler regression (75/75) clean.
