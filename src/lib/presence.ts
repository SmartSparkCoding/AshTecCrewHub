// Backend-only helpers for venue check-in (the "where is the crew right now" side
// of the app), shared by the presence endpoints in src/api/.
//
// This is deliberately separate from lib/server.ts, which deals with event RSVP
// intent. Attendance there answers "will you be at the rehearsal?"; presence
// here answers "are you in the room right now?". Mixing them means every
// presence read would drag RSVP state along with it, and the two disagree
// constantly: someone can be signed out of the venue while marked as attending.
import { zite } from '#db';
import { ids, upsertAttendance } from './server';

/** Where a member stands relative to the current session. */
export const PRESENCE_STATES = ['On Site', 'Off Site', 'Expected Back', 'Not at Venue'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

/**
 * Reads a single-link field. The generated types declare every linked record as
 * `string | string[]` even when the column is single-link, so every one of these
 * has to be narrowed by hand. Doing it in one place keeps the cast out of the
 * endpoints.
 */
export const one = (v?: string | string[] | null) => (Array.isArray(v) ? v[0] : v) || undefined;

/** One row per member per session, so a second tap updates in place. */
export const presenceKey = (sessionId: string, memberId: string) => `${sessionId}:${memberId}`;

/**
 * Unguessable but short. A 36-character UUID pushes the approval QR up to a
 * denser symbol, which is measurably slower to read off a phone screen in a dim
 * venue; 20 hex characters is 80 bits of entropy, far more than enough for a
 * link that an admin approves once.
 */
export function newToken(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The event a check-in session is for, as a plain id.
 *
 * Ticket: QR approval 500'd with `invalid input syntax for type uuid: "e"`.
 * The session's link column is typed `string | string[]` and came back as a
 * string, so `session.subEvent?.[0]` returned its FIRST CHARACTER - a one
 * letter "uuid" that Postgres refused. Anything that wants the id goes through
 * here, so the index-vs-string mistake can only live in one place.
 */
export const sessionSubEventId = (session?: { subEvent?: string | string[] | null }) =>
  one(session?.subEvent) ?? '';

/** The one session that may be open at a time, or undefined. */
export async function activeSession() {
  const { records } = await zite.presenceSessions.findAll({
    filters: { status: 'Active' },
    limit: 10,
  });
  // Newest first: if a crash ever left two marked Active, treat the later one
  // as the real one rather than refusing to show the app at all.
  return records.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0];
}

export async function requireActiveSession() {
  const s = await activeSession();
  if (!s) throw new Error('There is no open check-in session right now.');
  return s;
}

export async function findPresence(sessionId: string, memberId: string) {
  return zite.venuePresence.findOne({ filters: { presenceKey: presenceKey(sessionId, memberId) } });
}

/** Strips the internal bookkeeping down to what the UI actually renders. */
export function mapPresence(p: {
  // Optional: this helper only reshapes presentation fields, and rows arrive
  // typed as a bare record index signature from the database layer.
  id?: string
  state?: string
  reasonLabel?: string
  reason?: string
  comingBack?: boolean
  expectedBackAt?: string | null
  signedInAt?: string | null
  signedOutAt?: string | null
  pendingAction?: string
  approvalToken?: string
}) {
  return {
    state: p.state ?? null,
    reasonLabel: p.reasonLabel ?? '',
    reason: p.reason ?? '',
    comingBack: !!p.comingBack,
    expectedBackAt: p.expectedBackAt ?? null,
    signedInAt: p.signedInAt ?? null,
    signedOutAt: p.signedOutAt ?? null,
    pendingAction: p.pendingAction ?? null,
    token: p.approvalToken ?? null,
  };
}

export async function findPresenceByToken(token: string) {
  return zite.venuePresence.findOne({ filters: { approvalToken: token } });
}

/**
 * Append one row to the venue check-in timeline (ticket 168e8274).
 *
 * The VenuePresence row is overwritten on every approval, so it can only show
 * the latest sign-in/out. This is the durable record the admin backlog reads:
 * who did what, when, and which admin approved it. Never updated or deleted.
 */
export async function logPresenceEvent(event: {
  session: string;
  member?: string | null;
  action: string;
  reasonLabel?: string;
  reason?: string;
  comingBack?: boolean;
  expectedBackAt?: string | null;
  at: string;
  by: string;
}): Promise<void> {
  await zite.venuePresenceEvents.create({
    record: {
      eventKey: `${event.session}:${event.at}:${event.action}:${event.member ?? 'session'}`,
      session: event.session,
      member: event.member ?? null,
      action: event.action,
      reasonLabel: event.reasonLabel ?? '',
      reason: event.reason ?? '',
      comingBack: !!event.comingBack,
      expectedBackAt: event.expectedBackAt ?? null,
      at: event.at,
      by: event.by,
    } as never,
  });
}

/** One person's colour on the register for a single event. */
export type RegisterRow = { state: string; reason: string; returnAt: string | null };

/**
 * Where this member stands on the *register* for one event, if anywhere.
 *
 * Check-in and the register are two views of the same fact, and they had drifted
 * apart: an admin ticks somebody green, and that member can still open the
 * Check-in page and produce a sign-in code for a room they are already marked
 * into. Anything that needs the register's colour for one person reads it here,
 * rather than re-deriving the rule at each call site and getting it half right.
 */
export async function registerFor(subEventId: string, memberId: string): Promise<RegisterRow> {
  const blank: RegisterRow = { state: '', reason: '', returnAt: null };
  if (!subEventId || !memberId) return blank;
  const { records } = await zite.attendance.findAll({ filters: { subEvent: subEventId }, limit: 2000 });
  const row = records.find((a) => ids(a.member)[0] === memberId) as unknown as
    | { registerState?: string; reason?: string; returnAt?: string | null }
    | undefined;
  if (!row) return blank;
  return { state: row.registerState ?? '', reason: row.reason ?? '', returnAt: row.returnAt ?? null };
}

/**
 * Is the register already answering "are you in the room"?
 *
 * Green means in, which makes a sign-in code a question about something that
 * has already been settled. Off Site is the exception: they stepped out and are
 * coming back, so the green tick is a stale register row, not an answer.
 */
export const alreadyInRoom = (register: RegisterRow, state?: string | null) =>
  register.state === 'green' && state !== 'Off Site';

/** The colours the school-style register uses, plus "nobody has said". */
export type RegisterState = '' | 'green' | 'yellow' | 'red';

/**
 * The register colour that says the same thing as a presence state.
 *
 * The register and check-in are not two records of two facts. They are one fact
 * written in two places: green is in the room, yellow is away and coming back,
 * red is not in. Every write path goes through this mapping so the two can
 * never disagree, in either direction, no matter which one an admin touched.
 */
export const registerStateFor = (state?: string | null): RegisterState =>
  state === 'On Site' ? 'green'
  : state === 'Expected Back' ? 'yellow'
  : state === 'Off Site' ? 'red'
  : '';

/** The same mapping read the other way, so a colour can paint the roster. */
export const presenceStateFor = (register?: string | null): PresenceState =>
  register === 'green' ? 'On Site'
  : register === 'yellow' ? 'Expected Back'
  : register === 'red' ? 'Off Site'
  : 'Not at Venue';

/**
 * The words a register row carries when the member did not type their own.
 * A sign-out is a reason in itself: picking "Lunch" and adding nothing still
 * has to produce a register row that explains the colour.
 */
export const registerReason = (
  label?: string | null,
  reason?: string | null,
  fallback = 'Signed out',
) => (reason ?? '').trim() || (label ?? '').trim() || fallback;

/**
 * Writes one member's colour on the register for one event, and nothing else.
 *
 * Used by the check-in side, which has already written its own presence row and
 * only needs the register to catch up. Anything that starts from the register
 * uses setMemberState below, which does both.
 */
export async function writeRegister(opts: {
  subEventId: string;
  memberId: string;
  state: RegisterState;
  reason?: string;
  returnAt?: string | null;
  by: string;
}): Promise<void> {
  const { subEventId, memberId, state } = opts;
  if (!subEventId || !memberId) return;

  if (!state) {
    // Cleared: no row at all, so the register reads as "nobody has said"
    // instead of as an absence somebody argued for.
    const { records } = await zite.attendance.findAll({ filters: { subEvent: subEventId }, limit: 2000 });
    const row = records.find((a) => ids(a.member)[0] === memberId);
    if (row) await zite.attendance.delete({ id: row.id });
    return;
  }

  await upsertAttendance([{
    memberId,
    subEventId,
    status: state === 'green' ? 'Expected Arrival' : 'Not Attending',
    reason: state === 'green' ? '' : opts.reason ?? '',
    registerState: state,
    returnAt: state === 'yellow' ? opts.returnAt ?? null : null,
    byAdmin: true,
  }]);
}

/** The open session, but only if it is for this event. */
export async function sessionForSubEvent(subEventId: string) {
  const session = await activeSession();
  if (!session || sessionSubEventId(session) !== subEventId) return undefined;
  return session;
}

/**
 * Sets one member's state in both places at once: the register row and, when a
 * session is open for that event, the presence row.
 *
 * This is the only writer for the register side of the mirror. An admin marking
 * somebody green therefore signs them in, marking them away puts them on the
 * roster as away until they are back, and clearing the tick puts them at "not
 * at venue" rather than leaving a state behind that the register has forgotten.
 */
export async function setMemberState(opts: {
  subEventId: string;
  memberId: string;
  state: RegisterState;
  reason?: string;
  returnAt?: string | null;
  by: string;
}): Promise<{ state: RegisterState; presence: PresenceState | null }> {
  await writeRegister(opts);

  const session = await sessionForSubEvent(opts.subEventId);
  if (!session) return { state: opts.state, presence: null };

  const key = presenceKey(session.id, opts.memberId);
  const existing = await zite.venuePresence.findOne({ filters: { presenceKey: key } });
  const now = new Date().toISOString();
  const state = presenceStateFor(opts.state);

  const record = {
    presenceKey: key,
    session: session.id,
    member: opts.memberId,
    state,
    // The register's reason is free text, so it lands in `reason`, which is the
    // field the roster already shows. reasonLabel stays empty rather than being
    // guessed from a picklist that may not contain what was typed.
    reasonLabel: '',
    reason: opts.state === 'green' ? '' : opts.reason ?? '',
    comingBack: opts.state === 'yellow',
    expectedBackAt: opts.state === 'yellow' ? opts.returnAt ?? null : null,
    // A repeated green does not restart the clock on a sign-in that already
    // happened; anything that is not green ends it.
    signedInAt: opts.state === 'green'
      ? (existing?.state === 'On Site' && existing?.signedInAt ? existing.signedInAt : now)
      : null,
    signedOutAt: opts.state === 'green' || !opts.state ? null : now,
    // Whatever the member was asking for has been answered by hand.
    approvalToken: '',
    pendingAction: null,
    updatedBy: opts.by,
  };

  if (existing) await zite.venuePresence.update({ id: existing.id, record: record as never });
  else await zite.venuePresence.create({ record: record as never });

  await logPresenceEvent({
    session: session.id,
    member: opts.memberId,
    action: opts.state ? `Register ${opts.state}` : 'Register cleared',
    reason: opts.reason ?? '',
    comingBack: opts.state === 'yellow',
    expectedBackAt: record.expectedBackAt,
    at: now,
    by: opts.by,
  });

  return { state: opts.state, presence: state };
}

/**
 * Opens a session with the register already on the roster.
 *
 * The other half of the mirror: if an admin ticked people in before check-in was
 * opened, those ticks are people in the room, so the roster starts with them
 * there instead of showing everybody as "not at venue" until they scan.
 */
export async function seedPresenceFromRegister(
  session: { id: string; subEvent?: string | string[] | null },
  by: string,
): Promise<number> {
  const subEventId = sessionSubEventId(session);
  if (!subEventId) return 0;
  const { records } = await zite.attendance.findAll({ filters: { subEvent: subEventId }, limit: 2000 });
  const now = new Date().toISOString();
  let seeded = 0;

  for (const row of records) {
    const state = String(row.registerState ?? '') as RegisterState;
    if (state !== 'green' && state !== 'yellow' && state !== 'red') continue;
    const memberId = ids(row.member)[0];
    if (!memberId) continue;

    const presence = presenceStateFor(state);
    await zite.venuePresence.create({
      record: {
        presenceKey: presenceKey(session.id, memberId),
        session: session.id,
        member: memberId,
        state: presence,
        reasonLabel: '',
        reason: state === 'green' ? '' : String(row.reason ?? ''),
        comingBack: state === 'yellow',
        expectedBackAt: state === 'yellow' ? (row.returnAt as string | null) ?? null : null,
        signedInAt: state === 'green' ? now : null,
        signedOutAt: state === 'green' ? null : now,
        approvalToken: '',
        pendingAction: null,
        updatedBy: by,
      } as never,
    });
    seeded++;
  }

  return seeded;
}

/** The member ids behind a set of presence rows, for name lookups. */
export const memberIdsOf = (rows: { member?: string | string[] | null }[]) =>
  [...new Set(rows.flatMap((r) => ids(r.member)))];