import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import { MASCOT } from '../lib/mascot';
import { useAppSettings } from '../lib/appSettings';
import { playSfx } from '../lib/sfx';

/**
 * Ticket f3260834: a snack on the cat's page that you can drag onto the cat. It
 * gets eaten, the cat says "yummy", and a fresh one turns up a moment later.
 * Tapping a snack feeds the cat too, so it also works from the keyboard.
 */

type Snack = { id: string; label: string; emoji: string };

// Lucide has no burger, and emoji read better for food anyway.
const SNACKS: Snack[] = [
  { id: 'burger', label: 'burger', emoji: '🍔' },
  { id: 'steak', label: 'steak', emoji: '🥩' },
];

/** Prefer where the pointer is, fall back to rectangles for keyboard drags. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

export default function FeedTheCat() {
  const { catName } = useAppSettings();
  const [eaten, setEaten] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [yummy, setYummy] = useState(false);
  const timers = useRef<number[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const feed = (id: string) => {
    setEaten((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setYummy(true);
    playSfx('success');
    later(() => setYummy(false), 1800);
    later(() => setEaten((prev) => prev.filter((x) => x !== id)), 1500);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (e.over && e.over.id === 'cat') feed(String(e.active.id));
  };

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id));

  const draggingSnack = SNACKS.find((s) => s.id === dragging) ?? null;

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <section className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 className="min-w-0 font-semibold">Feed {catName}</h2>
          <p className="text-sm text-muted-foreground">Drag a snack onto the cat</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          <CatTarget label={catName} hungry={!!dragging && !eaten.includes(dragging)} yummy={yummy} />

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <AnimatePresence initial={false}>
              {SNACKS.filter((s) => !eaten.includes(s.id)).map((snack) => (
                <SnackChip key={snack.id} snack={snack} onFeed={() => feed(snack.id)} />
              ))}
            </AnimatePresence>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {yummy ? `${catName} says: yummy.` : 'Tap a snack instead of dragging if you like.'}
            </p>
          </div>
        </div>
      </section>

      <DragOverlay dropAnimation={null}>
        {draggingSnack && (
          <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-lg">
            <span className="text-xl leading-none" aria-hidden>{draggingSnack.emoji}</span>
            <span className="text-sm font-medium capitalize">{draggingSnack.label}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function CatTarget({ label, hungry, yummy }: { label: string; hungry: boolean; yummy: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'cat' });

  return (
    <div ref={setNodeRef} className="relative flex h-32 w-32 shrink-0 items-center justify-center">
      <div
        className={`absolute inset-0 rounded-full border-2 border-dashed transition-colors ${
          isOver || hungry ? 'border-primary bg-primary/10' : 'border-transparent'
        }`}
        aria-hidden
      />
      <motion.img
        src={MASCOT.image}
        alt={label}
        draggable={false}
        className={`relative h-24 w-24 drop-shadow ${isOver ? 'scale-105' : ''}`}
        animate={yummy ? { scale: [1, 1.12, 0.96, 1.04, 1], rotate: [0, -4, 4, 0] } : { y: [0, -4, 0] }}
        transition={yummy ? { duration: 0.9 } : { repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
      />
      <AnimatePresence>
        {yummy && (
          <motion.span
            initial={{ opacity: 0, y: 8, scale: 0.8 }}
            animate={{ opacity: 1, y: -6, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.9 }}
            className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground shadow"
          >
            yummy
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function SnackChip({ snack, onFeed }: { snack: Snack; onFeed: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: snack.id });

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6 }}
      ref={setNodeRef}
      onClick={onFeed}
      style={{
        touchAction: 'none',
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className="flex cursor-grab items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-medium capitalize shadow-sm hover:border-primary/60 active:cursor-grabbing"
      aria-label={`Feed ${snack.label}`}
      {...listeners}
      {...attributes}
    >
      <span className="text-xl leading-none" aria-hidden>{snack.emoji}</span>
      {snack.label}
    </motion.button>
  );
}
