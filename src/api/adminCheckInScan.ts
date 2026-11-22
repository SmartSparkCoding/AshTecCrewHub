import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';
import {
  activeSession,
  findPresenceByToken,
  logPresenceEvent,
  one,
  registerReason,
  registerStateFor,
  sessionSubEventId,
  writeRegister,
} from '../lib/presence';

/**
 * One scan, one outcome (feedback round 3).
 *
 * The venue flow used to make an admin scan a code, land on the /a/:token page
 * and press approve before the member counted as in. At a door that is two
 * taps too many, so this endpoint does the whole thing: approve the pending
 * request AND write the register for the event being checked in.
 *
 * Both directions, because the register and check-in are one fact written in two
 * places: letting somebody in is green, letting them out is yellow when they are
 * coming back and red when they are not, with the reason they gave.
 *
 * It only ever approves. A code is a request to be let in or out, and declining
 * needs a reason, so declining stays on the /a/:token page where the detail is.
 */
export default createEndpoint({
  description: 'Approves a scanned check-in code and ticks that member present for the event (admins)',
  authenticated: true,
  inputSchema: z.object({ subEventId: z.string().min(1), token: z.string().min(1) }),
  outputSchema: z.object({ memberId: z.string(), memberName: z.string(), action: z.string(), state: z.string().nullable() }),
  execute: async ({ input, context }) => {
    const me = await requireAdmin(context.user.email);

    const row = await findPresenceByToken(input.token);
    if (!row || !row.pendingAction) throw new Error('That code is no longer valid. Ask them to show a fresh one.');
    const action = row.pendingAction;

    const session = await activeSession();
    if (!session) throw new Error('No check-in is open for this session yet. Start it, then scan again.');

    const sessionSub = sessionSubEventId(session);
    if (sessionSub && sessionSub !== input.subEventId) {
      const other = await zite.subEvents.findOne({ id: sessionSub });
      throw new Error(`Check-in is open for "${other?.title ?? 'another session'}". Close that one first, then scan here.`);
    }

    const memberId = one(row.member) ?? '';
    const member = memberId ? await zite.crewMembers.findOne({ id: memberId }) : undefined;
    const memberName = member
      ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || member.schoolEmail || 'Member'
      : 'Member';

    const now = new Date().toISOString();
    const approved =
      action === 'Sign In'
        ? { state: 'On Site', signedInAt: now, signedOutAt: null }
        : { state: row.comingBack ? 'Expected Back' : 'Off Site', signedOutAt: now };

    await zite.venuePresence.update({
      id: row.id,
      record: {
        ...approved,
        // Spending the code here too: the same rules as the approval page.
        pendingAction: null,
        approvalToken: '',
        updatedBy: me.id,
      } as never,
    });

    await logPresenceEvent({
      session: session.id,
      member: memberId,
      action: `Approved ${action}`,
      reasonLabel: row.reasonLabel ?? '',
      reason: row.reason ?? '',
      at: now,
      by: me.id,
    });

    // One scan, both records. A full id, never the first character of one.
    if (memberId) {
      await writeRegister({
        subEventId: input.subEventId,
        memberId,
        state: registerStateFor(approved.state),
        reason: action === 'Sign In' ? '' : registerReason(row.reasonLabel, row.reason),
        returnAt: row.expectedBackAt ?? null,
        by: me.id,
      });
    }

    return { memberId, memberName, action, state: (approved.state as string) ?? null };
  },
});
