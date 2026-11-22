import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireAdmin } from '../lib/server';

/**
 * Which cast is on. One switch, read by the stage board, the show workspace and
 * the show panel, so all three always agree about who is in the building.
 *
 * The two cast names live here too: a school doing High School Musical has a
 * Cast X and a Cast Z, the next show has something else.
 */
export default createEndpoint({
  description: 'Set which cast is on, and what the two casts are called (admins)',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    cast: z.enum(['A', 'B']).optional(),
    castAName: z.string().max(40).optional(),
    castBName: z.string().max(40).optional(),
  }),
  outputSchema: z.object({ cast: z.string(), castAName: z.string(), castBName: z.string() }),
  execute: async ({ context, input }) => {
    await requireAdmin(context.user.email);
    const show = await zite.shows.findOne({ id: input.showId }).catch(() => null);
    if (!show) throw new Error('Show not found.');

    const record: Record<string, unknown> = {};
    if (input.cast !== undefined) record.micCast = input.cast;
    if (input.castAName !== undefined) record.castAName = input.castAName.trim().slice(0, 40) || 'Cast X';
    if (input.castBName !== undefined) record.castBName = input.castBName.trim().slice(0, 40) || 'Cast Z';
    if (Object.keys(record).length) await zite.shows.update({ id: input.showId, record });

    const after = await zite.shows.findOne({ id: input.showId });
    return {
      cast: String(after?.micCast ?? 'A'),
      castAName: String(after?.castAName ?? 'Cast X'),
      castBName: String(after?.castBName ?? 'Cast Z'),
    };
  },
});
