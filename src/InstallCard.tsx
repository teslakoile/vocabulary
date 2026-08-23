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
    <aside className="offer install">
      <p>
        Add this to your Home Screen to get the 1pm nudge. Practice works here either way.
      </p>
      <div className="row">
        <span className="steps">Share, then Add to Home Screen</span>
        <button
          className="link"
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, '1');
            onDismiss();
          }}
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
