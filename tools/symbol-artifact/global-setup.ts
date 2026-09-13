// vitest globalSetup — ADR-0001 consequence 5: the test framework is chosen for
// its before-collection hook, so the symbol artifact is regenerated before any
// test module is loaded.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function setup(): void {
  const generator = fileURLToPath(new URL('./generate.mjs', import.meta.url));
  /**
   * REQ-TRACE-182 (OQ-41): the regeneration "SHALL NEVER block collection: any failure SHALL be caught and
   * reported as a skipped-regeneration notice, leaving parse errors for the meta-tests to surface". It was not
   * caught — `execFileSync` throws on a non-zero exit, and a throw out of `globalSetup` fails the whole run
   * before one test is collected. What reaches it is exactly the case OQ-41 keeps open: a test session
   * regenerating in the same checkout as another invocation, where the replacement can fail transiently on
   * Windows (constraint D-06). The artifact the suite then runs against is the one already on disk — stale at
   * worst and never partial, because the write is now atomic — and a stale one is what the meta-tests report.
   */
  try {
    execFileSync(process.execPath, [generator], { stdio: 'inherit', env: { ...process.env, SYMBOLS_QUIET: '1' } });
  } catch (cause) {
    console.warn(`symbol artifact: regeneration skipped — ${cause instanceof Error ? cause.message : String(cause)}. The suite runs against the artifact already on disk (REQ-TRACE-182).`);
  }
}
