import { TOPICS, TOPIC_LABEL, type Topic } from '../types';
import { Tag } from '@/components/ui/tag';

interface Props {
  value: Topic | null;
  onChange: (topic: Topic | null) => void;
  /** What the unfiltered tag says. Practice and browse read differently. */
  allLabel?: string;
}

/** One tag per kind of word, and one for all of them. */
export function TopicFilter({ value, onChange, allLabel = 'All' }: Props) {
  return (
    <div role="group" aria-label="Topic" className="flex flex-wrap gap-2">
      <Tag tone="any" selected={value === null} onClick={() => onChange(null)}>
        {allLabel}
      </Tag>
      {TOPICS.map((t) => (
        <Tag key={t} tone={t} selected={value === t} onClick={() => onChange(t)}>
          {TOPIC_LABEL[t]}
        </Tag>
      ))}
    </div>
  );
}
