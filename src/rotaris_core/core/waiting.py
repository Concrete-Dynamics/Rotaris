"""How long a run may wait for the person it is asking (SWR-3623).

Two barriers block a run on a human and they are deliberately separate —
:class:`~rotaris_core.permissions.approval.ApprovalBarrier` for a permission
prompt, :class:`~rotaris_core.orchestrator.user_prompt_barrier.UserPromptBarrier`
for an agent's question — but they share one budget,
``runtime.approval_timeout_seconds``, and its own description says so. This is
the one place that says what the end of that budget's range *means*, because a
sentinel one barrier understood and the other did not would make "wait for me"
mean two different things depending on which one asked.
"""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces

#: A budget of zero: wait until the person answers, or until the wait is
#: cancelled. Zero rather than a very large number because every finite
#: stand-in is a deadline somebody eventually hits, and rather than
#: ``math.inf`` because CPython's lock acquire overflows on it.
WAIT_INDEFINITELY = 0.0


@traces(SWR.SWR_3623)
def wait_budget(timeout: float) -> float | None:
    """*timeout* as ``threading.Event.wait`` takes it — ``None`` for no limit.

    A run started from the requirements board has nobody in front of it at the
    moment it asks, and the point of saying so on the card is that the answer
    comes later. Denying the tool call five minutes in would leave the card
    announcing a decision that had already been made without the user.

    An indefinite wait is patient, not unkillable: every waiter is released by
    its barrier's ``cancel``/``cancel_all``, which is what stopping a run
    already does.
    """
    return None if timeout <= WAIT_INDEFINITELY else timeout
