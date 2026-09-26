/**
 * The review screen. One card at a time, forever.
 *
 * There is no session, no daily count and no done state, so nothing here counts
 * anything up or congratulates you. The only status the screen carries is a
 * quiet gold rule marking a card whose answer moves the schedule.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Eye, Flag, Keyboard, ListChecks, MessageSquareQuote, Pencil, ScrollText, X } from 'lucide-react';
import { applyGrade, gradeFor } from '../shared/scheduler';
import EditPanel from './EditPanel';
import { answerMatches, type Queue, type QueueItem } from './queue';
import type { Entry } from './types';
import { applyLocally, backlogOf, flagEntry, flush, recordEvent, type Snapshot } from './store';
import { Headword, Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Props {
  queue: Queue;
  snapshot: Snapshot;
  onSnapshot: (snapshot: Snapshot) => void;
}

type Answered = { correct: boolean; given?: string } | null;

const KIND = {
  recognition: { label: 'pick the meaning', icon: Eye },
  identify: { label: 'pick the word', icon: ListChecks },
  reverse: { label: 'type the word', icon: Keyboard },
  production: { label: 'from a situation', icon: MessageSquareQuote },
} as const;

/** What a card's options are checked against. Recognition offers definitions
 *  and identify offers words, so the right answer is not always the same field. */
const correctOption = (item: QueueItem): string =>
  item.card.type === 'identify'
    ? item.sense.term
    : item.options?.includes(item.sense.gloss)
      ? item.sense.gloss
      : item.sense.definition;

/** The question each card asks, in words. A bare headword or a bare definition
 *  left you to work out what was being asked. */
function Ask({ children }: { children: React.ReactNode }) {
  return <p data-slot="ask" className="text-sm font-medium tracking-wide text-muted-foreground">{children}</p>;
}

