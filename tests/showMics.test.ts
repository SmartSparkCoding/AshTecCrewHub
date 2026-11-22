// Mic list and cast switching (ticket c4a2b6f0).
//
// Two casts share the same box of radio packs, so a mic row belongs to a cast
// as well as a show. The point of these tests is that the stage board, the show
// workspace and the show panel all read the same cast answer, and that nothing
// can quietly write a row belonging to another show.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const saveMic = read('src/api/saveMic.ts');
const setMicCast = read('src/api/setMicCast.ts');
const workspace = read('src/api/getShowWorkspace.ts');
const liveShow = read('src/api/getLiveShowState.ts');
const adminLive = read('src/api/adminGetLiveShow.ts');
const dash = read('src/pages/live/LiveShowDash.tsx');
const admin = read('src/pages/admin/LiveShowAdmin.tsx');
const page = read('src/pages/ShowWorkspace.tsx');
const schema = read('server/db/schema.sql');
const db = read('server/db/index.ts');
const lib = read('src/lib/liveShow.ts');

test('the mic list has a table, an index, and cast columns on the show', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "ShowMics" \(/);
  assert.match(schema, /"ShowMics_show_idx" ON "ShowMics" \("show"\)/);
  assert.match(schema, /ALTER TABLE "Shows" ADD COLUMN IF NOT EXISTS "castAName"/);
  assert.match(schema, /ALTER TABLE "Shows" ADD COLUMN IF NOT EXISTS "castBName"/);
  assert.match(schema, /ALTER TABLE "Shows" ADD COLUMN IF NOT EXISTS "micCast"/);
  assert.match(db, /showMics: \{ table: 'ShowMics', arr: \[\] \}/);
});

test('a mic row is never written onto another show', () => {
  assert.equal((saveMic.match(/That mic belongs to another show\./g) ?? []).length, 2);
  assert.match(saveMic, /requireShowAccess\(context\.user\.email, input\.showId\)/);
  assert.match(saveMic, /assertPermission\(me, 'show\.edit'\)/);
  assert.match(saveMic, /if \(!me\.isAdmin\) throw new Error\('Only admins can delete mic rows\.'\)/);
});

test('only an admin can change which cast is on', () => {
  assert.match(setMicCast, /await requireAdmin\(context\.user\.email\)/);
  assert.match(setMicCast, /record\.micCast = input\.cast/);
  assert.match(setMicCast, /castAName: String\(after\?\.castAName \?\? 'Cast X'\)/);
});

test('the stage board gets the mics for the cast that is on, and nothing else', () => {
  assert.match(lib, /export const loadMicList/);
  assert.match(lib, /const cast = show\?\.micCast === 'B' \? 'B' : 'A'/);
  assert.match(lib, /\.filter\(\(r\) => String\(r\.cast \?\? 'A'\) === cast\)/);
  // The board only needs three fields; notes stay behind.
  assert.match(lib, /character: String\(r\.character \?\? ''\), performer: String\(r\.performer \?\? ''\)/);
  assert.match(liveShow, /loadMicList\(liveShow\.showId\)/);
  assert.match(liveShow, /mics,\n/);
  // The hidden board must still show nothing extra.
  assert.match(liveShow, /if \(!device\?\.enabled\) \{/);
});

test('the show panel reads the same cast answer as the board', () => {
  assert.match(adminLive, /mics: await loadMicList\(input\.showId\)/);
  assert.match(admin, /setMicCast\(\{ showId, cast \}\)/);
  assert.match(admin, /Stage board is now on/);
});

test('the workspace list is filtered by cast and saves on blur', () => {
  assert.match(workspace, /zite\.showMics\.findAll\(\{ filters: \{ show: input\.showId \}, limit: 500 \}\)/);
  assert.match(workspace, /micCast: String\(show\.micCast \?\? 'A'\)/);
  assert.match(workspace, /castNames: \{ A: String\(show\.castAName \?\? 'Cast X'\), B: String\(show\.castBName \?\? 'Cast Z'\) \}/);
  assert.match(page, /\{tab === 'mics' && <Mics ws=\{ws\} act=\{act\} \/>\}/);
  assert.match(page, /const rows = ws\.mics\.filter\(\(m\) => m\.cast === cast\)/);
  assert.match(page, /saveMic\(\{ showId: ws\.show\.id, id: m\.id, number: v \}\)/);
});

test('the board does not offer a sign-in or chat control it cannot use', () => {
  // Mics are read-only on the stage board: a screen on a wall does not edit rows.
  const start = dash.indexOf('<Mic className="h-3.5 w-3.5"');
  assert.ok(start > 0, 'the board should have a mic panel');
  const panel = dash.slice(start, dash.indexOf('Crew channel', start));
  assert.ok(panel.length > 200, 'the panel slice should cover the whole block');
  assert.ok(!panel.includes('onClick'), 'the mic panel must be read-only');
});

test('the dashboards poll faster than they used to', () => {
  assert.match(dash, /\}, 1500\);/);
  assert.match(read('src/lib/livePresence.tsx'), /setInterval\(refresh, 4000\)/);
  assert.match(read('src/pages/Attendance.tsx'), /pending \? 2000 : 5000/);
  assert.match(read('src/pages/admin/AdminPresence.tsx'), /\}, 3000\);/);
});
