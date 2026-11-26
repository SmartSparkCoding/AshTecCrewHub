import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { readWallet, spentOn, walletRow } from '../lib/catShop';
import { costumeById } from '../lib/mascot';
import { requireMember } from '../lib/server';

/**
 * Buy one costume. The price is checked against the catalogue on the server and
 * the balance is recounted from the member's own helpful actions, so the client
 * cannot post a cheaper price or spend coins twice.
 *
 * Buying equips it straight away: nobody wants to buy a hat and then hunt for a
 * second button.
 */
export default createEndpoint({
  description: 'Spend coins on a cat costume',
  authenticated: true,
  inputSchema: z.object({ id: z.string().min(1) }),
  outputSchema: z.object({
    ok: z.boolean(),
    equipped: z.string(),
    coins: z.number(),
    owned: z.array(z.string()),
  }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const costume = costumeById(input.id);
    if (!costume) throw new ZiteError({ code: 'BAD_REQUEST', message: 'That costume does not exist.' });

    const row = await walletRow(me.id);
    const wallet = await readWallet(me.id);
    if (wallet.owned.includes(costume.id)) {
      return { ok: true, equipped: costume.id, coins: wallet.coins, owned: wallet.owned };
    }
    if (wallet.coins < costume.price) {
      throw new ZiteError({
        code: 'BAD_REQUEST',
        message: `That is ${costume.price} coins and you have ${wallet.coins}. Help out and come back.`,
      });
    }

    const owned = [...wallet.owned, costume.id];
    await zite.catWallets.update({
      id: String(row.id),
      record: { owned, equipped: costume.id },
    });
    return { ok: true, equipped: costume.id, coins: Math.max(0, wallet.earned - spentOn(owned)), owned };
  },
});
