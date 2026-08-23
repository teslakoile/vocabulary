// Network-first for the document, cache-first for hashed assets, network-only
// for the API.
//
// The split matters. Vite fingerprints every asset filename, so those are safe
// to cache forever. index.html is not fingerprinted, and it is the file that
// names which fingerprinted bundle to load, so caching it first would pin the
// installed app to whatever version it saw on the day it was installed and no
// deploy would ever reach the phone.
//
// iOS runs nothing while the app is closed: Background Sync is unimplemented
// and Periodic Background Sync is WONTFIX. So this worker never syncs on its
// own. Flushing happens in the page, on open / visibilitychange / reconnect.
const SHELL = 'shell-v3';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon-180.png']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const keep = (request, response) => {
  if (!response.ok) return response;
  const copy = response.clone();
  caches.open(SHELL).then((c) => c.put(request, copy));
  return response;
};

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;               // never cache the API
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // The document, and anything the SPA rewrites to it, comes from the network
  // when there is one. Offline falls back to the last copy seen.
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(e.request)
        .then((res) => keep(e.request, res))
        .catch(() => caches.match('/index.html').then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Fingerprinted assets never change under the same URL, so a hit is always
  // correct and a miss is worth caching.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => keep(e.request, res)))
  );
});

// The nudge arrives with no payload, because the app already holds the corpus.
// Reading it here means the server never has to encrypt content, and the
// notification is still a real card rather than a generic reminder.
function cachedSnapshot() {
  return new Promise((resolve) => {
    let request;
    try { request = indexedDB.open('vocabulary', 1); } catch { resolve(null); return; }
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('corpus')) { resolve(null); return; }
      const get = db.transaction('corpus', 'readonly').objectStore('corpus').get('snapshot');
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => resolve(null);
    };
  });
}

// A card, phrased as its question side. Showing the word itself would give the
// answer away before the app opens.
function pickCard(snapshot) {
  if (!snapshot) return null;
  const senses = new Map();
  const live = new Set();
  for (const entry of snapshot.entries) {
    if (entry.archived_at || entry.status !== 'ready') continue;
    for (const sense of entry.senses) { senses.set(sense.id, sense); live.add(sense.id); }
  }
  const eligible = snapshot.cards.filter((c) => live.has(c.sense_id));
  if (!eligible.length) return null;

  const now = new Date().toISOString();
  const due = eligible.filter((c) => c.due_at && c.due_at <= now);
  const pool = due.length ? due : eligible;
  const card = pool[Math.floor(Math.random() * pool.length)];
  const sense = senses.get(card.sense_id);
  if (!sense) return null;

  // The notification shows the card's own question side, so tapping it lands on
  // the same screen the body already put in your head. A recognition card asks
  // about the word, both definition cards show the definition, and only a
  // production card wants a cue.
  const cue = sense.cues && sense.cues.length
    ? sense.cues[Math.floor(Math.random() * sense.cues.length)]
    : null;
  let body;
  if (card.type === 'recognition') body = sense.term;
  else if (card.type === 'production') body = (cue && cue.text) || sense.definition;
  else body = sense.definition;
  return { cardId: card.id, body: body || sense.definition };
}

self.addEventListener('push', (e) => {
  e.waitUntil(
    cachedSnapshot()
      .then(pickCard)
      .catch(() => null)
      .then((card) =>
        // Every push must display something or Safari revokes the subscription,
        // so there is a fallback for the case where nothing is cached yet.
        self.registration.showNotification("What's the word?", {
          body: card ? card.body : 'A minute of practice.',
          icon: '/icon-192.png',
          tag: 'vocab-nudge',
          data: { cardId: card ? card.cardId : null },
        })
      )
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const cardId = e.notification.data && e.notification.data.cardId;
  const target = cardId ? `/?card=${encodeURIComponent(cardId)}` : '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const open = cs.find((c) => 'focus' in c);
      return open ? open.focus().then((c) => c.navigate(target)) : self.clients.openWindow(target);
    })
  );
});
