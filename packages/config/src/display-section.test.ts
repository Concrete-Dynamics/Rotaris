import { describe, expect, it } from 'vitest';
import { DISPLAY_DEFAULTS, DISPLAY_LINE_CAP_CHOICES, capLines, readDisplaySection } from './display-section.js';
import type { ProblemSink } from './sections/field.js';

const sink = (): ProblemSink => ({ errors: [], warnings: [] });

describe('REQ-CHAT-166 — the `display:` section', () => {
  it('an absent section is the requirement\'s own defaults: both shown, 10 result lines, 2 input lines', () => {
    const s = sink();
    expect(readDisplaySection(undefined, s)).toEqual(DISPLAY_DEFAULTS);
    expect(readDisplaySection(null, s)).toEqual(DISPLAY_DEFAULTS);
    // A bare `display:` loads as the defaults rather than failing.
    expect(readDisplaySection({}, s)).toEqual(DISPLAY_DEFAULTS);
    expect(s.errors).toEqual([]);
  });

  it('reads the four values, and `unlimited` and null both mean no cap', () => {
    const s = sink();
    expect(readDisplaySection({ show_tool_results: false, show_tool_inputs: true, tool_result_lines: 50, tool_input_lines: 1 }, s))
      .toEqual({ show_tool_results: false, show_tool_inputs: true, tool_result_lines: 50, tool_input_lines: 1 });
    expect(readDisplaySection({ tool_result_lines: 'unlimited' }, s).tool_result_lines).toBeNull();
    expect(readDisplaySection({ tool_result_lines: null }, s).tool_result_lines).toBeNull();
    expect(readDisplaySection({ tool_input_lines: 'UNLIMITED' }, s).tool_input_lines).toBeNull();
    expect(s.errors).toEqual([]);
    // The values the settings surface offers, in its order; `null` is "unlimited".
    expect(DISPLAY_LINE_CAP_CHOICES).toEqual([1, 2, 5, 10, 20, 50, null]);
  });

  it('an unknown key warns and contributes nothing; a wrong type is a schema problem', () => {
    const warn = sink();
    readDisplaySection({ show_everything: true }, warn);
    expect(warn.warnings.map((w) => w.path)).toEqual(['display.show_everything']);
    expect(warn.errors).toEqual([]);
    const bad = sink();
    expect(readDisplaySection({ show_tool_results: 'yes' }, bad).show_tool_results).toBe(true);
    expect(bad.errors.map((e) => e.path)).toEqual(['display.show_tool_results']);
    const negative = sink();
    readDisplaySection({ tool_result_lines: -1 }, negative);
    expect(negative.errors.map((e) => e.path)).toEqual(['display.tool_result_lines']);
    const notAMapping = sink();
    readDisplaySection('nonsense', notAMapping);
    expect(notAMapping.errors.map((e) => e.path)).toEqual(['display']);
  });

  it('the truncation is marked in the drawn text and names how many further lines exist (REQ-CHAT-168)', () => {
    expect(capLines('a\nb\nc', 5)).toBe('a\nb\nc');
    expect(capLines('a\nb\nc', null)).toBe('a\nb\nc');
    expect(capLines('a\nb', 1)).toBe('a\n… cut short — 1 more line');
    expect(capLines('a\nb\nc\nd', 1)).toBe('a\n… cut short — 3 more lines');
    expect(capLines('', 1)).toBe('');
  });
});
