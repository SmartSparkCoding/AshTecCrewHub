/**
 * Email a file to named people, through the hub's own mail server.
 *
 * `email_crew` is deliberately all-or-nothing: everyone emailable, no staff, no
 * attachments. That is fine for an announcement and useless for "send today's
 * register to the three staff who asked for it, and copy the admins" (Jacob,
 * Nov 22). This is the narrower tool: you name who it goes to, it looks their
 * address up in CrewMembers, and it never invents one.
 *
 * Why it looks addresses up rather than taking them as arguments: the platform
 * already knows them, and an agent typing an address from memory is how a
 * register ends up at the wrong person. Names are matched against the member
 * list; a name that matches nobody, or more than one person, is reported back
 * and the send does not happen.
 *
 * Staff are allowed here on purpose. `isEmailable` drops teachers because they
 * should not get crew announcements, but they are exactly who asks for a
 * register, so the only hard rule is: must have a school address, and must not
 * be an AI agent account (those are records, not people).
 */
import { zite } from '#db';
import { Email, type EmailAttachment } from './email.js';

export type Person = { id: string; name: string; email: string; admin: boolean };

export type MatchResult = {
  matched: Person[];
  /** Asked for by name or address, matched nobody. */
  missing: string[];
  /** Asked for by name, matched several people. Nothing is guessed. */
  ambiguous: { asked: string; candidates: string[] }[];
};

const fullName = (m: any) => `${m.firstName ?? ''} ${m.lastName ?? ''}`.replace(/\s+/g, ' ').trim();

/** "Mr Andrews" and "N Andrews" should both find the same record. */
const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/^(mr|mrs|ms|miss|dr|sir|madam)\.?\s+/, '')
    .replace(/[^a-z0-9@.\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const alternates = (value: unknown): string[] =>
  String(value ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

const toPerson = (m: any): Person => ({
  id: m.id,
  name: fullName(m) || String(m.schoolEmail ?? ''),
  email: String(m.schoolEmail ?? '').trim(),
  admin: m.isAdmin === true,
});

const ofAge = (m: any) => m.memberType !== 'AI Agent' && !!String(m.schoolEmail ?? '').trim();

/** All crew records once, so a single send does one query, not one per name. */
export async function everyone(): Promise<any[]> {
  const { records } = await zite.crewMembers.findAll({ limit: 2000 });
  return (records as any[]).filter(ofAge);
}

/**
 * Resolve a list of names ("L Bourne", "Andrews") or addresses into people.
 * An address must match the member's school address or one of their alternates.
 */
export async function matchPeople(wanted: string[], pool?: any[]): Promise<MatchResult> {
  // Filtered here too, not only in `everyone`, so the rule holds for any caller.
  const members = (pool ?? (await everyone())).filter(ofAge);
  const matched = new Map<string, Person>();
  const missing: string[] = [];
  const ambiguous: { asked: string; candidates: string[] }[] = [];

  for (const raw of wanted.map((x) => String(x ?? '').trim()).filter(Boolean)) {
    const asked = plain(raw);

    if (raw.includes('@')) {
      const hits = members.filter(
        (m) =>
          String(m.schoolEmail ?? '').toLowerCase() === raw.toLowerCase() ||
          alternates(m.alternateEmails).includes(raw.toLowerCase())
      );
      if (hits.length === 1) matched.set(hits[0].id, toPerson(hits[0]));
      else missing.push(raw);
      continue;
    }

    const hits = members.filter((m) => {
      const name = plain(fullName(m));
      return name === asked || name.includes(asked) || asked.includes(name);
    });

    if (hits.length === 1) matched.set(hits[0].id, toPerson(hits[0]));
    else if (hits.length === 0) missing.push(raw);
    else ambiguous.push({ asked: raw, candidates: hits.map((m) => `${fullName(m)} <${m.schoolEmail}>`) });
  }

  return { matched: [...matched.values()].sort((a, b) => a.name.localeCompare(b.name)), missing, ambiguous };
}

/** Admins with an address, minus anyone already in `except`. */
export async function adminRecipients(except: Person[], pool?: any[]): Promise<Person[]> {
  const members = pool ?? (await everyone());
  const skip = new Set(except.map((p) => p.id));
  return members
    .filter((m) => m.isAdmin === true && !skip.has(m.id))
    .map(toPerson)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type MailResult = {
  dryRun: boolean;
  to: string[];
  cc: string[];
  attachment: string | null;
  sent: number;
  failed: number;
  missing: string[];
  ambiguous: { asked: string; candidates: string[] }[];
};

/**
 * One email, addressed to `to`, copying `cc` (or every admin when `ccAdmins`).
 * Logged to EmailLog once per person who received it, under one batchId.
 */
export async function sendMembers(input: {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  ccAdmins?: boolean;
  attachment?: { filename: string; base64: string };
  dryRun?: boolean;
}): Promise<MailResult> {
  const subject = String(input.subject ?? '').trim();
  const body = String(input.body ?? '').trim();
  const wanted = (input.to ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
  if (!subject) throw new Error('A subject is needed.');
  if (!body) throw new Error('A body is needed.');
  if (!wanted.length) throw new Error('Name at least one person to send it to.');

  const pool = await everyone();
  const to = await matchPeople(wanted, pool);
  const ccWanted = (input.cc ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);
  const cc = await matchPeople(ccWanted, pool);
  const admins = input.ccAdmins ? await adminRecipients(to.matched, pool) : [];

  const ccPeople = [...cc.matched, ...admins].filter(
    (p, i, all) => all.findIndex((x) => x.id === p.id) === i && !to.matched.some((t) => t.id === p.id)
  );

  const attachment: EmailAttachment | undefined =
    input.attachment && input.attachment.filename && input.attachment.base64
      ? { filename: String(input.attachment.filename), base64: String(input.attachment.base64) }
      : undefined;

  const missing = [...to.missing, ...cc.missing];
  const ambiguous = [...to.ambiguous, ...cc.ambiguous];
  const base: MailResult = {
    dryRun: !!input.dryRun,
    to: to.matched.map((p) => p.email),
    cc: ccPeople.map((p) => p.email),
    attachment: attachment?.filename ?? null,
    sent: 0,
    failed: 0,
    missing,
    ambiguous,
  };

  // Nothing guessed: an unknown or doubled name stops the send.
  if (missing.length || ambiguous.length) return base;
  if (!to.matched.length) return base;
  if (input.dryRun) return base;

  const batchId = crypto.randomUUID();
  const site = (process.env.APP_URL ?? 'https://ashtec.dino.icu').replace(/\/+$/, '');

  try {
    await Email.send({
      to: base.to,
      cc: base.cc,
      subject,
      body: [
        { type: 'text', content: body },
        { type: 'button', label: 'Open AshTec Crew Hub', href: site },
      ],
      ...(attachment ? { attachments: [attachment] } : {}),
    });
    base.sent = 1;
  } catch {
    base.failed = 1;
    return base;
  }

  const now = new Date().toISOString();
  const logs = [...to.matched, ...ccPeople].map((p) => ({
    subject,
    member: p.id,
    recipientEmail: p.email,
    purpose: attachment ? 'Register email' : 'Crew email',
    body,
    sentBy: 'gorkie',
    sentAt: now,
    batchId,
  }));
  for (let i = 0; i < logs.length; i += 100) {
    await zite.emailLog.bulkCreate({ records: logs.slice(i, i + 100) as never });
  }

  return base;
}
