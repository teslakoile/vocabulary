/**
 * The review screen. One card at a time, forever.
 *
 * There is no session, no daily count and no done state, so nothing here counts
 * anything up or congratulates you. The only status the screen carries is a
 * quiet dot marking a card whose answer moves the schedule.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyGrade, gradeFor } from '../shared/scheduler';
import EditPanel from './EditPanel';
import { answerMatches, type Queue, type QueueItem } from './queue';
import { applyLocally, flush, recordEvent, type Snapshot } from './store';

interface Props {
  queue: Queue;
  snapshot: Snapshot;
  onSnapshot: (snapshot: Snapshot) => void;
}

type Answered = { correct: boolean; given?: string } | null;

export default function Review({ queue, snapshot, onSnapshot }: Props) {
  const [item, setItem] = useState<QueueItem | undefined>(() => queue.peek());
  const [answered, setAnswered] = useState<Answered>(null);
  const [typed, setTyped] = useState('');
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!answered && item && item.card.type !== 'recognition') input.current?.focus();
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
    if (answered || !item || item.card.type !== 'recognition') return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      const options = item.options ?? [];
      if (!Number.isInteger(n) || n < 1 || n > options.length) return;
      e.preventDefault();
      reveal(options[n - 1] === item.sense.definition);
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
      <main className="shell">
        <p className="placeholder">
          Nothing to practise yet. Words appear here once they have been through generation.
        </p>
      </main>
    );
  }

  const { sense, entry, card } = item;

  return (
    <main className="shell review">
      {item.counts && <span className="counts" title="This answer moves the schedule" />}

      {!answered ? (
        <Question item={item} typed={typed} setTyped={setTyped} onReveal={reveal} inputRef={input} />
      ) : (
        <>
          <div className={`verdict ${answered.correct ? 'right' : 'wrong'}`}>
            {answered.correct ? 'Right' : 'Not this time'}
            {answered.given && !answered.correct && <em> you wrote &ldquo;{answered.given}&rdquo;</em>}
          </div>

          <h1 className="term">{sense.term}</h1>
          {sense.accepted.length > 0 && <p className="accepted">also {sense.accepted.join(', ')}</p>}

          <p className="definition">{sense.definition}</p>
          <p className="caution">{sense.caution}</p>
          <p className="example">&ldquo;{sense.example}&rdquo;</p>
          {entry.capture_note && <p className="note">{entry.capture_note}</p>}

          {editing ? (
            <EditPanel entry={entry} sense={sense} snapshot={snapshot} onSnapshot={onSnapshot} onDone={() => setEditing(false)} />
          ) : (
            <button className="link" onClick={() => setEditing(true)}>
              Fix this
            </button>
          )}

          <button className="primary" onClick={next} autoFocus>
            Next
          </button>

          <p className="meta">
            {card.type === 'recognition' ? 'recognition' : card.type === 'reverse' ? 'from the definition' : 'from a situation'}
          </p>
        </>
      )}
    </main>
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
      <>
        <h1 className="term">{sense.term}</h1>
        <ul className="options">
          {(item.options ?? []).map((option, i) => (
            <li key={option}>
              <button onClick={() => onReveal(option === sense.definition)}>
                <kbd>{i + 1}</kbd>
                <span>{option}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const prompt =
    card.type === 'reverse' ? sense.definition : (item.cue?.text ?? sense.definition);

  const submit = () => {
    if (!typed.trim()) return;
    onReveal(answerMatches(typed, sense), typed.trim());
  };

  return (
    <>
      <p className="prompt">{prompt}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
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
        <button className="primary" type="submit" disabled={!typed.trim()}>
          Check
        </button>
      </form>
      <button className="link" onClick={() => onReveal(false)}>
        I don&rsquo;t know
      </button>
    </>
  );
}
