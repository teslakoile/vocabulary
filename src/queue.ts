/**
 * The queue.
 *
 * There are no modes and no end. Cards that are due come first and count toward
 * the schedule; when they run out the same queue keeps serving cards that do
 * not. The transition is invisible, so free play is what the app does by
 * default rather than something to opt into.
 */
import type { Card, Cue, Entry, Sense, Snapshot, Topic } from './types';

/** How many due cards pass before a new one is let in. A backlog of due cards
 *  should not starve new words for weeks, which is what a strict due-first
 *  order would do. */
const NEW_CARD_EVERY = 5;

/** Where a wrong answer lands. Far enough that you recall it rather than echo
 *  it, near enough to stay inside one app-open. */
const REQUEUE_MIN = 8;
const REQUEUE_SPREAD = 3;

/** Cards kept queued ahead. Refilled lazily so free play never runs out. */
const LOOKAHEAD = 24;

/**
 * Minimum cards between two presentations of the same sense.
 *
 * Without this the three cards of a new word arrive back to back, because they
 * enter intake together. The second and third are then answered from the screen
 * you just read rather than from memory, which is both a worse rep and a lie to
 * FSRS: a confident Good says nothing about tomorrow.
 */
const SENSE_GAP = 8;

/**
 * Minimum cards between two presentations of the same prompt text.
 *
 * `identify`, `reverse` and `production` all show the definition and differ
 * only in whether you pick the word or type it. Eight apart is enough for two
 * different questions about one sense and nowhere near enough for the same
 * question twice, so these get their own, wider gap.
 */
const PROMPT_GAP = 24;

/** Wrong definitions shown beside the right one on a recognition card. */
const WRONG_OPTIONS = 3;

/** Wrong words shown beside the right one on an identify card. Five, not three:
 *  a word is two seconds of reading, so more options cost nothing and a one in
 *  six guess is worth more than a one in four. */
const WRONG_WORDS = 5;

export interface QueueItem {
  card: Card;
  sense: Sense;
  entry: Entry;
  /** True for due and new cards. False in free play, where answers are history
   *  rather than evidence about recall timing. */
  counts: boolean;
  /** The choices, shuffled. Definitions on a recognition card, words on an
   *  identify card. Absent on the two card types you type into. */
  options?: string[];
  /** What the screen actually shows, so the spacer can keep two cards asking
   *  the same question apart. */
  promptKey: string;
  /** A situation the word fits, shown beside the definition on every card that
   *  asks for the word. Many words fit one description and many fit one
   *  situation; seeing both is what narrows it to one. Which of the sense's cues
   *  this presentation uses. */
  cue?: Cue;
  /** The two cards you type into: positions of the answer's letters that are
   *  given, so the blanks you fill are a subset. */
  reveal?: number[];
}

const shuffle = <T>(items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

/** Shuffle the order words arrive in, but keep each word's own cards in the order
 *  they were given. The cards of a new word go easiest first, and `space` only
 *  ever pulls a card forward past another sense, so that order survives it. */
const shuffleBySense = (cards: Card[]): Card[] => {
  const groups = new Map<string, Card[]>();
  for (const card of cards) groups.set(card.sense_id, [...(groups.get(card.sense_id) ?? []), card]);
  return shuffle([...groups.values()]).flat();
};

const pick = <T>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];

/** Loose enough that a phone-keyboard typo is not a memory failure. */
const normalise = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/^to\s+/, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ');

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Does a typed answer count? Spelling is not what is being tested, so a single
 *  slip in a long word passes; short words must be exact, because at four
 *  letters one edit is a different word. */
export function answerMatches(typed: string, sense: Sense): boolean {
  const given = normalise(typed);
  if (!given) return false;
  for (const form of [sense.term, ...sense.accepted]) {
    const target = normalise(form);
    if (given === target) return true;
    if (target.length >= 8 && withinOneEdit(given, target)) return true;
  }
  return false;
}

/** The first letter of each word and a dot for every other letter, so
 *  `by and large` shows as `b· a·· l····`. A situation fits many words, and
 *  nobody remembers which of them are in the bank; the shape says which one is
 *  being asked for without spelling it. A label such as `(verb)` is dropped. */
export function answerShape(term: string): string {
  return term
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .replace(/[\p{L}\p{N}]+/gu, (word) => word[0] + '·'.repeat(word.length - 1));
}

/** One run of an answer: a stretch of letters to fill in, or punctuation that is
 *  already there, such as the hyphen in `buy-in`. */
