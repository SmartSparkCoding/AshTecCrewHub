import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  alreadyInRoom,
  mirrorWinner,
  presenceStateFor,
  registerReason,
  registerStateFor,
} from '../src/lib/presence';

/**
 * Ticket: "for people I have ticked green on the register, they can still
 * produce a check in QR code (TO CHECK IN). The register and check in are same
 * thing - they should mirror each others statuses!"
 *
 * Then, after that fix only blocked one direction: "The check-in is just
 * ANOTHER WAY to change your presence. If one changes, the other changes. Simple
 * as that. One doesn't have more power over the other."
 *
 * So there is one mapping between the two vocabularies and one writer for each
 * starting point, and every path that changes either side goes through them.
 * The register is not the senior record and check-in is not a request to
 * overwrite it: they are the same fact, and whichever one an admin touches, the
 * other follows.
 */

const read = (p: string) => readFileSync(p, 'utf8');

test('the two records say the same thing in two vocabularies', () => {
  const pairs: [string, string][] = [
    ['green', 'On Site'],
    ['yellow', 'Expected Back'],
    ['red', 'Off Site'],
    ['', 'Not at Venue'],
  ];
  for (const [colour, presence] of pairs) {
    assert.equal(presenceStateFor(colour), presence, `register ${colour || 'blank'}`);
    assert.equal(registerStateFor(presence), colour, `presence ${presence}`);
  }
});

test('a sign-out carries a reason even when the member added nothing', () => {
  assert.equal(registerReason('Lunch', ''), 'Lunch');
  assert.equal(registerReason('', 'Waiting for a lift'), 'Waiting for a lift');
  assert.equal(registerReason('Lunch', 'Waiting for a lift'), 'Waiting for a lift');
  // Nothing chosen and nothing typed still has to explain a red row.
  assert.equal(registerReason('', ''), 'Signed out');
});

