import { MASCOT, costumeById, costumePlacement } from '../lib/mascot';

/**
 * Tickets 10017d4f ("Cat avatars") and d46defd1 ("cat costumes").
 *
 * The cat is one picture, so a costume is an emoji dropped on the right part of
 * it: a hat sits on the head, shades across the eyes, a vest over the body and
 * the bat behind. That way every costume in the shop works at every size the cat
 * appears at, and nothing had to be drawn.
 */
export function CatCostume({ equipped, box }: { equipped: string; box: number }) {
  const costume = costumeById(equipped);
  if (!costume) return null;
  return (
    <span aria-hidden style={costumePlacement(costume, box)}>
      {costume.emoji}
    </span>
  );
}

export default function CatWithCostume({
  equipped,
  box = 128,
  alt,
  className = '',
  style,
}: {
  equipped: string;
  box?: number;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className="relative inline-block" style={{ width: box, height: box, ...style }}>
      <img
        src={MASCOT.image}
        alt={alt ?? 'The crew cat'}
        draggable={false}
        width={box}
        height={box}
        className={className}
      />
      <CatCostume equipped={equipped} box={box} />
    </span>
  );
}
