# Resolution Record — Domain 19, Notifications, Error Handling, and Recovery — Graphical-only sweep

Part 1 of 3 of [domain 19's resolutions](../19-notifications-errors-recovery.md), which indexes every part.

## Graphical-only sweep

Four requirements had no surface other than a shell invocation or a key-bound text-mode host. Each
is withdrawn in place, and each capability it carried is now reachable from the desktop interface.

| Withdrawn | What it was | Capability rescued into |
| --- | --- | --- |
| REQ-NOTIFY-086 | The three quota-wait choices (keep waiting / change model / cancel), offered by an "interactive host" and bound to `W`, `M` and `C` with a help line. | **REQ-NOTIFY-263** (new) — the quota wait is presented in the run header of every session, focused or not, naming provider, model, exhaustion state and remaining time, and offering the same three choices as controls. Resolves OQ 3. |
| REQ-NOTIFY-155 | `sessions --repair` on "both command-line clients", printing `repaired {id}  {old_status} -> interrupted  ({reason})`. | **REQ-NOTIFY-264** (new) — workspace-wide stale-session repair is an action on the session list, reporting per repaired session the identity, the previous status and the liveness reason, with copyable detail and the same nothing-to-do outcome on repetition. REQ-NOTIFY-153's cross-reference was re-pointed. |
| REQ-NOTIFY-241 | `rotaris-cli setup` mirroring first-run machine setup headlessly, one line per step, non-zero exit on failure. | **REQ-NOTIFY-265** (new) — a setup surface in Settings lists every managed step with its recorded outcome and offers re-running any single step on REQ-NOTIFY-236's terms, reading and updating the resumable state of REQ-NOTIFY-240. |
| REQ-NOTIFY-247 | The message-limit confirmation offering continue / double / cancel bound to `c`+Enter, `d`, and `x`+Escape. | **REQ-NOTIFY-266** (new) — a window-modal dialog owned by the session that reached the limit, stating count, limit and estimated token usage and offering the same three choices as controls, with focus on continuing and Escape cancelling. A non-focused run's limit raises an `info` notice instead. Resolves OQ 9. |

Four further requirements retained their capability but had shell-shaped text removed:

- **REQ-NOTIFY-076** no longer instructs the user to run `rotaris-cli login {provider}` in a
  terminal; the browser and device-code flows start in place under REQ-NOTIFY-202, and the
  requirement now forbids directing the user to a shell.
- **REQ-NOTIFY-202** no longer defines model persistence by reference to "the command-line login".
- **REQ-NOTIFY-156** now binds the desktop session list explicitly rather than "the plain session
  listing", and its marker is non-colour-only and exposed in the accessible name.
- **REQ-NOTIFY-165** and **REQ-NOTIFY-174** no longer fix a parseable single-line format; each now
  fixes the facts the report must carry and leaves the wording to the implementation, per decision 5.
- **REQ-NOTIFY-256** no longer lists "a line of command-line output" among the channels through
  which a repair may be announced.
- The Overview paragraph and the Data & Formats section headed *Command-line output formats* were
  amended accordingly; that section is now *Reports whose information content is fixed and whose
  wording is not*.
