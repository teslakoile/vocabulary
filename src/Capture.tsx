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
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
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
      <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={onClose}>
        <ArrowLeft />
        Back to Practice
      </Button>

      <h1 className="font-serif text-[2.1rem] leading-[1.1] font-semibold tracking-tight">
        New Word
      </h1>

      <Card className="gap-4 px-4 py-5">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="headword" className="text-muted-foreground">
              Word or Phrase
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
            <Label htmlFor="note" className="text-muted-foreground">
              Note
              <span className="font-normal text-muted-foreground/60">Optional</span>
            </Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Source and Context"
            />
          </div>
          <Button size="xl" type="submit" className="w-full" disabled={!headword.trim()}>
            <Plus />
            Save
          </Button>
        </form>
      </Card>

      {failed && (
        <Card className="flex-row items-start gap-3 border-destructive/40 bg-destructive/10 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">
            That did not reach the server. Try again once you have a connection.
          </p>
        </Card>
      )}

      {saved.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs tracking-wide text-muted-foreground/70 uppercase">Saved</p>
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="list-none divide-y divide-border/70 p-0">
              {saved.map((word) => (
                <li key={word} className="flex items-center gap-2.5 px-4 py-3">
                  <Check className="size-4 shrink-0 text-brand" />
                  <span className="break-words">{word}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Shell>
  );
}
