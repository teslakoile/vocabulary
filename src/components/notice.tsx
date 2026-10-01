/**
 * Anything the app needs to tell you that is not part of a word: a save that
 * did not reach the server, or an offer you can take or leave.
 *
 * One shape for all of them, so a warning never looks like an advert: an icon
 * in a round chip, a line of text, and optional actions under it. Like the
 * caution, it flattens to a tinted panel when it sits inside another card.
 */
import type * as React from 'react';
import { cn } from '@/lib/utils';

interface Props {
  tone?: 'info' | 'error';
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function Notice({ tone = 'info', icon: Icon, children, actions, className }: Props) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'paper lift flex flex-col gap-3 rounded-xl bg-card p-4',
        'in-data-[slot=card]:rounded-md in-data-[slot=card]:bg-muted',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-sky-deep/10 text-sky-deep'
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="pt-1">{children}</div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 pl-11">{actions}</div>}
    </div>
  );
}
