# Bug: Tool-Fehler werden nicht in `issues.json` protokolliert ✅ FIXED in 0.66.14

**Status:** Behoben in `v0.66.14`. Siehe Fix weiter unten.

## Scope

Dieser Report dokumentiert das Fehlen von Tool-Level-Fehlern in der
strukturierten Issue-Erfassung (`issues.json`) — entdeckt während der
Analyse von Session `20260709-154816-ba1193672b0c`.

Betroffene Komponenten:

- `src/rotaris_core/tools/terminal.py` — `HardenedTerminalExecutor` (keine Issue-Erzeugung)
- `src/rotaris_core/tools/` — generelle Tool-Executor-Patterns
- `src/rotaris_core/session/` — Session-Diagnostik / Issue-Erfassung

## Beobachtetes Verhalten

Session `20260709-154816-ba1193672b0c` hatte **mindestens 13 Tool-Level-Fehler**,
aber `issues.json` war **leer** (`"issues": []`).

### Nicht erfasste Fehlerkategorien

| Kategorie                   | Anzahl | Beispiel                                                                      |
| --------------------------- | ------ | ----------------------------------------------------------------------------- |
| `TmuxPanePool`-Crash        | 8      | `RuntimeError: TmuxPanePool is not initialized`                               |
| MCP-Client-Disconnect       | 2      | `MCP client not connected for tool 'lsp_init'`                                |
| Non-Zero-Exit (Package-Mgr) | 3      | `npm install` (EUNSUPPORTEDPROTOCOL), `pnpm install`, `yarn install` (ENOENT) |

### Beispiel: TmuxPanePool-Fehler (8×)

```json
{
  "tool_name": "terminal",
  "status": "completed",
  "is_error": true,
  "result": "… 'failure_kind': 'execution_error', 'error_class': 'RuntimeError',
             'detail': 'Terminal execution failed before completion:
             TmuxPanePool is not initialized or already closed' …"
}
```

`evidence/tool-calls.jsonl` enthält diese Einträge korrekt mit `is_error: true`,
aber kein korrespondierender Eintrag in `issues.json`.

### Beispiel: MCP-Disconnect (2×)

```json
{
  "tool_name": "lsp_init",
  "is_error": true,
  "result": "MCP client not connected for tool 'lsp_init'.
             The client has been closed and cannot be reconnected."
}
```

### Beispiel: Non-Zero-Exit ohne `is_error`-Flag (3×)

```json
{
  "tool_name": "terminal",
  "is_error": false,
  "result": "… exit_code=1 … 'npm error code EUNSUPPORTEDPROTOCOL' …"
}
```

Diese sind besonders problematisch: `exit_code=1` aber `is_error=false`.
Der Terminal-Executor markiert nur `execution_error` (Pool-Crash) als Fehler,
nicht aber non-zero Exit-Codes.

## Root Cause

### 1. Kein Issue-Erzeugungs-Pfad in Tool-Executoren

Die Tool-Executor-Klassen (`HardenedTerminalExecutor`, `MCPToolExecutor` etc.)
haben keinen codierten Pfad, der bei Fehlern einen strukturierten Issue erzeugt
und in die Session-Diagnostik einfließen lässt.

Die Issue-Erfassung findet derzeit nur im Scheduler/Orchestrator-Layer statt
(Stalls, Timeouts, Child-Cancellations) — **nicht** im Tool-Layer.

### 2. `is_error`-Semantik inkonsistent

- `terminal.py` setzt `is_error=true` nur bei `execution_error` (Pool-Crash),
  nicht bei `exit_code != 0`
- `mcp_tools` setzen `is_error=true` bei Disconnect
- Andere Tools haben möglicherweise wieder andere Kriterien

### 3. Keine zentrale Issue-Sammelstelle für Tools

Es gibt keine gemeinsame Basisklasse oder Middleware, die Tool-Responses
auf Fehler prüft und automatisch Issues erzeugt. Jeder Executor müsste
das selbst implementieren — was keiner tut.

