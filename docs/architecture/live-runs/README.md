# Live-run readings

Autopsies and diagnoses of `pnpm live-run` packs that the record cites. A live run's pack (its store, logs, traffic and
screenshots, `.live-run/runs/<pack>/` of the tree that ran it) is git-ignored and stays on the host that ran it; what the
record keeps of it is the reading here. Each file is the examination as written, read-only, against a copy of its pack, and
carries a note saying where it came from and what was added to it. A first execution these readings report is written back
into the record that decided it, in place, and gets its row in [`../first-executions.md`](../first-executions.md); a file here
is the evidence that report cites, not a substitute for it.

None of these files quotes the endpoint's host, a URL, a key or a token: the model key is written
`openai-compatible--<endpoint>/<model>`. Paths under `scratchpad/` and `/home/user/Rotaris-crw-wt-live/` name the
orchestrator's container, where the packs and the console logs stayed.

| File | Head | Pack | What it reads |
| --- | --- | --- | --- |
| [`live-c2fdd6a-default-autopsy.md`](live-c2fdd6a-default-autopsy.md) | `c2fdd6a` | default, `2026-10-06T15-47-11-941Z` | the default pack; finding K1 is cited by a fixed note |
| [`live-552d346-default-autopsy.md`](live-552d346-default-autopsy.md) | `552d346` | default, `2026-10-13T07-25-27-766Z` | the default pack; findings Q1 to Q3 |
| [`live-552d346-duress-autopsy.md`](live-552d346-duress-autopsy.md) | `552d346` | duress, `2026-10-13T08-12-41-551Z` | the duress pack; findings V1 to V3, D8's count |
| [`live-0bc3eee-fail-diagnosis.md`](live-0bc3eee-fail-diagnosis.md) | `0bc3eee` | default, `2026-10-13T12-18-40-282Z` | the pack's one FAIL, a harness defect |