export type BoardToken = { kind: 'slots'; text: string; length: number } | { kind: 'mark'; text: string };

/** The answer as a hangman board: an array of words, each an array of tokens.
 *  Same rules as `answerShape`, but structured so the screen can draw one blank
 *  per letter instead of a string of dots. */
export function answerBoard(term: string): BoardToken[][] {
  return term
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      (word.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? []).map((part): BoardToken =>
        /^[\p{L}\p{N}]/u.test(part)
          ? { kind: 'slots', text: part, length: Array.from(part).length }
          : { kind: 'mark', text: part }
      )
    );
}

/**
 * Which letters of the answer are given, as positions across the whole board.
 * The first letter of every word always is, so a situation that fits many words
 * still says which one is asked for. Beyond that, about one letter in three,
 * chosen at random, so the same word is not the same puzzle twice. A word of
 * one to three letters shows only its first.
 */
export function pickReveals(board: BoardToken[][]): number[] {
  const given: number[] = [];
  let at = 0;
  for (const word of board) {
    for (const token of word) {
      if (token.kind !== 'slots') continue;
      const rest = Array.from({ length: token.length - 1 }, (_, i) => at + i + 1);
      given.push(at, ...shuffle(rest).slice(0, Math.floor((token.length - 1) / 3)));
      at += token.length;
    }
  }
  return given.sort((a, b) => a - b);
}

/** Every letter of the answer, in board order. */
export const boardLetters = (board: BoardToken[][]): string[] =>
  board.flatMap((word) => word.flatMap((t) => (t.kind === 'slots' ? Array.from(t.text) : [])));

/** The whole answer as you have it: given letters where they belong, and what
 *  you typed in the blanks between them. */
export function composeAnswer(board: BoardToken[][], given: number[], typed: string[]): string {
  const known = new Set(given);
  let at = 0;
  return fillBoard(
    board,
    boardLetters(board).map((letter, i) => (known.has(i) ? letter : (typed[at++] ?? '')))
  );
}

/** Only the characters that go in a blank. Spaces and punctuation are typed
 *  freely and ignored, so `byandlarge` and `by and large` fill the same board. */
export const lettersOf = (typed: string): string[] => Array.from(typed.replace(/[^\p{L}\p{N}]/gu, ''));

export const boardSize = (board: BoardToken[][]): number =>
  board.reduce((sum, word) => sum + word.reduce((n, t) => n + (t.kind === 'slots' ? t.length : 0), 0), 0);

/** Put letters back into the board's own spacing and punctuation. */
export function fillBoard(board: BoardToken[][], letters: string[]): string {
  let at = 0;
  return board
    .map((word) =>
      word
        .map((t) => {
          if (t.kind === 'mark') return t.text;
          const out = letters.slice(at, at + t.length).join('');
          at += t.length;
          return out;
        })
        .join('')
    )
    .join(' ');
}

interface Indexed {
  senses: Map<string, Sense>;
  entries: Map<string, Entry>;
}

function index(snapshot: Snapshot): Indexed {
  const entries = new Map(snapshot.entries.map((e) => [e.id, e]));
  const senses = new Map<string, Sense>();
  for (const entry of snapshot.entries) for (const sense of entry.senses) senses.set(sense.id, sense);
  return { senses, entries };
}

/** A card is eligible when its entry is live and actually has content. Bare
 *  entries are held out of review until they have been through generation.
 *  With a topic chosen, only entries tagged with it are practised. */
function eligible(snapshot: Snapshot, { senses, entries }: Indexed, topic: Topic | null): Card[] {
  return snapshot.cards.filter((card) => {
    const sense = senses.get(card.sense_id);
    if (!sense) return false;
    const entry = entries.get(sense.entry_id);
    if (!entry || entry.archived_at !== null || entry.status !== 'ready') return false;
    return !topic || entry.tags.includes(topic);
  });
}

