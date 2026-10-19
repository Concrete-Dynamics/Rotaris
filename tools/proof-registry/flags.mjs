/**
 * The flag tokens a proof script reads from its own argv.
 *
 * The registry's flags column is what a runner may pass. The guard's other direction — a recorded flag's token
 * occurring in the script — cannot see an omission: a flag the script reads and the registry never names still
 * passes, and every plan that trusts the column misses it. This reads the script the way it reads argv.
 *
 * Two shapes count. A literal check on `process.argv`, or on the binding sliced from it (`argv`, not `l.argv`
 * and not another process's cmdline): `.includes('--flag')`, or `.startsWith('--flag')` / `=== '--flag'` /
 * `!== '--flag'` in the same statement. And a helper whose body builds `` `--${name}` `` or `` `--${name}=` ``
 * from its first parameter (`has`, `value`, `flag`), or one that takes the dashed form at the call
 * (`arg('--theme')`). A comment, a string, and a template sent to a child are not reads. A flag taken through
 * a computed name is not seen — the scripts pass literals, and `registry.test.ts` pins the shapes that exist.
 */
const FLAG = '--[a-z][a-z0-9-]*';
const NAME = '[A-Za-z_$][\\w$]*';

/**
 * 1 where the index is code: not a comment, a string, or the text of a template literal. An interpolation
 * (`${…}`) is code again, so a helper's `` `--${name}` `` stays findable as source while a flag mentioned
 * only inside a template is not a read.
 * @param {string} source
 * @returns {Uint8Array}
 */
function codeMask(source) {
  const mask = new Uint8Array(source.length);
  /** @type {Array<'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl'>} */
  const stack = ['code'];
  /** Brace depth to return to when an interpolation's `}` closes. */
  const interpClose = [];
  let braces = 0;
  let i = 0;
  while (i < source.length) {
    const state = stack[stack.length - 1];
    const c = source[i];
    const n = source[i + 1];
    if (state === 'code') {
      if (c === '{') braces += 1;
      if (c === '}') {
        braces -= 1;
        if (interpClose.length > 0 && braces === interpClose[interpClose.length - 1]) {
          stack.pop();
          interpClose.pop();
          i += 1;
          continue;
        }
      }
      if (c === '/' && n === '/') { stack.push('line'); i += 2; continue; }
      if (c === '/' && n === '*') { stack.push('block'); i += 2; continue; }
      if (c === "'") { stack.push('sq'); i += 1; continue; }
      if (c === '"') { stack.push('dq'); i += 1; continue; }
      if (c === '`') { stack.push('tpl'); i += 1; continue; }
      mask[i] = 1;
      i += 1;
      continue;
    }
    if (state === 'line') {
      if (c === '\n') { stack.pop(); mask[i] = 1; }
      i += 1;
      continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { stack.pop(); i += 2; continue; }
      i += 1;
      continue;
    }
    if (state === 'sq' || state === 'dq') {
      if (c === '\\') { i += 2; continue; }
      if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"')) stack.pop();
      i += 1;
      continue;
    }
    if (c === '\\') { i += 2; continue; }
    if (c === '`') { stack.pop(); i += 1; continue; }
    if (c === '$' && n === '{') {
      stack.push('code');
      interpClose.push(braces);
      i += 1;
      continue;
    }
    i += 1;
  }
  return mask;
}

/** The statement holding `at` mentions the script's own argv, in code. */
function statementReadsArgv(source, mask, at) {
  let i = at;
  while (i > 0) {
    const c = source[i - 1];
    if (c === ';' || c === '{' || c === '}') break;
    i -= 1;
  }
  const span = source.slice(i, at);
  const re = /(?:process\.argv|(?<![.\w])argv)\b/g;
  let match;
  while ((match = re.exec(span)) !== null) {
    if (mask[i + match.index] === 1) return true;
  }
  return false;
}

/**
 * @param {string} source
 * @returns {string[]} flag tokens, sorted, each `--name` with no `=`
 */
export function flagsRead(source) {
  const mask = codeMask(source);
  /** @type {Set<string>} */
  const tokens = new Set();
  const inCode = (index) => mask[index] === 1;

  const includes = new RegExp(String.raw`(?:process\.argv|(?<![.\w])argv)\.includes\(\s*(['"])(${FLAG})\1`, 'g');
  let match;
  while ((match = includes.exec(source)) !== null) {
    if (inCode(match.index)) tokens.add(match[2]);
  }

  const compared = new RegExp(String.raw`(?:\.startsWith\(\s*|(?:===|!==)\s*)(['"\`])(${FLAG})=?\1`, 'g');
  while ((match = compared.exec(source)) !== null) {
    if (inCode(match.index) && statementReadsArgv(source, mask, match.index)) tokens.add(match[2]);
  }

  const helpers = new RegExp(String.raw`(?:^|\n)const (${NAME}) = (?:async )?\((${NAME})\b[^)]*\) =>`, 'g');
  while ((match = helpers.exec(source)) !== null) {
    if (!inCode(match.index + (match[0].startsWith('\n') ? 1 : 0))) continue;
    const name = match[1];
    const param = match[2];
    const from = match.index + match[0].length;
    let end = source.length;
    const boundary = /\n(?:const |function |export |class )/g;
    boundary.lastIndex = from;
    let bound;
    while ((bound = boundary.exec(source)) !== null) {
      if (inCode(bound.index + 1)) { end = bound.index; break; }
    }
    const body = source.slice(from, Math.min(end, from + 2000));
    const prefixes = body.includes(`\`--\${${param}}\``) || body.includes(`\`--\${${param}}=\``);
    const callerDashes = !prefixes && (body.includes(`\`\${${param}}=\``) || body.includes(`\`\${${param}}\``));
    if (!prefixes && !callerDashes) continue;
    const calls = prefixes
      ? new RegExp(String.raw`(?<![.\w])${name}\(\s*(['"])([a-z][a-z0-9-]*)\1`, 'g')
      : new RegExp(String.raw`(?<![.\w])${name}\(\s*(['"])(${FLAG})\1`, 'g');
    let call;
    while ((call = calls.exec(source)) !== null) {
      if (!inCode(call.index)) continue;
      tokens.add(prefixes ? `--${call[2]}` : call[2]);
    }
  }

  return [...tokens].sort();
}
