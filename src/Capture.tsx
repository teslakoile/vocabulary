/**
 * Capture.
 *
 * This screen is competing with typing a line into Google Keep, so it is one
 * field, one button, and it stays open for the next word. A captured word goes
 * in bare and is held out of review until a generation pass gives it senses;
 * nothing here blocks on that.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Plus, TriangleAlert } from 'lucide-react';
import { captureEntry } from './store';
import { Heading, Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/notice';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    <Shell>
      <Button variant="ghost" size="sm" className="-ml-2 self-start text-muted-foreground" onClick={onClose}>
        <ArrowLeft />
        Back to practice
      </Button>

      <Heading className="pb-1">New word</Heading>

      <Card>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="headword">
              The word or phrase
            </Label>
            <Input
              id="headword"
              ref={input}
              value={headword}
              onChange={(e) => setHeadword(e.target.value)}
              placeholder="hyperscaler"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="note">
              Why you wrote it down
              <span className="font-normal text-muted-foreground">optional</span>
            </Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="who said it, and what it landed on"
            />
          </div>
          <Button size="xl" type="submit" className="mt-1 w-full pr-5" disabled={!headword.trim()}>
            Save
            <Plus />
          </Button>
        </form>
      </Card>

      {failed && (
        <Notice tone="error" icon={TriangleAlert}>
          That did not reach the server. Try again once you have a connection.
        </Notice>
      )}

      {saved.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-small text-muted-foreground">Saved just now</p>
          <Card className="gap-0 overflow-hidden p-0">
            <ul className="list-none divide-y divide-border p-0">
              {saved.map((word) => (
                <li key={word} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success/12 text-success">
                    <Check className="size-4" strokeWidth={2.5} />
                  </span>
                  <span className="font-semibold break-words">{word}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Shell>
  );
}
