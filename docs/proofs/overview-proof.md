# `overview-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/overview-proof.mjs`](../../apps/desktop/scripts/overview-proof.mjs).

The Overview painted from the run and the store

*2026-11-03:* the run launch matches the header's status as the lower-case REQ-NOTIFY-048 member (`· completed ·`), the word
the sessions card announces, since item 15 of the Overview audit of 2026-11-02 ([`docs/design/briefs/overview.md`](../design/briefs/overview.md));
until then it read REQ-CHAT-008's run-header label, `· Completed ·`.

Since 2026-11-03 the relaunch waits for its two conditions rather than firing at offsets: the chord back to the Overview
waits for the resume to have opened the stored session (`ROTARIS_CAPTURE_WAIT=js:…` — the view is the Workspace and the
session browser is closed, which `openSession` makes true once `session.subscribe` has answered), and the probes wait for
the sessions card's first row (`ROTARIS_CAPTURE_END_VIEW_UNTIL`, bounded at 20 s), which `session.list` fills after the
repository reads on a loaded host; `results.json` records how long the row took (`sessionRowWithinMs`). Until then the
chord came 2.5 s into the launch and the probe 3.5 s after it, and under fourteen agents' load the card still read
"Loading sessions…" with no row — a product red for a view still arriving
(`../archive/defects/overview-proofs-relaunch-reads-the-sessions-card-at-a-fixed-offset-while-it-is-still-loading.md`).
