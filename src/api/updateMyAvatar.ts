import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireMember } from '../lib/server';

/**
 * Saves the picture the member just uploaded, or clears it.
 *
 * The file itself goes straight to storage from the browser (`useUpload`), so
 * this only ever sees the resulting link. Sending an empty string removes the
 * picture, which is why the field is nullable rather than required.
 */
export default createEndpoint({
  description: 'Saves or clears the signed-in member’s profile picture',
  authenticated: true,
  inputSchema: z.object({ url: z.string().max(2000) }),
  outputSchema: z.object({ success: z.boolean(), profilePictureUrl: z.string() }),
  execute: async ({ input, context }) => {
    // requireMember, not actingMember: a preview session must never write.
    const me = await requireMember(context.user.email);
    const url = input.url.trim();
    if (url && !/^https?:\/\//i.test(url)) throw new Error('That does not look like an image link.');
    await zite.crewMembers.update({ id: me.id, record: { profilePictureUrl: url || null } as never });
    return { success: true, profilePictureUrl: url };
  },
});
