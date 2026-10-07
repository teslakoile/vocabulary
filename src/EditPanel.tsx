/**
 * Inline correction, opened from a card's answer side.
 *
 * Correction is the only editing path in the app: no review gate before content
 * goes live, and no separate edit screen. When a definition reads wrong you fix
 * it in the moment, and the queue keeps your place.
 */
import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { TOPICS, TOPIC_LABEL, type Entry, type Sense, type Snapshot, type Topic } from './types';
import { saveEntry } from './store';
import { Notice } from '@/components/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Props {
  entry: Entry;
  sense: Sense;
  snapshot: Snapshot;
  onSnapshot: (snapshot: Snapshot) => void;
  onDone: () => void;
}

export default function EditPanel({ entry, sense, snapshot, onSnapshot, onDone }: Props) {
  const [draft, setDraft] = useState({
    term: sense.term,
    accepted: sense.accepted.join(', '),
    gloss: sense.gloss,
    definition: sense.definition,
    caution: sense.caution,
    example: sense.example,
    capture_note: entry.capture_note ?? '',
  });
  const [topics, setTopics] = useState<Topic[]>(() => TOPICS.filter((t) => entry.tags.includes(t)));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const set = (field: keyof typeof draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [field]: e.target.value }));

  async function save() {
    setSaving(true);
    setFailed(false);

    const updatedSense: Sense = {
      ...sense,
      term: draft.term.trim(),
      accepted: draft.accepted.split(',').map((a) => a.trim()).filter(Boolean),
      gloss: draft.gloss.trim(),
      definition: draft.definition.trim(),
      caution: draft.caution.trim(),
      example: draft.example.trim(),
    };
    const updatedEntry: Entry = {
      ...entry,
      capture_note: draft.capture_note.trim() || null,
      // A tag this screen does not know about is kept rather than dropped.
      tags: [...entry.tags.filter((t) => !TOPICS.includes(t as Topic)), ...topics],
      senses: entry.senses.map((s) => (s.id === sense.id ? updatedSense : s)),
    };

    // Update what is on screen first. A failed save is worth telling you about,
    // but it is not worth throwing away what you typed.
    onSnapshot({
      ...snapshot,
      entries: snapshot.entries.map((e) => (e.id === entry.id ? updatedEntry : e)),
    });

    try {
      await saveEntry(updatedEntry);
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`term-${sense.id}`}>Word</Label>
        <Input
          id={`term-${sense.id}`}
          value={draft.term}
          onChange={set('term')}
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`accepted-${sense.id}`}>Also Accepted</Label>
        <Input
          id={`accepted-${sense.id}`}
          value={draft.accepted}
          onChange={set('accepted')}
          placeholder="Comma Separated"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`gloss-${sense.id}`}>Short Meaning</Label>
        <Input id={`gloss-${sense.id}`} value={draft.gloss} onChange={set('gloss')} placeholder="to strengthen" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`definition-${sense.id}`}>Definition</Label>
        <Textarea id={`definition-${sense.id}`} value={draft.definition} onChange={set('definition')} rows={3} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`caution-${sense.id}`}>Caution</Label>
        <Textarea id={`caution-${sense.id}`} value={draft.caution} onChange={set('caution')} rows={3} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`example-${sense.id}`}>Example</Label>
        <Textarea id={`example-${sense.id}`} value={draft.example} onChange={set('example')} rows={2} />
      </div>
      <div className="grid gap-2">
        <Label>Topic</Label>
        <div role="group" aria-label="Topic" className="flex flex-wrap gap-2">
          {TOPICS.map((t) => {
            const on = topics.includes(t);
            return (
              <Button
                key={t}
                size="sm"
                variant={on ? 'default' : 'outline'}
                // On a white card the glass outline washes out, so the off state gets dark text.
                className={cn('px-4', !on && 'text-foreground')}
                aria-pressed={on}
                // A word keeps at least one topic, or no filter would ever show it.
                onClick={() => setTopics((cur) => (on ? (cur.length > 1 ? cur.filter((x) => x !== t) : cur) : [...cur, t]))}
              >
                {TOPIC_LABEL[t]}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`note-${sense.id}`}>Note</Label>
        <Textarea
          id={`note-${sense.id}`}
          value={draft.capture_note}
          onChange={set('capture_note')}
          rows={2}
          placeholder="Source and Context"
        />
      </div>

      {failed && (
        <Notice tone="error" icon={TriangleAlert}>
          Saved on this device only. It will not reach the server until you are back online.
        </Notice>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
