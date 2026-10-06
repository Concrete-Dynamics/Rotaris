import { describe, expect, it } from 'vitest';
import { BUILT_IN_PERSONAS, DIRECT_WORK_INSTRUCTION, entryInstructionsFor } from './personas.js';

describe('engine/personas — the entry role\'s instructions for its grant (OQ-202 as ruled, PD-ORCH-006; REQ-ORCH-016/029)', () => {
  const orchestrator = BUILT_IN_PERSONAS.orchestrator;

  it('a coordinator granted the direct-work bundle is told to do the work itself, and no longer that it modifies nothing', () => {
    const prompt = entryInstructionsFor(orchestrator.systemPrompt, 'direct-work', orchestrator);
    expect(prompt).toMatch(/^You are the orchestrator\. /);
    expect(prompt).toContain(DIRECT_WORK_INSTRUCTION);
    // The contradiction the ruling removes: the coordinating sentence is gone from the instructions of a run that grants the bundle.
    expect(prompt).not.toContain('you do not modify files or run commands yourself');
    expect(prompt).not.toContain('every work item reaches a specialist through the delegate tool');
    expect(prompt).toContain('ask_questions');
  });

  it('a coordinating run keeps the coordinating prompt: no grant, or no pre-flight', () => {
    expect(entryInstructionsFor(orchestrator.systemPrompt, 'none', orchestrator)).toBe(orchestrator.systemPrompt);
    expect(entryInstructionsFor(orchestrator.systemPrompt, null, orchestrator)).toBe(orchestrator.systemPrompt);
    expect(orchestrator.systemPrompt).toContain('you do not modify files or run commands yourself');
  });

  it('a prompt the configuration supplies is kept whole, with the instruction after it', () => {
    expect(entryInstructionsFor('Configured coordinator prompt.', 'direct-work', { coordinatorOnly: true })).toBe(`Configured coordinator prompt.\n\n${DIRECT_WORK_INSTRUCTION}`);
    expect(entryInstructionsFor('', 'direct-work', { coordinatorOnly: true })).toBe(DIRECT_WORK_INSTRUCTION);
  });

  it('an entry role that is not a coordinator keeps its prompt, granted or not', () => {
    const coder = BUILT_IN_PERSONAS['coding-agent'];
    expect(entryInstructionsFor(coder.systemPrompt, 'direct-work', coder)).toBe(coder.systemPrompt);
    expect(entryInstructionsFor('x', 'direct-work', null)).toBe('x');
  });
});
