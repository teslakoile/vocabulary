import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A label that says what kind of thing something is. It is not a button, so it
 * does not look like one: a tinted tile with a coloured dot, where a button is
 * a solid or glass bar with a heavier edge.
 *
 * Given `onClick` it becomes a toggle. Selecting it fills the tile with its
 * colour and swaps the dot for a check, so the state is never carried by colour
 * alone.
 */
const tagVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-2 rounded-md font-semibold whitespace-nowrap transition-[background-color,color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
  {
    variants: {
      // Each tone sets five values: its colour, the text on that colour, and the
      // tile, its hover and its text when not selected. A topic's tile is a pale
      // wash of its colour, because a tint of amber over blue goes grey.
      tone: {
        general:
          '[--tag:var(--tag-general)] [--tag-on:var(--ink)] [--tag-idle:color-mix(in_oklch,var(--tag-general)_46%,white)] [--tag-idle-hover:color-mix(in_oklch,var(--tag-general)_66%,white)] [--tag-idle-ink:var(--ink)]',
        business:
          '[--tag:var(--tag-business)] [--tag-on:var(--ink)] [--tag-idle:color-mix(in_oklch,var(--tag-business)_46%,white)] [--tag-idle-hover:color-mix(in_oklch,var(--tag-business)_66%,white)] [--tag-idle-ink:var(--ink)]',
        tech:
          '[--tag:var(--tag-tech)] [--tag-on:var(--ink)] [--tag-idle:color-mix(in_oklch,var(--tag-tech)_46%,white)] [--tag-idle-hover:color-mix(in_oklch,var(--tag-tech)_66%,white)] [--tag-idle-ink:var(--ink)]',
        // Not a topic: the "all of them" choice. Glass on the sky and a pale
        // tint on a card, like the other quiet controls.
        any:
          '[--tag:var(--primary)] [--tag-on:var(--primary-foreground)] [--tag-idle:color-mix(in_oklch,var(--foreground)_20%,transparent)] [--tag-idle-hover:color-mix(in_oklch,var(--foreground)_32%,transparent)] [--tag-idle-ink:var(--foreground)]',
      },
      size: {
        default: 'h-8 px-3 text-small leading-none',
        sm: 'h-6 px-2 text-caption leading-none',
      },
    },
    defaultVariants: { tone: 'any', size: 'default' },
  }
);

const idle = 'bg-[var(--tag-idle)] text-[var(--tag-idle-ink)]';
const chosen = 'bg-[var(--tag)] text-[var(--tag-on)]';

const interactive =
  'relative cursor-pointer after:absolute after:inset-x-0 after:-inset-y-1 active:scale-[0.96] motion-reduce:active:scale-100 outline-none focus-visible:ring-4 focus-visible:ring-ring/40';

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
    onClick && !selected && 'hover:bg-[var(--tag-idle-hover)]',
    className
  );
  const mark = selected ? (
    <Check className="size-3.5 shrink-0" strokeWidth={3} aria-hidden />
  ) : (
    <span className="size-2 shrink-0 rounded-full bg-[var(--tag)]" aria-hidden />
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
      {size === 'sm' && !selected ? <span className="size-1.5 shrink-0 rounded-full bg-[var(--tag)]" aria-hidden /> : mark}
      {children}
    </span>
  );
}

export { Tag, tagVariants };
