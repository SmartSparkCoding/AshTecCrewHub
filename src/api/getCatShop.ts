import { z } from 'zod';
import { createEndpoint } from '#backend';
import { readWallet } from '../lib/catShop';
import { requireMember } from '../lib/server';

/**
 * Tickets 10017d4f ("Cat avatars") and d46defd1 ("cat costumes").
 *
 * Everything the shop needs in one call: the catalogue, what the member already
 * owns, what the cat has on, and how many coins are left. Coins are counted on
 * every read (see src/lib/catShop.ts), so a member who ticks a checklist item
 * sees the balance go up without anyone running a job.
 */
export default createEndpoint({
  description: 'The cat shop: the costume catalogue, your coins and what you own',
  authenticated: true,
  inputSchema: z.object({}),
  outputSchema: z.object({
    coins: z.number(),
    earned: z.number(),
    spent: z.number(),
    owned: z.array(z.string()),
    equipped: z.string(),
    counts: z.object({ checklist: z.number(), signoff: z.number(), cuecall: z.number() }),
    costumes: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        price: z.number(),
        emoji: z.string(),
        slot: z.string(),
        blurb: z.string(),
      }),
    ),
  }),
  execute: async ({ context }) => {
    const me = await requireMember(context.user.email);
    return readWallet(me.id);
  },
});
