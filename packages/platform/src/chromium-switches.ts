/**
 * The Chromium switch a child launch of this application's own executable must carry.
 *
 * REQ-MCP-033 / REQ-STARTUP-002 / REQ-STARTUP-015: the reserved token launches the application's own executable, and
 * that executable is a Chromium. Chromium refuses to start as root with its sandbox on (crbug.com/638180), so an
 * operator running the application that way starts it with `--no-sandbox`. The child is a fresh Chromium and inherits
 * nothing of the parent's command line by itself: launched bare it died with SIGTRAP before the sentinel ran, and the
 * project setup reported "Running as root without --no-sandbox is not supported" (2026-09-27, a cloud container). None
 * of the three requirements says whether the launch carries the parent's switches — **OQ-76** — and this is the reading
 * built: a launch of the product's own executable carries exactly the sandbox switch the parent was started with, and
 * nothing else of its command line, because the sandbox is a property of the host the parent already measured and the
 * child cannot measure differently.
 *
 * Pure over an argument vector, so the builder of the launch (the run host), the sentinel that reads it (main) and the
 * fork that hands it from main to the run host all read one definition.
 */

/** The switch the child inherits when the parent carries it. */
export const SANDBOX_SWITCH = '--no-sandbox';

/** The switches a launch of this executable inherits from `argv`: `--no-sandbox` when present, else nothing. */
export function inheritedChromiumSwitches(argv: readonly string[]): readonly string[] {
  return argv.includes(SANDBOX_SWITCH) ? [SANDBOX_SWITCH] : [];
}

/**
 * The index of the first argument at or after `from` that is not an inherited switch — where the reserved token stands
 * when the launch put the switch in front of it. `--` is never skipped: it is the branch's separator, not a switch.
 */
export function afterInheritedSwitches(argv: readonly string[], from: number): number {
  let at = from;
  while (argv[at] === SANDBOX_SWITCH) at += 1;
  return at;
}
