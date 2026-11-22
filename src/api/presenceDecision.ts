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
 * Approve or decline a member's pending sign-in/sign-out. Admins only.
 *
 * Approving applies exactly one transition:
 *   Sign In  -> On Site,           stamping signedInAt
 *   Sign Out -> Expected Back when they said they are returning, otherwise
 *              Off Site. Both stamp signedOutAt.
 *
 * The register follows whichever way it went, because the register and check-in
 * are one fact written in two places: in is green, away and coming back is
 * yellow with the time, gone is red with the reason. Neither side is the boss.
 *
 * Declining touches nothing but the request itself. A declined member keeps
 * whatever state they already had, because "no" to leaving is not the same as
 * being told they are on site.
 */
export default createEndpoint({
  description: 'Approves or declines a pending venue check-in request (admins only)',
  authenticated: true,
  inputSchema: z.object({
    token: z.string().min(1),
    decision: z.enum(['approve', 'decline']),
  }),
  outputSchema: z.object({ state: z.string().nullable(), memberName: z.string() }),
  execute: async ({ input, context }) => {
    const me = await requireAdmin(context.user.email);

    const row = await findPresenceByToken(input.token);
    if (!row || !row.pendingAction) throw new Error('That code is no longer valid.');
    const action = row.pendingAction;

    const session = await activeSession();
    if (!session || row.session !== session.id)
      throw new Error('That check-in session has closed, so this request cannot be decided.');

    const memberId = one(row.member);
    const member = memberId ? await zite.crewMembers.findOne({ id: memberId }) : undefined;
    const memberName = member
      ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || member.schoolEmail || 'Member'
      : 'Member';

    if (input.decision === 'decline') {
      await zite.venuePresence.update({
        id: row.id,
        record: { pendingAction: null, approvalToken: '', updatedBy: me.id } as never,
      });
      // Record the decline too: "asked to leave at 14:05, declined by Mr X" is
      // part of the story an admin reviewing a session wants to see.
      await logPresenceEvent({
        session: session.id,
        member: memberId,
        action: `Declined ${action}`,
        reasonLabel: row.reasonLabel ?? '',
        reason: row.reason ?? '',
        at: new Date().toISOString(),
        by: me.id,
      });
      return { state: row.state ?? null, memberName };
    }

    const now = new Date().toISOString();
    const approved =
      action === 'Sign In'
        ? { state: 'On Site', signedInAt: now, signedOutAt: null }
        : {
            state: row.comingBack ? 'Expected Back' : 'Off Site',
            signedOutAt: now,
          };

    await zite.venuePresence.update({
      id: row.id,
      record: {
        ...approved,
        // Spends the code: a link is single-use, so a screenshot stops working
        // the moment it has been approved once.
        pendingAction: null,
        approvalToken: '',
        updatedBy: me.id,
      } as never,
    });

    // The same approval writes the member's colour for the event, so the
    // register tells the truth about somebody who has just signed in or out.
    // A full id, never the first character of one: a string subEvent made this
    // "e" and the register write 500'd after the approval had already landed.
    const sessionSub = sessionSubEventId(session);
    if (memberId && sessionSub) {
      await writeRegister({
        subEventId: sessionSub,
        memberId,
        state: registerStateFor(approved.state),
        reason: action === 'Sign In' ? '' : registerReason(row.reasonLabel, row.reason),
        returnAt: row.expectedBackAt ?? null,
        by: me.id,
      });
    }

    await logPresenceEvent({
      session: session.id,
      member: memberId,
      action,
      reasonLabel: row.reasonLabel ?? '',
      reason: row.reason ?? '',
      comingBack: !!row.comingBack,
      expectedBackAt: row.expectedBackAt ?? null,
      at: now,
      by: me.id,
    });

    return { state: approved.state, memberName };
  },
});