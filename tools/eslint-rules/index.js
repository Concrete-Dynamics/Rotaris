// @ts-check
// Project-local ESLint rules. Each exists because a record makes something a
// structural rule rather than a discipline; the rule is what makes it structural.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { citationsIn, RETIRED_DOMAINS } from '../requirement-coverage/coverage.mjs';

/** ADR-0006: no Date.now, performance.now, setTimeout or setInterval in engine
 * code. Every duration reads from the MonotonicClock port and every timer is
 * obtained from the Timers port, so a controlled clock can drive the product. */
/** @type {import('eslint').Rule.RuleModule} */
const noBareTimers = {
  meta: {
    type: 'problem',
    docs: { description: 'ADR-0006 — engine code takes time from the clock ports, never from globals' },
    schema: [],
    messages: {
      timer: 'ADR-0006: `{{name}}` is a bare timer. Obtain it from the Timers port.',
      clock: 'ADR-0006: `{{name}}` reads a global clock. Read MonotonicClock or WallClock instead.',
    },
  },
  create(context) {
    const TIMERS = new Set(['setTimeout', 'setInterval', 'setImmediate']);
    return {
      CallExpression(node) {
        const c = node.callee;
        if (c.type === 'Identifier' && TIMERS.has(c.name)) {
          context.report({ node, messageId: 'timer', data: { name: c.name } });
          return;
        }
        if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.property.type === 'Identifier') {
          const name = `${c.object.name}.${c.property.name}`;
          if (name === 'Date.now' || name === 'performance.now' || name === 'process.hrtime') {
            context.report({ node, messageId: 'clock', data: { name } });
          }
        }
      },
      /** `any`: an ESTree `NewExpression`, its options read syntactically as the comment above says. */
      NewExpression(/** @type {any} */ node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Date' && node.arguments.length === 0) {
          context.report({ node, messageId: 'clock', data: { name: 'new Date()' } });
        }
      },
    };
  },
};

/** ADR-0002/ADR-0044: `electron` is imported only in the five composition roots
 * of apps/desktop and in packages/shell/src/electron (its adapters). */
/** @type {import('eslint').Rule.RuleModule} */
const noElectronOutsideRoots = {
  meta: {
    type: 'problem',
    docs: { description: 'electron is a composition-root dependency, not a library one' },
    schema: [],
    messages: { bad: "`electron` may only be imported from apps/desktop/src/* or packages/shell/src/electron/*." },
  },
  create(context) {
    const file = context.filename.replace(/\\/g, '/');
    const allowed = /\/apps\/desktop\/src\/|\/packages\/shell\/src\/electron\//.test(file);
    return {
      ImportDeclaration(node) {
        const src = String(node.source.value);
        if (!allowed && (src === 'electron' || src.startsWith('electron/'))) {
          context.report({ node, messageId: 'bad' });
        }
      },
    };
  },
};

/** ADR-0031 (accepted narrowed, R-049): arithmetic on an amount lives in `packages/kernel/src/money.ts` and
 * nowhere else. The repository's lint runs without type information, so the rule is syntactic and has two
 * halves. (1) The exact arithmetic's own material — `BigInt(...)` and bigint literals — appears nowhere else,
 * so a second exact-money path cannot be written beside the first. (2) A value whose NAME says it is money
 * (`cost`, `price`, `amount`, in any case, as an identifier or a member) is never an operand of an arithmetic
 * operator, of a numeric conversion (`Number`, `parseFloat`, `parseInt`, unary `+`) or of a compound
 * assignment, which is how a binary float gets back in. Its limit is the heuristic's: a money value renamed to
 * something else escapes half (2). The rule is what makes that the exception rather than the habit. */
const MONEY_NAME = /cost|price|amount/i;
const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '**']);
const CONVERSIONS = new Set(['Number', 'parseFloat', 'parseInt']);

