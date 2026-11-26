import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { FRAME_MAX, liveShowForVideo, putFrame } from '../lib/stageVideo';
import { allow } from '#server/rateLimit.js';

/**
 * Ticket 7e928a80. The camera posts one JPEG here and the screens read it back,
 * for networks that block peer-to-peer video. The frame is a data URL, so it
 * needs no upload handling and nothing lands on disk.
 */
export default createEndpoint({
  description: 'Post one JPEG frame from a stage camera, for screens that cannot reach it peer to peer',
  authenticated: false,
  inputSchema: z.object({
    deviceKey: z.string().min(1).max(120),
    frame: z.string().max(FRAME_MAX),
    liveShowId: z.string().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    // A camera posts about two and a half frames a second. Anything much faster
    // is a script, and this endpoint is open by design (a stage phone has no
    // session), so it gets a ceiling: 12 a second and 300 a minute per camera.
    if (!allow(`frame:${input.deviceKey}`, 12, 1_000) || !allow(`framemin:${input.deviceKey}`, 300, 60_000)) {
      throw new ZiteError({ code: 'BAD_REQUEST', message: 'That camera is posting faster than a camera can film.' });
    }
    const show = await liveShowForVideo(input.liveShowId);
    if (!show) throw new Error('No show is open, so there is nothing to stream.');
    if (!/^data:image\/jpeg;base64,/.test(input.frame)) {
      throw new ZiteError({ code: 'BAD_REQUEST', message: 'A frame has to be a JPEG data URL.' });
    }
    const put = await putFrame(input.deviceKey, String(show.id), input.frame);
    if (put === 'missing') {
      throw new ZiteError({ code: 'BAD_REQUEST', message: 'That camera has not joined yet. Reload the camera page.' });
    }
    if (put === 'idle') {
      throw new ZiteError({ code: 'BAD_REQUEST', message: 'That camera is not filming. Start streaming on the camera page.' });
    }
    return { ok: true };
  },
});
