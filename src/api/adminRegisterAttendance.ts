import { z } from 'zod';
import { createEndpoint } from '#backend';
import { requireAdmin } from '../lib/server';
import { setMemberState } from '../lib/presence';

/**
 * Ticket 57ce12eb, extended for the school-style register.
 *
 * A register row is one of three colours, and the colour is the record:
 *   green  - in, attending
 *   yellow - away for a while (lunch, a meeting, called out), with a reason
 *   red    - not in (appointment, unwell), with a reason
 * Tapping the colour that is already set clears the row, so a wrong tap is one
 * tap to undo. Yellow and red must carry a reason, because a school has to be
 * able to say *why* someone was not in the room, not just that they were not.
 *
 * Green writes the plain expected status. Yellow and red write 'Not Attending'
 * with the reason. Every row keeps its colour in registerState, so the register
 * reopens exactly as it was left, and the reason is on the attendance record
 * itself rather than in a comment somewhere.
 *
 * Club sessions are not part of a show, so the automatic attendance sync never
 * touches them and these rows are the only record of the register.
 *
 * The register and check-in are one fact written in two places, so this does not
 * write a register row on its own: setMemberState writes the colour and the
 * presence state together. Green signs the member in, yellow puts them on the
 * roster as away until they are back, red puts them off site, and clearing the
 * tick clears the presence side too instead of leaving a state the register has
 * forgotten about.
 */
const STATE = z.enum(['green', 'yellow', 'red', '']);

export default createEndpoint({
  description: 'Takes a venue register for an event, marking members in, away or not in (admins)',
  authenticated: true,
  inputSchema: z.object({
    subEventId: z.string(),
    memberId: z.string(),
    // Kept so older callers and the scan path still work unchanged.
    present: z.boolean().optional(),
    state: STATE.optional(),
    reason: z.string().max(200).optional(),
    // ISO timestamp: when a member is away for a while, the time they said
    // they would be back. Only yellow keeps one.
    returnAt: z.string().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), state: STATE }),
  execute: async ({ input, context }) => {
    const admin = await requireAdmin(context.user.email);
    const state = input.state ?? (input.present ? 'green' : '');
    const reason = (input.reason ?? '').trim().replace(/\s+/g, ' ');
    if ((state === 'yellow' || state === 'red') && reason.length < 2) {
      throw new Error('Give a reason for that, so the register says why.');
    }

    let returnAt: string | null = null;
    if (state === 'yellow' && input.returnAt) {
      if (Number.isNaN(Date.parse(input.returnAt))) throw new Error('That is not a time I can read. Try again.');
      returnAt = new Date(input.returnAt).toISOString();
    }

    // Both sides in one write. Tapping the same colour again clears the row, so
    // an empty state is a clear here and not a special case for the caller.
    await setMemberState({
      subEventId: input.subEventId,
      memberId: input.memberId,
      state,
      reason,
      returnAt,
      by: admin.id,
    });

    return { ok: true, state };
  },
});
