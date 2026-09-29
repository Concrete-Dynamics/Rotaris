import { describe, expect, it } from 'vitest';
import {
  clipSkillDescription, parseSkillListing, skillListing, skillListingBody, skillListingCountText,
  SKILL_LISTING_DESCRIPTION_CAP, type SkillRow,
} from './skills.js';

const row = (over: Partial<SkillRow> = {}): SkillRow => ({
  name: 'alpha', declaredName: 'Alpha', description: 'Alpha does things.', path: '/ws/.agents/skills/alpha/SKILL.md', directory: '/ws/.agents/skills/alpha',
  scope: 'project', triggers: [], shadowed: [], loadMode: 'name-only', invocationMode: 'default', forcedThisSession: false, userInvocable: true,
  ...over,
});

describe('REQ-CHAT-162 — the description clip', () => {
  it('leaves a description of at most 120 characters as it is, whitespace runs collapsed to one line', () => {
    expect(clipSkillDescription('  Alpha\n  does\tthings.  ')).toBe('Alpha does things.');
    const exact = 'x'.repeat(SKILL_LISTING_DESCRIPTION_CAP);
    expect(clipSkillDescription(exact)).toBe(exact);
  });
  it('cuts a longer one to 120 characters, the last of them the ellipsis', () => {
    const clipped = clipSkillDescription('y'.repeat(SKILL_LISTING_DESCRIPTION_CAP + 1));
    expect(Array.from(clipped)).toHaveLength(SKILL_LISTING_DESCRIPTION_CAP);
    expect(clipped.endsWith('…')).toBe(true);
    expect(clipped.slice(0, -1)).toBe('y'.repeat(SKILL_LISTING_DESCRIPTION_CAP - 1));
  });
  it('counts characters, not UTF-16 units, so a cut never splits a surrogate pair', () => {
    const clipped = clipSkillDescription('😀'.repeat(SKILL_LISTING_DESCRIPTION_CAP + 5));
    expect(Array.from(clipped)).toHaveLength(SKILL_LISTING_DESCRIPTION_CAP);
    expect(Array.from(clipped).slice(0, -1).every((c) => c === '😀')).toBe(true);
  });
});

describe('REQ-CHAT-162 — the listing carries exactly five facts per skill and the count', () => {
  it('takes the normalized name, the scope, the triggers, the clipped description and the path — and no in-context flag (ESC-37)', () => {
    const listing = skillListing([row({ triggers: ['render', ' /pdf\n'], forcedThisSession: true, description: 'd'.repeat(200) })]);
    expect(listing.count).toBe(1);
    expect(listing.skills[0]).toEqual({ name: 'alpha', scope: 'project', triggers: ['render', '/pdf'], description: clipSkillDescription('d'.repeat(200)), path: '/ws/.agents/skills/alpha/SKILL.md' });
    expect(Object.keys(listing.skills[0]!)).not.toContain('forcedThisSession');
  });
  it('REQ-CHAT-168: the count reads correctly at zero, one and many', () => {
    expect(skillListingCountText(0)).toBe('0 skills listed');
    expect(skillListingCountText(1)).toBe('1 skill listed');
    expect(skillListingCountText(6)).toBe('6 skills listed');
  });
});

describe('REQ-CHAT-162 — one row text, written once and read back by the renderer', () => {
  const skills = [
    row({ name: 'home-skill', scope: 'user', description: 'A skill from the user scope.', path: '/home/me/.agents/skills/home-skill/SKILL.md' }),
    row({ name: 'ws-skill', triggers: ['render', '/pdf'], description: 'The workspace skill.', path: 'C:\\work\\project\\.agents\\skills\\ws-skill\\SKILL.md' }),
    row({ name: 'by-hand', scope: 'manual', description: '', path: '/tmp/by hand/SKILL.md' }),
  ];

  it('is readable as text on its own — the copy of the message, the export and a search all hold only this', () => {
    expect(skillListingBody(skillListing(skills))).toBe([
      '3 skills listed',
      '- home-skill [user]',
      '  A skill from the user scope.',
      '  /home/me/.agents/skills/home-skill/SKILL.md',
      '- ws-skill [project] triggers: render, /pdf',
      '  The workspace skill.',
      '  C:\\work\\project\\.agents\\skills\\ws-skill\\SKILL.md',
      '- by-hand [manual]',
      '  ',
      '  /tmp/by hand/SKILL.md',
    ].join('\n'));
  });

  it('parses back to the same facts, and every span points at its own text in the body', () => {
    const body = skillListingBody(skillListing(skills));
    const parsed = parseSkillListing(body);
    expect(parsed).not.toBeNull();
    expect(parsed!.count).toBe(3);
    expect(parsed!.skills.map((s) => [s.name.text, s.scope.text, s.triggers?.text ?? null, s.description.text, s.path.text])).toEqual([
      ['home-skill', 'user', null, 'A skill from the user scope.', '/home/me/.agents/skills/home-skill/SKILL.md'],
      ['ws-skill', 'project', 'render, /pdf', 'The workspace skill.', 'C:\\work\\project\\.agents\\skills\\ws-skill\\SKILL.md'],
      ['by-hand', 'manual', null, '', '/tmp/by hand/SKILL.md'],
    ]);
    const spans = [parsed!.header, ...parsed!.skills.flatMap((s) => [s.name, s.scope, ...(s.triggers ? [s.triggers] : []), s.description, s.path])];
    for (const span of spans) expect(body.slice(span.start, span.start + span.text.length)).toBe(span.text);
  });

  it('the empty catalog is still one row that reports its count', () => {
    const body = skillListingBody(skillListing([]));
    expect(body).toBe('0 skills listed');
    expect(parseSkillListing(body)).toEqual({ count: 0, header: { text: '0 skills listed', start: 0 }, skills: [] });
  });

  it('accepts nothing looser than its own shape, so any other system notice stays a system notice', () => {
    for (const other of [
      'Intent classified: feature',
      'Permission mode is now \'ask\'; it applies from the next tool call.',
      '2 skills listed\n- a [project]\n  d\n  /p',
      '1 skill listed\n- a [elsewhere]\n  d\n  /p',
      '1 skill listed\n- a [user]\n  d\n  ',
      '1 skill listed\n- a [user]\nd\n  /p',
      '',
    ]) expect(parseSkillListing(other)).toBeNull();
  });

  it('a path holding a line break cannot be carried unambiguously, and the row falls back to text rather than lying', () => {
    const body = skillListingBody(skillListing([row({ path: '/odd\npath/SKILL.md' })]));
    expect(parseSkillListing(body)).toBeNull();
  });
});
