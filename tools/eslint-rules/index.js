// @ts-check
// Project-local ESLint rules. Each exists because a record makes something a
// structural rule rather than a discipline; the rule is what makes it structural.

/** ADR-0006: no Date.now, performance.now, setTimeout or setInterval in engine
 * code. Every duration reads from the MonotonicClock port and every timer is
 * obtained from the Timers port, so a controlled clock can drive the product. */
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
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Date' && node.arguments.length === 0) {
          context.report({ node, messageId: 'clock', data: { name: 'new Date()' } });
        }
      },
    };
  },
};

/** ADR-0002/ADR-0044: `electron` is imported only in the five composition roots
 * of apps/desktop and in packages/shell/src/electron (its adapters). */
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

/** The name an operand is known by — an identifier, or the last property of a member access — or null. */
function nameOf(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression') return nameOf(node.expression);
  return null;
}
const isMoney = (node) => { const name = nameOf(node); return name !== null && MONEY_NAME.test(name); };

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
    const report = (node, messageId, data = {}) => context.report({ node, messageId, data });
    return {
      Literal(node) {
        if (typeof node.bigint === 'string') report(node, 'bigint');
      },
      CallExpression(node) {
        const c = node.callee;
        if (c.type === 'Identifier' && c.name === 'BigInt') { report(node, 'bigint'); return; }
        const conversion = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'Number' && c.property.type === 'Identifier' ? c.property.name : null;
        if (conversion !== null && CONVERSIONS.has(conversion) && isMoney(node.arguments[0])) report(node, 'conversion', { name: nameOf(node.arguments[0]) });
      },
      BinaryExpression(node) {
        if (!ARITHMETIC.has(node.operator)) return;
        const money = isMoney(node.left) ? node.left : isMoney(node.right) ? node.right : null;
        if (money !== null) report(node, 'operator', { name: nameOf(money), op: node.operator });
      },
      AssignmentExpression(node) {
        const op = node.operator.slice(0, -1);
        if (node.operator === '=' || !ARITHMETIC.has(op)) return;
        const money = isMoney(node.left) ? node.left : isMoney(node.right) ? node.right : null;
        if (money !== null) report(node, 'operator', { name: nameOf(money), op: node.operator });
      },
      UnaryExpression(node) {
        if ((node.operator === '+' || node.operator === '-') && isMoney(node.argument)) report(node, 'conversion', { name: nameOf(node.argument) });
      },
      UpdateExpression(node) {
        if (isMoney(node.argument)) report(node, 'operator', { name: nameOf(node.argument), op: node.operator });
      },
    };
  },
};

export default {
  rules: {
    'no-bare-timers': noBareTimers,
    'no-electron-outside-roots': noElectronOutsideRoots,
    'money-only-in-money-ts': moneyOnlyInMoneyTs,
  },
};
