import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { alreadyInRoom } from '../src/lib/presence';

/**
 * Ticket: "for people I have ticked green on the register, they can still
 * produce a check in QR code (TO CHECK IN). The register and check in are same
 * thing - they should mirror each others statuses!"
 *
 * They were two screens answering one question. An admin ticks somebody green,
 * and that member opens Check-in, presses Sign in, and gets a live code for a
 * room they are already marked into. Approving it then wrote a second approval
 * onto the timeline for something that had already happened.
 *
 * The rule now lives in one function, so the endpoint and this test cannot
 * disagree about what "already in" means.
 */

const endpoint = () => readFileSync('src/api/presenceRequest.ts', 'utf8');
const registerApi = () => readFileSync('src/api/adminRegisterAttendance.ts', 'utf8');
const page = () => readFileSync('src/pages/Attendance.tsx', 'utf8');
const presence = () => readFileSync('src/lib/presence.ts', 'utf8');

test('a green register row means there is nothing left to scan', () => {
  assert.equal(alreadyInRoom({ state: 'green', reason: '', returnAt: null }, null), true);
  assert.equal(alreadyInRoom({ state: 'green', reason: '', returnAt: null }, 'On Site'), true);
  assert.equal(alreadyInRoom({ state: 'green', reason: '', returnAt: null }, 'Expected Back'), true);
});

test('yellow and red do not block a sign-in', () => {
  for (const state of ['yellow', 'red', '']) {
    assert.equal(alreadyInRoom({ state, reason: '', returnAt: null }, null), false, state);
  }
});

test('somebody the register says is Off Site can sign back in', () => {
  // They stepped out, so the green tick is a stale row, not an answer about now.
  assert.equal(alreadyInRoom({ state: 'green', reason: '', returnAt: null }, 'Off Site'), false);
});

test('the check-in endpoint asks the register before minting a code', () => {
  const source = endpoint();
  assert.match(source, /alreadyInRoom\(register, existing\?\.state\)/);
  assert.match(source, /An admin has already marked you in on the register, so there is no code to scan\./);
  // Only sign-in is refused. Refusing a sign-out would trap somebody in a room
  // the register says they are in.
  const guard = source.slice(source.indexOf('if (!signingOut)'), source.indexOf('const token = newToken()'));
  assert.ok(guard.includes('alreadyInRoom'), 'the register guard sits in the sign-in branch');
  // A second tap while already on site is the same duplicate, different route.
  assert.match(source, /You are already signed in\./);
});

test('a green tick spends a code that is already waiting', () => {
  const source = registerApi();
  assert.match(source, /clearPendingSignIn\(open\.id, input\.memberId, admin\.id\)/);
  assert.match(source, /if \(state === 'green'\)/);
  // Only when the tick belongs to the session that is actually open.
  assert.match(source, /sessionSubEventId\(open\) === input\.subEventId/);
});

test('clearing a waiting code only clears sign-in requests', () => {
  const source = presence();
  assert.match(source, /row\.pendingAction !== 'Sign In'/);
  assert.match(source, /approvalToken: ''/);
});

test('the page knows their register colour', () => {
  assert.match(readFileSync('src/api/getPresence.ts', 'utf8'), /const register = await registerFor\(/);
  assert.match(readFileSync('src/lib/livePresence.tsx', 'utf8'), /setRegister\(r\.register \?\? null\)/);
});

test('the page does not offer a sign-in button the register has settled', () => {
  const source = page();
  assert.match(source, /const markedIn =/);
  assert.match(source, /mine\?\.state !== 'Off Site'/);
  assert.match(source, /You are already marked in\./);
  // The QR is driven by pendingAction, and nothing can be pending for a member
  // the register calls in, so the code never renders for them.
  const card = source.slice(source.indexOf("{mine?.state === 'On Site' ?"), source.indexOf('{asking && ('));
  const settled = card.indexOf('markedIn ?');
  const signIn = card.indexOf('onClick={signIn}');
  // Green is checked before the button, so the press is only reachable by
  // somebody the register has not already marked in.
  assert.ok(settled > -1, 'the register branch exists');
  assert.ok(signIn > settled, 'sign-in is the fallback branch, not the first one');
});
