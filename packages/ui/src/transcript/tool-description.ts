import { clipValue, redact } from '@rotaris/kernel';

/**
 * REQ-CHAT-175 — **what a tool call is doing, in one line a reader can follow without opening it.**
 *
 * The header of a tool row used to be the tool's own name (`terminal`, `read_file`), which says which mechanism ran
 * and nothing about the work. This module derives the sentence a reader wants — `Runs npm test`, `Reads src/app.ts`,
 * `Searches for release.yml` — from the two facts the row already carries: the tool's name and the arguments the
 * model sent.
 *
 * Four properties, each a requirement:
 *
 * - **REQ-CHAT-175, deterministic and pure.** No model call, no clock, no store, no side effect: the same name and
 *   the same arguments always give the same line. It is display only — it changes no call, no argument, no guard and
 *   no recorded row, and a name this build does not know falls back to the tool's own name rather than to a guess.
 * - **REQ-CHAT-176, redacted.** The arguments can carry a credential (a token on a command line, a key in a URL), so
 *   the line goes through `@rotaris/kernel`'s `redact` — the one pass the row's output goes through — and is clipped
 *   *after* masking, as REQ-EVENTS-063 orders. A secret that would have been masked in the output is masked here.
 * - **REQ-CHAT-177, the header at every stop.** `display/toolVerbosity` decides what else a tool row draws (grouping,
 *   preview, openness); it never decides whether the description is drawn. That directive's slider is recorded and not
 *   built (PD-CHAT-010), and this line is drawn unconditionally, so the five stops cannot disagree about it.
 * - **REQ-CHAT-178, the accessible name.** It is the header's own text, so a screen reader reads the meaning of the
 *   call first and the outcome after it, and the row is not a name-shaped button with no name.
 *
 * **What it deliberately does not do.** It does not read a tool's executor, its `label` function or its schema: those
 * live below the UI (`@rotaris/agent-tools`) and a surface that reached for them would take the whole tool layer with
 * it. It reads the argument JSON the row records and nothing else, so it works on history exactly as on a live row and
 * on a session recorded by an older build — the derivation happens at draw time, which is also why no store migration
 * and no `body` rewrite is owed.
 */

/** REQ-CHAT-175: the longest line drawn before it is cut, in code points, plus REQ-CHAT-176's `…`. */
export const TOOL_DESCRIPTION_MAX = 120;

type Args = Readonly<Record<string, unknown>>;

/** The arguments a row records, as an object; anything unreadable reads as none rather than as an error. */
function argsOf(inputJson: string | undefined): Args {
  if (inputJson === undefined || inputJson.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(inputJson);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Args) : {};
  } catch {
    return {};
  }
}

