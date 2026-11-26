import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

/**
 * The Nov 2026 audit: one pass over the things that were exposed, the things
 * that looked wrong on a light theme, and the small papercuts people hit every
 * day. These are source checks, in the style of the other suites, because most
 * of them are about a header or a string being present rather than behaviour
 * that is easy to exercise without a browser.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const index = read('server/index.ts');
const server = read('src/lib/server.ts');
const stage = read('src/lib/stageVideo.ts');
const schema = read('server/db/schema.sql');
const mcp = read('server/mcp.ts');
const theme = read('src/lib/theme.ts');
const shell = read('public/sw.js');

test('every response carries the baseline security headers', () => {
  assert.match(index, /X-Content-Type-Options', 'nosniff/);
  assert.match(index, /X-Frame-Options', 'SAMEORIGIN/);
  assert.match(index, /Referrer-Policy', 'strict-origin-when-cross-origin/);
  // The stage camera needs its own permission; nothing else does.
  assert.match(index, /camera=\(self\), microphone=\(self\), geolocation=\(\), payment=\(\)/);
  assert.match(index, /Cross-Origin-Opener-Policy', 'same-origin'/);
  // HSTS only makes sense over https, so it is conditional on APP_URL.
  assert.match(index, /Strict-Transport-Security/);
  assert.match(index, /APP_URL[\s\S]{0,20}startsWith\('https:\/\/'\)[\s\S]{0,80}Strict-Transport-Security/);
});

test('a failed database check does not name the database to the internet', () => {
  assert.match(index, /error: 'Database unavailable'/);
  assert.ok(!/error: e\?\.message/.test(index), 'healthz must not pass the driver message out');
});

test('the feed address is compared in constant time', () => {
  assert.match(index, /timingSafeEqual/);
  assert.match(index, /createHash\('sha256'\)/);
});

test('the audio deck token is not compared with ===, and a default is warned about', () => {
  assert.match(server, /timingSafeEqual/);
  assert.match(server, /warnAboutDefaultDeckToken/);
  assert.match(index, /warnAboutDefaultDeckToken\(\)/);
});

test('relayed frames only exist while a camera is filming', () => {
  assert.match(stage, /String\(existing\.role \?\? ''\) !== 'camera' \|\| !existing\.sharing/);
  assert.match(stage, /String\(row\.role \?\? ''\) !== 'camera' \|\| !row\.sharing/);
  assert.match(stage, /FramePutResult/);
  assert.match(stage, /FRAME_TTL_MS = 8_000/);
  const put = read('src/api/stageFramePut.ts');
  assert.match(put, /allow\(`frame:\$\{input\.deviceKey\}`, 12, 1_000\)/);
  assert.match(put, /allow\(`framemin:\$\{input\.deviceKey\}`, 300, 60_000\)/);
  assert.match(put, /not filming/);
});

test('pictures cannot be uploaded without limit, and are kept out of search', () => {
  assert.match(index, /UPLOAD_PER_MINUTE/);
  assert.match(index, /allow\(`upload:\$\{owner\}`, UPLOAD_PER_MINUTE, 60 \* 1000\)/);
  assert.match(index, /X-Robots-Tag', 'noindex, nofollow'/);
});

test('crawlers are told to stay out of the app and the pictures', () => {
  assert.match(index, /app\.get\('\/robots\.txt'/);
  assert.match(index, /Disallow: \/api\//);
  assert.match(index, /Allow: \//);
});

test('identity endpoints are never cached', () => {
  assert.match(index, /app\.get\('\/api\/actAs'[\s\S]{0,400}Cache-Control', 'no-store'/);
  assert.match(index, /app\.get\('\/api\/auth\/session'[\s\S]{0,400}Cache-Control', 'no-store'/);
});

test('a wrong admin PIN is a refusal, not a server fault', () => {
  const unlocks = read('src/api/liveShowUnlockAdmin.ts');
  for (const file of ['liveShowUnlockAdmin', 'liveShowChat', 'liveShowClearChat', 'stageVideoShare', 'enableLiveShowDevice']) {
    const src = read(`src/api/${file}.ts`);
    assert.ok(!/throw new Error\(/.test(src), `${file} should throw ZiteError so the status is right`);
  }
  assert.match(unlocks, /ZiteError\('Those admin details are not right\.', 'FORBIDDEN'\)/);
});

test('an agent reply is signed with the agent name, not the admin behind the key', () => {
  assert.match(schema, /"authorName"\s+text NOT NULL DEFAULT ''/);
  assert.match(schema, /ALTER TABLE "SupportReplies" ADD COLUMN IF NOT EXISTS "authorName"/);
  const reply = read('src/api/adminReplyTicket.ts');
  assert.match(reply, /authorName: adminName/);
  const get = read('src/api/adminGetTicket.ts');
  assert.match(get, /signed \|\| nameOf\.get\(authorId\)/);
});

test('the show countdown does not say "0 days to go" on the day', () => {
  const home = read('src/pages/Home.tsx');
  assert.match(home, /countdown!\.days === 0 \? 'Today' : countdown!\.days/);
});

test('the crash screen follows the theme and reads like English', () => {
  const main = read('src/main.tsx');
  assert.ok(!main.includes('bg-white'), 'the crash card must not assume light mode');
  assert.match(main, /bg-card/);
  assert.match(main, /This screen broke/);
  assert.match(main, /Reload the page/);
});

test('a shared link previews with a title and a picture', () => {
  const html = read('index.html');
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:image" content="https:\/\/ashtec\.dino\.icu\/og\.png"/);
  assert.match(html, /name="twitter:card"/);
  assert.ok(existsSync(new URL('../public/og.png', import.meta.url)), 'the preview picture should be committed');
});

test('the browser chrome colour follows the page background', () => {
  assert.match(theme, /syncThemeColor/);
  assert.match(theme, /name="theme-color"/);
  assert.match(theme, /--background/);
});

test('a stage screen poll does not fetch every last picture from the database', () => {
  assert.match(stage, /SELECT "deviceKey", "name", "role", "sharing", "watching", "lastSeenAt" FROM "StageVideo"/);
  assert.ok(!/stageVideo\.findAll/.test(stage), 'the peer list should not select the frame column');
});

test('devices that never said goodbye are swept up', () => {
  assert.match(stage, /sweepVideoPeers/);
  assert.match(stage, /DELETE FROM "StageVideo" WHERE "lastSeenAt" < \$1/);
  assert.match(read('src/api/stageVideoState.ts'), /sweepVideoPeers\(\)/);
});

test('MCP can check the server and hand out the feed address', () => {
  assert.match(mcp, /name: 'server_health'/);
  assert.match(mcp, /uptimeMinutes/);
  assert.match(mcp, /name: 'feed_key'/);
  assert.match(mcp, /rotateFeedKey\(\)/);
});

test('the support queue can be paged instead of cut at fifty', () => {
  assert.match(mcp, /const limit = Math\.min\(200/);
  assert.match(mcp, /moreAfterThisPage/);
});

test('a stalled network opens the cached app instead of spinning for ever', () => {
  assert.match(shell, /NAV_TIMEOUT_MS = 4000/);
  assert.match(shell, /Promise\.race/);
  // A cached update manifest would tell people they are up to date when they are not.
  assert.match(shell, /if \(url\.pathname\.startsWith\('\/downloads\/'\)\) return;/);
});
