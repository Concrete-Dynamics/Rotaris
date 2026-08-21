# Bug: TmuxPanePool wird bei parallelen Kind-Agenten unbrauchbar

## Scope

Dieser Report analysiert den TmuxPanePool-Ausfall während Session
`20260709-154816-ba1193672b0c`, der 8 Terminal-Tool-Fehler bei 2 parallel
laufenden Coding-Agenten verursachte.

Betroffene Komponenten:

- `src/rotaris_core/tools/terminal.py` — Terminal-Tool-Executor (`__call__`, `_execute_pooled`)
- `openhands/tools/terminal/terminal/tmux_pane_pool.py` — `TmuxPanePool.checkout()`
- Ggf. Session-Management des TmuxPanePool über Kind-Agent-Grenzen hinweg

## Beobachtetes Verhalten

Ab 15:52:34 (ca. 2 Minuten nach Start der parallelen Coding-Agenten) schlugen
**alle** Terminal-Commands beider Agenten mit demselben Fehler fehl:

```
RuntimeError: TmuxPanePool is not initialized or already closed
```

### Betroffene Agenten und Commands

| Agent                              | Fehlgeschlagene Commands                                                    | Zeitraum            |
| ---------------------------------- | --------------------------------------------------------------------------- | ------------------- |
| `create-api-contracts-package`     | `yarn typecheck`, `yarn test`, `yarn typecheck && yarn test`, `echo "test"` | 15:52:37 – 15:52:46 |
| `create-service-contracts-package` | `ls ...`, `echo "test"`, `echo ok`                                          | 15:52:34 – 15:53:19 |

### Erfolgreiche Commands vor dem Crash

| Agent                              | Command                          | Dauer  | Zeit     |
| ---------------------------------- | -------------------------------- | ------ | -------- |
| `extend-platform-contracts-v2`     | `npx tsc --noEmit`               | 862ms  | 15:51:24 |
| `create-api-contracts-package`     | `yarn install --frozen-lockfile` | 869ms  | 15:52:05 |
| `create-api-contracts-package`     | `yarn install`                   | 6681ms | 15:51:57 |
| `create-service-contracts-package` | `yarn install`                   | 6184ms | 15:52:02 |

Der letzte erfolgreiche Terminal-Call war `15:52:05` (yarn install), der erste
Fehler `15:52:34` — dazwischen liegen 29 Sekunden ohne Terminal-Nutzung.

### Traceback (aus `evidence/debug.log`)

```python
File "src/rotaris_core/tools/terminal.py", line 866, in __call__
    return self._execute_pooled(action, conversation)
File "src/rotaris_core/tools/terminal.py", line 782, in _execute_pooled
    with pool.pane() as handle:
File "openhands/tools/terminal/terminal/tmux_pane_pool.py", line 302, in pane
    handle = PaneHandle(self.checkout(timeout=timeout))
File "openhands/tools/terminal/terminal/tmux_pane_pool.py", line 226, in checkout
    raise RuntimeError("TmuxPanePool is not initialized or already closed")
```

## Root Cause

### Hypothese 1: Pool wird nach Kind-Agent-Ende geschlossen

`extend-platform-contracts-v2` endete um 15:52:31. Möglicherweise wird der
TmuxPanePool beim Cleanup eines Kind-Agents geschlossen, obwohl andere Kinder
ihn noch nutzen. Der Pool ist vermutlich **pro-Session**, nicht **pro-Child**
— das Schließen durch ein Kind zerstört ihn für alle.

### Hypothese 2: Ressourcen-Limit (max panes)

Der Pool hat ein konfiguriertes Maximum an Panes. `yarn install` könnte
Subprozesse spawnen, die kurzzeitig zusätzliche Panes belegen und das Limit
überschreiten, woraufhin der Pool in einen Fehlerzustand geht und sich schließt.

### Hypothese 3: Race Condition bei parallelem Pool-Zugriff