test('checking in writes the register, and checking out writes it too', () => {
  for (const file of ['src/api/presenceDecision.ts', 'src/api/adminCheckInScan.ts']) {
    const source = read(file);
    assert.match(source, /writeRegister\(/, `${file} writes the register`);
    // Both directions come from the presence transition, not from a check for
    // Sign In, which is what made stepping out invisible on the register.
    assert.match(source, /state: registerStateFor\(approved\.state\)/, file);
    assert.match(source, /reason: action === 'Sign In' \? '' : registerReason\(/, file);
    assert.doesNotMatch(source, /action === 'Sign In' && memberId/, `${file} is no longer sign-in only`);
    assert.doesNotMatch(source, /upsertAttendance/, `${file} does not write attendance behind the writer's back`);
  }
});

test('a sign-out is yellow when they are coming back and red when they are not', () => {
  const decision = read('src/api/presenceDecision.ts');
  assert.match(decision, /state: row\.comingBack \? 'Expected Back' : 'Off Site'/);
  assert.match(decision, /returnAt: row\.expectedBackAt \?\? null/);
});

test('ticking the register moves presence in the same write', () => {
  const source = read('src/api/adminRegisterAttendance.ts');
  assert.match(source, /setMemberState\(\{/);
  for (const arg of ['subEventId: input.subEventId', 'memberId: input.memberId', 'state,', 'reason,', 'returnAt,', 'by: admin.id']) {
    assert.ok(source.includes(arg), `the register passes ${arg}`);
  }
  assert.doesNotMatch(source, /upsertAttendance/, 'the register does not write the register row alone');
});

test('the writer paints the roster from the colour', () => {
  const source = read('src/lib/presence.ts');
  assert.match(source, /const state = presenceStateFor\(opts\.state\);/);
  assert.match(source, /comingBack: opts\.state === 'yellow'/);
  assert.match(source, /expectedBackAt: opts\.state === 'yellow' \? opts\.returnAt \?\? null : null/);
  // Green stamps a sign-in, away and gone stamp a sign-out, and a repeated
  // green does not restart the clock on a sign-in that already happened.
  assert.match(source, /signedInAt: opts\.state === 'green'/);
  assert.match(source, /signedOutAt: opts\.state === 'green' \|\| !opts\.state \? null : now/);
  assert.match(source, /existing\?\.state === 'On Site' && existing\?\.signedInAt/);
});

test('a mark by hand spends any code that was waiting', () => {
  const source = read('src/lib/presence.ts');
  assert.match(source, /approvalToken: '',\n    pendingAction: null,/);
});

test('clearing the tick clears both sides', () => {
  const source = read('src/lib/presence.ts');
  // No register row at all, rather than a row arguing for an absence.
  assert.match(source, /if \(!state\) \{/);
  assert.match(source, /await zite\.attendance\.delete\(\{ id: row\.id \}\)/);
  // And the presence side goes to "not at venue", not left as it was.
  assert.match(source, /register === 'red' \? 'Off Site'\n  : 'Not at Venue'/);
});

test('opening a session starts from the register', () => {
  assert.match(read('src/api/presenceStart.ts'), /await seedPresenceFromRegister\(\{ id: String\(created\.id\), subEvent: sub\.id \}, me\.id\)/);
  const source = read('src/lib/presence.ts');
  const seed = source.slice(source.indexOf('export async function seedPresenceFromRegister'));
  assert.match(seed, /presenceStateFor\(state\)/);
  assert.match(seed, /if \(state !== 'green' && state !== 'yellow' && state !== 'red'\) continue;/);
});

test('a green register row still means there is nothing left to scan', () => {
  assert.equal(alreadyInRoom({ state: 'green', reason: '', returnAt: null }, null), true);
  assert.equal(alreadyInRoom({ state: 'green', reason: '', returnAt: null }, 'On Site'), true);
  assert.equal(alreadyInRoom({ state: 'green', reason: '', returnAt: null }, 'Expected Back'), true);
  for (const state of ['yellow', 'red', '']) {
    assert.equal(alreadyInRoom({ state, reason: '', returnAt: null }, null), false, state);
  }
  // Safety valve: a green row left over from before the mirror existed must not
  // trap somebody who has already stepped out.
  assert.equal(alreadyInRoom({ state: 'green', reason: '', returnAt: null }, 'Off Site'), false);
});

test('the check-in endpoint asks the register before minting a code', () => {
  const source = read('src/api/presenceRequest.ts');
  assert.match(source, /alreadyInRoom\(register, existing\?\.state\)/);
  assert.match(source, /An admin has already marked you in on the register, so there is no code to scan\./);
  const guard = source.slice(source.indexOf('if (!signingOut)'), source.indexOf('const token = newToken()'));
  assert.ok(guard.includes('alreadyInRoom'), 'the register guard sits in the sign-in branch');
  assert.match(source, /You are already signed in\./);
});

test('the page knows their register colour', () => {
  assert.match(read('src/api/getPresence.ts'), /const register = await registerFor\(/);
  assert.match(read('src/lib/livePresence.tsx'), /setRegister\(r\.register \?\? null\)/);
});

test('the page does not offer a sign-in button the register has settled', () => {
  const source = read('src/pages/Attendance.tsx');
  assert.match(source, /const markedIn =/);
  assert.match(source, /mine\?\.state !== 'Off Site'/);
  assert.match(source, /You are already marked in\./);
  const card = source.slice(source.indexOf("{mine?.state === 'On Site' ?"), source.indexOf('{asking && ('));
  const settled = card.indexOf('markedIn ?');
  const signIn = card.indexOf('onClick={signIn}');
  assert.ok(settled > -1, 'the register branch exists');
  assert.ok(signIn > settled, 'sign-in is the fallback branch, not the first one');

  // A mirrored row would otherwise say the same reason twice: once in the
  // register note ("the register says you are away: Lunch") and again as the
  // old reason label underneath it.
  assert.match(source, /mine\.reasonLabel && !registerNote &&/);
});

/**
 * Ticket: "at the moment, im signed out on check in, but my register says im
 * here (green) - why? they should mirror each other."
 *
 * The writes were already mirroring. The rows were written before the mirror
 * existed, and a write-time mirror cannot repair a pair it never wrote, so the
 * read paths now pick a winner instead of rendering the argument.
 */
test('the later write wins, and a missing row never beats a real one', () => {
  // Agreement, including "nobody has said anything" on both sides.
  assert.equal(mirrorWinner(undefined, undefined), 'none');
  assert.equal(mirrorWinner({ registerState: '' }, { state: 'Not at Venue' }), 'none');
  assert.equal(mirrorWinner({ registerState: 'green' }, { state: 'On Site' }), 'none');
  assert.equal(mirrorWinner({ registerState: 'yellow' }, { state: 'Expected Back' }), 'none');
  assert.equal(mirrorWinner({ registerState: 'red' }, { state: 'Off Site' }), 'none');

  // The reported bug: a green tick from this morning, nothing on the roster.
  assert.equal(mirrorWinner({ registerState: 'green' }, undefined), 'register');
  assert.equal(mirrorWinner({ registerState: 'green' }, { state: '' }), 'register');

  // The other way round: they signed in, the register has no row yet.
  assert.equal(mirrorWinner(undefined, { state: 'On Site' }), 'presence');
  assert.equal(mirrorWinner({ registerState: '' }, { state: 'Off Site' }), 'presence');
});

test('when both rows exist the newest one wins', () => {
  const att = { registerState: 'green', updatedAt: '2026-11-22T10:15:00.000Z' };
  const older = { state: 'Off Site', updatedAt: '2026-11-22T10:05:00.000Z' };
  const newer = { state: 'Off Site', updatedAt: '2026-11-22T11:50:00.000Z' };

  assert.equal(mirrorWinner(att, older), 'register', 'ticked green after they signed out');
  assert.equal(mirrorWinner(att, newer), 'presence', 'signed out after the tick');

  // A tie is not worth arguing about; the register is what a human tapped.
  assert.equal(mirrorWinner(att, { ...older, updatedAt: att.updatedAt }), 'register');
});

test('the read paths reconcile before they render', () => {
  const mine = readFileSync('src/api/getPresence.ts', 'utf8');
  assert.match(mine, /await reconcileMember\(/, 'a member opening Check-in heals their own pair');
  assert.match(mine, /reconcileMember\(\{ id: String\(session\.id\)/);

  const roster = readFileSync('src/api/adminGetPresence.ts', 'utf8');
  assert.match(roster, /if \(canManage\) await reconcileSession\(/, 'the roster heals the whole set');
  assert.match(roster, /reconcileSession\(\{ id: String\(session\.id\)/);

  const lib = readFileSync('src/lib/presence.ts', 'utf8');
  // One writer per direction, so reconciling cannot invent a third way to set
  // a state that later drifts from the other side.
  assert.match(lib, /export async function reconcileMember/);
  assert.match(lib, /export async function reconcileSession/);
  assert.match(lib, /await setMemberState\(\{\n      subEventId,/);
  assert.match(lib, /await writeRegister\(\{\n      subEventId,/);
});
