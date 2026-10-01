/**
 * The field that stops a word being misused. It is the reason this app is not
 * a dictionary, so it is the one thing on an answer that carries red.
 *
 * On the sky it is a white card with a tinted header strip. Inside another card
 * it drops the shadow and becomes a tinted panel, so it never reads as a card
 * inside a card.
 */
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Caution({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'paper lift overflow-hidden rounded-xl bg-card',
        'in-data-[slot=card]:rounded-md in-data-[slot=card]:bg-muted',
        className
      )}
    >
      <p className="flex items-center gap-2 bg-muted px-4 pt-3 pb-2 text-small leading-none font-semibold text-destructive in-data-[slot=card]:pb-0">
        <TriangleAlert className="size-4" />
        Careful
      </p>
      <p className="px-4 pt-2 pb-4">{children}</p>
    </div>
  );
}
