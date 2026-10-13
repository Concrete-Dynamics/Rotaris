/**
 * One number field of Settings › Runtime set and saved as a person does it, through the capture seams of one launch: the
 * Settings view (Ctrl+7) opened on its Runtime category, the field clicked as soon as it is drawn, its text selected
 * (Ctrl+A) and deleted (Backspace), the new value typed character by character, Tab to leave the field (its blur commits a
 * draft), and the save bar's Save pressed. The deletion is not decoration: a value typed over a selection that already
 * reads the same digits is no change to the field (React's controlled input fires no change for it), so a stored 3 s
 * shown clamped as `1` minute and overtyped `1` stayed 3 s with the bar clean (first measured by `continuation-proof`,
 * 2026-10-13). The save bar's status is probed after the edit and read again at the end.
 *
 * Built for PD-CONFIG-003's two Runtime timeouts, whose stored values the harnesses had only ever written into
 * `agents.yaml` themselves (`withRuntimeKey`): the Per-agent timeout (`#child-timeout`, whole minutes, stored as seconds)
 * and the Improvement analysis timeout (`#improvement-timeout`, seconds). `continuation-proof`'s later-run scenario sets the
 * first in the built app; `live-run.mjs`'s `cutoff` scenario sets the first and its `ask` scenario the second before a real
 * model meets them. Verification only.
 *
 * The click waits for the field (`@~`, up to `at`); every later step is an appointment after that deadline, so the steps
 * land in order whenever the click lands. `fieldSaveReading` reads the launch log back.
 */
export function runtimeFieldSteps({ id, value, at = 8_000 }) {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`a Settings field id is a bare id: ${id}`);
  if (!/^\d+$/.test(String(value))) throw new Error(`a Runtime number field takes whole digits: ${value}`);
  return {
    ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Runtime',
    ROTARIS_CAPTURE_CLICKS: `#${id}@~${at};;.save-bar .btn-primary>>Save@${at + 2_600}`,
    ROTARIS_CAPTURE_CHORDS: `Ctrl+A@${at + 500}`,
    ROTARIS_CAPTURE_TYPE_AT: `${value}@${at + 900}`,
    ROTARIS_CAPTURE_KEYS: `Backspace@${at + 700};;Tab@${at + 1_800}`,
    ROTARIS_CAPTURE_PROBE_AT: `.save-bar__status@${at + 2_200}`,
    ROTARIS_CAPTURE_PROBE: `#${id};;.save-bar__status`,
    ROTARIS_CAPTURE_AFTER_MS: String(at + 5_000),
  };
}

/**
 * What one `runtimeFieldSteps` launch shows: the bar's status after the edit (`Unsaved changes` when the edit reached the
 * form) and at the end (`All changes saved` when Save wrote it), and the field's value at the end. Null where the log holds
 * no such probe.
 */
export function fieldSaveReading(log, { id, at = 8_000 }) {
  const probe = (prefix, selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`capture: ${prefix} ${escaped} → (\\[.*\\])\\s*$`, 'm').exec(log);
    if (m === null) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  };
  const status = (rows) => (rows === null ? null : rows[0]?.text ?? null);
  return {
    afterEdit: status(probe(`probe-at ${at + 2_200}`, '.save-bar__status')),
    atEnd: status(probe('probe', '.save-bar__status')),
    field: probe('probe', `#${id}`)?.[0]?.value ?? null,
  };
}
