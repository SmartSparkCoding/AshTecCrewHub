import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { sessionSubEventId } from '../src/lib/presence';

/**
 * Ticket: approving a QR check-in from the /a/:token page 500'd with
 * `invalid input syntax for type uuid: "e"`.
 *
 * The session's link column is typed `string | string[]`. When it came back as
 * a plain string, `session.subEvent?.[0]` handed Postgres the FIRST CHARACTER
 * of the event id, so the register write blew up after the sign-in had already
 * been saved. The member saw "Can't approve this" for a check-in that had
 * actually worked, and the register never got ticked.
 */

const EVENT = 'e5b1c0de-1111-4a2b-8c3d-0123456789ab';

test('a single link gives the whole id, not its first character', () => {
  assert.equal(sessionSubEventId({ subEvent: EVENT }), EVENT);
  assert.equal(sessionSubEventId({ subEvent: EVENT }).length, 36);
  assert.notEqual(sessionSubEventId({ subEvent: EVENT }), 'e');
});

test('an array link gives its first entry', () => {
  assert.equal(sessionSubEventId({ subEvent: [EVENT, 'ffffffff-2222-4a2b-8c3d-0123456789ab'] }), EVENT);
});

test('a session with no event says so instead of inventing one', () => {
  assert.equal(sessionSubEventId({ subEvent: '' }), '');
  assert.equal(sessionSubEventId({ subEvent: [] }), '');
  assert.equal(sessionSubEventId({ subEvent: null }), '');
  assert.equal(sessionSubEventId({}), '');
  assert.equal(sessionSubEventId(undefined), '');
});

test('approving a QR sign-in reads the event id through that helper', () => {
  const src = readFileSync(new URL('../src/api/presenceDecision.ts', import.meta.url), 'utf8');
  assert.match(src, /const sessionSub = sessionSubEventId\(session\);/, 'presenceDecision must use the shared helper');
  assert.doesNotMatch(src, /subEvent\?\.\[0\]/, 'subEvent?.[0] is the bug: it indexes a string');
});
