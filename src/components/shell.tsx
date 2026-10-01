/**
 * The frame every screen sits in.
 *
 * One place owns the column width, the phone padding and the safe areas, so a
 * screen with short content cannot shrink-wrap and a long headword cannot push
 * the page sideways.
 */
import type * as React from 'react';
import sky from '@/assets/sky.webp';
import { cn } from '@/lib/utils';

export function Shell({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      className={cn(
        'mx-auto flex w-full max-w-[34rem] flex-1 flex-col gap-4 px-5 pt-[calc(1rem+var(--safe-top,env(safe-area-inset-top)))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
        className
      )}
      {...props}
    />
  );
}

/** Sticky and thin: it holds two taps and the app's name, nothing else. No
 *  rule under it, because the sky is the same above and below. */
export function TopBar({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 bg-sky/80 backdrop-blur-md',
        className
      )}
      {...props}
    />
  );
}

export function TopBarInner({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-[34rem] items-center justify-between gap-2 px-3 pt-[calc(0.25rem+env(safe-area-inset-top))] pb-1',
        className
      )}
      {...props}
    />
  );
}

/**
 * A headword, with break opportunities where they read best.
 *
 * Entries like scaffolding/harness/sandbox have no natural break, so on a phone
 * they either widened the page or broke mid-word. Breaking after the slash is
 * the one place a reader will not stumble.
 */
export function Headword({ children }: { children: string }) {
  const parts = children.split('/');
  return (
    <>
      {parts.map((part, i) => (
        <span key={`${part}-${i}`}>
          {i > 0 && <wbr />}
          {i < parts.length - 1 ? `${part}/` : part}
        </span>
      ))}
    </>
  );
}

/** Past this many characters an entry is a phrase, and drops a size so it
 *  still fits a phone in two or three lines. */
const LONG_HEADWORD = 16;

/** The word itself: the largest thing on any screen it is on. */
export function Heading({ children, className }: { children: string; className?: string }) {
  return (
    <h1 className={cn('headword', children.length > LONG_HEADWORD && 'headword-long', className)}>
      <Headword>{children}</Headword>
    </h1>
  );
}

/**
 * The painting along the foot of a screen that has room for it: cloud, and the
 * edge of a tree. It sits in the flow rather than behind the page, so white
 * cards and buttons never end up on top of white cloud, and its top edge fades
 * out so it has no seam against the flat blue above it.
 */
export function Sky({ className }: { className?: string }) {
  return (
    <img
      src={sky}
      alt=""
      aria-hidden
      className={cn(
        'pointer-events-none -mx-5 mt-auto h-56 w-[calc(100%+2.5rem)] max-w-none object-cover object-bottom select-none [mask-image:linear-gradient(transparent,black_45%)]',
        className
      )}
    />
  );
}

/** A state with nothing to show: a line on the sky, with no card around it. */
export function Empty({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 py-10">
      <Icon className="size-6" />
      <p className="max-w-[22ch] font-serif text-title">{children}</p>
    </div>
  );
}
