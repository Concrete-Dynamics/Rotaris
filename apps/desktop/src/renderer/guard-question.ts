/**
 * REQ-SHELL-124's Save/Discard/Cancel is ONE question per window. Since OQ-311 (ruled 2026-10-14 under R-072) the update's
 * `Restart now` and the installer's `Update now` / `Try again` ask it too, so a person may press the window's close, or the
 * update may ask again at its hand-off, while the question is already open. A second asking joins the open question and
 * settles with its one answer: it never replaces it, which would leave the first asker waiting for an answer nobody can give.
 */
export interface OpenQuestion {
  current: Promise<boolean> | null;
}

/**
 * Asks through `open` unless a question is already open in `slot`, in which case it returns that question. `open` receives the
 * function that answers it; the slot is cleared before the answer reaches anyone, so the next asking opens a fresh question.
 */
export function joinOrAsk(slot: OpenQuestion, open: (answer: (proceed: boolean) => void) => void): Promise<boolean> {
  if (slot.current !== null) return slot.current;
  const question = new Promise<boolean>((resolve) => {
    let answered = false;
    open((proceed) => {
      if (answered) return;
      answered = true;
      if (slot.current === question) slot.current = null;
      resolve(proceed);
    });
  });
  slot.current = question;
  return question;
}
