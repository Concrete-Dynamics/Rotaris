import { parentPort } from 'node:worker_threads';
import { nodeClocks } from '@rotaris/platform';
import { workerMain } from '@rotaris/workspace';

/**
 * ADR-0040 (Part AJ): the traceability worker thread's entry. It receives jobs and a shared cancel flag from the
 * workspace service's owner thread, runs the passes, and posts progress and outcomes back; it never opens one of
 * the five repository artifacts — their bytes arrive with the job (specific 6). Terminable: a cancel the pass does
 * not honour within the grace ends the thread, and the next job spawns a fresh one.
 */
if (parentPort) workerMain(parentPort, nodeClocks());
