## A signal sent without `session_action` is read as a query and dropped silently

In the Windows ARM64 live run's `frictions` scenario (pack `2026-10-20T07-55-35-723Z`, head `00957641`; Windows 11 ARM64
(build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, endpoint `katalyst`, unmetered), the child asked to
"SIGINT it" sent the terminal tool, twice (ordinals 10 and 18 of session `77e620ab`),
`{"command":"session_action=send_signal","session_id":"ts_…","signal":"SIGINT"}`: the action written into `command` as text,
no `session_action` argument. With a `session_id` and no action the tool runs REQ-TOOLS-110's default, `query`; it answered
"Session ts_… is running. (no new output since last poll)" and said nothing of the `signal` it had been given or of the
`command` it did not run. The child polled, listed and sent the same shape again, never learning why its signal did nothing;
the live run's "the probe run attempted the SIGINT stop" went red on it ("no send_signal in the record"), and the OQ-10 /
OQ-133 Windows reading the scenario exists to take (the agent's own SIGINT read back `killed (exit -1)`) was not taken.

## Specs

None contradicted: REQ-TOOLS-110 makes `query` the default when `session_id` is set, and the tool did that. The friction is
that a `signal` (and a non-empty `command`) given beside an id with no action are ignored without a word. Whether such a call should be refused as `invalid_request`
naming `session_action`, or answered with a note, is not in the specification and would be an open question.

## Relevant files

- `packages/agent-tools/src/terminal/index.ts` — `const action = a.session_action ?? 'query'`; `signal` is read only by
  `send_signal`.
- `apps/desktop/scripts/live-run.mjs` — the `frictions` checks that read `argsOf(call).session_action === 'send_signal'`.
