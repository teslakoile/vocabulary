/**
 * A hint, not a gate.
 *
 * The app runs fine in a tab: D1 is the system of record, IndexedDB is only a
 * cache, and answers flush after every card, so nothing is at risk if a browser
 * clears site data. Installing buys two things, and only on iOS: Web Push, which
 * does not work at all from a Safari tab, and exemption from Safari's 7-day cap
 * on script-writable storage, which otherwise means re-downloading the corpus.
 *
 * So this shows on iOS in a tab and nowhere else, and it can be dismissed.
 */
import { SquareArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const DISMISSED_KEY = 'vocab.install.dismissed';

export const shouldOfferInstall = (standalone: boolean): boolean =>
  !standalone &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !localStorage.getItem(DISMISSED_KEY);

interface Props {
  onDismiss: () => void;
}

export default function InstallCard({ onDismiss }: Props) {
  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand">
          <SquareArrowUp className="size-4" />
        </span>
        <p className="text-sm text-muted-foreground">
          Add this to your Home Screen to get the 1pm nudge. Practice works here either way.
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground/80">Share, then Add to Home Screen</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, '1');
            onDismiss();
          }}
        >
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