/** The first non-empty string among `names`; the alias pairs a tool's arguments spell the same fact two ways. */
function textOf(args: Args, ...names: readonly string[]): string {
  for (const name of names) {
    const value = args[name];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

/** The length of an array argument, or 0 — `steps`, `task_ids`. */
function countOf(args: Args, name: string): number {
  const value = args[name];
  return Array.isArray(value) ? value.length : 0;
}

/**
 * REQ-CHAT-175: the phrase for one tool, or null where this build derives none for it. One entry per public tool name
 * of REQ-TOOLS-001's registry; a name outside the table is null and falls back to itself.
 */
function phraseFor(toolName: string, args: Args): string | null {
  const path = textOf(args, 'path', 'file_path');
  switch (toolName) {
    case 'terminal': {
      const command = textOf(args, 'command');
      if (command !== '') return `Runs ${command}`;
      if (args['is_input'] === true) return 'Types into the terminal';
      const action = textOf(args, 'session_action');
      if (action !== '') return `Terminal session: ${action}`;
      return 'Runs a command';
    }
    case 'read_file':
    case 'haet_read':
      return path === '' ? 'Reads a file' : `Reads ${path}`;
    case 'write_file': {
      const operation = textOf(args, 'operation');
      const target = path === '' ? '' : ` ${path}`;
      switch (operation) {
        case 'create': return `Creates${target === '' ? ' a file' : target}`;
        case 'edit': return `Edits${target === '' ? ' a file' : target}`;
        case 'overwrite': return `Overwrites${target === '' ? ' a file' : target}`;
        case 'insert': return `Inserts into${target === '' ? ' a file' : target}`;
        case 'undo': return 'Undoes the last write';
        default: return `Writes${target === '' ? ' a file' : target}`;
      }
    }
    case 'haet':
    case 'haet_edit':
      return path === '' ? 'Edits a file' : `Edits ${path}`;
    case 'grep': {
      const pattern = textOf(args, 'pattern');
      if (pattern === '') return 'Searches the workspace';
      return path === '' ? `Searches for ${pattern}` : `Searches for ${pattern} in ${path}`;
    }
    case 'glob': {
      const pattern = textOf(args, 'pattern');
      return pattern === '' ? 'Finds files' : `Finds files matching ${pattern}`;
    }
    case 'fetch': {
      const url = textOf(args, 'url');
      return url === '' ? 'Fetches a URL' : `Fetches ${url}`;
    }
    case 'delegate': {
      const persona = textOf(args, 'persona');
      const task = textOf(args, 'task_name');
      if (persona === '' && task === '') return 'Delegates work';
      if (persona === '') return `Delegates ${task}`;
      return task === '' ? `Delegates to ${persona}` : `Delegates to ${persona}: ${task}`;
    }
    case 'background_output': {
      const task = textOf(args, 'task_id');
      return task === '' ? 'Reads a child\'s output' : `Reads the output of ${task}`;
    }
    case 'wait_for_tasks': {
      const waiting = countOf(args, 'task_ids');
      return waiting === 0 ? 'Waits for its children' : `Waits for ${waiting} ${waiting === 1 ? 'child' : 'children'}`;
    }
    case 'todo': {
      switch (textOf(args, 'operation')) {
        case 'add_phase':
        case 'add_task': return 'Adds to the todo list';
        case 'update': return 'Updates a todo item';
        case 'remove_task': return 'Removes a todo item';
        default: return 'Updates the todo list';
      }
    }
    case 'ask_questions': {
      const steps = countOf(args, 'steps');
      if (steps === 0) return 'Asks a question';
      return `Asks ${steps} ${steps === 1 ? 'question' : 'questions'}`;
    }
    case 'git_commit': {
      const message = textOf(args, 'message');
      return message === '' ? 'Commits the workspace' : `Commits ${message}`;
    }
    case 'git_read': {
      const ref = textOf(args, 'ref');
      return ref === '' ? 'Reads the Git state' : `Reads Git ref ${ref}`;
    }
    case 'artifact_write': {
      const slug = textOf(args, 'slug');
      return slug === '' ? 'Writes an artifact' : `Writes the artifact ${slug}`;
    }
    case 'artifact_read': {
      const id = textOf(args, 'id_or_slug');
      return id === '' ? 'Reads an artifact' : `Reads the artifact ${id}`;
    }
    case 'artifact_list':
      return 'Lists artifacts';
    default:
      return null;
  }
}

/**
 * REQ-CHAT-175/176: the description a tool row draws as its header.
 *
 * The fallback is the tool's own name (REQ-CHAT-175) — never an empty string for a named tool — and an unnamed tool
 * yields the empty string, which the row answers with the text it recorded. REQ-CHAT-176 masks before it clips.
 */
export function describeToolCall(toolName: string, inputJson: string | undefined): string {
  const name = toolName.trim();
  if (name === '') return '';
  const phrase = phraseFor(name, argsOf(inputJson)) ?? name;
  const line = phrase.replace(/\s+/gu, ' ').trim();
  return clipValue(redact(line), TOOL_DESCRIPTION_MAX);
}
