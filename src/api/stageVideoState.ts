import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { claimSignals, liveShowForVideo, loadVideoPeers, sweepSignals } from '../lib/stageVideo';

/**
 * Ticket 7e928a80. One poll per device, twice a second while video is in use:
 * "here I am", "here is who else is around", and "here are the handshakes that
 * arrived for you while you were away".
 */
export default createEndpoint({
  description: 'Poll the stage video board: peers, and any handshakes waiting for this device',
  authenticated: false,
  inputSchema: z.object({
    deviceKey: z.string().min(1).max(120),
    liveShowId: z.string().optional(),
    name: z.string().max(80).optional(),
  }),
  outputSchema: z.object({
    liveShowId: z.string(),
    me: z.object({ deviceKey: z.string(), sharing: z.boolean(), watching: z.string() }),
    peers: z.array(
      z.object({
        deviceKey: z.string(),
        name: z.string(),
        role: z.string(),
        sharing: z.boolean(),
        watching: z.string(),
        lastSeenAt: z.string(),
      }),
    ),
    signals: z.array(z.object({ id: z.string(), fromKey: z.string(), kind: z.string(), payload: z.string() })),
  }),
  execute: async ({ input }) => {
    const show = await liveShowForVideo(input.liveShowId);
    if (!show) throw new Error('No show is open, so there is nothing to stream.');
    const liveShowId = String(show.id);

    // A device only exists here once it has joined, and joining is what this is.
    const existing = await zite.stageVideo.findOne({ filters: { deviceKey: input.deviceKey } }).catch(() => null);
    const now = new Date().toISOString();
    if (existing) {
      await zite.stageVideo.update({
        id: String(existing.id),
        record: {
          liveShow: liveShowId,
          lastSeenAt: now,
          ...(input.name ? { name: input.name } : {}),
        },
      });
    } else {
      await zite.stageVideo.create({
        record: {
          liveShow: liveShowId,
          deviceKey: input.deviceKey,
          name: input.name ?? '',
          role: 'screen',
          sharing: false,
          watching: '',
          lastSeenAt: now,
        },
      });
    }

    const [peers, signals] = await Promise.all([
      loadVideoPeers(liveShowId),
      claimSignals(liveShowId, input.deviceKey),
      sweepSignals(liveShowId),
    ]);
    const mine = peers.find((p) => p.deviceKey === input.deviceKey);
    return {
      liveShowId,
      me: { deviceKey: input.deviceKey, sharing: mine?.sharing ?? false, watching: mine?.watching ?? '' },
      peers,
      signals,
    };
  },
});
