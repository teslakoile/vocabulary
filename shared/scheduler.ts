/**
 * The one place FSRS is configured. Both the Worker and the browser import it,
 * so an event applied offline and the same event replayed on the server land on
 * the same schedule.
 *
 * Default parameters, permanently. Optimising needs roughly 1,000 reviews of
 * history and buys single-digit percent at this size.
 */
import { createEmptyCard, fsrs, generatorParameters, type Card as FsrsCard } from 'ts-fsrs';
import type { Grade } from './types';

const engine = fsrs(generatorParameters({ enable_fuzz: true }));

/** Right or wrong is all the app knows. 3 is Good, 1 is Again. */
export const gradeFor = (correct: boolean): Grade => (correct ? 3 : 1);

export function parseState(serialised: string | null, fallbackNow: Date): FsrsCard {
  if (!serialised) return createEmptyCard(fallbackNow);
  const raw = JSON.parse(serialised) as Record<string, unknown>;
  return {
    ...(raw as unknown as FsrsCard),
    due: new Date(raw.due as string),
    last_review: raw.last_review ? new Date(raw.last_review as string) : undefined,
  };
}

export interface Applied {
  fsrs_state: string;
  due_at: string;
}

/** Apply one grade to one card. Pure: same inputs, same schedule. */
export function applyGrade(serialised: string | null, grade: Grade, at: Date): Applied {
  const card = parseState(serialised, at);
  const { card: next } = engine.next(card, at, grade);
  return { fsrs_state: JSON.stringify(next), due_at: new Date(next.due).toISOString() };
}
