import { TOPICS, TOPIC_LABEL, type Topic } from '../types';
import { Button } from '@/components/ui/button';

interface Props {
  value: Topic | null;
  onChange: (topic: Topic | null) => void;
  /** What the unfiltered chip says. Practice and browse read differently. */
  allLabel?: string;
}

/** One chip per kind of word, and one for all of them. */
export function TopicFilter({ value, onChange, allLabel = 'All' }: Props) {
  const chips: { key: Topic | null; label: string }[] = [
    { key: null, label: allLabel },
    ...TOPICS.map((t) => ({ key: t, label: TOPIC_LABEL[t] })),
  ];
  return (
    <div role="group" aria-label="Topic" className="flex flex-wrap gap-2">
      {chips.map(({ key, label }) => (
        <Button
          key={label}
          size="sm"
          variant={key === value ? 'default' : 'outline'}
          className="px-4"
          aria-pressed={key === value}
          onClick={() => onChange(key)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
