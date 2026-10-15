/**
 * One number field of Settings › Runtime set and saved as a person does it, through the capture seams of one launch: the
 * Settings view (Ctrl+7) opened on its Runtime category, the field clicked as soon as it is drawn, its text selected
 * (Ctrl+A), the new value typed character by character over the selection, Tab to leave the field (its blur commits a
 * draft), and the save bar's Save pressed. The save bar's status is probed after the edit and read again at the end.
 *
 * The value is typed OVER the selection, as a person does it, with nothing deleted first. Until 2026-10-14 these steps
 * pressed Backspace before typing, because a value typed over a selection that already read the same digits was no change
 * to the field (React's controlled input raises no change for it), so a stored 3 s shown clamped as `1` minute and
 * overtyped `1` stayed 3 s with the bar clean (first measured by `continuation-proof`, 2026-10-13). The field now commits
 * from the input event (`ClampedNumberField`), and `continuation-proof`'s later-run scenario, which types `1` over a stored
 * 3 s shown as `1`, is the measurement of that path
 * (`docs/defects/fixed/a-runtime-number-field-ignores-a-value-typed-over-the-same-clamped-digits.md`).
 *
 * Built for PD-CONFIG-003's two Runtime timeouts, whose stored values the harnesses had only ever written into
 * `agents.yaml` themselves (`withRuntimeKey`): the Per-agent timeout (`#child-timeout`, whole minutes, stored as seconds)
 * and the Improvement analysis timeout (`#improvement-timeout`, seconds). `continuation-proof`'s later-run scenario sets the
 * first in the built app; `live-run.mjs`'s `cutoff` scenario sets the first and its `ask` scenario the second before a real
 * model meets them. Verification only.
 *
 * The click waits for the field (`@~`, up to `at`); every later step is an appointment after that deadline, so the steps
 * land in order whenever the click lands. `fieldSaveReading` reads the launch log back.
 *
 * The field's `aria-description` is read twice through `ROTARIS_CAPTURE_EVAL_AT`: after the edit and before Save, when it must
 * still state the value the file holds (REQ-CONFIG-446, REQ-CONFIG-419), and after Save, when it states the new one. Until
 * 2026-10-15 the description read the form's pending value, so the first reading stated the unsaved edit as stored
 * (`docs/defects/fixed/a-runtime-timeout-fields-description-states-an-unsaved-value-as-stored.md`).
 */
export function runtimeFieldSteps({ id, value, at = 8_000 }) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`a Settings field id is a bare id: ${id}`);
  if (!/^\d+$/.test(String(value))) throw new Error(`a Runtime number field takes whole digits: ${value}`);
  return {
    ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime',
    ROTARIS_CAPTURE_CLICKS: `#${id}@~${at};;.save-bar .btn-primary>>Save@${at + 2_600}`,
    ROTARIS_CAPTURE_CHORDS: `Ctrl+A@${at + 500}`,
    ROTARIS_CAPTURE_TYPE_AT: `${value}@${at + 900}`,
    ROTARIS_CAPTURE_KEYS: `Tab@${at + 1_800}`,
    ROTARIS_CAPTURE_PROBE_AT: `.save-bar__status@${at + 2_200}`,
    ROTARIS_CAPTURE_PROBE: `#${id};;.save-bar__status`,
    ROTARIS_CAPTURE_EVAL_AT: `${describedBy(id)}@${at + 2_200};;${describedBy(id)}@${at + 4_500}`,
    ROTARIS_CAPTURE_AFTER_MS: String(at + 5_000),
  };
}

/** The renderer expression that reads one field's `aria-description` (null when the field or the attribute is absent). */
function describedBy(id) {
  return `document.getElementById('${id}')?.getAttribute('aria-description') ?? null`;
}

/**
 * What one `runtimeFieldSteps` launch shows: the bar's status after the edit (`Unsaved changes` when the edit reached the
 * form) and at the end (`All changes saved` when Save wrote it), the field's value at the end, and its `aria-description`
 * after the edit and after Save. Null where the log holds no such probe.
 */
export function fieldSaveReading(log, { id, at = 8_000 }) {
  const probe = (prefix, selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`capture: ${prefix} ${escaped} → (\\[.*\\])\\s*$`, 'm').exec(log);
    if (m === null) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  };
  const status = (rows) => (rows === null ? null : rows[0]?.text ?? null);
  const description = (ms) => {
    const escaped = `capture: eval-at ${ms} ${describedBy(id)} → `.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`${escaped}(.*)$`, 'm').exec(log);
    if (m === null) return null;
    try { const value = JSON.parse(m[1].trim()); return typeof value === 'string' ? value : null; } catch { return null; }
  };
  return {
    afterEdit: status(probe(`probe-at ${at + 2_200}`, '.save-bar__status')),
    atEnd: status(probe('probe', '.save-bar__status')),
    field: probe('probe', `#${id}`)?.[0]?.value ?? null,
    descriptionAfterEdit: description(at + 2_200),
    descriptionAtEnd: description(at + 4_500),
  };
}
