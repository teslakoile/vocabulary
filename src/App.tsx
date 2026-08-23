import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Browse from './Browse';
import Capture from './Capture';
import InstallCard, { shouldOfferInstall } from './InstallCard';
import Review from './Review';
import SecretGate from './SecretGate';
import { Queue } from './queue';
import { dismissNudgeOffer, enableNudge, nudgeState } from './push';
import { getSecret, readSnapshot, sync, UnauthorisedError, type Snapshot } from './store';

type View = 'review' | 'browse' | 'capture';

const isIOS = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent);

/** iOS reports standalone on navigator; everyone else uses the media query. */
function useStandalone(): boolean {
  const [standalone, setStandalone] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = (e: MediaQueryListEvent) => setStandalone(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return standalone;
}

export default function App() {
  const standalone = useStandalone();
  const [secret, setSecretState] = useState(getSecret);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejected, setRejected] = useState(false);
  const [view, setView] = useState<View>('review');
  const [offerInstall, setOfferInstall] = useState(false);
  const [offerNudge, setOfferNudge] = useState(false);
  const queueRef = useRef<Queue | null>(null);
  const pinned = useRef(false);

  /**
   * Show whatever is cached immediately, then sync behind it. Waiting for the
   * network before the first card would make a daily habit feel like a website.
   */
  const refresh = useCallback(async () => {
    const cached = await readSnapshot();
    if (cached) setSnapshot(cached);
    setLoading(false);
    try {
      const fresh = await sync();
      if (fresh) setSnapshot(fresh);
      setRejected(false);
    } catch (error) {
      if (error instanceof UnauthorisedError) setRejected(true);
      // Any other failure means offline, and the cache is already on screen.
    }
  }, []);

  useEffect(() => {
    if (!secret) return;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [refresh, secret]);

  // Rebuild only when the server has actually said something new. Every answer
  // produces a locally-updated snapshot too, and rebuilding on those would throw
  // away the queue's spacing after every single card.
  const fetchedAt = snapshot?.fetched_at;
  const queue = useMemo(() => {
    if (!snapshot) return null;
    if (!queueRef.current) queueRef.current = new Queue(snapshot);
    else queueRef.current.replaceSnapshot(snapshot);
    return queueRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedAt]);

  useEffect(() => {
    setOfferInstall(shouldOfferInstall(standalone));
    // Push on iOS needs the home-screen install, so offering it in a tab would
    // be offering something that cannot work.
    setOfferNudge(nudgeState() === 'unasked' && (standalone || !isIOS()));
  }, [standalone]);

  // Arriving from a nudge opens the card the nudge was about. Once only, so a
  // later sync does not drag you back to it.
  useEffect(() => {
    if (!queue || pinned.current) return;
    const card = new URLSearchParams(location.search).get('card');
    if (!card) return;
    pinned.current = true;
    queue.pin(card);
    history.replaceState(null, '', location.pathname);
  }, [queue]);

  if (!secret || rejected) {
    return (
      <SecretGate
        rejected={rejected}
        onAccepted={(value) => {
          setSecretState(value);
          setRejected(false);
          setLoading(true);
        }}
      />
    );
  }

  if (loading) return <main className="shell" />;

  if (!snapshot || !queue) {
    return (
      <main className="shell">
        <p className="placeholder">
          Nothing cached yet, and the server is not reachable. Open this again once you have a
          connection.
        </p>
      </main>
    );
  }

  return (
    <div className="app">
      {view === 'review' && (
        // Capture is one tap from practising rather than buried in a menu,
        // because it is competing with typing a line into Google Keep.
        <nav className="bar">
          <button onClick={() => setView('capture')} aria-label="Add a word">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button onClick={() => setView('browse')} aria-label="Search your words">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </svg>
          </button>
        </nav>
      )}

      {view === 'review' && offerInstall && <InstallCard onDismiss={() => setOfferInstall(false)} />}

      {view === 'review' && offerNudge && (
        // iOS ignores a permission request that is not tied to a tap, so the
        // ask has to be a button rather than something that fires on launch.
        <aside className="offer">
          <p>A word at 1pm each day on this device, so this stays a habit. Turning it on elsewhere too is fine.</p>
          <div className="row">
            <button
              className="primary"
              onClick={async () => {
                setOfferNudge(false);
                await enableNudge();
              }}
            >
              Turn on
            </button>
            <button className="link" onClick={() => { dismissNudgeOffer(); setOfferNudge(false); }}>
              Not now
            </button>
          </div>
        </aside>
      )}

      {view === 'review' && <Review queue={queue} snapshot={snapshot} onSnapshot={setSnapshot} />}
      {view === 'browse' && (
        <Browse snapshot={snapshot} onSnapshot={setSnapshot} onClose={() => setView('review')} />
      )}
      {view === 'capture' && <Capture onClose={() => setView('review')} onCaptured={refresh} />}
    </div>
  );
}
