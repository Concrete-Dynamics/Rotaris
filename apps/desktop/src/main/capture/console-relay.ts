/**
 * The capture's relay of renderer console messages (Part O: a blank window is explained by its log, not by its PNG), in
 * the **details form** of Electron's `console-message` event. Electron 44, the version this repository pins, documents a
 * single `Event<WebContentsConsoleMessageEventParams>` argument and marks the positional `(event, level, message, line,
 * sourceId)` form deprecated; a listener declaring more than one parameter logs "'console-message' arguments are
 * deprecated and will be removed", and the relay would stop when they are
 * (`docs/defects/fixed/the-captures-console-relay-listens-with-the-deprecated-console-message-arguments.md`).
 */

/** The fields of the details event this relay reads. */
export interface ConsoleMessageDetails {
  readonly message: string;
  readonly level: 'info' | 'warning' | 'error' | 'debug';
  readonly lineNumber: number;
  readonly sourceId: string;
}

/** What emits the event: a window's `webContents`, or a test's fake. */
export interface ConsoleMessageSource {
  on(event: 'console-message', listener: (details: ConsoleMessageDetails) => void): unknown;
}

/**
 * Relays each warning and error the renderer logs — what `level >= 2` selected under the positional form, whose levels
 * ran 0 verbose, 1 info, 2 warning, 3 error. The listener takes the details event as its only parameter.
 */
export function onConsoleWarning(source: ConsoleMessageSource, relay: (details: ConsoleMessageDetails) => void): void {
  source.on('console-message', (details) => {
    if (details.level === 'warning' || details.level === 'error') relay(details);
  });
}