export default function Review({ queue, snapshot, onSnapshot }: Props) {
  const [item, setItem] = useState<QueueItem | undefined>(() => queue.peek());
  const [answered, setAnswered] = useState<Answered>(null);
  const [typed, setTyped] = useState('');
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!answered && item && !item.options) input.current?.focus();
  }, [answered, item]);

  const reveal = useCallback(
    (correct: boolean, given?: string) => {
      if (!item || answered) return;
      setAnswered({ correct, given });

      const graded_at = new Date().toISOString();
      const grade = gradeFor(correct);
      void recordEvent({
        id: crypto.randomUUID(),
        card_id: item.card.id,
        graded_at,
        grade,
        counts_toward_schedule: item.counts,
        device: navigator.userAgent.slice(0, 60),
      });

      // Show the new interval immediately. The Worker runs the same FSRS code on
      // the same parameters, so this is a preview of where it will land, not a
      // guess the server might contradict.
      if (item.counts) {
        const next = applyGrade(item.card.fsrs_state, grade, new Date(graded_at));
        onSnapshot(applyLocally(snapshot, item.card.id, next, true));
      }
      void flush().catch(() => {
        // Offline. The event is already in IndexedDB and goes up on the next open.
      });
    },
    [answered, item, onSnapshot, snapshot]
  );

  // Number keys pick an option. On a laptop this is the difference between
  // practising and operating a mouse.
  useEffect(() => {
    if (answered || !item?.options) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      const options = item.options ?? [];
      if (!Number.isInteger(n) || n < 1 || n > options.length) return;
      e.preventDefault();
      reveal(options[n - 1] === correctOption(item));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, item, reveal]);

  const next = useCallback(() => {
    if (!answered) return;
    queue.advance(answered.correct);
    setAnswered(null);
    setTyped('');
    setEditing(false);
    setItem(queue.peek());
  }, [answered, queue]);

  if (!item) {
    return (
      <Shell className="justify-center">
        <Card className="items-center gap-3 border-dashed px-6 py-10 text-center">
          <ScrollText className="size-6 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nothing to practise yet. Words appear here once they have been through generation.
          </p>
        </Card>
      </Shell>
    );
  }

  const { sense, entry, card } = item;
  const kind = KIND[card.type];

  return (
    <Shell>
      {!answered && <Backlog count={backlogOf(snapshot.entries).length} />}

      {item.counts && (
        <span
          className="h-[3px] w-7 shrink-0 rounded-full bg-brand/70"
          title="This answer moves the schedule"
        />
      )}

      {!answered ? (
        <Question item={item} typed={typed} setTyped={setTyped} onReveal={reveal} inputRef={input} />
      ) : (
        <div data-slot="answer" className="stagger flex flex-1 flex-col gap-4">
          <div
            className={
              answered.correct
                ? 'flex items-center gap-2 text-sm font-semibold tracking-wide text-[var(--success)]'
                : 'flex items-center gap-2 text-sm font-semibold tracking-wide text-destructive'
            }
          >
            <span
              className={
                answered.correct
                  ? 'flex size-6 items-center justify-center rounded-full bg-[var(--success)]/15'
                  : 'flex size-6 items-center justify-center rounded-full bg-destructive/15'
              }
            >
              {answered.correct ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            </span>
            {answered.correct ? 'Right' : 'Not this time'}
            {answered.given && !answered.correct && (
              <span className="font-normal text-muted-foreground">
                you wrote &ldquo;{answered.given}&rdquo;
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="font-serif text-[2.1rem] leading-[1.1] font-semibold tracking-tight">
              <Headword>{sense.term}</Headword>
            </h1>
            {sense.gloss && <p className="text-[1.05rem] text-muted-foreground">means {sense.gloss}</p>}
            {sense.accepted.length > 0 && (
              <p className="text-sm text-muted-foreground">also {sense.accepted.join(', ')}</p>
            )}
          </div>

          <p className="text-[1.05rem] leading-relaxed">{sense.definition}</p>

          {/* The field that stops a word being misused, so it gets the one accent
           * on the screen. It is the reason this app is not a dictionary. */}
          <Card className="gap-0 border-l-2 border-l-brand bg-brand-muted/30 px-4 py-3.5">
            <p className="text-[0.97rem] leading-relaxed text-foreground/90">{sense.caution}</p>
          </Card>

          <p className="font-serif text-[1.02rem] leading-relaxed text-muted-foreground italic">
            &ldquo;{sense.example}&rdquo;
          </p>

          {entry.capture_note && (
            <p className="text-sm text-muted-foreground">{entry.capture_note}</p>
          )}

          {editing ? (
            <EditPanel
              entry={entry}
              sense={sense}
              snapshot={snapshot}
              onSnapshot={onSnapshot}
              onDone={() => setEditing(false)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setEditing(true)}
              >
                <Pencil />
                Fix this
              </Button>
              <FlagControl key={entry.id} entry={entry} snapshot={snapshot} onSnapshot={onSnapshot} />
            </div>
          )}

          <div className="mt-auto flex flex-col gap-3 pt-2">
            <Button size="xl" className="w-full" onClick={next} autoFocus>
              Next
              <ArrowRight />
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
              <kind.icon className="size-3.5" />
              {kind.label}
            </p>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** How many words are waiting for a refine session. Quiet, and absent at zero. */
function Backlog({ count }: { count: number }) {
  if (!count) return null;
  return (
    <p className="text-xs text-muted-foreground/80">
      {count} {count === 1 ? 'word is' : 'words are'} waiting for your next refine
    </p>
  );
}

/**
 * Flag a word for the next refine session instead of fixing it on the phone.
 * The word stays in practice; the note tells the session what looked wrong.
 */
function FlagControl({ entry, snapshot, onSnapshot }: { entry: Entry; snapshot: Snapshot; onSnapshot: (s: Snapshot) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  // The card on screen holds its own copy of the entry until the next sync, so
  // the snapshot update alone does not reach it. Track the send here too.
  const [sent, setSent] = useState(false);

  if (entry.flagged_at || sent) {
    return <span className="px-2 text-sm text-muted-foreground">Flagged for your next refine</span>;
  }
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <Flag />
        Flag
      </Button>
    );
  }

  const send = async () => {
    const flagged: Entry = { ...entry, flagged_at: new Date().toISOString(), flag_note: note.trim() || null };
    onSnapshot({ ...snapshot, entries: snapshot.entries.map((e) => (e.id === entry.id ? flagged : e)) });
    setSent(true);
    try {
      await flagEntry(entry.id, note);
    } catch {
      // Put the screen back so the note is not lost behind a flag that never landed.
      onSnapshot(snapshot);
      setSent(false);
      setFailed(true);
    }
  };

  return (
    <form
      className="flex w-full items-center gap-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What looks wrong? Optional"
        autoFocus
      />
      <Button type="submit" size="sm">Flag</Button>
      {failed && <span className="text-sm text-destructive">Not sent. Check your connection.</span>}
    </form>
  );
}

interface QuestionProps {
  item: QueueItem;
  typed: string;
  setTyped: (value: string) => void;
  onReveal: (correct: boolean, given?: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function Question({ item, typed, setTyped, onReveal, inputRef }: QuestionProps) {
  const { sense, card } = item;

  if (card.type === 'recognition') {
    return (
      <div data-slot="question" data-kind="recognition" className="stagger flex flex-col gap-4">
        <h1 className="font-serif text-[2.1rem] leading-[1.1] font-semibold tracking-tight">
          <span className="font-normal text-muted-foreground">What does </span>
          <Headword>{sense.term}</Headword>
          <span className="font-normal text-muted-foreground"> mean?</span>
        </h1>
        <ul data-slot="options" className="grid list-none gap-2.5 p-0">
          {(item.options ?? []).map((option, i) => (
            <li key={option}>
              <button
                className="surface pressable flex w-full items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left leading-snug hover:border-brand/40 hover:bg-accent/60"
                onClick={() => onReveal(option === correctOption(item))}
              >
                {/* The option number, for keyboard use. Hidden where there is no keyboard. */}
                <kbd className="mt-px hidden size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-sans text-xs text-muted-foreground pointer-fine:flex">
                  {i + 1}
                </kbd>
                <span>{option}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (card.type === 'identify') {
    return (
      <div data-slot="question" data-kind="identify" className="stagger flex flex-col gap-4">
        <Ask>Which word means this?</Ask>
        <p data-slot="prompt" className="pt-1 text-[1.28rem] leading-[1.45]">{sense.definition}</p>
        {/* Two columns where there is room. A word is short enough that six of
         * them still read at a glance, which is the whole point of this card. */}
        <ul data-slot="options" className="grid list-none gap-2.5 p-0 sm:grid-cols-2">
          {(item.options ?? []).map((option, i) => (
            <li key={option}>
              <button
                className="surface pressable flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left font-serif text-[1.05rem] leading-snug hover:border-brand/40 hover:bg-accent/60"
                onClick={() => onReveal(option === sense.term)}
              >
                <kbd className="hidden size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-sans text-xs text-muted-foreground pointer-fine:flex">
                  {i + 1}
                </kbd>
                <span>{option}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const prompt = card.type === 'reverse' ? sense.definition : (item.cue?.text ?? sense.definition);

  const submit = () => {
    if (!typed.trim()) return;
    onReveal(answerMatches(typed, sense), typed.trim());
  };

  return (
    <div data-slot="question" data-kind={card.type} className="stagger flex flex-col gap-4">
      <Ask>{card.type === 'reverse' ? 'Type the word that means this.' : 'Type the word that fits.'}</Ask>
      <p data-slot="prompt" className="pt-1 text-[1.28rem] leading-[1.45]">{prompt}</p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          ref={inputRef}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="the word"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        <Button size="xl" type="submit" className="w-full" disabled={!typed.trim()}>
          Check
        </Button>
      </form>
      <Button
        variant="quiet"
        size="sm"
        className="self-start"
        onClick={() => onReveal(false)}
      >
        I don&rsquo;t know
      </Button>
    </div>
  );
}
