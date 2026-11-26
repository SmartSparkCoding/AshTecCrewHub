import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Tickets 10017d4f ("Cat avatars") and d46defd1 ("cat costumes"). Coins are
 * earned by being useful, never handed out, so the balance is worked out from
 * rows the app already writes; only what has been bought is stored.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const shop = read('src/lib/catShop.ts');
const schema = read('server/db/schema.sql');
const buy = read('src/api/buyCatCostume.ts');
const equip = read('src/api/equipCatCostume.ts');
const get = read('src/api/getCatShop.ts');
const mascot = read('src/lib/mascot.ts');
const page = read('src/pages/Mascot.tsx');
const companion = read('src/components/CatCompanion.tsx');
const db = read('server/db/index.ts');

test('only the wallet is stored, because coins are worked out', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS "CatWallets"/);
  assert.match(schema, /CatWallets_member_idx/);
  assert.match(db, /catWallets: \{ table: 'CatWallets'/);
  assert.ok(!/coins\s+(int|integer)/i.test(schema), 'a stored balance drifts; compute it');
});

test('helping out is what pays', () => {
  assert.match(shop, /ShowChecklistItems/);
  assert.match(shop, /ShowSignoffs/);
  assert.match(shop, /CueCalls/);
  assert.match(shop, /"ackedAt" IS NOT NULL/);
  assert.match(shop, /WELCOME_COINS/);
});

test('a costume cannot be bought without the coins', () => {
  assert.match(buy, /code: 'BAD_REQUEST'/);
  assert.match(buy, /Help out and come back/);
  // The price is read on the server, never trusted from the page.
  assert.ok(!buy.includes('price: z.number'), 'the client must not send the price');
});

test('a costume you do not own cannot be worn', () => {
  assert.match(equip, /You have not bought that one yet/);
  assert.match(get, /readWallet\(/);
});

test('every costume is priced, named and has a place on the cat', () => {
  const ids = [...mascot.matchAll(/id: '([a-z-]+)', name:/g)].map((m) => m[1]);
  assert.ok(ids.length >= 8, `expected a shop of costumes, found ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, 'two costumes share an id');
  for (const slot of ['behind', 'head', 'face', 'body']) {
    assert.match(mascot, new RegExp(`${slot}: \\{ size:`), `no placement for ${slot}`);
  }
  // Nothing copyrighted: the caped one is a bin bag bat, not Batman.
  assert.ok(!/batman|superman/i.test(mascot), 'keep the costumes out of trademark trouble');
});

test('the cat wears it in the corner and on its own page', () => {
  assert.match(page, /buyCatCostume/);
  assert.match(page, /Wardrobe/);
  assert.match(companion, /CatCostume/);
  assert.match(companion, /useCatWardrobe/);
});
