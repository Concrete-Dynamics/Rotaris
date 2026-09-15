/**
 * ADR-0022's shared quoting, kept single-purpose on purpose.
 *
 * REQ-SANDBOX-064: quoting is a security boundary here, not a formatting nicety. The wrapper is a
 * string submitted to a live shell rather than an argv array, so a workspace path carrying a quote
 * or a backslash must not be able to end its enclosing literal and introduce rules of its own.
 *
 * Two functions, two literal kinds, each used everywhere its kind appears and nowhere else:
 * `shellQuote` for every token of the rendered invocation (REQ-SANDBOX-079), and
 * `profileQuote` for every path embedded in a Seatbelt profile string (REQ-SANDBOX-075).
 */

/**
 * POSIX single-quoted form. Everything inside `'…'` is literal, including backslashes and
 * newlines, so the only character needing work is the quote itself: close, escape, reopen.
 * The empty string quotes to `''` rather than to nothing, which would drop a token.
 */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * A Seatbelt profile string literal: `"…"` with backslash and double quote escaped. The profile
 * is itself carried to `sandbox-exec` inside a shell-quoted `-p` argument, so a path travels
 * through both functions and must survive each independently.
 */
export function profileQuote(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
