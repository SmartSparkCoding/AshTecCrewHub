/**
 * The crew mascot (Batch 8): a name, a backstory and a voice.
 *
 * The cat that hosts the feedback forms had no name and no reason to be here.
 * Now it does. This is the single source of truth for the mascot's identity and
 * its lines, shared by the Mascot page, the floating CatCompanion, and (via the
 * same list) the feedback pages.
 */

export const MASCOT = {
  name: 'Tabby',
  role: 'Crew mascot',
  image: '/cat.png',
  tagline: 'Nine lives, all spent backstage.',
  /** A short backstory, told in the cat's voice. */
  backstory: [
    'I turned up during the first Tech Week and never left. Someone left a tuna sandwich in the lighting box and, well, that was that.',
    'Since then I have supervised every get-in, slept through every run-through, and inspected every coil of cable in the building. I have opinions about cable management. Strong ones.',
    'I do not carry a radio and I have never once been on a call sheet, but every show runs better when I am watching from the fly rail.',
  ],
  /** Facts, for a little character sheet. */
  facts: [
    { label: 'Lives left', value: 'Nine (allegedly)' },
    { label: 'Preferred department', value: 'Lighting (it is warm)' },
    { label: 'Favourite cue', value: 'Blackout, obviously' },
    { label: 'Least favourite', value: 'The sound of a dry ice machine' },
    { label: 'Years on the crew', value: 'Since before you were in Year 7' },
  ],
  /** Things the cat says. Keep them kind, dry and short. */
  lines: [
    'Meow. Pick away.',
    'I read every one of these. Every. One.',
    'No rush. I have nine lives.',
    '*taps the checkbox with a paw*',
    'Do it for the crew.',
    'Have you coiled that cable properly? I checked. You have not.',
    'The blackout is the best cue and I will not be taking questions.',
    'I have been asleep on the followspot since the interval.',
    'Turn the house lights down. I am about to make an entrance.',
    'Mic check. Meow. Meow. Thank you, sound desk.',
    'Someone has left a water bottle in the wings again. I have moved it.',
    'Being on book is easy. Being a cat is easier.',
    'That is a lovely gel frame. I shall sit on it.',
    'Five minutes to curtain. I have been ready since Tuesday.',
    'Do not forget to strike the set. Or do. I will watch.',
    'I have nine lives and eight of them were spent waiting for a cue.',
  ],
  /** A random line, handy for anywhere that just wants one. */
  line: () => MASCOT.lines[Math.floor(Math.random() * MASCOT.lines.length)],
} as const;

/**
 * Tickets 10017d4f (Cat avatars) and d46defd1 (cat costumes): a shop where coins
 * buy costumes for the crew cat, and the one you own can be worn.
 *
 * The cat itself is one picture, so a costume is an emoji worn on top of it in
 * a named slot. That keeps the shop honest: no artwork to commission, every
 * costume sits the same way on the floating cat and on the mascot page, and
 * adding one is a line of data rather than a design job.
 */
export type CostumeSlot = 'behind' | 'head' | 'face' | 'body';

export type Costume = {
  id: string;
  name: string;
  price: number;
  emoji: string;
  slot: CostumeSlot;
  blurb: string;
};

/**
 * Prices are low at the bottom on purpose: a new member starts with the welcome
 * coins and can afford the hi-vis on day one, and the good stuff is what you get
 * for ticking off the checklist and signing off show nights.
 */
export const COSTUMES: Costume[] = [
  { id: 'hi-vis', name: 'Hi-Vis Vest', price: 5, emoji: '🦺', slot: 'body', blurb: 'So nobody asks who the cat is in the wings.' },
  { id: 'helmet', name: "Rigger's Helmet", price: 10, emoji: '⛑️', slot: 'head', blurb: 'For bumps, drops and falling gel frames.' },
  { id: 'shades', name: 'Blackout Shades', price: 12, emoji: '🕶️', slot: 'face', blurb: 'A blackout is just a long blink.' },
  { id: 'cowboy', name: 'Wrangler Hat', price: 16, emoji: '🤠', slot: 'head', blurb: 'Wrangling cable like it is cattle.' },
  { id: 'tophat', name: 'Opening Night Top Hat', price: 20, emoji: '🎩', slot: 'head', blurb: 'Front of house, first night, no nerves.' },
  { id: 'bat', name: 'Bin Bag Bat', price: 22, emoji: '🦇', slot: 'behind', blurb: 'Two bin bags and a dream. Not affiliated with anyone.' },
  { id: 'pumpkin', name: 'Pumpkin Head', price: 25, emoji: '🎃', slot: 'head', blurb: 'For the Halloween social, and only then.' },
  { id: 'wizard', name: "Flyman's Wizard Hat", price: 30, emoji: '🧙', slot: 'head', blurb: 'For whoever makes the flying bars appear.' },
  { id: 'crown', name: 'Label-The-XLRs Crown', price: 40, emoji: '👑', slot: 'head', blurb: 'The highest honour the crew can give.' },
];

export const costumeById = (id: string | null | undefined): Costume | null =>
  COSTUMES.find((c) => c.id === id) ?? null;

/**
 * Where each slot sits on the cat picture, in percentages of the picture's own
 * size, so the costume stays on the head whether the cat is 128px on the mascot
 * page or 56px in the corner of the app.
 */
export const SLOT_PLACEMENT: Record<CostumeSlot, { size: number; top?: string; bottom?: string; left?: string; right?: string; opacity?: number }> = {
  behind: { size: 0.42, bottom: '2%', right: '-8%', opacity: 0.85 },
  head: { size: 0.44, top: '-9%', left: '50%' },
  face: { size: 0.3, top: '34%', left: '50%' },
  body: { size: 0.36, bottom: '-2%', left: '50%' },
};

/** Inline styles for the emoji on top of the cat, from the slot it belongs in. */
export function costumePlacement(costume: Costume | null, box: number): Record<string, string | number> {
  if (!costume) return { display: 'none' };
  const p = SLOT_PLACEMENT[costume.slot];
  return {
    position: 'absolute',
    fontSize: `${Math.max(10, Math.round(box * p.size))}px`,
    lineHeight: 1,
    userSelect: 'none',
    pointerEvents: 'none',
    ...(p.top ? { top: p.top } : {}),
    ...(p.bottom ? { bottom: p.bottom } : {}),
    ...(p.left ? { left: p.left, transform: 'translateX(-50%)' } : {}),
    ...(p.right ? { right: p.right } : {}),
    ...(p.opacity !== undefined ? { opacity: p.opacity } : {}),
    filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))',
  };
}
