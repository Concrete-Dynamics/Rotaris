import headless from '@xterm/headless';
import serialize from '@xterm/addon-serialize';

/**
 * ADR-0021: the run host holds ONE headless emulator per live stream — the current screen, the retained
 * scrollback, the `truncated` flag — and keeps consuming whether or not anyone watches (REQ-TOOLS-127).
 * The emulator library is a PORT, not the decision; `@xterm/headless` is the adapter beneath it, chosen
 * because every display (ADR-0047) runs the same parser over the same bytes, which is what makes
 * REQ-SHELL-102's identical-cells claim a testable equality of inputs rather than a hope.
 *
 * Nothing here is persisted (REQ-SHELL-104: a session read back from storage produces no terminal tabs).
 */
export interface ScreenEmulator {
  readonly cols: number;
  readonly rows: number;
  /** Feed VT bytes; resolves once the parser has applied them (xterm parses on its own queue). */
  write(data: string): Promise<void>;
  resize(cols: number, rows: number): void;
  /** A VT serialisation of the retained screen — scrollback, cells, attributes — a display resets and replays. */
  serialize(): string;
  /** The retained lines as plain text, right-trimmed, newline-joined (what a preview without a parser can show). */
  text(): string;
  /** REQ-TOOLS-128 / REQ-SHELL-087: true once a line has scrolled past what is retained. Never returns to false. */
  readonly truncated: boolean;
  dispose(): void;
}

export interface EmulatorSpec {
  readonly cols: number;
  readonly rows: number;
  /** Retained lines above the screen; 0 keeps the screen alone (REQ-TOOLS-126's `terminal_stream_buffer_kb: 0`). */
  readonly scrollback: number;
}
export type EmulatorFactory = (spec: EmulatorSpec) => ScreenEmulator;

const { Terminal } = headless;
const { SerializeAddon } = serialize;

/** The `@xterm/headless` adapter. The package is CommonJS, hence the default import and the destructure above. */
export const xtermEmulatorFactory: EmulatorFactory = (spec) => {
  const term = new Terminal({ cols: spec.cols, rows: spec.rows, scrollback: spec.scrollback, allowProposedApi: true });
  const addon = new SerializeAddon();
  term.loadAddon(addon);
  let truncated = false;
  // Once the buffer holds rows + scrollback lines, the next scroll pushes the oldest line out of retention.
  let full = term.buffer.active.length >= spec.rows + spec.scrollback;
  term.onScroll(() => {
    if (full) truncated = true;
    full = term.buffer.active.length >= term.rows + spec.scrollback;
  });
  return {
    get cols() { return term.cols; },
    get rows() { return term.rows; },
    write: (data) => new Promise<void>((resolve) => term.write(data, resolve)),
    resize: (cols, rows) => { term.resize(Math.max(1, cols), Math.max(1, rows)); },
    serialize: () => addon.serialize(),
    text: () => {
      const b = term.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < b.length; i += 1) lines.push(b.getLine(i)?.translateToString(true) ?? '');
      while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      return lines.join('\n');
    },
    get truncated() { return truncated; },
    dispose: () => { term.dispose(); },
  };
};
