import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Ticket 7e928a80 ("A live stream"). Source checks for the stage video: nothing
 * streams without an admin and their cat PIN, the handshake rows are the only
 * thing the server carries, and the stage board is the side that offers.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const schema = read('server/db/schema.sql');
const share = read('src/api/stageVideoShare.ts');
const state = read('src/api/stageVideoState.ts');
const signal = read('src/api/stageVideoSignal.ts');
const client = read('src/lib/stageVideoClient.ts');
const dash = read('src/pages/live/LiveShowDash.tsx');
const cam = read('src/pages/live/ShowDashVideo.tsx');
const db = read('server/db/index.ts');
const app = read('src/App.tsx');

test('the video tables exist and are registered', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "StageVideo"/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "StageSignals"/);
  assert.match(schema, /StageVideo_device_idx/);
  assert.match(db, /stageVideo: \{ table: 'StageVideo'/);
  assert.match(db, /stageSignals: \{ table: 'StageSignals'/);
});

test('sharing needs an admin account and their cat PIN', () => {
  assert.match(share, /verifyAdminSecret\(/);
  assert.match(share, /if \(!member\?\.isAdmin \|\| !\(await verifyAdminSecret\(email, input\.pin\)\)\)/);
  assert.match(share, /code: 'FORBIDDEN'/);
  // No session or token is minted: the PIN is checked on every change.
  assert.ok(!share.includes('AuthSessions'), 'the PIN must not mint a session');
});

test('a screen cannot handshake with itself', () => {
  assert.match(signal, /A screen cannot handshake with itself/);
  assert.match(signal, /kind: z\.enum\(\['offer', 'answer', 'ice'\]\)/);
});

test('the server only carries the handshake, never the picture', () => {
  // The payload is opaque: nothing server-side parses or stores video.
  assert.match(signal, /stageSignals\.create/);
  assert.ok(!/getUserMedia|MediaStream|RTCPeerConnection/.test(signal + share + state));
  assert.match(client, /export const POLL_MS = 700/);
});

test('the viewer offers and the camera answers', () => {
  assert.match(client, /addTransceiver\('video', \{ direction: 'recvonly' \}\)/);
  assert.match(client, /if \(sig\.kind === 'offer'\)/);
  assert.match(client, /await send\(from, 'answer', answer\)/);
});

test('the stage board shows what a camera sends, and can stop', () => {
  assert.match(dash, /Stop watching/);
  assert.match(dash, /connecting…/);
  assert.match(dash, /srcObject = video\.remote/);
  // A blocked autoplay must not leave a black rectangle on a stage screen.
  assert.match(dash, /el\.muted = true/);
});

test('the camera page is share only and dims on purpose', () => {
  assert.match(app, /path="\/show-dash-video"/);
  assert.match(cam, /getUserMedia/);
  assert.match(cam, /The screen is dim on purpose/);
  // Starting a stream is the one thing it does, so there is no chat or control.
  assert.ok(!cam.includes('adminLiveShowControl'), 'the camera page must not drive the show');
});
