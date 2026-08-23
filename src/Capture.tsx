/**
 * Capture.
 *
 * This screen is competing with typing a line into Google Keep, so it is one
 * field, one button, and it stays open for the next word. A captured word goes
 * in bare and is held out of review until a generation pass gives it senses;
 * nothing here blocks on that.
 */
import { useEffect, useRef, useState } from 'react';
import { captureEntry } from './store';

interface Props {
  onClose: () => void;
  onCaptured: () => void;
}

export default function Capture({ onClose, onCaptured }: Props) {
  const [headword, setHeadword] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  async function save() {
    const word = headword.trim();
    if (!word) return;
    setFailed(false);
    setHeadword('');
    setNote('');
    input.current?.focus();
    try {
      await captureEntry(word, note.trim() || undefined);
      setSaved((s) => [word, ...s]);
      onCaptured();
    } catch {
      // Capture is the one thing that must not be lost, so say so rather than
      // pretending. There is no offline queue for new words yet.
      setFailed(true);
      setHeadword(word);
      setNote(note);
    }
  }

  return (
    <main className="shell">
      <button className="link" onClick={onClose}>Back to practice</button>
      <h1>New word</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          ref={input}
          value={headword}
          onChange={(e) => setHeadword(e.target.value)}
          placeholder="the word or phrase"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="why you wrote it down (optional)"
        />
        <button className="primary" type="submit" disabled={!headword.trim()}>
          Save
        </button>
      </form>

      {failed && <p className="failed">That did not reach the server. Try again once you have a connection.</p>}

      {saved.length > 0 && (
        <>
          <p className="meta">saved just now</p>
          <ul className="rows">
            {saved.map((word) => (
              <li key={word}><span className="justsaved">{word}</span></li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