Zwei parallele Coding-Agenten greifen gleichzeitig auf denselben TmuxPanePool
zu. Ein langer Command (`yarn install`, 6681ms) in einem Agenten könnte eine
Ressource blockieren, die der andere Agent ebenfalls anfordert — der Pool
interpretiert den Timeout als "nicht initialisiert" und schließt sich.

### Konsequenz: Falsche Erfolgsmeldungen

`create-api-contracts-package` meldete fälschlich im Summary:

> "Package compiles, `yarn typecheck` and `yarn test` pass"

Obwohl alle drei Verifikations-Commands mit `TmuxPanePool`-Fehlern scheiterten.
Der Agent hat die `is_error: true`-Responses nicht als Verifikationsfehler
interpretiert, sondern trotzdem Erfolg gemeldet.

## Reproduktion

1. Orchestrator delegiert 3+ Coding-Agenten parallel
2. Mindestens einer führt langlaufende Terminal-Commands aus (`yarn install`)
3. Ein Agent beendet, während andere noch Terminal nutzen
4. → TmuxPanePool wird geschlossen, alle verbleibenden Terminal-Calls scheitern

## Empfohlene Fix-Richtung

### 1. Pool-Lifecycle an Session binden, nicht an Child

Der TmuxPanePool muss **session-scoped** sein und darf erst geschlossen werden,
wenn die gesamte Session endet — nicht wenn ein einzelner Child-Agent endet.

**Datei**: `src/rotaris_core/tools/terminal.py` — Prüfen, wer `pool.close()` aufruft
und ob das im Child-Cleanup-Pfad passiert.

### 2. Pool-Status vor jedem Call prüfen + Recover

Der Terminal-Executor sollte vor jedem Call prüfen, ob der Pool noch lebt, und
ihn ggf. neu initialisieren (lazy re-init).

### 3. Tool-Fehler als Issues erfassen

`TmuxPanePool`-Fehler werden derzeit nicht in `issues.json` protokolliert.
Der `HardenedTerminalExecutor` sollte bei `execution_error`-Ergebnissen einen
Issue vom Typ `tool_error` mit `kind: "tmux_pool_crash"` erzeugen.

**Datei**: `src/rotaris_core/tools/terminal.py` — im `__call__`-Exception-Handler

### 4. Agent-Summary warnt bei Verifikationsfehlern

Der Summary-Prompt sollte den Agenten anweisen, `is_error: true` bei Terminal-
Calls als "Verifikation nicht möglich" zu interpretieren und im Summary
explizit zu dokumentieren — nicht stillschweigend Erfolg zu behaupten.

## Resolution

**Status:** ✅ Resolved — 2026-07-09 (v0.66.11)

**Root cause confirmed:** `HardenedTerminalExecutor._execute_pooled()` overrode
the SDK's `TerminalExecutor._execute_pooled()` without carrying forward the pool
recovery mechanism (`_is_recoverable_tmux_pool_error` / `_recover_tmux_pool`).
When a recoverable tmux error occurred, the SDK would recover by closing the
broken pool and creating a fresh one — Rotaris instead caught the exception
in `__call__`, returned an error observation, and left the pool permanently dead.

Hypothesen 1 und 3 aus der Code-Analyse widerlegt: Jeder Child-Agent hat seinen
eigenen Pool (per-Conversation). Pools beeinflussen sich nicht gegenseitig.

**Fix (2 Änderungen in `src/rotaris_core/tools/terminal.py`):**

1. **`_execute_pooled` recovery** — Wraps pooled execution in a `try/except`
   that catches `LibTmuxException`, `TmuxObjectDoesNotExist` (via inherited
   `_is_recoverable_tmux_pool_error`), and `RuntimeError("not initialized or
already closed")`. On recovery, closes the broken pool, creates a fresh one,
   and returns a recovery observation to the agent.

2. **`__call__` lazy re-init** — The exception handler now attempts pool recovery
   when it sees a `RuntimeError` indicating a broken pool, even if
   `_execute_pooled`'s own recovery failed.

**Validation:** 30 terminal unit tests pass, `make lint` clean.
