# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Run autopsy — 21ebbb5d-3020-4f93-98cf-8eaab894af5b (frictions, v1-4ec58051303c4300829be798789f98db, 20.8 s, 65,152 in / 1,142 out)

Part 7 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## Run autopsy — 21ebbb5d-3020-4f93-98cf-8eaab894af5b (frictions, v1-4ec58051303c4300829be798789f98db, 20.8 s, 65,152 in / 1,142 out)

`explicit_trivial` (0.99). The coordinator made 5 calls, all `ok`:
- `write_file create` ("1 line created");
- a background `node`;
- a SIGINT;
- a `query` that read "killed (exit -1)";
- `cat -A`.

No todo list; see K2.

### 1. Spec-faithful (no finding)
- **The one warning** is `git_commit` "removed from orchestrator by prerequisite (executor_absent)" (15:55:39.753). It stays
  a warning as `coordinator-only-removals-are-logged-as-warnings.md` ruled.
- **The first request** answered without reasoning about a contradiction (OQ-202 row).
