/**
 * REQ-STARTUP-134's ban on session content, as PD-STARTUP-011 places it on each writer of the application log: no line at
 * any level quotes transcript or prompt text, model output, a tool's result or a file's contents, whoever produced the
 * text, and a writer that would otherwise quote one writes its source, kind and byte length instead. This is that
 * replacement, one wording for every writer, so a reader of the log (and of a diagnostics run directory's `app-log` stream)
 * meets the same phrase wherever a writer held text back. The stream itself is not filtered a second time: the obligation
 * is the writer's, and the test beside each writer holds it.
 *
 * What stays quotable, by kind (PD-STARTUP-011): a folder path, a provider's error text and a child process's own
 * diagnostic lines (a tool server's standard error among them); credentials are masked by the one redaction pass
 * (REQ-TOOLS-171), not here.
 */

/** The kinds of session content REQ-STARTUP-134 names, in the words a log line says them. */
export type SessionContentKind = 'prompt text' | 'transcript text' | 'model output' | 'tool output' | 'file contents';

/** The UTF-8 byte length of `text`, the length a writer names in its line. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * The words a log line carries in place of session content: `<kind> from <source>, <n> bytes, not quoted`. `source` names
 * who produced the text (a model, a tool, a server), never the text.
 */
export function sessionContentInLog(kind: SessionContentKind, source: string, text: string): string {
  return `${kind} from ${source}, ${utf8ByteLength(text)} bytes, not quoted`;
}
