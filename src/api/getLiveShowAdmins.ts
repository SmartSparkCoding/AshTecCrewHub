import { z } from 'zod';
import { createEndpoint } from '#backend';
import { zite } from '#db';
import { adminsWithSecrets } from '../../server/catLogin.js';

/**
 * The admins a stage screen can be enabled as (ticket f75f7b40). Only admins
 * who actually have a cat-login secret set can be picked, because the enable
 * prompt and the in-page unlock both verify that secret. Email is returned
 * because the picker submits it; names are already public in the crew list, the
 * support tab and the calendar footer. No secret material is returned.
 */
export default createEndpoint({
  description: 'Lists admins with a cat-login secret (id, name, email) for the enable/unlock pickers',
  authenticated: false,
  inputSchema: z.object({}),
  outputSchema: z.object({
    admins: z.array(z.object({ id: z.string(), name: z.string(), email: z.string() })),
  }),
  execute: async () => {
    const withSecrets = new Set((await adminsWithSecrets()).map((e) => e.toLowerCase()));
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const admins = records
      .filter((m) => !!m.isAdmin && !!m.schoolEmail && withSecrets.has(String(m.schoolEmail).toLowerCase()))
      .map((m) => ({
        id: String(m.id),
        name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || 'Admin',
        email: String(m.schoolEmail),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { admins };
  },
});