/**
 * The name an operand is known by — an identifier, or the last property of a member access — or null.
 * `any`: the node is ESTree or typescript-estree's (`TSNonNullExpression`, `TSAsExpression`), and `estree` types the first only.
 * @param {any} node
 * @returns {string | null}
 */
function nameOf(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression') return nameOf(node.expression);
  return null;
}
/** @param {any} node */
const isMoney = (node) => { const name = nameOf(node); return name !== null && MONEY_NAME.test(name); };

/** @type {import('eslint').Rule.RuleModule} */
const moneyOnlyInMoneyTs = {
  meta: {
    type: 'problem',
    docs: { description: 'ADR-0031 — arithmetic on an amount lives in kernel/src/money.ts only' },
    schema: [],
    messages: {
      bigint: 'ADR-0031: exact arithmetic lives in packages/kernel/src/money.ts; use addAmounts or multiplyAmount there instead of a bigint here.',
      operator: "ADR-0031: `{{name}}` is money and `{{op}}` would compute on it here, in binary floating point or as string concatenation. Use packages/kernel/src/money.ts (addAmounts, multiplyAmount, formatAmount).",
      conversion: 'ADR-0031: `{{name}}` is money and converting it to a number loses its exactness. Keep it a decimal string and use packages/kernel/src/money.ts.',
    },
  },
  create(context) {
    /** @type {(node: import('estree').Node, messageId: string, data?: Record<string, string>) => void} */
    const report = (node, messageId, data = {}) => context.report({ node, messageId, data });
    return {
      Literal(node) {
        if ('bigint' in node && typeof node.bigint === 'string') report(node, 'bigint');
      },
      CallExpression(node) {
        const c = node.callee;
        if (c.type === 'Identifier' && c.name === 'BigInt') { report(node, 'bigint'); return; }
        const conversion = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'Number' && c.property.type === 'Identifier' ? c.property.name : null;
        if (conversion !== null && CONVERSIONS.has(conversion) && isMoney(node.arguments[0])) report(node, 'conversion', { name: nameOf(node.arguments[0]) ?? '' });
      },
      BinaryExpression(node) {
        if (!ARITHMETIC.has(node.operator)) return;
        const money = isMoney(node.left) ? node.left : isMoney(node.right) ? node.right : null;
        if (money !== null) report(node, 'operator', { name: nameOf(money) ?? '', op: node.operator });
      },
      AssignmentExpression(node) {
        const op = node.operator.slice(0, -1);
        if (node.operator === '=' || !ARITHMETIC.has(op)) return;
        const money = isMoney(node.left) ? node.left : isMoney(node.right) ? node.right : null;
        if (money !== null) report(node, 'operator', { name: nameOf(money) ?? '', op: node.operator });
      },
      UnaryExpression(node) {
        if ((node.operator === '+' || node.operator === '-') && isMoney(node.argument)) report(node, 'conversion', { name: nameOf(node.argument) ?? '' });
      },
      UpdateExpression(node) {
        if (isMoney(node.argument)) report(node, 'operator', { name: nameOf(node.argument) ?? '', op: node.operator });
      },
    };
  },
};

/** ReqToCode §3.2/§4.6 (arXiv 2603.13999), R-092: a reference to a requirement that does not exist fails the build,
 * and a reference to a deprecated one is no silent pass. The citations of this repository are text — comments,
 * strings, test names, JSX text — so the rule reads every comment and every string, template and JSX-text token of a
 * file, finds each `REQ-…`/`PD-…` identifier with the forms the coverage report expands (`<id>..<nnn>`,
 * `<id> to <nnn>`, `<id>/<nnn>`, `<id>, <nnn> and <nnn>`: `citationsIn`, imported from that report rather than copied), and
 * resolves it against the generated artifact `pnpm symbols` writes (`packages/kernel/src/generated/requirements.ts`).
 *
 * - An identifier the artifact does not define is an error, whether written out or inside a range. A written one is read
 *   with any number of digits (`REQ-[A-Z]+-\d+`), so a digit too many or too few, which the coverage report's
 *   three-digit grammar never reads as a citation, is an identifier the artifact does not define, not text skipped.
 * - An identifier written out that is withdrawn in place, superseded by a directive, or in a retired domain (TUI,
 *   CLI) is an error unless the line or the line above says so in a word — `withdrawn` (or `withdrawal`),
 *   `superseded` (or the superseding directive's own identifier), `retired` — which marks the citation as a
 *   deliberate historical one. An identifier only implied by a range is checked for existence alone: a range that
 *   spans a withdrawn identifier cites its live neighbours, not the withdrawn one.
 * - The option `pending` names identifiers whose lifecycle the record has left open, each with the open question
 *   holding it (`{ 'REQ-ORCH-153': 'OQ-491' }` until that question's ruling, 2026-11-04); their lifecycle check waits
 *   on the ruling, and existence is still checked. An entry leaves with the ruling that closes its question. */
