import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { credentialEmail, verifyAdminSecret } from '../../server/catLogin.js';
import { findMemberByEmail } from '../lib/server';
import { isVideoRole, liveShowForVideo } from '../lib/stageVideo';

/**
 * Ticket 7e928a80: "Make it secure with the admin acc + cat pin!"
 *
 * So starting or stopping a stream, and pointing a screen at another screen,
 * both need the same pair that unlocks the live controls: an admin's account and
 * their cat-login PIN. Devices can poll and handshake freely, but nothing starts
 * without an admin saying so.
 */
export default createEndpoint({
  description: 'Start or stop sharing this device camera, or aim this device at another one (admin PIN required)',
  authenticated: false,
  inputSchema: z.object({
    deviceKey: z.string().min(1).max(120),
    memberId: z.string().optional(),
    email: z.string().email().optional(),
    pin: z.string().min(1).max(200),
    name: z.string().max(80).optional(),
    role: z.enum(['screen', 'camera']).optional(),
    sharing: z.boolean().optional(),
    watching: z.string().max(120).optional(),
    liveShowId: z.string().optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    sharing: z.boolean(),
    watching: z.string(),
    admin: z.string(),
  }),
  execute: async ({ input }) => {
    const email = await credentialEmail(input.email, input.memberId);
    if (!email) throw new ZiteError({ code: 'BAD_REQUEST', message: 'Pick which admin is allowing this.' });
    const member = await findMemberByEmail(email);
    if (!member?.isAdmin || !(await verifyAdminSecret(email, input.pin))) {
      throw new ZiteError({ code: 'FORBIDDEN', message: 'Those admin details are not right.' });
    }

    const show = await liveShowForVideo(input.liveShowId);
    if (!show) throw new Error('No show is open, so there is nothing to stream.');
    const liveShowId = String(show.id);

    const existing = await zite.stageVideo.findOne({ filters: { deviceKey: input.deviceKey } }).catch(() => null);
    const record: Record<string, any> = { liveShow: liveShowId, lastSeenAt: new Date().toISOString() };
    if (input.name !== undefined) record.name = input.name;
    if (isVideoRole(input.role) || input.role) record.role = input.role;
    if (typeof input.sharing === 'boolean') record.sharing = input.sharing;
    if (input.watching !== undefined) record.watching = input.watching;

    if (existing) {
      await zite.stageVideo.update({ id: String(existing.id), record });
    } else {
      await zite.stageVideo.create({
        record: { deviceKey: input.deviceKey, name: '', role: 'screen', sharing: false, watching: '', ...record },
      });
    }

    const after = await zite.stageVideo.findOne({ filters: { deviceKey: input.deviceKey } });
    const name = `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() || 'Admin';
    return {
      ok: true,
      sharing: !!after?.sharing,
      watching: String(after?.watching ?? ''),
      admin: name,
    };
  },
});
