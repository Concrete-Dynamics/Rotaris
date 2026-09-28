/**
 * The Chromium switch a child launch of this application's own executable must carry.
 *
 * REQ-MCP-033 / REQ-STARTUP-002 / REQ-STARTUP-015: the reserved token launches the application's own executable, and
 * that executable is a Chromium. Chromium refuses to start as root with its sandbox on (crbug.com/638180), so an
 * operator running the application that way starts it with `--no-sandbox`. The child is a fresh Chromium and inherits
 * nothing of the parent's command line by itself: launched bare it died with SIGTRAP before the sentinel ran, and the
 * project setup reported "Running as root without --no-sandbox is not supported" (2026-09-27, a cloud container). None
 * of the three requirements says whether the launch carries the parent's switches — **OQ-82** — and this is the reading
 * built: a launch of the product's own executable carries exactly the sandbox switch the parent was started with, and
 * nothing else of its command line, because the sandbox is a property of the host the parent already measured and the
 * child cannot measure differently.
 *
 * **Where it stands.** REQ-MCP-033 is not silent on the order: the token is the executable's FIRST argument. So the
 * switch stands between the token and the branch's `--` separator — `rotaris builtin:code-intelligence --no-sandbox --`
 * — which Chromium still reads (it parses switches anywhere before `--`; measured as root 2026-09-28: that line reaches
 * the sentinel, the bare `builtin:code-intelligence --` dies with SIGTRAP). The sentinel drops it before the separator,
 * so the runtime never receives it. (The first build, 2026-09-28, put the switch in FRONT of the token and read "first
 * argument" as "first argument that is not that switch"; the verifier found that a stated clause reinterpreted, and the
 * placement above keeps it.)
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
 * The arguments after the token with the inherited switch the launch put between the token and `--` removed — only
 * that run of switches, and only when the separator follows it, so the separator is next and the runtime receives
 * none of Chromium's switches. Anything else is returned unchanged: a switch after `--` is the runtime's own argument.
 */
export function withoutInheritedSwitches(afterToken: readonly string[]): string[] {
  let at = 0;
  while (afterToken[at] === SANDBOX_SWITCH) at += 1;
  return at > 0 && afterToken[at] === '--' ? afterToken.slice(at) : [...afterToken];
}