const ARTIFACT = fileURLToPath(new URL('../../packages/kernel/src/generated/requirements.ts', import.meta.url));
const IDENTIFIER_TEXT = /\b(?:REQ|PD)-[A-Z]+-\d+/g;

/**
 * @typedef {{ file: string, line: number, withdrawn: boolean }} CitedSymbol
 * @typedef {{ REQ: Record<string, CitedSymbol>, PD: Record<string, CitedSymbol>, SUPERSEDED_BY: Record<string, string> }} CitationArtifact
 */
/** @type {CitationArtifact | null} */
let artifact = null;
/**
 * The artifact, read once per process. A tree without it has not run `pnpm symbols`, which the gate runs first.
 * @returns {CitationArtifact}
 */
export function loadArtifact() {
  if (artifact) return artifact;
  if (!existsSync(ARTIFACT)) {
    throw new Error(`rotaris/requirement-citations-resolve: no ${ARTIFACT}; run \`pnpm symbols\` first`);
  }
  const mod = createRequire(import.meta.url)(ARTIFACT);
  artifact = { REQ: mod.REQ, PD: mod.PD, SUPERSEDED_BY: mod.SUPERSEDED_BY };
  return artifact;
}

/**
 * Every finding of one line of citation text, pure over the artifact.
 * @param {string} text the token's or comment's text on this line
 * @param {string} context this source line and the one above it, where a `withdrawn`/`superseded`/`retired` mark is read
 * @param {CitationArtifact} art
 * @param {Record<string, string>} [pending]
 * @returns {Array<{ id: string, index: number, kind: 'undefined' | 'withdrawn' | 'superseded' | 'retired', data: Record<string, string> }>}
 */
export function citationFindings(text, context, art, pending = {}) {
  /** @type {ReturnType<typeof citationFindings>} */
  const out = [];
  /** @type {Map<string, number>} */
  const written = new Map();
  for (const m of text.matchAll(IDENTIFIER_TEXT)) if (!written.has(m[0])) written.set(m[0], m.index ?? 0);
  const first = written.size > 0 ? Math.min(...written.values()) : 0;
  // Every identifier the artifact defines has three digits and `citationsIn` reads only those, so a written one of
  // any other length is reported here: a fourth digit typed after a live identifier cites nothing that exists.
  for (const [id, index] of written) {
    if (/-\d{3}$/.test(id)) continue;
    const where = id.startsWith('PD-') ? 'docs/product/directives/' : 'docs/spec/';
    out.push({ id, index, kind: 'undefined', data: { id, where } });
  }
  for (const id of citationsIn(text)) {
    const at = written.get(id);
    const explicit = at !== undefined;
    const index = at ?? first;
    const [kind, domain = ''] = id.split('-');
    const symbol = kind === 'PD' ? art.PD[id] : art.REQ[id];
    if (!symbol) {
      out.push({ id, index, kind: 'undefined', data: { id, where: kind === 'PD' ? 'docs/product/directives/' : 'docs/spec/' } });
      continue;
    }
    if (!explicit || pending[id]) continue;
    if (kind === 'REQ' && RETIRED_DOMAINS.includes(domain)) {
      if (!/\bretire/i.test(context)) out.push({ id, index, kind: 'retired', data: { id, domain } });
      continue;
    }
    const by = kind === 'REQ' ? art.SUPERSEDED_BY[id] : undefined;
    if (by) {
      if (!/supersed/i.test(context) && !context.includes(by)) out.push({ id, index, kind: 'superseded', data: { id, by } });
      continue;
    }
    if (symbol.withdrawn && !/\bwithdr[ae]w/i.test(context)) {
      out.push({ id, index, kind: 'withdrawn', data: { id, at: `${kind === 'PD' ? 'docs/product/' : 'docs/spec/'}${symbol.file}:${symbol.line}` } });
    }
  }
  return out;
}

