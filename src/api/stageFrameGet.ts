import { z } from 'zod';
import { createEndpoint } from '#backend';
import { FRAME_TTL_MS, readFrame } from '../lib/stageVideo';

/**
 * Ticket 7e928a80. The screen side of the picture relay: give me the newest
 * frame from that camera, or nothing if it has stopped posting.
 */
export default createEndpoint({
  description: 'Read the newest relayed frame from a stage camera',
  authenticated: false,
  inputSchema: z.object({ deviceKey: z.string().min(1).max(120) }),
  outputSchema: z.object({ frame: z.string(), ageMs: z.number(), staleAfterMs: z.number() }),
  execute: async ({ input }) => {
    const { frame, ageMs } = await readFrame(input.deviceKey);
    return { frame, ageMs, staleAfterMs: FRAME_TTL_MS };
  },
});
