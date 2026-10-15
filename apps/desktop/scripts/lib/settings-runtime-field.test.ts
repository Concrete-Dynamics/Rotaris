/**
 * The Settings › Runtime number-field steps and their reading (`settings-runtime-field.mjs`), pinned against log text in the
 * capture seams' own shapes. Since 2026-10-15 the reading carries the field's `aria-description` after the edit and after
 * Save, which `continuation-proof`'s later-run scenario holds to the stored value
 * (REQ-CONFIG-446, REQ-CONFIG-419; `docs/defects/fixed/a-runtime-timeout-fields-description-states-an-unsaved-value-as-stored.md`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the helper is plain ESM beside the scripts that run it.
import { fieldSaveReading, runtimeFieldSteps } from './settings-runtime-field.mjs';

const expression = `document.getElementById('child-timeout')?.getAttribute('aria-description') ?? null`;

describe('a Runtime number field set and saved through the capture seams', () => {
  it('reads the field description twice: after the edit, before Save, and after Save', () => {
    const env = runtimeFieldSteps({ id: 'child-timeout', value: 1 }) as Record<string, string>;
    // Two plain appointments, `<expression>@ms` joined by `;;`: no `>>`, `@` or `;;` inside the expression to split it.
    expect(env['ROTARIS_CAPTURE_EVAL_AT']).toBe(`${expression}@10200;;${expression}@12500`);
    expect(/>>|@|;;/.test(expression)).toBe(false);
    // Both readings fall between the edit's Tab (9,800) and the end (13,000), on either side of Save (10,600).
    expect(env['ROTARIS_CAPTURE_KEYS']).toBe('Tab@9800');
    expect(env['ROTARIS_CAPTURE_CLICKS']).toContain('Save@10600');
    expect(env['ROTARIS_CAPTURE_AFTER_MS']).toBe('13000');
  });

  it('returns the stored description after the edit and the saved one at the end, and null where the log holds none', () => {
    const log = [
      `[main] capture: probe-at 10200 .save-bar__status → [{"text":"Unsaved changes","data":{}}]`,
      `[main] capture: eval-at 10200 ${expression} → "Stored as 3 seconds."`,
      `[main] capture: eval-at 12500 ${expression} → "Stored as 60 seconds."`,
      `[main] capture: probe #child-timeout → [{"text":"","value":"1","data":{}}]`,
      `[main] capture: probe .save-bar__status → [{"text":"All changes saved","data":{}}]`,
    ].join('\n');
    expect(fieldSaveReading(log, { id: 'child-timeout' })).toEqual({
      afterEdit: 'Unsaved changes', atEnd: 'All changes saved', field: '1',
      descriptionAfterEdit: 'Stored as 3 seconds.', descriptionAtEnd: 'Stored as 60 seconds.',
    });
    const other = fieldSaveReading(log, { id: 'improvement-timeout' });
    expect(other.descriptionAfterEdit).toBeNull();
    expect(other.descriptionAtEnd).toBeNull();
    expect(fieldSaveReading(log.replace('"Stored as 3 seconds."', 'null'), { id: 'child-timeout' }).descriptionAfterEdit).toBeNull();
  });
});
