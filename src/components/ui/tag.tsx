import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A label that says what kind of thing something is. It is made of the same
 * parts as the glass outline button and badge, so it belongs on the sky and on
 * a card without a palette of its own: a quiet glass tile with a small dot of
 * the painting's colour (gold leaf, green leaf, cloud shadow) beside the name.
 *
 * Given `onClick` it becomes a toggle. Selecting it fills the tile like the
 * primary button, white on the sky and blue on a card, and swaps the dot for a
 * check, so the state is never carried by colour alone.
 */
const tagVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-md border-2 font-medium whitespace-nowrap backdrop-blur-xl transition-[background-color,border-color,color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
  {
    variants: {
      // A tone sets one value: the colour of the dot.
      tone: {
        general: '[--tag:var(--tag-general)]',
        business: '[--tag:var(--tag-business)]',
        tech: '[--tag:var(--tag-tech)]',
        // Not a topic: the "all of them" choice. It has no colour to show.
        any: '[--tag:transparent]',
      },
      size: {
        default: 'h-9 px-3 text-small leading-none',
        sm: 'h-6 px-2 text-caption leading-none',
      },
    },
    defaultVariants: { tone: 'any', size: 'default' },
  }
);

const idle = 'border-input bg-secondary text-secondary-foreground';
const chosen = 'border-transparent bg-primary text-primary-foreground';

const interactive =
  'relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-0.5 active:scale-[0.96] motion-reduce:active:scale-100 outline-none focus-visible:ring-4 focus-visible:ring-ring/40';

type TagProps = Omit<React.ComponentProps<'span'>, 'onClick'> &
  VariantProps<typeof tagVariants> & {
    selected?: boolean;
    /** Makes the tag a toggle. */
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  };

function Tag({ tone, size, selected = false, onClick, className, children, ...props }: TagProps) {
  const classes = cn(
    tagVariants({ tone, size }),
    selected ? chosen : idle,
    onClick && interactive,
    onClick && !selected && 'hover:bg-accent',
    className
  );
  const mark = selected ? (
    <Check className="size-3.5 shrink-0" strokeWidth={3} aria-hidden />
  ) : tone === 'any' || !tone ? null : (
    <span className={cn('shrink-0 rounded-full bg-[var(--tag)]', size === 'sm' ? 'size-1.5' : 'size-2')} aria-hidden />
  );

  if (onClick) {
    return (
      <button
        type="button"
        data-slot="tag"
        aria-pressed={selected}
        className={classes}
        onClick={onClick}
        {...(props as React.ComponentProps<'button'>)}
      >
        {mark}
        {children}
      </button>
    );
  }
  return (
    <span data-slot="tag" className={classes} {...props}>
      {mark}
      {children}
    </span>
  );
}

export { Tag, tagVariants };
