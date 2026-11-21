## The requirements board hears of no change made outside its own commands, and nothing watches the repository

Found on 2026-11-11 by the critiques of the Requirements board's foot (UIR-401 and UIR-502,
[the requirements-board brief](../../design/briefs/requirements-board.md)) while its sentence was being reworded; read in
the source, not driven. Not repaired: the foot now says what holds, and a watcher is a mechanism of its own.

The board is told of a change on one channel, and that channel is written from two places only: main's relay
broadcasts when the reply to a `requirements.*` command carries `changed` (`apps/desktop/src/main/requirements.ts`),
and the run coordinator does the same for the commands it sends (`apps/desktop/src/main/requirements-runs.ts`). The
workspace service reads the requirement store again only on the first read, on Re-evaluate, and after the board's own
accept, edit, create and traceability operations (`apps/desktop/src/workspace-service/delivery.ts`, the calls of
`refresh`). No file watcher exists in `apps/desktop/src` or in any package. A requirement document written by hand, by
a session that is not one of the board's runs, or by a checkout or a pull in the Git view therefore changes nothing on
the board until Re-evaluate is pressed. The measurement that would show it: write a document into the store from
outside, wait 30 s on the board without pressing anything, and read the card count.

## Specs

REQ-TRACE-334: the board subscribes to the engine's evaluation results and "No manual refresh SHALL be required".
REQ-TRACE-507 speaks of a subscription that "reports that the repository watcher behind it has stopped delivering",
and so presumes a watcher; the same requirement keeps the re-evaluation control of REQ-TRACE-342 as "the guaranteed
route to a current board", which is what the build has in the watcher's place.

## Relevant files

- `apps/desktop/src/main/requirements.ts`, `apps/desktop/src/main/requirements-runs.ts` — the two senders.
- `apps/desktop/src/workspace-service/delivery.ts` — `refresh`, and where it is called.
- `packages/ui/src/requirements/model.ts` — `SUBSCRIPTION_SENTENCE`, which states the limit to the reader.

## Repaired 2026-11-21 (PD-TRACE-002 clause 10, REQ-ADOPT-051)

The workspace service now watches the store directory (of the built-in layout or of every store of the accepted
shape), the shape file and the layout file, and reads the board again 400 ms after the last change it saw; main
publishes the generation on channel 10 (`rewatch` and `onRepositoryChange` in
`apps/desktop/src/workspace-service/delivery.ts`; the `requirements.changed` event). The board is also read again when
the window regains focus and when a run started from the board ends. The measurement this note named was taken on the
built application: a status word edited in a document from outside moved its card with nothing pressed, and
`apps/desktop/src/workspace-service/surveyed-board.test.ts` holds it. Where the watch cannot be set or stops, the
survey strip says the board is not watching, and Re-evaluate stays the guaranteed route. The foot's sentence
(`SUBSCRIPTION_SENTENCE`) says what now holds.
