/**
 * One email to the whole crew (asked for by Jacob, Nov 22).
 *
 * Deliberately not wired into the app's admin UI: this exists because an agent
 * was asked to send a single department-wide note, and the only honest way to
 * do that was to make the capability explicit, previewable and logged instead of
 * looping the browser a hundred times.
 *
 * The recipient rules are the app's own, not new ones: `isEmailable` already
 * drops staff and preview accounts, and `resolveRecipients` adds the two things
 * a blast must never hit — AI agent accounts (which are not people) and any
 * name Jacob asks to leave out.
 *
 * `dryRun` returns the list and sends nothing. That is the step that should be
 * read before the real call.
 */
import { zite } from '#db';
import { Email } from './email.js';
import { isEmailable, isStaff } from '../src/lib/server.js';

export type Recipient = { id: string; name: string; email: string };

/** A 400-recipient blast is already bigger than this crew; stop runaway loops. */
export const MAX_BLAST = 400;

const siteUrl = () => (process.env.APP_URL ?? 'https://ashtec.dino.icu').replace(/\/+$/, '');

const fullName = (m: { firstName?: string | null; lastName?: string | null }) =>
  `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();

/**
 * Everyone who should get a crewwide email: real people, emailable, not staff,
 * not an AI agent, and not someone named in `exclude`.
 */
export async function resolveRecipients({ exclude = [] }: { exclude?: string[] } = {}): Promise<Recipient[]> {
  const wanted = exclude.map((x) => x.trim().toLowerCase()).filter(Boolean);
  const { records } = await zite.crewMembers.findAll({ limit: 2000 });

  return (records as any[])
    .filter((m) => {
      if (!isEmailable(m)) return false;
      if (m.memberType === 'AI Agent') return false;
      if (isStaff(m)) return false;
      const name = fullName(m).toLowerCase();
      const email = String(m.schoolEmail ?? '').toLowerCase();
      return !wanted.some((w) => name.includes(w) || email.includes(w));
    })
    .map((m) => ({ id: m.id, name: fullName(m), email: String(m.schoolEmail) }))
    .filter((r) => !!r.email)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_BLAST);
}

export type BlastResult = {
  dryRun: boolean;
  count: number;
  names: string[];
  sent: number;
  failed: number;
};

/**
 * The same body goes to everyone, with `{name}` standing in for the first name.
 * Each send is logged to EmailLog as `purpose: 'Crew email'` and shares a
 * batchId, so the admin email log shows exactly what went out and to whom.
 */
export async function sendBlast(input: {
  subject: string;
  body: string;
  exclude?: string[];
  dryRun?: boolean;
}): Promise<BlastResult> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) throw new Error('A subject is needed.');
  if (!body) throw new Error('A body is needed.');

  const recipients = await resolveRecipients({ exclude: input.exclude });
  const names = recipients.map((r) => r.name);

  if (input.dryRun) {
    return { dryRun: true, count: recipients.length, names, sent: 0, failed: 0 };
  }

  const batchId = crypto.randomUUID();
  const base = siteUrl();
  const logs: Record<string, unknown>[] = [];
  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    const first = r.name.split(' ')[0] || 'there';
    const text = body.replace(/\{name\}/g, first);
    try {
      await Email.send({
        to: r.email,
        subject,
        body: [
          { type: 'text', content: text },
          { type: 'button', label: 'Open AshTec Crew Hub', href: base },
        ],
      });
      sent++;
      logs.push({
        subject,
        member: r.id,
        recipientEmail: r.email,
        purpose: 'Crew email',
        body: text,
        sentBy: 'gorkie',
        sentAt: new Date().toISOString(),
        batchId,
      });
    } catch {
      failed++;
    }
  }

  for (let i = 0; i < logs.length; i += 100) {
    await zite.emailLog.bulkCreate({ records: logs.slice(i, i + 100) as never });
  }

  return { dryRun: false, count: recipients.length, names, sent, failed };
}
