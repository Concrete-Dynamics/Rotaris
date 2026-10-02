/**
 * REQ-SHELL-044: wherever a count is shown with a noun, the noun agrees with the count, and the literal parenthesised
 * "(s)" form is never rendered anywhere in the product (REQ-CHAT-168, REQ-HOOKS-054 and REQ-HOOKS-106 say the same of
 * their own domains). It lives in the kernel because every package may import the kernel and no other: sign-in in
 * `providers`, the run's messages in `engine`, the tools' results in `agent-tools`, checkpoint text in `contracts` and
 * `workspace`, and the surfaces in `ui` all need it, and none of those may import `ui`, where it began
 * (`docs/architecture/views/01-component-view.md`).
 *
 * Zero takes the plural ("0 models"), as REQ-SHELL-044's own "0 bg sessions" does. `plural` is for a noun whose plural
 * is not the singular plus `s` ("1 match", "2 matches").
 */
export function countNoun(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
