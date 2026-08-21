# A run adopts queued prompts that belong to nobody, and the suite flakes on it

**Status:** Open — diagnosed, not fixed.

**Found:** 2026-08-18, investigating "the tests are flaky under different runs" ·
**Severity:** High (the flake is the symptom; the product defect underneath is that
one run consumes another's queued messages) · **Platform:** all; observed on Linux

**Affected requirements:** SWR-1228 (the failing test), SWR-2434 (the session
scoping that turns out to be inert), SWR-1005

---

## What flakes

Two tests, one cause, a different one each time — which is what made it read as
instability rather than as a defect:

```
FAILED tests/unit/test_tui_app.py::test_start_run_persists_final_only_agent_response_once
E       AssertionError: assert ['Only the fi... is visible.'] == ['Only the fi... is visible.']
E         Left contains 3 more items, first extra item: 'Only the final answer is visible.'

FAILED tests/unit/test_tui_app.py::test_start_run_uses_recent_session_context_for_follow_up_task
E       assert 4 == 1
E        +  where 4 = len(['You are continuing an existing Rotaris session...',
E                          'Just a prompt.', 'Verify the previous output.', 'revised'])
```

The second one settles it without any further argument. `'Just a prompt.'`,
`'Verify the previous output.'` and `'revised'` are not strings this test knows
about — they are the three prompts `tests/test_prompt_api.py` leaves behind,
quoted back inside an unrelated assertion an hour later in the run. Its transcript
shows the loop had turned them into work:

```
events=[{'role': 'agent', 'name': 'Queued-Prompt-b42ab996', 'content': 'Marked it implemented.'},
        {'role': 'agent', 'name': 'Queued-Prompt-8bac8c1f', 'content': 'Marked it implemented.'},
        {'role': 'system', 'content': 'Run completed.'}]
```

Measured on this machine, same tree (`d791712`), 4 CPUs:

| Selection | Failures |
|---|---|
| full suite, `-n auto` (the `Makefile` command), 6 consecutive runs | **3 / 6** |
| `test_start_run_persists_final_only_agent_response_once` alone, 15 runs | **0 / 15** |
| `tests/test_prompt_api.py` + that test, one process | **1 / 1 — deterministic** |
| `apps/rotaris/tests`, 6 consecutive runs (both passes) | **0 / 6** |

The third row is the point: this is not a timing flake and not a load flake. It
reproduces in **6 seconds, single process, no `-n`**, with a byte-identical
failure message.

## The chain

1. **`tests/test_prompt_api.py` leaks three prompts.** It is a `unittest.TestCase`
   whose `setUp` says so out loud:

   ```python
   # Clear registry for testing if possible, but it's a singleton.
   # In a real scenario, we might want to add a clear method to PromptRegistry for testing.
   ```

   There is no cleanup, so the file ends with three prompts still `QUEUED`:

   ```
   [regprobe] queued_prompts_left=3 steering_keys=1
   [regprobe]   status=QUEUED session_id='' content='Just a prompt.'
   [regprobe]   status=QUEUED session_id='abc-123' content='Verify the previous output.'
   [regprobe]   status=QUEUED session_id='' content='revised'
   ```

2. **`PromptRegistry` is a process-wide singleton** (`core/prompt_types.py:53-74`):
   `__new__` hands back `cls._instance`, and `_queued_prompts` lives as long as the
   interpreter. Nothing in `src/`, `tests/` or `apps/` ever resets it — every file
   that knows about the problem hand-rolls its own fixture, and they disagree:
   `test_prompt_types.py` and `test_queued_prompt_triggering.py` clear **before**
   each test, `test_queued_prompt_session_scope.py` clears **before and after**, and
   `test_prompt_api.py` does neither.

3. **The Ralph loop reads the whole registry.** At the point it would stop
   (`ralph/loop.py:483-486`):

   ```python
   queued_prompts = prompt_registry.get_queued_prompts(
       self.queued_prompt_session_id or None
   )
   ```

   `self.queued_prompt_session_id` is initialised to `""` at `loop.py:289` and is
   **never assigned anywhere in `src/`** — `grep` finds exactly two hits, the
   declaration and this read. So the expression is always `"" or None` → `None`,
   and `get_queued_prompts(None)` is documented as "the legacy whole-registry read".

4. The three leftovers come back as active queued prompts, the loop appends a
   `Queued Prompts` phase, and runs **three more iterations**. `run_child` is
   stubbed to return the same report every time, so each iteration appends the same
   agent message. Three leaked prompts, three extra messages.

### Control

`tests/integration/test_queued_prompt_triggering.py` also leaks — but its one
leftover is `TRIGGERED`, and the loop filters to `p.status.value == "QUEUED"`.
Paired with the same test: **2 passed**. The status filter is the difference, which
is what makes the mechanism above the operating one rather than a coincidence.

## Why it presents as flaky rather than as a broken test

In a serial run the leak is cleaned up by accident. Collection order puts
`tests/test_prompt_api.py` at position 591 and the failing test at 5468, and
between them sit `tests/unit/test_prompt_types.py` and
`tests/unit/test_queued_prompt_session_scope.py`, whose own fixtures clear the
registry on the way past. Insert either one and the pairing goes green:

```bash
uv run pytest tests/test_prompt_api.py tests/unit/test_queued_prompt_session_scope.py \
  tests/unit/test_tui_app.py::test_start_run_persists_final_only_agent_response_once -q
# 14 passed
```

Under `-n auto` that rescue is a coin flip. xdist distributes by test, so a worker
can receive the leaking file without receiving either cleaner, and then receive the
victim. Which worker gets what changes every run — so the same tree is green twice
and red twice, and nothing in the diff moved.

## The product defect underneath

The test is the messenger. `queued_prompt_session_id` being unassigned means the
scoping added for SWR-2434 does not exist at runtime. Its own docstring
(`prompt_types.py:110-111`) states the claim it is meant to hold:

> A concrete id returns that session's prompts only, so parallel Rotaris runs can
> never consume each other's messages.

Because the loop only ever passes `None`, a run adopts **every** queued prompt in
the process, including ones a user typed into a different session. Rotaris desktop
runs several sessions in one process, so this is reachable without any test
involved: queue a follow-up in session A while session B is finishing, and B runs
it.

## Suggested first moves

1. **Set `queued_prompt_session_id`** where the loop is constructed for a run, so
   the scoping SWR-2434 describes is actually in force. That fixes the product
   defect and removes the test's exposure at the same time.
2. **Give `PromptRegistry` a real reset** and call it from one autouse fixture in
   `tests/conftest.py`, replacing the four disagreeing hand-rolled ones. A
   process-wide singleton that eleven test files write to needs one owner, not a
   convention each file re-invents.
3. Only then consider the test itself. It is asserting the right thing; it was
   reading through a hole in the product.

## Related code

| File | Concern |
|---|---|
| `src/rotaris_core/core/prompt_types.py` | the singleton (`:53`), `get_queued_prompts` and its `None` contract (`:106`) |
| `src/rotaris_core/ralph/loop.py` | `queued_prompt_session_id = ""` (`:289`), never assigned; the whole-registry read (`:486`) |
| `tests/test_prompt_api.py` | leaks three `QUEUED` prompts; `setUp` documents the absent cleanup |
| `tests/unit/test_tui_app.py` | `test_start_run_persists_final_only_agent_response_once` (`:914`) and `test_start_run_uses_recent_session_context_for_follow_up_task` (`:434`) |
