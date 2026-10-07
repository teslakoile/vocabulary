import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Bell, Plus, Search, Share } from 'lucide-react';
import Browse from './Browse';
import Capture from './Capture';
import InstallCard, { shouldOfferInstall } from './InstallCard';
import Review from './Review';
import SecretGate from './SecretGate';
import { Empty, Shell, TopBar, TopBarInner } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/notice';
import { TopicFilter } from '@/components/topic-filter';
import { TOPICS, type Topic } from './types';
import { Queue } from './queue';
import { dismissNudgeOffer, enableNudge, nudgeState } from './push';
import { getSecret, readSnapshot, sync, UnauthorisedError, type Snapshot } from './store';

type View = 'review' | 'browse' | 'capture';

const TOPIC_KEY = 'vocab.topic';

/** The kind of word last chosen for practice, kept on this device. */
function savedTopic(): Topic | null {
  try {
    const value = localStorage.getItem(TOPIC_KEY);
    return TOPICS.find((t) => t === value) ?? null;
  } catch {
    return null;
  }
}

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
  const [topic, setTopic] = useState<Topic | null>(savedTopic);
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
    if (!queueRef.current) queueRef.current = new Queue(snapshot, topic);
    else queueRef.current.replaceSnapshot(snapshot);
    return queueRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedAt]);

  const chooseTopic = useCallback((next: Topic | null) => {
    queueRef.current?.setTopic(next);
    setTopic(next);
    try {
      if (next) localStorage.setItem(TOPIC_KEY, next);
      else localStorage.removeItem(TOPIC_KEY);
    } catch {
      // The choice still applies for this visit.
    }
  }, []);

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
        <Empty icon={Share}>
          Nothing cached yet, and the server is not reachable. Open this again once you have a
          connection.
        </Empty>
      </Shell>
    );
  }

  return (
    // The top bar already clears the status bar, so the screen under it must not
    // clear it a second time.
    <div
      className="flex min-h-dvh flex-col"
      style={view === 'review' ? ({ '--safe-top': '0px' } as CSSProperties) : undefined}
    >
      {view === 'review' && (
        // Capture is one tap from practising rather than buried in a menu,
        // because it is competing with typing a line into Google Keep.
        <TopBar>
          <TopBarInner>
            <Button variant="ghost" size="icon-xl" onClick={() => setView('capture')} aria-label="Add Word">
              <Plus />
            </Button>
            <span className="font-serif text-title leading-none">Vocabulary</span>
            <Button variant="ghost" size="icon-xl" onClick={() => setView('browse')} aria-label="Search">
              <Search />
            </Button>
          </TopBarInner>
        </TopBar>
      )}

      {view === 'review' && offerInstall && (
        <div className="mx-auto w-full max-w-column px-5 pt-4">
          <InstallCard onDismiss={() => setOfferInstall(false)} />
        </div>
      )}

      {view === 'review' && offerNudge && (
        // iOS ignores a permission request that is not tied to a tap, so the
        // ask has to be a button rather than something that fires on launch.
        <div className="mx-auto w-full max-w-column px-5 pt-4">
          <Notice
            icon={Bell}
            actions={
              <>
                <Button
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
              </>
            }
          >
            A word at 1pm each day on this device, so this stays a habit. Turning it on elsewhere
            too is fine.
          </Notice>
        </div>
      )}

      {view === 'review' && (
        <div className="mx-auto w-full max-w-column px-5 pt-2">
          <TopicFilter value={topic} onChange={chooseTopic} />
        </div>
      )}

      {/* Keyed on the topic so a new choice starts from the queue's new first card. */}
      {view === 'review' && (
        <Review key={topic ?? 'all'} queue={queue} snapshot={snapshot} onSnapshot={setSnapshot} />
      )}
      {view === 'browse' && (
        <Browse snapshot={snapshot} onSnapshot={setSnapshot} onClose={() => setView('review')} />
      )}
      {view === 'capture' && <Capture onClose={() => setView('review')} onCaptured={refresh} />}
    </div>
  );
}
