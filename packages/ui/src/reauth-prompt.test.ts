import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReauthPrompt as ReauthPromptState } from '@rotaris/contracts';
import { AppShell } from './AppShell.js';
import { WorkspaceView } from './WorkspaceView.js';
import { REAUTH_SUBMIT_LABEL, ReauthPrompt, applyReauthPublish, reauthCopy, reauthPromptFor, seedReauthPrompts, type ReauthPrompts } from './ReauthPrompt.js';

const ERROR = 'scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided';
const base: ReauthPromptState = {
  sessionId: 'S1', primary: { provider: 'katalyst', model: 'big', modelKey: 'big' }, fallback: { provider: 'deepseek', model: 'small', modelKey: 'small' },
  provider: { id: 'katalyst', name: 'Katalyst' }, method: 'api-key', error: ERROR,
};
const render = (prompt: ReauthPromptState) => renderToStaticMarkup(createElement(ReauthPrompt, { prompt, onSubmit: async () => ({ ok: true as const, applies: 'next-iteration' as const }), onDismiss: async () => undefined }));

describe('the non-modal re-authentication prompt (REQ-NOTIFY-071/078, ADR-0048)', () => {
  it('REQ-NOTIFY-071: names the primary that failed, says the run continues on the fallback and switches back from the next iteration', () => {
    expect(reauthCopy(base)).toEqual({
      title: 'Re-authenticate Katalyst',
      body: 'katalyst/big could not authenticate. The run continues on the fallback model deepseek/small; re-authenticating switches back to katalyst/big from the next iteration.',
      method: null,
    });
  });

  it('ADR-0048: a window-level dialog with no aria-modal and no backdrop; it quotes the provider\'s error and offers the dismissal that keeps the fallback', () => {
    const html = render(base);
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain('aria-modal');
    expect(html).not.toContain('dialog-backdrop');
    expect(html).toContain('data-testid="reauth-error">scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided</p>');
    // REQ-NOTIFY-071's dismissal "meaning that the fallback is kept", in the words the surface shows.
    expect(html).toContain('data-action="reauth-keep">Keep the fallback</button>');
    expect(html).toContain(`data-action="reauth-submit">${REAUTH_SUBMIT_LABEL}</button>`);
    expect(html.indexOf('Keep the fallback')).toBeLessThan(html.indexOf(`>${REAUTH_SUBMIT_LABEL}<`));
  });

  it('REQ-NOTIFY-078: a key-based provider is offered a masked key field', () => {
    const html = render(base);
    expect(html).toMatch(/<input[^>]*type="password"[^>]*data-testid="reauth-key"/);
    expect(html).not.toContain('data-testid="reauth-method"');
  });

  it('a device-code or browser provider is offered no key field and is told the method is unavailable in this build', () => {
    const reason = 'GitHub Copilot signs in with "Code shown here, entered at the provider", which this build does not provide yet.';
    const html = render({ ...base, provider: { id: 'copilot', name: 'GitHub Copilot' }, method: 'unavailable', unavailableReason: reason });
    expect(html).not.toContain('type="password"');
    expect(html).toContain(`data-testid="reauth-method">${reason.replace(/"/g, '&quot;')}</p>`);
  });

  it('a provider this application holds no credential for says where its key comes from, and still offers switching back', () => {
    const copy = reauthCopy({ ...base, provider: { id: 'scripted', name: 'scripted' }, method: 'none' });
    expect(copy.method).toBe('This application holds no credential for scripted; its key comes from the model configuration. Re-authenticate it there, then switch back here.');
    expect(render({ ...base, method: 'none' })).toContain('data-action="reauth-submit"');
  });

  it('REQ-NOTIFY-030: the window draws the followed session\'s prompt alone — absent while another is focused, back on refocusing', () => {
    let held: ReauthPrompts = new Map();
    held = applyReauthPublish(held, 'S1', base);
    expect(reauthPromptFor(held, 'S1')).toBe(base);
    // The user focuses S2: S1's prompt is not drawn over it, and nothing S1's would act on is on screen.
    expect(reauthPromptFor(held, 'S2')).toBeNull();
    expect(reauthPromptFor(held, null)).toBeNull();
    // S2 gets its own; each session's is drawn only while it is followed.
    const s2: ReauthPromptState = { ...base, sessionId: 'S2', primary: { provider: 'openai', model: 'gpt', modelKey: 'gpt' } };
    held = applyReauthPublish(held, 'S2', s2);
    expect(reauthPromptFor(held, 'S2')).toBe(s2);
    // Refocusing S1 brings its prompt back; closing it (an answer, in any window) removes it for good.
    expect(reauthPromptFor(held, 'S1')).toBe(base);
    held = applyReauthPublish(held, 'S1', null);
    expect(reauthPromptFor(held, 'S1')).toBeNull();
    expect(reauthPromptFor(held, 'S2')).toBe(s2);
  });

  it('a window that mounts after a prompt opened draws it from the read, and a publish that reached it first wins', () => {
    const newer: ReauthPromptState = { ...base, error: 'a newer failure' };
    const seeded = seedReauthPrompts(applyReauthPublish(new Map(), 'S1', newer), [base, { ...base, sessionId: 'S3' }]);
    expect(reauthPromptFor(seeded, 'S1')).toBe(newer);
    expect(reauthPromptFor(seeded, 'S3')?.sessionId).toBe('S3');
  });

  it('ADR-0048 / OQ-180: the Workspace view draws the prompt in flow, in its own row after the run header and before the transcript', () => {
    const panel = createElement(ReauthPrompt, { prompt: base, onSubmit: async () => ({ ok: true as const, applies: 'next-run' as const }), onDismiss: async () => undefined });
    const html = renderToStaticMarkup(createElement(WorkspaceView, { session: null, rows: [], onSubmit: async () => ({ ok: true as const }), onStop: async () => ({ ok: true as const }), reauthPrompt: panel }));
    const prompt = html.indexOf('data-testid="reauth-prompt"');
    expect(prompt).toBeGreaterThan(html.indexOf('data-testid="run-header"'));
    expect(prompt).toBeLessThan(html.indexOf('class="transcript"'));
    // A direct child of the view's grid, so it takes the `reauth` row rather than lying over another.
    expect(html).toMatch(/<\/div><section class="reauth-prompt" role="dialog"[\s\S]*?<\/section><div class="transcript" role="log"/);
    // And the shell no longer carries a window panel over the rail-and-view region.
    const shell = renderToStaticMarkup(createElement(AppShell, { version: '0.0.0', workspacePath: '/w', home: '/h', sessionName: null, onChooseWorkspace: () => undefined, statusItems: [] }));
    expect(shell).not.toContain('reauth-prompt');
  });

  it('the head (title, sentence), the provider\'s words with the key\'s hint, then the answers (key, buttons) — the hint describing the key field', () => {
    const html = render(base);
    const head = html.indexOf('class="reauth-prompt__head"');
    const detail = html.indexOf('class="reauth-prompt__detail"');
    const answer = html.indexOf('class="reauth-prompt__answer"');
    expect(head).toBeGreaterThan(-1);
    expect(head).toBeLessThan(html.indexOf('data-testid="reauth-body"'));
    expect(detail).toBeLessThan(html.indexOf('data-testid="reauth-error"'));
    expect(answer).toBeGreaterThan(html.indexOf('data-testid="reauth-error"'));
    expect(answer).toBeLessThan(html.indexOf('data-testid="reauth-key"'));
    expect(answer).toBeLessThan(html.indexOf('data-action="reauth-keep"'));
    expect(answer).toBeGreaterThan(html.indexOf('data-testid="reauth-key-hint"'));
    const hintId = /id="([^"]+)" class="reauth-prompt__caption" data-testid="reauth-key-hint"/.exec(html)?.[1];
    expect(hintId).toBeDefined();
    expect(html).toMatch(new RegExp(`aria-describedby="${hintId}"[^>]*data-testid="reauth-key"`));
  });
});

