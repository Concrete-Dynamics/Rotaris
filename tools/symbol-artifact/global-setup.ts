// vitest globalSetup — ADR-0001 consequence 5: the test framework is chosen for
// its before-collection hook, so the symbol artifact is regenerated before any
// test module is loaded.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function setup(): void {
  const generator = fileURLToPath(new URL('./generate.mjs', import.meta.url));
  execFileSync(process.execPath, [generator], { stdio: 'inherit', env: { ...process.env, SYMBOLS_QUIET: '1' } });
}
