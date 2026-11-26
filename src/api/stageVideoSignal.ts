import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { PAYLOAD_MAX, liveShowForVideo } from '../lib/stageVideo';

/**
 * Ticket 7e928a80. Post one handshake (offer, answer or ICE candidate) for the
 * other device to collect on its next poll. The payload is a blob of WebRTC
 * JSON, so it is only ever passed along, never parsed here.
 */
export default createEndpoint({
  description: 'Send one WebRTC handshake to another stage screen',
  authenticated: false,
  inputSchema: z.object({
    deviceKey: z.string().min(1).max(120),
    toKey: z.string().min(1).max(120),
    kind: z.enum(['offer', 'answer', 'ice']),
    payload: z.string().max(PAYLOAD_MAX),
    liveShowId: z.string().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    if (input.deviceKey === input.toKey) {
      throw new ZiteError({ code: 'BAD_REQUEST', message: 'A screen cannot handshake with itself.' });
    }
    const show = await liveShowForVideo(input.liveShowId);
    if (!show) throw new ZiteError('No show is open, so there is nothing to stream.', 'BAD_REQUEST');
    await zite.stageSignals.create({
      record: {
        liveShow: String(show.id),
        fromKey: input.deviceKey,
        toKey: input.toKey,
        kind: input.kind,
        payload: input.payload,
      },
    });
    return { ok: true };
  },
});
