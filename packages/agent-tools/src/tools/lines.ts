/**
 * What the file tools call a line. A newline ENDS a line; it does not begin another, so `probe-ok\n` is one line
 * and an empty file has none — the count `wc -l` and every editor give, and the one a model checks a report
 * against. `text.split('\n')` counted the empty string after a final newline as one more line: the live run of
 * 2026-09-29 was told "2 line(s) created" for `probe-ok\n`, read `total_lines: 2` back, and spent a terminal
 * call on `wc` to find out which was true (docs/defects/fixed/a-trailing-newline-counts-as-a-line.md).
 *
 * A last line with no newline after it is still a line. Line-window matching (REQ-TOOLS-136) keeps splitting
 * on every newline, because it rejoins what it split and must give the bytes back unchanged; only what is
 * COUNTED, SHOWN or POSITIONED by line goes through here (REQ-TOOLS-134, REQ-TOOLS-135, REQ-CHAT-050).
 */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines;
}

/** The number of lines in `text`, under `splitLines`' reading. */
export function lineCount(text: string): number {
  return splitLines(text).length;
}