/** @type {import('eslint').Rule.RuleModule} */
const requirementCitationsResolve = {
  meta: {
    type: 'problem',
    docs: { description: 'R-092, ReqToCode §4.6 — every requirement or directive identifier cited in code resolves against the generated artifact' },
    schema: [{
      type: 'object',
      properties: { pending: { type: 'object', additionalProperties: { type: 'string', pattern: '^OQ-\\d+$' } } },
      additionalProperties: false,
    }],
    messages: {
      undefined: 'cites {{id}}, which {{where}} does not define. Correct it to the identifier meant, or remove it.',
      withdrawn: 'cites {{id}}, withdrawn in place ({{at}}). Cite what replaced it, or mark a deliberate historical citation with the word `withdrawn` on this line or the line above.',
      superseded: 'cites {{id}}, superseded by {{by}}, which governs instead. Cite {{by}}, or mark a deliberate historical citation (`superseded by {{by}}`).',
      retired: 'cites {{id}}, in the retired {{domain}} domain (docs/spec/README.md). Remove it, or mark a deliberate historical citation with the word `retired`.',
    },
  },
  create(context) {
    /** @type {Record<string, string>} */
    const pending = context.options[0]?.pending ?? {};
    const art = loadArtifact();
    const source = context.sourceCode;
    const lines = source.lines;
    /** @type {Set<string>} */
    const seen = new Set();
    /** @param {{ range?: [number, number] | undefined, loc?: { start: { line: number, column: number } } | null | undefined }} token */
    const scan = (token) => {
      if (!token.range || !token.loc) return;
      // The token's raw text, so a column is a column of the source; one segment per physical line.
      const raw = source.text.slice(token.range[0], token.range[1]);
      if (!/(?:REQ|PD)-/.test(raw)) return;
      const start = token.loc.start;
      raw.split('\n').forEach((segment, i) => {
        const line = start.line + i;
        const column = i === 0 ? start.column : 0;
        const here = `${lines[line - 2] ?? ''}\n${lines[line - 1] ?? ''}`;
        for (const f of citationFindings(segment, here, art, pending)) {
          const key = `${line}:${f.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          context.report({ loc: { line, column: column + f.index }, messageId: f.kind, data: f.data });
        }
      });
    };
    return {
      Program() {
        for (const comment of source.getAllComments()) scan(comment);
        for (const token of source.ast.tokens ?? []) {
          // `JSXText` is typescript-estree's token type for text between JSX tags.
          if (token.type === 'String' || token.type === 'Template' || /** @type {string} */ (token.type) === 'JSXText') scan(token);
        }
      },
    };
  },
};

/** R-091 (`docs/architecture/hardening.md` §3.1; the Electron security checklist, items 3, 4, 6, 8, 9 and 10): every window's
 * renderer is built from `secureWebPreferences()` (`apps/desktop/src/main/secure-web-preferences.ts`). A `new BrowserWindow(...)`
 * passes an object literal whose `webPreferences` is an object literal opening with a spread of `secureWebPreferences(...)`,
 * stands after every other spread of the options (so nothing spread later replaces it), and adds no key of its own that decides
 * the perimeter. Syntactic, as the repository's lint is: an options object built elsewhere and passed by name is reported too,
 * because what it holds cannot be read here. Keep `SECURITY_KEYS` equal to `SECURITY_PREFERENCE_KEYS` there. */
const SECURITY_KEYS = new Set([
  'sandbox', 'contextIsolation', 'nodeIntegration', 'nodeIntegrationInWorker', 'nodeIntegrationInSubFrames', 'webSecurity',
  'allowRunningInsecureContent', 'experimentalFeatures', 'enableBlinkFeatures', 'webviewTag',
]);
/**
 * The name a non-computed property key is written with, or null. `any`: an ESTree `Property`, read on its `key` alone.
 * @param {any} property
 * @returns {string | null}
 */
const keyName = (property) => {
  if (property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') return property.key.value;
  return null;
};
/** @param {any} node */
const isFactoryCall = (node) => node?.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'secureWebPreferences';

const browserWindowUsesSecurePrefs = {
  meta: {
    type: 'problem',
    docs: { description: 'R-091 — every BrowserWindow is built with secureWebPreferences()' },
    schema: [],
    messages: {
      options: 'R-091: pass `new BrowserWindow` an object literal, so its `webPreferences` can be seen to come from `secureWebPreferences()`.',
      missing: 'R-091: this window states no `webPreferences`; write `webPreferences: { ...secureWebPreferences(preload) }`.',
      overridden: 'R-091: a spread after `webPreferences` may replace it; put `webPreferences: { ...secureWebPreferences(preload) }` last.',
      notFactory: 'R-091: `webPreferences` must open with a spread of `secureWebPreferences(preload)` (main/secure-web-preferences.ts).',
      securityKey: 'R-091: `{{name}}` decides the renderer\'s perimeter and is set by `secureWebPreferences()` alone; remove it here.',
      spread: 'R-091: a second spread inside `webPreferences` may replace what `secureWebPreferences()` set; name the keys instead.',
    },
  },
  /** @param {import('eslint').Rule.RuleContext} context */
  create(context) {
    return {
      /** `any`: an ESTree `NewExpression`, its options read syntactically as the comment above says. */
      NewExpression(/** @type {any} */ node) {
        const callee = node.callee;
        const named = callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' ? callee.property.name : null;
        if (named !== 'BrowserWindow') return;
        const options = node.arguments[0];
        if (options?.type !== 'ObjectExpression') { context.report({ node, messageId: 'options' }); return; }
        const index = options.properties.findLastIndex((/** @type {any} */ p) => p.type === 'Property' && keyName(p) === 'webPreferences');
        if (index === -1) { context.report({ node: options, messageId: 'missing' }); return; }
        if (options.properties.slice(index + 1).some((/** @type {any} */ p) => p.type === 'SpreadElement')) { context.report({ node: options.properties[index], messageId: 'overridden' }); return; }
        const prefs = options.properties[index].value;
        if (prefs.type !== 'ObjectExpression' || prefs.properties[0]?.type !== 'SpreadElement' || !isFactoryCall(prefs.properties[0].argument)) {
          context.report({ node: prefs, messageId: 'notFactory' });
          return;
        }
        for (const p of prefs.properties.slice(1)) {
          if (p.type === 'SpreadElement') { context.report({ node: p, messageId: 'spread' }); continue; }
          const name = keyName(p);
          if (name === null || SECURITY_KEYS.has(name)) context.report({ node: p, messageId: 'securityKey', data: { name: name ?? '(a computed key)' } });
        }
      },
    };
  },
};

export default {
  rules: {
    'no-bare-timers': noBareTimers,
    'no-electron-outside-roots': noElectronOutsideRoots,
    'money-only-in-money-ts': moneyOnlyInMoneyTs,
    'requirement-citations-resolve': requirementCitationsResolve,
    'browser-window-uses-secure-prefs': browserWindowUsesSecurePrefs,
  },
};
