/**
 * Local storage and sync.
 *
 * The phone is offline often enough that the app treats the network as a bonus.
 * IndexedDB holds the corpus and, more importantly, the events not yet accepted
 * by the server: those are the only data that exists nowhere else, so they are
 * written before the UI advances and deleted only once the server has them.
 *
 * There is no Background Sync on iOS and Periodic Background Sync is WONTFIX,
 * so flushing is opportunistic: on app open, after each answer, and on regaining
 * connectivity.
 */
import type { Card, Entry, PullResponse, ReviewEvent } from '../shared/types';

const DB_NAME = 'vocabulary';
const DB_VERSION = 1;
const SECRET_KEY = 'vocab.secret';

type StoreName = 'corpus' | 'pending';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('corpus')) db.createObjectStore('corpus');
      if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      })
  );
}

export const getSecret = (): string | null => localStorage.getItem(SECRET_KEY);
export const setSecret = (secret: string): void => localStorage.setItem(SECRET_KEY, secret.trim());
export const clearSecret = (): void => localStorage.removeItem(SECRET_KEY);

export class UnauthorisedError extends Error {}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const secret = getSecret();
  if (!secret) throw new UnauthorisedError('no secret set');
  const response = await fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      'x-vocab-secret': secret,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  if (response.status === 401) throw new UnauthorisedError('secret rejected');
  return response;
}

/** The corpus as the app last saw it. Present even with no network. */
export interface Snapshot extends PullResponse {
  fetched_at: string;
  /** ETag of the entries half, so an unchanged corpus is not re-downloaded. */
  corpus_etag?: string;
}

export const readSnapshot = (): Promise<Snapshot | undefined> => tx('corpus', 'readonly', (s) => s.get('snapshot'));

const writeSnapshot = (snapshot: Snapshot): Promise<unknown> =>
  tx('corpus', 'readwrite', (s) => s.put(snapshot, 'snapshot'));

export const readPending = (): Promise<ReviewEvent[]> => tx('pending', 'readonly', (s) => s.getAll());

const putPending = (event: ReviewEvent): Promise<unknown> => tx('pending', 'readwrite', (s) => s.put(event));

const dropPending = (ids: string[]): Promise<void> =>
  open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction('pending', 'readwrite');
        const store = transaction.objectStore('pending');
        for (const id of ids) store.delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      })
  );

/** Record an answer. Durable before anything else happens. */
export async function recordEvent(event: ReviewEvent): Promise<void> {
  await putPending(event);
}

/**
 * Push everything pending, oldest first, in chunks the Worker will accept.
 * Returns the schedules the server settled on, which are authoritative.
 */
export async function flush(): Promise<Record<string, { fsrs_state: string | null; due_at: string | null }>> {
  const pending = (await readPending()).sort((a, b) => a.graded_at.localeCompare(b.graded_at));
  const settled: Record<string, { fsrs_state: string | null; due_at: string | null }> = {};
  if (!pending.length) return settled;

  for (let i = 0; i < pending.length; i += 20) {
    const chunk = pending.slice(i, i + 20);
    const response = await api('/api/events', { method: 'POST', body: JSON.stringify({ events: chunk }) });
    if (!response.ok) break;
    const body = (await response.json()) as { schedules?: typeof settled };
    Object.assign(settled, body.schedules ?? {});
    // Only now is it safe to forget them.
    await dropPending(chunk.map((e) => e.id));
  }
  return settled;
}

/**
 * Flush first, then pull. That order matters: pulling first would overwrite
 * local schedules with server state that has not yet heard about the answers
 * sitting in the pending store.
 *
 * The two halves are fetched separately because the corpus is five times the
 * size of the schedule and changes a thousandth as often. On a normal open the
 * corpus returns 304 and only the schedule crosses the wire.
 */
export async function sync(): Promise<Snapshot | undefined> {
  await flush();
  const cached = await readSnapshot();

  const [stateResponse, corpusResponse] = await Promise.all([
    api('/api/state'),
    api('/api/corpus', cached?.corpus_etag ? { headers: { 'if-none-match': cached.corpus_etag } } : {}),
  ]);
  if (!stateResponse.ok) return undefined;

  const state = (await stateResponse.json()) as Omit<PullResponse, 'entries'>;

  let entries = cached?.entries ?? [];
  let corpus_etag = cached?.corpus_etag;
  if (corpusResponse.status === 200) {
    entries = ((await corpusResponse.json()) as { entries: Entry[] }).entries;
    corpus_etag = corpusResponse.headers.get('etag') ?? undefined;
  } else if (corpusResponse.status !== 304) {
    return undefined;
  }

  const snapshot: Snapshot = { ...state, entries, corpus_etag, fetched_at: new Date().toISOString() };
  await writeSnapshot(snapshot);
  return snapshot;
}

/**
 * Apply an answer to the cached snapshot so the UI does not wait for a round
 * trip. The client and the Worker run the same FSRS code on the same defaults,
 * so this is a preview of an answer the server will reach independently.
 */
export function applyLocally(
  snapshot: Snapshot,
  cardId: string,
  next: { fsrs_state: string; due_at: string },
  countsTowardSchedule: boolean
): Snapshot {
  const cards = snapshot.cards.map((card): Card =>
    card.id === cardId && countsTowardSchedule ? { ...card, ...next } : card
  );
  const wasNew = snapshot.cards.find((c) => c.id === cardId)?.fsrs_state === null;
  return {
    ...snapshot,
    cards,
    intake_today: snapshot.intake_today + (wasNew && countsTowardSchedule ? 1 : 0),
  };
}

export async function saveEntry(entry: Entry): Promise<void> {
  await api(`/api/entries/${entry.id}`, { method: 'PATCH', body: JSON.stringify(entry) });
}

export async function captureEntry(headword: string, captureNote?: string): Promise<void> {
  await api('/api/entries', { method: 'POST', body: JSON.stringify({ headword, capture_note: captureNote }) });
}

export async function archiveEntry(id: string, archived: boolean): Promise<void> {
  await api(`/api/entries/${id}/archive`, { method: archived ? 'POST' : 'DELETE' });
}
