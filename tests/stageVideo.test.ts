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

test('the camera shares the mic deck slot, and the deck takes a tap to come back', () => {
  assert.match(dash, /function MicOrCamera/);
  assert.match(dash, /<MicOrCamera mics=\{mics\} video=\{video\} \/>/);
  assert.match(dash, /\{tab\('mics', 'Mics'/);
  assert.match(dash, /\{tab\('camera', 'Camera'/);
  assert.match(dash, /connecting…/);
  assert.match(dash, /srcObject = video\.remote/);
  // Switching back to the deck drops the connection instead of streaming on.
  assert.match(dash, /if \(next === 'mics' && video\.watching\) video\.setWatch\(''\)/);
  // A blocked autoplay must not leave a black rectangle on a stage screen.
  assert.match(dash, /el\.muted = true/);
});

test('pointing a screen at a camera needs no PIN, because filming is the guarded half', () => {
  assert.match(state, /watch: z\.string\(\)\.max\(120\)\.optional\(\)/);
  assert.ok(!state.includes('verifyAdminSecret'), 'watching is a display choice, not a camera going live');
  assert.match(share, /verifyAdminSecret/);
  assert.match(client, /setWatch/);
});

test('the camera page is share only and dims on purpose', () => {
  assert.match(app, /path="\/show-dash-video"/);
  assert.match(cam, /getUserMedia/);
  assert.match(cam, /The screen is dim on purpose/);
  // Starting a stream is the one thing it does, so there is no chat or control.
  assert.ok(!cam.includes('adminLiveShowControl'), 'the camera page must not drive the show');
});

test('a network that blocks peer-to-peer falls back to relayed frames', () => {
  // A school wifi with client isolation gives the browsers no candidate they can
  // reach, so the peer connection sits at "connecting" for ever and the wall
  // screen shows a black box. The camera also posts small JPEGs, and a screen
  // that gets no real video shows the newest one.
  const put = read('src/api/stageFramePut.ts');
  const get = read('src/api/stageFrameGet.ts');
  const lib = read('src/lib/stageVideo.ts');
  const videoSchema = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS "StageVideo"'));

  assert.match(videoSchema, /"frame"\s+text NOT NULL DEFAULT ''/);
  assert.match(videoSchema, /"frameAt"\s+timestamptz/);
  // Applied to a database that already has the table from the first release.
  assert.match(schema, /ALTER TABLE "StageVideo" ADD COLUMN IF NOT EXISTS "frame" text/);

  // The camera posts one frame at a time while it is filming, at a size that
  // fits through the same JSON body limit as everything else.
  assert.match(cam, /stageFramePut\(\{ deviceKey: key, frame: canvas\.toDataURL\('image\/jpeg', 0\.5\) \}\)/);
  assert.match(cam, /canvas\.width = 480/);
  assert.match(cam, /url\(\)|setTimeout\(tick, 400\)/);
  // Nothing is written to disk, and the frame has to really be a JPEG.
  assert.match(put, /\^data:image\\\/jpeg;base64,/);
  assert.match(get, /readFrame\(input\.deviceKey\)/);
  // An old frame is worse than no frame: the camera has stopped posting.
  assert.match(lib, /FRAME_TTL_MS = 8_000/);
  assert.match(lib, /ageMs > FRAME_TTL_MS/);
  // The screen tries real video first, then the relay, and says which it is on.
  assert.match(dash, /const r = await stageFrameGet\(\{ deviceKey: video\.watching \}\)/);
  assert.match(dash, /timer = window\.setTimeout\(tick, 2000\)/);
  assert.match(dash, /\{snap && <img src=\{snap\}/);
  assert.match(dash, />\s*\n?\s*relay\s*\n?\s*<\/span>/);
});
