import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Confirm } from './Confirm.js';
import { RUNTIME_CONFIRMATIONS } from './ConfigSettings.js';

/**
 * REQ-CONFIG-327's two confirmations, the `autonomous` one narrowed by PD-WORKSPACE-009 (OQ-468, ruled 2026-11-04). Until
 * 2026-11-05 its body said only that mutating tools inside the workspace run without asking — it had dropped the
 * requirement's residual guard ("any call reaching a path outside the workspace continues to require approval") with no
 * directive, and that guard was false anyway: REQ-TOOLS-044 refuses a file tool's outside path at the fence and never asks,
 * and the terminal and MCP are not judged by path. The directive's three statements replace it.
 */
describe('the Runtime card\'s confirmations (REQ-CONFIG-327, PD-WORKSPACE-009)', () => {
  const { autonomous, outside } = RUNTIME_CONFIRMATIONS;

  it('the autonomous confirmation says the three things PD-WORKSPACE-009 fixes, and no longer promises the residual guard', () => {
    expect(autonomous.title).toBe('Start runs in autonomous mode?');
    expect(autonomous.body).toBe(
      'Mutating tools inside the workspace will be invoked without asking, except for the destructive commands the starter rules always deny. '
      + 'A file tool reaching a path outside the workspace is refused by the path fence and never asked about, unless access beyond the workspace is on. '
      + 'Terminal commands and MCP tools are not judged by the paths they reach; they are bounded only by OS confinement where it is active.',
    );
    expect(autonomous.body).not.toMatch(/continues? to require approval/);
  });

  it('the access-beyond-the-workspace confirmation keeps REQ-CONFIG-327\'s words', () => {
    expect(outside).toEqual({
      title: 'Allow access beyond the workspace?',
      body: 'Agents will then be able to read and change files outside the chosen workspace. This belongs on only where a task genuinely needs it.',
    });
  });

  it('each is drawn as the warning prompt, Cancel first and the default, with its body whole', () => {
    for (const c of [autonomous, outside]) {
      const html = renderToStaticMarkup(createElement(Confirm, { title: c.title, body: c.body, onYes: () => undefined, onCancel: () => undefined }));
      expect(html).toContain(`<p class="dialog-body">${c.body.replace(/'/g, '&#x27;')}</p>`);
      expect(html.indexOf('>Cancel<')).toBeLessThan(html.indexOf('>Yes<'));
    }
  });

  it('the Runtime card draws both from these words, never a literal of its own', () => {
    const source = readFileSync(new URL('./ConfigSettings.tsx', import.meta.url), 'utf8');
    expect(source).toContain('<Confirm title={RUNTIME_CONFIRMATIONS.outside.title} body={RUNTIME_CONFIRMATIONS.outside.body} ');
    expect(source).toContain('<Confirm title={RUNTIME_CONFIRMATIONS.autonomous.title} body={RUNTIME_CONFIRMATIONS.autonomous.body} ');
  });
});
