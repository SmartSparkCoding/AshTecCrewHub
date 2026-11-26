import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { MASCOT } from '../lib/mascot';
import { useAppSettings } from '../lib/appSettings';
import { useCatHidden } from '../lib/uiPrefs';
import { playSfx } from '../lib/sfx';
import { useCatWardrobe, setWardrobe } from '../lib/catWardrobe';
import CatWithCostume from '../components/CatCostume';
import { buyCatCostume, equipCatCostume } from '#api';
import { Button } from '@project/components/ui/button';
import { Switch } from '@project/components/ui/switch';
import { Cat, Coins, MessageCircle, Sparkles } from 'lucide-react';

/**
 * The crew mascot's page (Batch 8): who Tabby is, and why there is a cat in the
 * lighting box. Also where you turn the floating cat on or off and ask it to say
 * something.
 */
export default function Mascot() {
  const reduceMotion = useReducedMotion();
  const [hidden, setHidden] = useCatHidden();
  const { catName } = useAppSettings();
  const [line, setLine] = useState(MASCOT.line());
  /** Tickets 10017d4f / d46defd1: the shop, the coins and what the cat is wearing. */
  const { shop, equipped } = useCatWardrobe();
  const [busy, setBusy] = useState<string | null>(null);

  async function buy(id: string, name: string, price: number) {
    setBusy(id);
    try {
      const next = await buyCatCostume({ id });
      if (shop) setWardrobe({ ...shop, equipped: next.equipped, coins: next.coins, owned: next.owned });
      toast.success(`${name} is on the cat`, { description: `${price} coins spent. Help out to earn them back.` });
      playSfx('pop');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function wear(id: string) {
    setBusy(id || 'off');
    try {
      const next = await equipCatCostume({ id });
      if (shop) setWardrobe({ ...shop, equipped: next.equipped, coins: next.coins });
      toast.success(id ? 'Costume on' : 'Costume off');
      playSfx('pop');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 hc-stagger">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border bg-card p-8 text-center">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: 'radial-gradient(600px 240px at 50% -10%, rgba(236,55,80,0.18), transparent 70%)' }} />
        <div className="relative">
          <motion.div
            className="mx-auto w-fit drop-shadow-xl"
            animate={reduceMotion ? undefined : { y: [0, -6, 0], rotate: [-2, 2, -2] }}
            transition={{ repeat: reduceMotion ? 0 : Infinity, duration: 4.5, ease: 'easeInOut' }}
          >
            <CatWithCostume equipped={equipped} box={128} alt={catName} />
          </motion.div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">{catName}</h1>
          <p className="mt-1 text-sm font-medium uppercase tracking-wider text-primary">{MASCOT.role}</p>
          <p className="mt-3 text-lg text-muted-foreground">{MASCOT.tagline}</p>
        </div>
      </div>

      {/* Backstory */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Cat className="h-5 w-5 text-primary" />Backstory</h2>
        <div className="space-y-3 rounded-2xl border bg-card p-5 text-sm leading-relaxed">
          {MASCOT.backstory.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </section>

      {/* The cat says */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><MessageCircle className="h-5 w-5 text-primary" />The cat says</h2>
        <div className="rounded-2xl border bg-card p-6 text-center">
          <p className="min-h-[2.5rem] text-lg italic">{line}</p>
          <Button className="mt-4" onClick={() => { setLine(MASCOT.line()); playSfx('pop'); }}>
            <Sparkles className="mr-1.5 h-4 w-4" />Ask the cat
          </Button>
        </div>
      </section>

      {/*
        Tickets 10017d4f (H Balachandran) and d46defd1 (J So): a shop where
        coins earned by being helpful buy the cat something to wear. Two tickets
        about the same cat, so one page: the shop is here, next to the cat it
        dresses.
      */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Coins className="h-5 w-5 text-primary" />
            Wardrobe
          </h2>
          <p className="rounded-full border bg-card px-3 py-1 font-mono text-sm font-semibold tabular-nums">
            {shop ? `${shop.coins} coins` : 'counting coins…'}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Coins come from being useful, not from asking: 5 for a checklist item you tick off, 2 for a show night
            you sign off, 2 for a cue call you answer. Everything you buy stays yours.
          </p>
          {shop ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Earned {shop.earned} · spent {shop.spent} · checklist {shop.counts.checklist}, sign-offs{' '}
              {shop.counts.signoff}, cue calls {shop.counts.cuecall}
            </p>
          ) : null}
          {shop && shop.equipped ? (
            <Button variant="outline" size="sm" className="mt-3" disabled={busy !== null} onClick={() => wear('')}>
              Take it off
            </Button>
          ) : null}
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {(shop?.costumes ?? []).map((c) => {
              const owned = shop?.owned.includes(c.id) ?? false;
              const on = shop?.equipped === c.id;
              const short = shop ? shop.coins < c.price : false;
              return (
                <li
                  key={c.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${on ? 'border-primary bg-primary/10' : ''}`}
                >
                  <span className="text-2xl leading-none" aria-hidden>{c.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.blurb}</span>
                  </span>
                  {owned ? (
                    <Button
                      size="sm"
                      variant={on ? 'secondary' : 'outline'}
                      disabled={busy !== null || on}
                      onClick={() => wear(c.id)}
                    >
                      {on ? 'On' : 'Wear'}
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy !== null || short} onClick={() => buy(c.id, c.name, c.price)}>
                      {c.price} coins
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Character sheet */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Character sheet</h2>
        <dl className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2">
          {MASCOT.facts.map((f) => (
            <div key={f.label} className="bg-card p-4">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">{f.label}</dt>
              <dd className="mt-1 text-sm font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Companion toggle */}
      <section className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-5">
        <div>
          <h3 className="font-semibold">Roaming the app</h3>
          <p className="text-sm text-muted-foreground">Show {catName} in the corner of every page. It is per device, so a shared computer need not have a cat. There is food next to it on desktop: drag it over, or click it, and {catName} eats it.</p>
        </div>
        <Switch checked={!hidden} onCheckedChange={(on) => { setHidden(!on); playSfx('pop'); }} aria-label="Show the cat on every page" />
      </section>
    </div>
  );
}
