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
import { Archive, ArrowLeft, ChevronRight, Pencil, RotateCcw, Search, SearchX } from 'lucide-react';
import EditPanel from './EditPanel';
import type { Card as CardRow, Entry, Snapshot } from './types';
import { archiveEntry } from './store';
import { Empty, Heading, Headword, Shell } from '@/components/shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Caution } from '@/components/caution';
import { Input } from '@/components/ui/input';

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
  const bySense = new Map<string, CardRow[]>();
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
        case 'Pending': return e.archived_at === null && (e.status !== 'ready' || e.flagged_at !== null);
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
      <Shell>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start text-muted-foreground"
          onClick={() => {
            setOpenId(null);
            setEditingSense(null);
          }}
        >
          <ArrowLeft />
          Back to List
        </Button>

        <div className="flex flex-col gap-3 pb-1">
          <Heading>{open.headword}</Heading>
          <div className="flex flex-wrap gap-2">
            {open.archived_at && <Badge variant="secondary">Archived</Badge>}
            {open.status !== 'ready' && <Badge variant="outline">Pending</Badge>}
            {open.senses.length > 1 && (
              <Badge variant="outline">{open.senses.length} senses</Badge>
            )}
          </div>
        </div>

        {open.senses.map((sense) => (
          <Card key={sense.id} className="gap-4">
            {open.senses.length > 1 && (
              <h2 className="font-serif text-title break-words">
                <Headword>{sense.term}</Headword>
              </h2>
            )}
            <p>{sense.definition}</p>
            <Caution>{sense.caution}</Caution>
            <p className="text-muted-foreground">
              &ldquo;{sense.example}&rdquo;
            </p>
            {/* The card's actions sit under a hairline, the way a message's do. */}
            <div className="-mx-4 border-t px-4 pt-3">
              {editingSense === sense.id ? (
                <div className="pt-1">
                  <EditPanel
                    entry={open}
                    sense={sense}
                    snapshot={snapshot}
                    onSnapshot={onSnapshot}
                    onDone={() => setEditingSense(null)}
                  />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 text-muted-foreground"
                  onClick={() => setEditingSense(sense.id)}
                >
                  <Pencil />
                  Edit
                </Button>
              )}
            </div>
          </Card>
        ))}

        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start text-muted-foreground"
          onClick={async () => {
            const archived = open.archived_at === null;
            // Archive, never delete: the review history stays attached.
            onSnapshot({
              ...snapshot,
              entries: snapshot.entries.map((e) =>
                e.id === open.id
                  ? { ...e, archived_at: archived ? new Date().toISOString() : null }
                  : e
              ),
            });
            await archiveEntry(open.id, archived).catch(() => undefined);
          }}
        >
          {open.archived_at ? <RotateCcw /> : <Archive />}
          {open.archived_at ? 'Restore' : 'Archive'}
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={onClose}>
        <ArrowLeft />
        Back to Practice
      </Button>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 z-10 size-4 -translate-y-1/2 text-ink/50" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          type="search"
          className="pl-11"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((name) => (
          <Button
            key={name}
            size="sm"
            variant={name === filter ? 'default' : 'outline'}
            className="px-4"
            onClick={() => setFilter(name)}
          >
            {name}
          </Button>
        ))}
      </div>

      {rows.length > 0 && (
        <Card className="gap-0 overflow-hidden p-0">
          <ul data-slot="rows" className="list-none divide-y divide-border p-0">
            {rows.map((entry) => (
              <li key={entry.id}>
                <button
                  className="pressable flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => {
                    setOpenId(entry.id);
                    // The list's scroll would otherwise carry over, and a word
                    // opened from far down it would open part way down.
                    window.scrollTo(0, 0);
                  }}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <strong className="font-semibold break-words">
                      <Headword>{entry.headword}</Headword>
                    </strong>
                    <span className="text-small text-muted-foreground">
                      {entry.status === 'ready' ? gloss(entry) : 'waiting for its meaning'}
                    </span>
                  </span>
                  <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rows.length === 0 && (
        <Empty icon={SearchX}>No Matches</Empty>
      )}
    </Shell>
  );
}
