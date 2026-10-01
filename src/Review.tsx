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
import { answerBoard, answerMatches, boardSize, composeAnswer, lettersOf, type BoardToken, type Queue, type QueueItem } from './queue';
import type { Cue, Entry, Sense } from './types';
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

/** What the cards that ask for the word show: the definition, and a situation the
 *  word fits. Either alone leaves several words standing; together they leave
 *  one. The sense's example sentence is not used, because it contains the word. */
function Prompt({ sense, cue }: { sense: Sense; cue?: Cue }) {
  return (
    <>
      <p data-slot="prompt" className="font-serif text-title">{sense.definition}</p>
      {cue && (
        <div data-slot="situation" className="mt-4 flex flex-col gap-1">
          <p className="text-caption text-muted-foreground">Situation</p>
          <p>{cue.text}</p>
        </div>
      )}
    </>
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
          <Prompt sense={sense} cue={item.cue} />
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

  const board = answerBoard(sense.term);
  const given = item.reveal ?? [];
  const letters = lettersOf(typed);

  const submit = () => {
    if (!typed.trim()) return;
    // The blanks hold the missing letters, and the given ones are filled in
    // around them. Typing the whole word, given letters and all, also works.
    const whole = composeAnswer(board, given, letters);
    onReveal(answerMatches(whole, sense) || answerMatches(typed, sense), typed.trim());
  };

  return (
    <form
      data-slot="question"
      data-kind={card.type}
      className="stagger flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-2">
        <Ask counts={counts}>Definition</Ask>
        <Prompt sense={sense} cue={item.cue} />
      </div>
      <LetterBoard board={board} given={given} typed={typed} setTyped={setTyped} inputRef={inputRef} />
      <Button size="xl" type="submit" className="w-full pr-5" disabled={!typed.trim()}>
        Check
        <ArrowRight />
      </Button>
      <Button
        type="button"
        variant="quiet"
        size="sm"
        className="-ml-3 self-start"
        onClick={() => onReveal(false)}
      >
        Reveal Answer
      </Button>
    </form>
  );
}

/**
 * The answer as blanks, one underline per letter, with some letters already in.
 * The given letters sit on a pale chip and stay put; you type the rest and they
 * fill the empty blanks in order. The first letter of every word is always
 * given, so a situation that fits many words still says which one is asked for.
 *
 * It is a drawing of a real text field: the field lies over the board, invisible,
 * so the phone keyboard, paste and Enter all behave as they do anywhere else.
 * The blanks shrink to fit the longest run on one line, and a run is never
 * split across two.
 */
function LetterBoard({
  board,
  given,
  typed,
  setTyped,
  inputRef,
}: {
  board: BoardToken[][];
  given: number[];
  typed: string;
  setTyped: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [focused, setFocused] = useState(false);
  const letters = lettersOf(typed);
  const total = boardSize(board);
  const known = new Set(given);
  const blanks = total - known.size;

  // A run is a stretch of blanks and the mark that follows it, such as
  // `scaffolding/`. A run never splits; a word breaks between runs, the same
  // place the headword does, so a slash-joined answer is not squeezed onto one
  // line.
  type Run = { start: number; length: number; text: string; mark?: string };
  let at = 0;
  const words = board.map((word) => {
    const runs: Run[] = [];
    for (const token of word) {
      if (token.kind === 'slots') {
        runs.push({ start: at, length: token.length, text: token.text });
        at += token.length;
      } else if (runs.length) {
        runs[runs.length - 1]!.mark = token.text;
      } else {
        runs.push({ start: at, length: 0, text: '', mark: token.text });
      }
    }
    return runs;
  });

  // Where each empty blank sits among the empty blanks: the nth letter you type
  // goes in the nth one.
  const rank = new Map<number, number>();
  for (let i = 0, n = 0; i < total; i++) if (!known.has(i)) rank.set(i, n++);

  // The widest run, with a mark counted as half a blank, sets the blank size.
  const widest = Math.max(...words.flat().map((run) => run.length + (run.mark ? 0.5 : 0)));

  // Letters past the last blank still show, so a long answer is never hidden.
  // They sit in a word of their own, in the pale red the sky allows.
  const over = letters.slice(blanks);

  return (
    <div
      data-slot="board"
      className="relative [container-type:inline-size]"
      style={
        {
          '--slot': `min(2.5rem, calc((100cqw - ${widest}rem * 0.25) / ${widest}))`,
        } as React.CSSProperties
      }
    >
      <div
        aria-hidden
        className="flex flex-wrap gap-x-6 gap-y-4 font-serif"
        style={{ fontSize: 'calc(var(--slot) * 0.95)', lineHeight: 1 }}
      >
        {words.map((word, w) => (
          <div key={w} className="flex flex-wrap items-end gap-x-1 gap-y-4">
            {word.map((run, r) => (
              <div key={r} className="flex items-end gap-1">
                {Array.from({ length: run.length }, (_, i) => {
                  const index = run.start + i;
                  const isGiven = known.has(index);
                  const n = rank.get(index);
                  return (
                    <Blank
                      key={i}
                      letter={isGiven ? run.text[i] : n === undefined ? undefined : letters[n]}
                      given={isGiven}
                      active={focused && n !== undefined && n === letters.length}
                    />
                  );
                })}
                {run.mark && <span className="pb-1 text-muted-foreground">{run.mark}</span>}
              </div>
            ))}
          </div>
        ))}
        {over.length > 0 && (
          <div className="flex items-end gap-1">
            {over.map((letter, i) => (
              <Blank key={i} letter={letter} over />
            ))}
          </div>
        )}
      </div>
      {/* Sixteen pixels or more, or iOS zooms the page when it takes focus. */}
      <input
        ref={inputRef}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={`Answer, ${total} letters, ${given.length} given. Type the other ${blanks}.`}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        className="absolute inset-0 size-full cursor-text text-base opacity-0 caret-transparent"
      />
      {/* Always takes its line, so the board does not jump when it goes. */}
      <p aria-hidden className={cn('pt-4 text-caption text-muted-foreground', (focused || typed) && 'invisible')}>
        Tap to fill the blanks
      </p>
    </div>
  );
}

/** One blank: a letter on an underline. A given letter sits on a pale chip, so it
 *  reads as part of the puzzle rather than something you typed. The blank being
 *  typed into is the brightest, and pulses. */
function Blank({ letter, given, active, over }: { letter?: string; given?: boolean; active?: boolean; over?: boolean }) {
  return (
    <span
      data-slot="blank"
      data-given={given ? '' : undefined}
      data-filled={letter ? '' : undefined}
      className={cn(
        'inline-flex items-end justify-center border-b-[3px] pb-1 transition-colors duration-150',
        letter ? 'border-white' : 'border-white/50',
        given && 'rounded-t-sm bg-white/16',
        active && 'blank-active border-white',
        over && 'border-destructive text-destructive'
      )}
      style={{ width: 'var(--slot)', height: 'calc(var(--slot) * 1.45)' }}
    >
      {letter}
    </span>
  );
}
