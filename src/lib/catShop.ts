import { zite } from '#db';
import { COSTUMES, costumeById, type Costume } from './mascot';

/**
 * Tickets 10017d4f ("Cat avatars") and d46defd1 ("cat costumes").
 *
 * H's ticket says the coins come from being helpful, so they are not a number we
 * hand out: they are counted from things the crew hub already records. J So's
 * ticket wants the costumes to be wearable, so the wallet remembers what you own
 * and what the cat has on.
 *
 * Balance = welcome coins + everything earned - the price of what you own. That
 * way a coin can never be conjured by editing a row, and an old wallet with no
 * history still adds up correctly.
 */

/** Coins every member gets, so the shop is usable on day one. */
export const WELCOME_COINS = 10;

/**
 * What earns coins. Each one is a real action already recorded elsewhere in the
 * app, so "helpful" means something you actually did, not something you clicked.
 */
export const COIN_RULES = [
  { key: 'checklist', coins: 5, label: 'A show checklist item you ticked off' },
  { key: 'signoff', coins: 2, label: 'A show night you signed off' },
  { key: 'cuecall', coins: 2, label: 'A cue call you answered' },
] as const;

export type CoinBreakdown = { checklist: number; signoff: number; cuecall: number };

/** The raw counts, straight from the tables that record the helpful things. */
export async function helpfulCounts(memberId: string): Promise<CoinBreakdown> {
  const { rows } = await zite.sql({
    query: `SELECT
      (SELECT count(*) FROM "ShowChecklistItems" WHERE "doneBy" = $1::uuid)::int AS "checklist",
      (SELECT count(*) FROM "ShowSignoffs" WHERE "member" = $1::uuid)::int AS "signoff",
      (SELECT count(*) FROM "CueCalls" WHERE "member" = $1::uuid AND "ackedAt" IS NOT NULL)::int AS "cuecall"`,
    params: [memberId],
  });
  const row = (rows[0] ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { checklist: n(row.checklist), signoff: n(row.signoff), cuecall: n(row.cuecall) };
}

export const coinsFor = (c: CoinBreakdown) =>
  COIN_RULES.reduce((sum, rule) => sum + (c[rule.key] ?? 0) * rule.coins, 0);

/** What a list of owned costume ids cost. Unknown ids are ignored, not charged. */
export const spentOn = (owned: string[]) =>
  owned.reduce((sum, id) => sum + (costumeById(id)?.price ?? 0), 0);

export type Wallet = {
  coins: number;
  earned: number;
  spent: number;
  owned: string[];
  equipped: string;
  costumes: Costume[];
  counts: CoinBreakdown;
};

const knownOwned = (raw: unknown): string[] => {
  const list = Array.isArray(raw) ? raw.map(String) : [];
  return [...new Set(list)].filter((id) => !!costumeById(id));
};

/** The member's wallet row, created on first look so a purchase has somewhere to go. */
export async function walletRow(memberId: string) {
  const existing = await zite.catWallets.findOne({ filters: { member: memberId } }).catch(() => null);
  if (existing) return existing;
  return zite.catWallets.create({ record: { member: memberId, owned: [], equipped: '' } });
}

export async function readWallet(memberId: string): Promise<Wallet> {
  const [row, counts] = await Promise.all([walletRow(memberId), helpfulCounts(memberId)]);
  const owned = knownOwned(row.owned);
  const equipped = owned.includes(String(row.equipped ?? '')) ? String(row.equipped) : '';
  const earned = WELCOME_COINS + coinsFor(counts);
  const spent = spentOn(owned);
  return {
    coins: Math.max(0, earned - spent),
    earned,
    spent,
    owned,
    equipped,
    costumes: COSTUMES,
    counts,
  };
}
