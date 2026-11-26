import { z } from 'zod';
import { createEndpoint, ZiteError } from '#backend';
import { zite } from '#db';
import { readWallet, walletRow } from '../lib/catShop';
import { costumeById } from '../lib/mascot';
import { requireMember } from '../lib/server';

/**
 * Put a costume on the cat, or take it off with an empty id. Only costumes the
 * member owns can be worn, so the cat cannot turn up in something unbought.
 */
export default createEndpoint({
  description: 'Wear or remove a cat costume you own',
  authenticated: true,
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ ok: z.boolean(), equipped: z.string(), coins: z.number() }),
  execute: async ({ context, input }) => {
    const me = await requireMember(context.user.email);
    const id = input.id.trim();
    if (id && !costumeById(id)) {
      throw new ZiteError({ code: 'BAD_REQUEST', message: 'That costume does not exist.' });
    }
    const row = await walletRow(me.id);
    const wallet = await readWallet(me.id);
    if (id && !wallet.owned.includes(id)) {
      throw new ZiteError({ code: 'BAD_REQUEST', message: 'You have not bought that one yet.' });
    }
    await zite.catWallets.update({ id: String(row.id), record: { equipped: id } });
    return { ok: true, equipped: id, coins: wallet.coins };
  },
});