## Auswirkung

- Session-Analysen verlassen sich auf `issues.json` als erste Anlaufstelle
- Leeres `issues.json` suggeriert einen sauberen Lauf, obwohl 13 Fehler auftraten
- Tool-Fehler sind nur durch manuelle Inspektion von `tool-calls.jsonl` und
  `debug.log` auffindbar
- Die `summary.md` (maschinengeneriert) zeigt `Issues: 0` — irreführend

## Empfohlene Fix-Richtung

### 1. `ToolIssue`-Datenmodell definieren

```python
@dataclass
class ToolIssue:
    tool_name: str
    agent_name: str
    kind: str  # "tmux_pool_crash", "mcp_disconnect", "non_zero_exit", ...
    message: str
    command: str | None  # für terminal
    exit_code: int | None
    timestamp: str
```

### 2. Issue-Erzeugung in `HardenedTerminalExecutor.__call__`

Nach jedem `execution_error` oder `exit_code != 0` einen `ToolIssue` erzeugen
und an den Session-Diagnostik-Pfad übergeben (z.B. via `conversation.issue_collector`
oder einen Callback).

### 3. `is_error`-Semantik vereinheitlichen

- `exit_code != 0` → `is_error = True`
- `execution_error` → `is_error = True`
- Timeout → `is_error = True`

### 4. Zentrale Tool-Issue-Sammelstelle

Eine Basisklasse oder ein Mixin, das nach jedem Tool-Call automatisch prüft:

- `is_error == True` → Issue erfassen
- `exit_code != 0` → Issue erfassen
- MCP-Status != connected → Issue erfassen

Dies vermeidet, dass jeder neue Tool-Executor das Issue-Tracking selbst
implementieren muss.

### 5. `issues.json`-Writer erweitern

Der bestehende Issue-Writer (vermutlich in `session/` oder `orchestrator/`)
muss Tool-Issues zusätzlich zu den bestehenden Issue-Kategorien (stall,
timeout, child_force_cancelled) akzeptieren und persistieren.

---

## Fix (v0.66.14)

**Root Cause:** `describe_timed_tool_event()` in `orchestrator/scheduler_diagnostics.py`
priorisierte den `status`-String des SDK-Events über das `is_error`-Flag der Observation.
Wenn ein Tool `is_error=True` setzte, aber der Event-Status `"completed"` war
(was bei `HardenedTerminalObservation` der Fall ist, da `from_text()` den Status
auf `"completed"` setzt), wurde der Fehlerstatus verworfen und als `"completed"`
durchgereicht. `_log_tool_call_timing()` leitete daraus `is_error=False` ab,
wodurch `record_tool_call()` keinen Issue in `issues.json` schrieb.

### Änderungen

**`src/rotaris_core/orchestrator/scheduler_diagnostics.py`** — `describe_timed_tool_event()`:

1. **Title-having branch (~L94):** `is_error` hat jetzt Vorrang vor `status`:

   ```python
   # Vorher:
   terminal_status = status or ("error" if is_error else "completed")
   # Nachher:
   terminal_status = "error" if is_error else (status or "completed")
   ```

2. **Title-less observation branch (~L116):** Prüft jetzt `is_error` auf der Observation:
   ```python
   # Vorher:
   return ("terminal", tool_name, tool_call_id, "completed", None, result)
   # Nachher:
   obs_is_error = bool(getattr(event.observation, "is_error", False))
   return ("terminal", tool_name, tool_call_id, "error" if obs_is_error else "completed", None, result)
   ```

**`tests/unit/test_scheduler_diagnostics.py`** — 14 neue Unit-Tests für:

- `is_error=True` + `status="completed"` → `"error"`
- `is_error=False` + `status="completed"` → `"completed"`
- `is_error=True` ohne Status → `"error"`
- Title-less observation mit/ohne `is_error`
- Rejection-Events unverändert
- Edge cases: kein `tool_call_id`, kein `tool_name`, weder Observation noch Rejection