function present(card: Card, { senses, entries }: Indexed, counts: boolean): QueueItem | null {
  const sense = senses.get(card.sense_id);
  if (!sense) return null;
  const entry = entries.get(sense.entry_id);
  if (!entry) return null;

  // Every card that asks for the word shows the definition, so they share a key;
  // recognition shows the word and keys on the card itself.
  const promptKey = card.type === 'recognition' ? card.id : `${sense.id}:definition`;

  const item: QueueItem = { card, sense, entry, counts, promptKey };

  if (card.type === 'identify') {
    // Wrong words come from the corpus itself and were chosen per sense, because
    // a word picked at random is often defensible: a short plain definition of
    // `esoteric` can be argued to fit `obscure`.
    item.options = shuffle([sense.term, ...sense.word_distractors.slice(0, WRONG_WORDS)]);
  }

  if (card.type === 'recognition' && sense.gloss && sense.gloss_distractors.length >= WRONG_OPTIONS) {
    // "What Does bolster Mean?" answered with four short dictionary glosses.
    // The wrong three were written in the same grammatical form as the right
    // one, so the card cannot be answered by spotting the only verb.
    item.options = shuffle([sense.gloss, ...sense.gloss_distractors.slice(0, WRONG_OPTIONS)]);
  } else if (card.type === 'recognition') {
    // A sense with no gloss yet, such as a word captured in the app, falls
    // back to full definitions.
    //
    // Sibling senses make the sharpest distractors, which is the whole reason
    // an entry like scaffolding / harness / sandbox was written down together.
    //
    // Three wrong ones, not five. Six long definitions is more reading than
    // recalling, and on a phone the last two sit below the fold anyway.
    const siblings = entry.senses.filter((s) => s.id !== sense.id).map((s) => s.definition);
    const wrong = [...siblings, ...sense.distractors].filter(Boolean).slice(0, WRONG_OPTIONS);
    item.options = shuffle([sense.definition, ...wrong]);
  }

  if (card.type !== 'recognition' && sense.cues.length) {
    item.cue = pick(sense.cues);
  }

  if (card.type === 'reverse' || card.type === 'production') {
    item.reveal = pickReveals(answerBoard(sense.term));
  }

  return item;
}

/** What was actually put on screen, for the two spacing rules. */
export interface Shown {
  sense: string;
  prompt: string;
}

/**
 * Pull cards forward past a card whose sense, or whose prompt, was seen too
 * recently. Greedy and order-preserving otherwise, so due cards keep their
 * priority; a card only moves when leaving it in place would stack two views of
 * the same word or ask the same question twice.
 *
 * The two rules degrade rather than stall. A candidate satisfying both wins; if
 * none does, the sense rule alone decides; if nothing at all qualifies, the next
 * card goes out as it is, because a short gap beats an empty queue.
 */
function space(items: QueueItem[], from: number, history: Shown[] = []): QueueItem[] {
  const head = items.slice(0, from);
  const pending = items.slice(from);
  const out: QueueItem[] = [...head];
  // Seeded with what was actually shown, so a rebuild mid-session cannot serve
  // a word again straight after you just answered it.
  const recent: Shown[] = [...history, ...head.map(shownOf)].slice(-PROMPT_GAP);

  const sawSense = (id: string) => recent.slice(-SENSE_GAP).some((r) => r.sense === id);
  const sawPrompt = (key: string) => recent.some((r) => r.prompt === key);

  while (pending.length) {
    let at = pending.findIndex((i) => !sawSense(i.sense.id) && !sawPrompt(i.promptKey));
    if (at === -1) at = pending.findIndex((i) => !sawSense(i.sense.id));
    if (at === -1) at = 0;
    const [item] = pending.splice(at, 1);
    out.push(item!);
    recent.push(shownOf(item!));
    if (recent.length > PROMPT_GAP) recent.shift();
  }
  return out;
}

const shownOf = (item: QueueItem): Shown => ({ sense: item.sense.id, prompt: item.promptKey });

export class Queue {
  private upcoming: QueueItem[] = [];
  private indexed: Indexed;
  private pool: Card[] = [];
  /** What was actually shown, most recent last. Survives a rebuild. */
  private history: Shown[] = [];

  constructor(private snapshot: Snapshot, private topic: Topic | null = null) {
    this.indexed = index(snapshot);
    this.rebuild();
  }

  /** Practise one kind of word, or all of them. Starts the queue over, so the
   *  card on screen belongs to the old choice and the caller must ask again. */
  setTopic(topic: Topic | null): void {
    if (topic === this.topic) return;
    this.topic = topic;
    this.rebuild();
  }

  /** Called after a sync replaces the snapshot. Keeps the current card in place
   *  so a background refresh cannot yank the screen out from under an answer. */
  replaceSnapshot(snapshot: Snapshot): void {
    const current = this.upcoming[0];
    this.snapshot = snapshot;
    this.indexed = index(snapshot);
    this.rebuild();
    if (current) {
      this.upcoming = space(
        [current, ...this.upcoming.filter((i) => i.card.id !== current.card.id)],
        1,
        this.history
      );
    }
  }