/**
 * The placement in the stylesheet. Two overlay placements covered controls in the built app — `fixed` at the window's
 * corner (the title bar, the notice) and `absolute` in the rail-and-view region (at 1000x680 the run header's switches,
 * and the composer's submit under a key field) — so the rule pinned here is that the prompt is no overlay at all: it
 * names a row of the Workspace grid, and every template of that grid declares the row.
 */
const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
const rulesOf = (selector: string): string[] => [...css.matchAll(new RegExp(`(?:^|\\n|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`, 'g'))].map((m) => m[1] ?? '');

describe('the re-authentication prompt overlays nothing (ADR-0048 "leaves the rest navigable", REQ-SHELL-022)', () => {
  it('is laid out in flow — no fixed or absolute position, no stacking order of its own — in the Workspace grid\'s `reauth` row', () => {
    const own = rulesOf('.reauth-prompt').join(' ');
    expect(own).not.toMatch(/position\s*:\s*(fixed|absolute)/);
    expect(own).not.toMatch(/z-index/);
    expect(own).toMatch(/overflow\s*:\s*auto/);
    expect(rulesOf('.workspace > .reauth-prompt').join(' ')).toMatch(/grid-area\s*:\s*reauth/);
    // Shorter than it needs (the minimum window with a notice standing), the card scrolls and its answers stay at its floor.
    const answer = rulesOf('.reauth-prompt__answer').join(' ');
    expect(answer).toMatch(/position\s*:\s*sticky/);
    expect(answer).toMatch(/(^|[\s;])bottom\s*:/);
  });

  it('every Workspace grid template names the `reauth` row and gives it a row of its own, zero high when empty', () => {
    const areas = [...css.matchAll(/\.workspace(?:--with-sidebar|--narrow)\s*\{[^}]*grid-template-areas:\s*([^;]+);/g)].map((m) => m[1]!);
    expect(areas.length).toBe(2);
    for (const a of areas) {
      const rows = [...a.matchAll(/'([^']+)'/g)].map((m) => m[1]!.trim());
      expect(rows.some((r) => r.split(/\s+/).includes('reauth'))).toBe(true);
      expect(rows.findIndex((r) => r.split(/\s+/).includes('reauth'))).toBe(rows.findIndex((r) => r.split(/\s+/).includes('runhead')) + 1);
    }
    // Each rows template of the view: the wide ones have seven tracks and the narrow ones eight (the drawer bar), the
    // `reauth` track `minmax(0, auto)` straight after the run header's, so the transcript's floor is sized first.
    const templates = [...css.matchAll(/(\.workspace[^{,]*)\{[^}]*grid-template-rows:\s*([^;]+);/g)].map((m) => ({ selector: m[1]!.trim(), rows: m[2]!.trim() }));
    expect(templates.length).toBeGreaterThanOrEqual(6);
    for (const t of templates) {
      const tracks = t.rows.match(/minmax\([^)]*\([^)]*\)[^)]*\)|minmax\([^)]*\)|\S+/g)!;
      const narrow = t.selector.includes('--narrow');
      expect(tracks.length, t.selector).toBe(narrow ? 8 : 7);
      expect(tracks[narrow ? 2 : 1], t.selector).toBe('minmax(0, auto)');
    }
  });

  it('beside an expanded plan gate the prompt yields as a bar — its title and its answers on one row, nothing pinned, no height written — and is whole again beside a collapsed gate (REQ-ORCH-153, PD-ORCH-002, OQ-180)', () => {
    // A `minmax(0, auto)` track is maximised before a flexible one is expanded (CSS Grid §12.5-12.7). With the gate expanded
    // the transcript is not drawn and the gate's row is `minmax(0, 1fr)`, so the whole prompt took its height first and left
    // the gate 42 px at 1000x680, its three answers unreachable (the verifier's probe, 2026-10-02).
    const expanded = ".workspace[data-plan-gate='1']:not([data-plan-gate-collapsed='1']) > .reauth-prompt";
    const card = rulesOf(expanded).join(' ');
    expect(card).toMatch(/flex-direction\s*:\s*row/);
    expect(card).toMatch(/flex-wrap\s*:\s*wrap/);
    // The bar's height is its one row of controls: no height of any kind is written, so nothing rests on arithmetic.
    expect(card).not.toMatch(/(^|[\s;])(max-|min-)?height\s*:/);
    // The sentence, the provider's words and the hint are not drawn in the bar; the answers are unpinned (nothing scrolls).
    expect(css).toMatch(new RegExp(`${expanded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.reauth-prompt__head \\.dialog-body,\\s*${expanded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.reauth-prompt__detail\\s*\\{\\s*display:\\s*none;\\s*\\}`));
    const answer = rulesOf(`${expanded} .reauth-prompt__answer`).join(' ');
    expect(answer).toMatch(/position\s*:\s*static/);
    expect(rulesOf(`${expanded} .reauth-prompt__answer .field`).join(' ')).toMatch(/flex-direction\s*:\s*row/);
    // The inline label stays one line (the first bar drawn broke "API key" over two, beside its field).
    expect(rulesOf(`${expanded} .reauth-prompt__answer .field-label`).join(' ')).toMatch(/white-space\s*:\s*nowrap/);
    // Every bar rule is keyed on the expanded gate alone: no other rule hides the prompt's words, so with no gate or a
    // collapsed one the prompt is whole.
    const hiding = [...css.matchAll(/([^{}]*\.reauth-prompt[^{}]*)\{[^}]*display\s*:\s*none/g)].map((m) => m[1]!.trim());
    expect(hiding.length).toBeGreaterThan(0);
    for (const selector of hiding) for (const part of selector.split(',')) expect(part.trim().startsWith(expanded), part).toBe(true);
  });
});
