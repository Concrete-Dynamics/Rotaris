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

export default {
  rules: {
    'no-bare-timers': noBareTimers,
    'no-electron-outside-roots': noElectronOutsideRoots,
  },
};
