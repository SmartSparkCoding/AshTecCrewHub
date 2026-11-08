import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';

/**
 * The suffixes the sign-in box offers.
 *
 * Everyone on the crew shares one or two school domains, so typing the whole
 * address every time is busywork. This reads the domains that actually appear
 * on the crew list (current and backup addresses) and returns the most common
 * ones, so the list follows the school rather than being hard-coded.
 *
 * Unauthenticated on purpose: it runs before anyone has signed in. It only ever
 * returns bare domains, never an address or a name.
 */
export default createEndpoint({
  description: 'Lists the email domains the crew uses, for the sign-in suffix picker',
  inputSchema: z.object({}),
  outputSchema: z.object({ domains: z.array(z.string()) }),
  execute: async () => {
    const { records } = await zite.crewMembers.findAll({ limit: 2000 });
    const counts = new Map<string, number>();
    for (const m of records) {
      // Preview accounts use a made-up domain that nobody can sign in with.
      if (m.isPreviewAccount) continue;
      const addresses = [m.schoolEmail ?? '', ...(m.alternateEmails ?? '').split(',')];
      for (const address of addresses) {
        const domain = address.trim().toLowerCase().split('@')[1] ?? '';
        if (!domain.includes('.')) continue;
        counts.set(domain, (counts.get(domain) ?? 0) + 1);
      }
    }
    const domains = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([domain]) => domain);
    return { domains };
  },
});
