/**
 * The frame every screen sits in.
 *
 * One place owns the column width, the phone padding and the safe areas, so a
 * screen with short content cannot shrink-wrap and a long headword cannot push
 * the page sideways.
 */
import type * as React from 'react';
import { cn } from '@/lib/utils';

export function Shell({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      className={cn(
        'mx-auto flex w-full max-w-[34rem] flex-1 flex-col gap-4 px-5 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]',
        className
      )}
      {...props}
    />
  );
}

/** Sticky, blurred, and thin: it holds two taps and the app's name, nothing else. */
export function TopBar({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-xl',
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
        'mx-auto flex w-full max-w-[34rem] items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)]',
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
