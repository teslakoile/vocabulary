/**
 * The review screen. One card at a time, forever.
 *
 * There is no session, no daily count and no done state, so nothing here counts
 * anything up or congratulates you. The only status the screen carries is a
 * white dot marking a card whose answer moves the schedule.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Eye, Flag, Keyboard, ListChecks, MessageSquareQuote, Pencil, ScrollText, TriangleAlert, X } from 'lucide-react';
import { applyGrade, gradeFor } from '../shared/scheduler';
import EditPanel from './EditPanel';
import { answerMatches, answerShape, type Queue, type QueueItem } from './queue';
import type { Entry } from './types';
import { applyLocally, backlogOf, flagEntry, flush, recordEvent, type Snapshot } from './store';
import { Caution } from '@/components/caution';
import { Empty, Heading, Shell, Sky } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/notice';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface Props {
  queue: Queue;
  snapshot: Snapshot;
  onSnapshot: (snapshot: Snapshot) => void;
}

type Answered = { correct: boolean; given?: string } | null;

const KIND = {
  recognition: { label: 'Meaning Choice', icon: Eye },
  identify: { label: 'Word Choice', icon: ListChecks },
  reverse: { label: 'Definition Recall', icon: Keyboard },
  production: { label: 'Situation Recall', icon: MessageSquareQuote },
} as const;

/** What a card's options are checked against. Recognition offers definitions
 *  and identify offers words, so the right answer is not always the same field. */
const correctOption = (item: QueueItem): string =>
  item.card.type === 'identify'
    ? item.sense.term
    : item.options?.includes(item.sense.gloss)
      ? item.sense.gloss
      : item.sense.definition;

/** An answer you can tap: a white card, the same one whether it holds a
 *  meaning or a word. */
const OPTION =
  'paper lift pressable flex w-full gap-3 rounded-xl bg-card px-4 py-4 text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-white/60 focus-visible:outline-none';

/** The option number, for keyboard use. Hidden where there is no keyboard. */
const KEY =
  'hidden size-6 shrink-0 items-center justify-center rounded-md border font-sans text-caption text-muted-foreground pointer-fine:flex';

/** The line above the prompt. A question where one reads naturally, and
 *  otherwise the name of what the card shows: a definition or a situation. A
 *  card whose answer moves the schedule carries a white dot, and nothing else
 *  on the screen says so. */
