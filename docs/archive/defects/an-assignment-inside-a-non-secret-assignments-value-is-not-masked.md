## An assignment inside a non-secret assignment's value is not masked

The redaction pass's first layer (`packages/kernel/src/redaction.ts`, `layerAssignments`) matched `key=value` and
`key: value` and consumed the value whether it masked it or not. So the value of an assignment whose key is not
secret-looking was never read for an assignment of its own: `GET https://api.example.com/v1/models?api_key=SECRET failed`
came through unmasked, the URL being the value of `https:`, and so did `error: token=abc` and `status:401 auth=xyz`.
Found 2026-11-01 while putting main's application log through the pass (bundle D1 of the hardening plan,
[the log's note](mains-application-log-lines-bypass-the-redaction-pass.md)), on the probe of a URL with a key in its query;
no leak observed.

## Specs

REQ-EVENTS-060: "an assignment inside the text — `key=value`, `key: value` … — whose key normalizes to one of the six
fragments", in which the value alone is masked. A secret assignment inside another assignment's value is inside the text;
REQ-TOOLS-171 makes this pass the one every surface uses, so every surface missed it.

## Relevant files

- `packages/kernel/src/redaction.ts` — `layerPlainAssignments`, `valueEnd`.
- `packages/kernel/src/redaction.test.ts` — the cases and the size bound.
- `docs/architecture/adr/0007-secret-redaction.md` — "The application log, and an assignment's value read for its own", where the falsified reason is kept.

## Outcome — repaired 2026-11-01 (hardening plan hrd1, bundle D1)

The layer consumes a value only when it masks it: the boundary before the key is a lookbehind, nothing after the
separator is consumed, and the value's extent (`VALUE`'s three alternatives, unchanged) is found by `valueEnd` for a
secret-looking key alone. A lookahead over the whole value at every key, tried first, made chained assignments quadratic
(3.8 s over 100 KB); the build kept the per-key cost bounded as ADR-0007's first execution at size requires.
`redaction.test.ts` pins a URL's key query, `error: token=`, `status:401 auth=`, a plain query unchanged and a masked one
unchanged, and 100 KB of chained non-secret assignments under 1,000 ms (100 ms until 2026-11-02, which a loaded host
missed one run in three; the quadratic form took 3.8 s) (both red before: the first on its masking, the
second on its last assignment). Every other kernel case and every worked example passes as before. No shape was added and
no vocabulary changed; the pass now does what REQ-EVENTS-060 already said.
