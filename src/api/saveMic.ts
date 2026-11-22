import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { requireShowAccess, assertPermission } from '../lib/server';

/**
 * The mic list: which radio mic each character wears, and who is playing them.
 *
 * Two casts share the same box of packs, so a row belongs to a cast as well as
 * a show and a number. Number is text rather than a number so "12A" and "spare"
 * fit in the same column.
 */
export default createEndpoint({
  description: 'Add, edit or remove a mic list row for a show',
  authenticated: true,
  inputSchema: z.object({
    showId: z.string().min(1),
    id: z.string().optional(),
    cast: z.enum(['A', 'B']).optional(),
    number: z.string().max(20).optional(),
    character: z.string().max(120).optional(),
    performer: z.string().max(120).optional(),
    notes: z.string().max(400).optional(),
    remove: z.boolean().optional(),
  }),
  outputSchema: z.object({ ok: z.boolean(), id: z.string() }),
  execute: async ({ context, input }) => {
    const { me } = await requireShowAccess(context.user.email, input.showId);
    assertPermission(me, 'show.edit');

    if (input.remove) {
      if (!input.id) throw new Error('Nothing to remove.');
      const existing = await zite.showMics.findOne({ id: input.id }).catch(() => null);
      if (!existing) return { ok: true, id: input.id };
      if (String(existing.show) !== input.showId) throw new Error('That mic belongs to another show.');
      if (!me.isAdmin) throw new Error('Only admins can delete mic rows.');
      await zite.showMics.delete({ id: input.id });
      return { ok: true, id: input.id };
    }

    const clean = (v: string | undefined, n: number) => (v === undefined ? undefined : v.slice(0, n).trim());

    if (input.id) {
      const existing = await zite.showMics.findOne({ id: input.id }).catch(() => null);
      if (!existing) throw new Error('Mic not found.');
      if (String(existing.show) !== input.showId) throw new Error('That mic belongs to another show.');
      const record: Record<string, unknown> = {};
      if (input.cast !== undefined) record.cast = input.cast;
      if (input.number !== undefined) record.number = clean(input.number, 20);
      if (input.character !== undefined) record.character = clean(input.character, 120);
      if (input.performer !== undefined) record.performer = clean(input.performer, 120);
      if (input.notes !== undefined) record.notes = clean(input.notes, 400);
      await zite.showMics.update({ id: input.id, record });
      return { ok: true, id: input.id };
    }

    const number = clean(input.number, 20) ?? '';
    const character = clean(input.character, 120) ?? '';
    const performer = clean(input.performer, 120) ?? '';
    if (!number && !character && !performer) throw new Error('Give the mic a number, a character or a performer.');
    const cast = input.cast ?? 'A';
    // New rows land at the end of their cast, so the list keeps the order it was
    // typed in rather than whatever Postgres happens to return.
    const siblings = await zite.showMics.findAll({ filters: { show: input.showId }, limit: 500 });
    const position = siblings.records.filter((r) => String(r.cast) === cast).length;

    const created = await zite.showMics.create({
      record: {
        show: input.showId,
        cast,
        number,
        character,
        performer,
        notes: clean(input.notes, 400) ?? '',
        position,
        createdBy: me.id,
      } as never,
    });
    return { ok: true, id: String(created.id) };
  },
});