  private rebuild(): void {
    const now = new Date().toISOString();
    const cards = eligible(this.snapshot, this.indexed, this.topic);

    const due = cards.filter((c) => c.due_at !== null && c.due_at <= now);
    const allowance = Math.max(0, this.snapshot.settings.new_cards_per_day - this.snapshot.intake_today);
    // Intake order decides which words are let in today. It must not decide
    // which one you meet first, or the same word opens the app every time until
    // its three cards are used up.
    const fresh = shuffleBySense(
      cards
        .filter((c) => c.fsrs_state === null)
        .sort((a, b) => (a.intake_order ?? Infinity) - (b.intake_order ?? Infinity))
        .slice(0, allowance)
    );

    const counting = shuffle(due);
    const ordered: Card[] = [];
    const waiting = [...fresh];
    counting.forEach((card, i) => {
      ordered.push(card);
      if ((i + 1) % NEW_CARD_EVERY === 0 && waiting.length) ordered.push(waiting.shift()!);
    });
    ordered.push(...waiting);

    const countingIds = new Set(ordered.map((c) => c.id));
    // Free play prefers what has been seen least recently, so the loop does not
    // feel like a fixed rotation.
    //
    // Shuffle before the sort, not after. Sort is stable, so cards that have
    // been answered keep their date order while cards that have never been seen
    // land in a random order rather than the order the API happened to return.
    // That order is physical row order, and it is not neutral: adding the
    // `identify` type put all 95 of its cards at the end of the table, so the
    // stalest third held none of them and free play served 3 in 40.
    this.pool = shuffle(cards.filter((c) => !countingIds.has(c.id)))
      .sort((a, b) => (a.last_event_at ?? '').localeCompare(b.last_event_at ?? ''));

    this.upcoming = space(
      ordered.map((card) => present(card, this.indexed, true)).filter((i): i is QueueItem => i !== null),
      0,
      this.history
    );
    this.top();
  }

  /** Keep enough queued that peek() never returns nothing while cards exist. */
  private top(): void {
    if (!this.pool.length) return;
    const queued = new Set(this.upcoming.map((i) => i.card.id));
    while (this.upcoming.length < LOOKAHEAD) {
      // Sample from the stalest third, so ordering is stable but not identical
      // between app-opens.
      const window = Math.max(1, Math.floor(this.pool.length / 3));
      const candidates = this.pool.slice(0, window).filter((c) => !queued.has(c.id));
      const card = pick(candidates) ?? this.pool.find((c) => !queued.has(c.id));
      if (!card) return;
      queued.add(card.id);
      this.pool = [...this.pool.filter((c) => c.id !== card.id), card];
      const item = present(card, this.indexed, false);
      if (item) this.upcoming.push(item);
    }
    // Keep index 0 where it is: it may already be on screen.
    this.upcoming = space(this.upcoming, 1, this.history);
  }

  /**
   * Put one card at the front. Tapping a nudge should open the card the
   * notification was about, not whatever happened to be next.
   */
  pin(cardId: string): void {
    const queued = this.upcoming.findIndex((i) => i.card.id === cardId);
    if (queued > 0) {
      const [item] = this.upcoming.splice(queued, 1);
      this.upcoming.unshift(item!);
      return;
    }
    if (queued === 0) return;
    const card = this.pool.find((c) => c.id === cardId);
    if (!card) return;
    // Arriving from a notification is not the same as the schedule asking for
    // it, so it does not count unless it was already due.
    const now = new Date().toISOString();
    const item = present(card, this.indexed, card.due_at !== null && card.due_at <= now);
    if (item) this.upcoming.unshift(item);
  }

  peek(): QueueItem | undefined {
    this.top();
    return this.upcoming[0];
  }

  /** Advance past the current card. A wrong answer comes back inside this
   *  app-open rather than being rescheduled and forgotten. */
  advance(correct: boolean): void {
    const item = this.upcoming.shift();
    if (!item) return;
    this.history = [...this.history, shownOf(item)].slice(-PROMPT_GAP);
    if (!correct) {
      const at = Math.min(
        this.upcoming.length,
        REQUEUE_MIN + Math.floor(Math.random() * REQUEUE_SPREAD)
      );
      // The repeat never counts: it is the same question minutes later, which
      // says nothing about whether the word will still be there tomorrow.
      this.upcoming.splice(at, 0, { ...item, counts: false });
    }
    this.top();
  }

  /** Due cards remaining, for the quiet marker. Never shown as a target. */
  countingLeft(): number {
    return this.upcoming.filter((i) => i.counts).length;
  }
}
