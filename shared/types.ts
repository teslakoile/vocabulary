/** Shapes shared by the Worker and the PWA. One definition, two consumers. */

/**
 * Order matters: it is the order a sense's cards enter intake, easiest first.
 * `recognition` shows the word and asks for the meaning, `identify` shows the
 * meaning and asks for the word, and the last two ask you to produce it.
 */
export const CARD_TYPES = ['recognition', 'identify', 'reverse', 'production'] as const;
export type CardType = (typeof CARD_TYPES)[number];

/** FSRS ratings. Kyle never self-grades: the app answers right/wrong for him. */
export type Grade = 1 | 2 | 3 | 4;

/**
 * The kinds of use a meaning can be tagged with. The topic belongs to a sense,
 * because one word often means different things in different fields. A sense may
 * carry more than one, and an entry's own tags are the union of its senses'.
 */
export const TOPICS = ['general', 'tech', 'business'] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABEL: Record<Topic, string> = { general: 'General', tech: 'Tech', business: 'Business' };

/**
 * The topics a meaning belongs to. A sense with none of its own (an older cached
 * snapshot, or a word not yet refined) falls back to its entry's.
 */
export const topicsOfSense = (sense: { tags?: string[] }, entry: { tags: string[] }): string[] =>
  sense.tags?.length ? sense.tags : entry.tags;

export interface Cue {
  text: string;
  setting: 'work' | 'life';
}

export interface Sense {
  id: string;
  entry_id: string;
  position: number;
  term: string;
  accepted: string[];
  definition: string;
  caution: string;
  example: string;
  cues: Cue[];
  /** 5 wrong definitions, for the card that shows the word. */
  distractors: string[];
  /** 5 wrong words taken from other entries, for the card that shows the definition. */
  word_distractors: string[];
  /** The dictionary-plain meaning in 2 to 6 words, e.g. "to strengthen". */
  gloss: string;
  /** 3 wrong glosses in the same grammatical form, for the recognition card. */
  gloss_distractors: string[];
  /** Which topics this meaning belongs to. Practice filters on this. */
  tags: string[];
  prompt_version: number | null;
  updated_at: string;
}

export interface Entry {
  id: string;
  headword: string;
  capture_note: string | null;
  tags: string[];
  status: 'bare' | 'generating' | 'ready' | 'failed';
  archived_at: string | null;
  /** Set when Kyle flags a word for the next refine session. */
  flagged_at: string | null;
  flag_note: string | null;
  updated_at: string;
  senses: Sense[];
}

export interface Card {
  id: string;
  sense_id: string;
  type: CardType;
  /** Serialised ts-fsrs card. Null means the card has never been seen. */
  fsrs_state: string | null;
  due_at: string | null;
  last_event_at: string | null;
  intake_order: number | null;
}

export interface ReviewEvent {
  /** Client-generated UUID. This is what makes the log safe to resend. */
  id: string;
  card_id: string;
  graded_at: string;
  grade: Grade;
  /**
   * Free play does not move the schedule. The flag rides on the event rather
   * than being inferred later, because whether a card was due is a fact about
   * the moment it was answered.
   */
  counts_toward_schedule: boolean;
  device?: string;
}

export interface PullResponse {
  entries: Entry[];
  cards: Card[];
  settings: { timezone: string; nudge_hour: number; new_cards_per_day: number };
  /** Cards already let in today, against new_cards_per_day. */
  intake_today: number;
  server_time: string;
}
