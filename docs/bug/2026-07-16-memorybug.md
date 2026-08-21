Cause found. Three interacting issues—not Qt widget leak.

### 1. Memory growth: LiteLLM streaming thread pool

LiteLLM 1.91.1 creates module-global executor with 100 workers: /D:/Development/Apps/geraet-ai/.venv/Lib/site-packages/litellm/
litellm_core_utils/thread_pool_executor.py:3. Every synchronous stream chunk submits logging/cache work: /D:/Development/Apps/geraet-ai/.venv/
Lib/site-packages/litellm/litellm_core_utils/streaming_handler.py:1719.

Evidence:

- Pool: 1 thread at 178s → 100 at 654s.
- Still 100 idle workers at normal close, 1,675s later.
- Ramp: +182.8 MiB RSS, +278.3 MiB VMS, +368 handles.
- Pool/RSS Pearson correlation: 0.90; pool/handles: 0.994.
- After saturation, RSS falls 64.7 MiB during run.
- Traced Python heap: 33.60 MiB at saturation → 32.31 MiB at close.
- Final stacks show workers idle in concurrent.futures.thread.\_worker: /D:/Development/Apps/geraet-ai/.tmp/rotaris-deep/20260714T175631Z-26124/
  snapshots/0066-normal-close.json.

Conclusion: bounded runaway thread retention/native high-water mark, not endless Python heap leak. Qt objects also do not accumulate: active
peak 1,966 → close 1,640.

### 2. Huge observed UI degradation: profiler feedback loop

Deep diagnostics runs tracemalloc.take_snapshot() synchronously on Qt thread: /D:/Development/Apps/geraet-ai/apps/rotaris/src/rotaris/
diagnostics/live.py:318, /D:/Development/Apps/geraet-ai/src/rotaris_core/runtime_memory.py:55. Lag itself triggers another snapshot.

Using snapshot payload time vs file-write timestamp:

- 67 snapshots.
- Median freeze: 26.9s.
- p95: 36.4s.
- Maximum: 44.7s.
- Estimated total snapshot blocking: 1,608s of 2,329s = 69%.
- Snapshot duration vs traced heap correlation: 0.70.

Thus extreme 50–118s event-loop lag mostly diagnostic observer effect.

### 3. Real production responsiveness bug: full session reload on UI thread

Rotaris polls every 750ms: /D:/Development/Apps/geraet-ai/apps/rotaris/src/rotaris/services/run_bridge.py:50. Poll synchronously reloads and
projects full session on Qt thread: /D:/Development/Apps/geraet-ai/apps/rotaris/src/rotaris/services/run_bridge.py:233.

Worse: SessionManager.load_session() performs reasoning repair every load: /D:/Development/Apps/geraet-ai/src/rotaris_core/session/manager.py:150.
This DeepSeek run requires repair, causing scan of 67 event JSON files every poll: /D:/Development/Apps/geraet-ai/src/rotaris_core/session/
state_repair.py:48.

Statistics:

- 170 polls; 169.5s total UI-thread occupation.
- Poll p95 6.20s; max 11.97s.
- 29 polls >1s; 14 >5s.
- Session load consumes median 92.8% of poll time.
- Poll/load correlation: 0.915.
- Poll p95 worsens from 375ms first quartile to 2,004ms last quartile.
- Actual transcript rendering p95 only 79ms—painting not main problem.

Fix order:

1. Move deep snapshots off Qt thread; stop lag→full-snapshot feedback.
2. Prevent LiteLLM per-chunk executor expansion or cap/coalesce logging; shut pool down.
3. Move session loading off Qt thread/use deltas.
4. Run reasoning repair only when opening/resuming session, never every poll.
5. Re-run with light diagnostics; deep mode currently distorts workload.

Full aggregate: /D:/Development/Apps/geraet-ai/.tmp/rotaris-deep/20260714T175631Z-26124/summary.json. No code changed.
