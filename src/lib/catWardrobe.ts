import { useEffect, useState } from 'react';
import { getCatShop, type GetCatShopOutputType } from '#api';

/**
 * Tickets 10017d4f ("Cat avatars") and d46defd1 ("cat costumes").
 *
 * Two places draw the cat (the corner companion on every page, and the cat's own
 * page) and the shop changes what it is wearing, so the answer is fetched once
 * per visit and shared: buy a hat in the shop and the cat in the corner has it
 * on before the next poll.
 */
export type CatShop = GetCatShopOutputType;
export type CatWardrobe = CatShop & { costumes: CatShop['costumes'] };

let cache: CatShop | null = null;
let inflight: Promise<CatShop | null> | null = null;
const listeners = new Set<(shop: CatShop | null) => void>();

function announce(shop: CatShop | null) {
  cache = shop;
  listeners.forEach((fn) => fn(shop));
}

/** Fetch once per visit; a second caller joins the request already in the air. */
export async function loadWardrobe(force = false): Promise<CatShop | null> {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;
  inflight = getCatShop({})
    .then((shop) => {
      announce(shop);
      return shop;
    })
    .catch(() => cache)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Called after a purchase or a change so every cat on screen catches up. */
export function setWardrobe(shop: CatShop) {
  announce(shop);
}

/**
 * The cat on screen: the shop if it has loaded, otherwise a cat with no hat. It
 * is deliberately quiet about failures, because a missing costume should never
 * be the reason a page looks broken.
 */
export function useCatWardrobe() {
  const [shop, setShop] = useState<CatShop | null>(cache);

  useEffect(() => {
    let alive = true;
    listeners.add(setShop);
    if (cache) setShop(cache);
    else void loadWardrobe().then((next) => { if (alive) setShop(next); });
    return () => {
      alive = false;
      listeners.delete(setShop);
    };
  }, []);

  return { shop, equipped: shop?.equipped ?? '', refresh: () => loadWardrobe(true) };
}