function Ask({ counts, children }: { counts: boolean; children: React.ReactNode }) {
  return (
    <p data-slot="ask" className="flex items-center gap-2 text-muted-foreground">
      {counts && <span className="size-2 rounded-full bg-white" title="This answer moves the schedule" />}
      {children}
    </p>
  );
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
        <Empty icon={ScrollText}>
          Nothing to practise yet. Words appear here once they have been through generation.
        </Empty>
      </Shell>
    );
  }

  const { sense, entry, card } = item;
  const kind = KIND[card.type];

  return (
    <Shell className={cn(!answered && 'pb-0')}>
      {!answered ? (
        <>
          <Backlog count={backlogOf(snapshot.entries).length} />
          <Question item={item} typed={typed} setTyped={setTyped} onReveal={reveal} inputRef={input} />
          <Sky />
        </>
      ) : (
        <div data-slot="answer" className="stagger flex flex-1 flex-col gap-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p
              className={cn(
                'paper flex items-center gap-2 rounded-md bg-card px-3 py-2 text-small leading-none font-semibold',
                answered.correct ? 'text-success' : 'text-destructive'
              )}
            >
              {answered.correct ? <Check className="size-4" strokeWidth={2.5} /> : <X className="size-4" strokeWidth={2.5} />}
              {answered.correct ? 'Correct' : 'Incorrect'}
            </p>
            {answered.given && !answered.correct && (
              <span className="text-small text-muted-foreground">Your Answer: &ldquo;{answered.given}&rdquo;</span>
            )}
          </div>

          {/* The reference's rhythm: 8 inside a group, 24 between groups. */}
          <div className="flex flex-col gap-2">
            <Heading>{sense.term}</Heading>
            {sense.gloss && <p className="text-lead">{sense.gloss}</p>}
            {sense.accepted.length > 0 && (
              <p className="text-small text-muted-foreground">Also Accepted: {sense.accepted.join(', ')}</p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <p>{sense.definition}</p>
            <Caution>{sense.caution}</Caution>
            <p className="text-muted-foreground">&ldquo;{sense.example}&rdquo;</p>
            {entry.capture_note && (
              <p className="text-small text-muted-foreground">{entry.capture_note}</p>
            )}
          </div>

          {editing ? (
            <Card>
              <EditPanel
                entry={entry}
                sense={sense}
                snapshot={snapshot}
                onSnapshot={onSnapshot}
                onDone={() => setEditing(false)}
              />
            </Card>
          ) : (
            <div className="-ml-2 flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setEditing(true)}
              >
                <Pencil />
                Edit
              </Button>
              <FlagControl key={entry.id} entry={entry} snapshot={snapshot} onSnapshot={onSnapshot} />
            </div>
          )}

          <div className="mt-auto flex flex-col gap-3 pt-2">
            <Button size="xl" className="w-full pr-5" onClick={next} autoFocus>
              Next
              <ArrowRight />
            </Button>
            <p className="flex items-center justify-center gap-2 text-caption text-muted-foreground">
              <kind.icon className="size-4" />
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
    <p className="text-caption text-muted-foreground">
      Backlog: {count}
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
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-md border-2 border-input bg-secondary px-3 text-small font-medium backdrop-blur-xl">
        <Flag className="size-4" />
        Flagged
      </span>
    );
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

  // Its own line, under the actions. The row it sits in is pulled left by the
  // ghost buttons' padding, so this puts that back.
  return (
    <Card className="mt-2 ml-2 basis-[calc(100%-0.5rem)]">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor={`flag-${entry.id}`}>
            Note
            <span className="font-normal text-muted-foreground">Optional</span>
          </Label>
          <Input
            id={`flag-${entry.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
        </div>
        {failed && (
          <Notice tone="error" icon={TriangleAlert}>
            Not sent. Check your connection and try again.
          </Notice>
        )}
        <div className="flex items-center gap-2">
          <Button type="submit">Flag</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
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
  const { sense, card, counts } = item;

  if (card.type === 'recognition') {
    return (
      <div data-slot="question" data-kind="recognition" className="stagger flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Ask counts={counts}>What Does This Mean?</Ask>
          <Heading>{sense.term}</Heading>
        </div>
        <ul data-slot="options" className="stagger-list grid list-none gap-3 p-0">
          {(item.options ?? []).map((option, i) => (
            <li key={option}>
              <button
                className={cn(OPTION, 'items-start')}
                onClick={() => onReveal(option === correctOption(item))}
              >
                <kbd className={KEY}>
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
      <div data-slot="question" data-kind="identify" className="stagger flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Ask counts={counts}>Definition</Ask>
          <p data-slot="prompt" className="font-serif text-title">{sense.definition}</p>
        </div>
        {/* Two columns where there is room. A word is short enough that six of
         * them still read at a glance, which is the whole point of this card. */}
        <ul data-slot="options" className="stagger-list grid list-none gap-3 p-0 sm:grid-cols-2">
          {(item.options ?? []).map((option, i) => (
            <li key={option}>
              <button
                className={cn(OPTION, 'items-center font-semibold')}
                onClick={() => onReveal(option === sense.term)}
              >
                <kbd className={cn(KEY, 'font-normal')}>
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

  const shape = answerShape(sense.term);

  const submit = () => {
    if (!typed.trim()) return;
    onReveal(answerMatches(typed, sense), typed.trim());
  };

  return (
    <div data-slot="question" data-kind={card.type} className="stagger flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Ask counts={counts}>{card.type === 'reverse' ? 'Definition' : 'Situation'}</Ask>
        <p data-slot="prompt" className="font-serif text-title">{prompt}</p>
        {/* Many words fit a situation, and only one of them is in the bank.
         *  Spaced out so each dot reads as one letter; the one place in the app
         *  with letter-spacing. */}
        <p
          data-slot="shape"
          aria-label={`Starts with ${shape[0]}, ${shape.length} characters`}
          className="pt-2 text-lead tracking-[0.18em] text-muted-foreground"
        >
          {shape}
        </p>
      </div>
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
          placeholder="Answer"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
        />
        <Button size="xl" type="submit" className="w-full pr-5" disabled={!typed.trim()}>
          Check
          <ArrowRight />
        </Button>
      </form>
      <Button
        variant="quiet"
        size="sm"
        className="-ml-3 self-start"
        onClick={() => onReveal(false)}
      >
        Reveal Answer
      </Button>
    </div>
  );
}
