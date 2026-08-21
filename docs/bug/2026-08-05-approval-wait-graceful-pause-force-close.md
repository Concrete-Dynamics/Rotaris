# Bug: Ein auf Approval wartender Tool-Call wird bei Pause nach 30 s force-closed

## Scope

Befund aus der Implementierung von SWR-2504 (Interactive approval flow). Der
Report betrifft die Wechselwirkung zwischen dem blockierenden Approval-Wait und
den bestehenden Pause-/Stall-Mechanismen des Schedulers.

Betroffene Komponenten:

- `src/rotaris_core/orchestrator/scheduler_conversation.py` — `graceful_pause_conversation()`
- `src/rotaris_core/orchestrator/child_run.py` — `_log_tool_call_timing()` (Tool-Activity-Registry)
- `src/rotaris_core/orchestrator/scheduler_watchdog.py` — `run_with_stall_watchdog()`
- `src/rotaris_core/permissions/approval.py` — `BrokeredApprovalResolver` (Wartezeit bis
  `runtime.approval_timeout_seconds`, Default 300 s)

Status: **offen**. Ein Teilaspekt (Stop löst wartende Approvals nicht) wurde im
Zuge von SWR-2504 direkt behoben, siehe „Bereits behoben".

## Beobachtetes Verhalten (statische Analyse, kein Live-Run)

Der Permission-Gate sitzt in `RotarisAgent._execute_action_event`. Zu diesem
Zeitpunkt hat das SDK das `ActionEvent` bereits emittiert, also gilt der Tool-Call
für die Buchhaltung als **gestartet**:

- `describe_timed_tool_event` klassifiziert jedes Event mit `action`-Attribut als
  `phase == "start"` (`scheduler_diagnostics.py:156`).
- `_log_tool_call_timing` trägt die `tool_call_id` daraufhin in
  `active_tool_call_ids` **und** in die `ToolActivityRegistry` ein
  (`child_run.py:119-128`).

Ein `ask`-Entscheid blockiert den Dispatch-Thread danach bis zu
`approval_timeout_seconds` (Default 300 s). In diesem Fenster gilt der Tool-Call
als aktiv.

### 1. Pause force-closed das wartende Kind nach 30 s

`graceful_pause_conversation` wartet `tool_deadline` Sekunden (Default 30,0) auf
das Ende aktiver Tool-Calls und schließt die Conversation danach hart:

```
src/rotaris_core/orchestrator/scheduler_conversation.py:243  tool_deadline: float = 30.0
src/rotaris_core/orchestrator/scheduler_conversation.py:245  force_close_on_deadline: bool = True
```

Aufrufer mit dem force-closenden Default sind u. a.
`Scheduler.request_stop` (`scheduler.py:944`) und der Timeout-Pfad in
`child_run.py:883`. Ein Nutzer, der pausiert, während ein Approval-Modal offen
steht, beendet damit nach 30 s das wartende Kind — obwohl der Nutzer die
Freigabe gerade erst liest.

Das ist strukturell **derselbe Defekt** wie beim `wait_for_tasks`-Bug vom
2026-07-09 (siehe `docs/bug/2026-07-09-orchestrator-force-close-wait-barrier.md`):
ein per Design langlaufender Zustand wird wie ein hängendes Tool behandelt.

### 2. Stall-Watchdog: kein Force-Close, aber auch kein UI-Signal

Ursprünglicher Verdacht war ein Stall-Warn nach `child_stall_timeout` (90 s).
Das trifft **nicht** zu: der Watchdog behandelt Wartezeit mit aktiven Tool-Calls
gesondert und loggt nur INFO, ohne `stall_callback`
(`scheduler_watchdog.py:86-98`).

Nebenwirkung: weil der `stall_callback` in diesem Zweig bewusst nicht feuert,
bekommt die Oberfläche für ein wartendes Kind gar kein Zustandssignal. Ein
Approval ist derzeit nur über die Transkriptzeile, das Modal und
`SessionState.pending_approvals` sichtbar — der Agent-Monitor zeigt das Kind
unverändert als „running". SWR-2504 verlangt „the pending request is visible in
the session/agent monitor"; diese Sicht fehlt noch.

## Root Cause

Der Approval-Wait ist per Design langlaufend und **nutzergebunden**, wird von der
Tool-Activity-Buchhaltung aber wie normale Tool-Arbeit behandelt. Die
Pause-Heuristik („Tool länger als 30 s aktiv ⇒ hängt") gilt für einen Zustand,
dessen Dauer allein vom Menschen abhängt.

## Lösungsvorschläge

### Option A: Approval-Wait aus der Tool-Activity-Registry ausnehmen

Analog zur bestehenden `wait_for_tasks`-Ausnahme in `child_run.py:127`. Problem:
die Ausnahme greift dort am Tool-**Namen**, hier wäre sie zustandsabhängig
(derselbe Terminal-Call ist mal blockiert, mal nicht). Bräuchte ein Signal vom
Approval-Broker an die Registry (`approval_started` / `approval_finished`).

### Option B: Pause-Deadline für wartende Approvals aussetzen

`graceful_pause_conversation` prüft vor dem Force-Close, ob für die Session ein
Approval offen ist (`resolve_approval_host(...).barrier.pending_ids()`), und
pausiert dann statt zu schließen (`force_close_on_deadline=False`).

### Option C: Pause cancelt offene Approvals sofort

Pause bedeutet „stopp jetzt": die offenen Requests werden vor der Deadline
gecancelt, die Calls resolven fail-safe zu deny, das Kind läuft in seinen
normalen Abschluss. Verliert die Nutzerentscheidung, ist aber deterministisch.

Empfohlen: **B**, mit **C** als Fallback nach Ablauf von
`approval_timeout_seconds`. Zusätzlich der Monitor-Zustand aus Befund 2 (eigener
Kindzustand „waiting for approval" statt Missbrauch des Stall-Kanals).

## Bereits behoben (2026-08-05, im Rahmen von SWR-2504)

`Scheduler.request_stop` löste bisher nur die `user_prompt_barrier`, nicht die
Approval-Barrier — ein Stop hätte bis zu 300 s auf den Timeout des wartenden
Calls gewartet. `Scheduler._release_pending_approvals` cancelt die offenen
Approvals der Session jetzt in derselben Zeile wie die Frage-Prompts
(`scheduler.py`), abgedeckt durch
`tests/integration/test_permission_approval.py::test_scheduler_stop_releases_a_call_waiting_for_approval`.

Der Force-Close nach 30 s (Befund 1) und die fehlende Monitor-Sicht (Befund 2)
bleiben offen.
