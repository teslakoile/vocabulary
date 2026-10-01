import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Plus, Search, Share } from 'lucide-react';
import Browse from './Browse';
import Capture from './Capture';
import InstallCard, { shouldOfferInstall } from './InstallCard';
import Review from './Review';
import SecretGate from './SecretGate';
import { Shell, TopBar, TopBarInner } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

  if (loading) return <Shell />;

  if (!snapshot || !queue) {
    return (
      <Shell className="justify-center">
        <Card className="items-center gap-3 px-6 py-10 text-center">
          <Share className="size-6 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nothing cached yet, and the server is not reachable. Open this again once you have a
            connection.
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {view === 'review' && (
        // Capture is one tap from practising rather than buried in a menu,
        // because it is competing with typing a line into Google Keep.
        <TopBar>
          <TopBarInner>
            <Button variant="ghost" size="icon-xl" onClick={() => setView('capture')} aria-label="Add Word">
              <Plus />
            </Button>
            <span className="font-serif text-[0.7rem] tracking-[0.35em] text-muted-foreground uppercase">
              Vocabulary
            </span>
            <Button variant="ghost" size="icon-xl" onClick={() => setView('browse')} aria-label="Search">
              <Search />
            </Button>
          </TopBarInner>
        </TopBar>
      )}

      {view === 'review' && offerInstall && (
        <div className="mx-auto w-full max-w-[34rem] px-5 pt-4">
          <InstallCard onDismiss={() => setOfferInstall(false)} />
        </div>
      )}

      {view === 'review' && offerNudge && (
        // iOS ignores a permission request that is not tied to a tap, so the
        // ask has to be a button rather than something that fires on launch.
        <div className="mx-auto w-full max-w-[34rem] px-5 pt-4">
          <Card className="gap-3 border-brand/25 bg-brand-muted/40 px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
                <Bell className="size-4" />
              </span>
              <p className="text-sm text-muted-foreground">
                A word at 1pm each day on this device, so this stays a habit. Turning it on
                elsewhere too is fine.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="brand"
                onClick={async () => {
                  setOfferNudge(false);
                  await enableNudge();
                }}
              >
                Turn On
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  dismissNudgeOffer();
                  setOfferNudge(false);
                }}
              >
                Not Now
              </Button>
            </div>
          </Card>
        </div>
      )}

      {view === 'review' && <Review queue={queue} snapshot={snapshot} onSnapshot={setSnapshot} />}
      {view === 'browse' && (
        <Browse snapshot={snapshot} onSnapshot={setSnapshot} onClose={() => setView('review')} />
      )}
      {view === 'capture' && <Capture onClose={() => setView('review')} onCaptured={refresh} />}
    </div>
  );
}
