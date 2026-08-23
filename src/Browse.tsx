/**
 * Browse and search.
 *
 * A row is an entry, not a sense, because 84 is the number written down in
 * Keep and a list of 95 senses would not match what the list feels like.
 * Search is the real navigation: the filters are for the handful of questions
 * a list cannot answer.
 *
 * There is no progress badge on a row. Struggling is a filter instead, so the
 * screen never turns into a dashboard.
 */
import { useMemo, useState } from 'react';
import EditPanel from './EditPanel';
import type { Card, Entry, Snapshot } from './types';
import { archiveEntry } from './store';

const FILTERS = ['All', 'Recent', 'Struggling', 'Pending', 'Archived'] as const;
type Filter = (typeof FILTERS)[number];

/** Two lapses is where a card stops being new and starts being a problem. */
const STRUGGLING_LAPSES = 2;

const gloss = (entry: Entry): string => {
  const first = entry.senses[0]?.definition ?? '';
  const sentence = first.split(/(?<=[.!?])\s/)[0] ?? '';
  return sentence.length > 96 ? `${sentence.slice(0, 95)}…` : sentence;
};

const haystack = (entry: Entry): string =>
  [
    entry.headword,
    entry.capture_note ?? '',
    entry.tags.join(' '),
    ...entry.senses.flatMap((s) => [s.term, ...s.accepted, s.definition, s.caution, s.example]),
  ]
    .join(' ')
    .toLowerCase();

function strugglingEntryIds(snapshot: Snapshot): Set<string> {
  const bySense = new Map<string, Card[]>();
  for (const card of snapshot.cards) {
    const list = bySense.get(card.sense_id);
    if (list) list.push(card);
    else bySense.set(card.sense_id, [card]);
  }
  const ids = new Set<string>();
  for (const entry of snapshot.entries) {
    for (const sense of entry.senses) {
      for (const card of bySense.get(sense.id) ?? []) {
        if (!card.fsrs_state) continue;
        try {
          if ((JSON.parse(card.fsrs_state).lapses ?? 0) >= STRUGGLING_LAPSES) ids.add(entry.id);
        } catch {
          // A card whose state will not parse is a sync problem, not a struggle.
        }
      }
    }
  }
  return ids;
}

interface Props {
  snapshot: Snapshot;
  onSnapshot: (snapshot: Snapshot) => void;
  onClose: () => void;
}

export default function Browse({ snapshot, onSnapshot, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingSense, setEditingSense] = useState<string | null>(null);

  const struggling = useMemo(() => strugglingEntryIds(snapshot), [snapshot]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = snapshot.entries.filter((e) => !needle || haystack(e).includes(needle));

    const filtered = matched.filter((e) => {
      switch (filter) {
        case 'Archived': return e.archived_at !== null;
        case 'Pending': return e.archived_at === null && e.status !== 'ready';
        case 'Struggling': return e.archived_at === null && struggling.has(e.id);
        default: return e.archived_at === null;
      }
    });

    if (filter === 'Recent') {
      return [...filtered].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 25);
    }
    return filtered.sort((a, b) => a.headword.localeCompare(b.headword));
  }, [filter, query, snapshot.entries, struggling]);

  const open = openId ? snapshot.entries.find((e) => e.id === openId) : null;

  if (open) {
    return (
      <main className="shell">
        <button className="link" onClick={() => { setOpenId(null); setEditingSense(null); }}>
          Back to the list
        </button>
        <h1 className="term">{open.headword}</h1>
        {open.senses.map((sense) => (
          <section key={sense.id} className="sense">
            {open.senses.length > 1 && <h2 className="senseterm">{sense.term}</h2>}
            <p className="definition">{sense.definition}</p>
            <p className="caution">{sense.caution}</p>
            <p className="example">&ldquo;{sense.example}&rdquo;</p>
            {editingSense === sense.id ? (
              <EditPanel
                entry={open}
                sense={sense}
                snapshot={snapshot}
                onSnapshot={onSnapshot}
                onDone={() => setEditingSense(null)}
              />
            ) : (
              <button className="link" onClick={() => setEditingSense(sense.id)}>Fix this</button>
            )}
          </section>
        ))}
        <button
          className="link"
          onClick={async () => {
            const archived = open.archived_at === null;
            // Archive, never delete: the review history stays attached.
            onSnapshot({
              ...snapshot,
              entries: snapshot.entries.map((e) =>
                e.id === open.id ? { ...e, archived_at: archived ? new Date().toISOString() : null } : e
              ),
            });
            await archiveEntry(open.id, archived).catch(() => undefined);
          }}
        >
          {open.archived_at ? 'Bring this back' : 'Archive this word'}
        </button>
      </main>
    );
  }

  return (
    <main className="shell">
      <button className="link" onClick={onClose}>Back to practice</button>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search words, meanings, cautions"
        type="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <div className="filters">
        {FILTERS.map((name) => (
          <button
            key={name}
            className={name === filter ? 'chip on' : 'chip'}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <ul className="rows">
        {rows.map((entry) => (
          <li key={entry.id}>
            <button onClick={() => setOpenId(entry.id)}>
              <strong>{entry.headword}</strong>
              <span>{entry.status === 'ready' ? gloss(entry) : 'waiting for its meaning'}</span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="placeholder">Nothing matches.</p>}
    </main>
  );
}
