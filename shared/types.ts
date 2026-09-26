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
