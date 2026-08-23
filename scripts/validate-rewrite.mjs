/**
 * Checks a rewrite batch before it is merged back into the corpus.
 *
 * The rules here are the ones a generation session cannot be trusted to hold
 * on its own, because each was broken once already:
 *   - the length tell, which made the correct answer the longest of six
 *     options in 100% of senses in the first corpus;
 *   - the two-sentence definition, which is what this rewrite exists to undo;
 *   - a word distractor that is a defensible answer, which is the failure
 *     mode the new definition-to-word card introduces.
 *
 * Usage: node scripts/validate-rewrite.mjs [files...]
 *        node scripts/validate-rewrite.mjs --all
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const REWRITE_DIR = '.scratch/vocab-pwa/corpus/rewrite';
const RAW_DIR = '.scratch/vocab-pwa/corpus/raw';

const MAX_DEFINITION = 90;
const N_DISTRACTORS = 5;
const N_WORD_DISTRACTORS = 5;
const OVERLAP_LIMIT = 0.1;

let failures = 0;
let warnings = 0;
const fail = (where, message) => { failures++; console.error(`FAIL  ${where}: ${message}`); };
const warn = (where, message) => { warnings++; console.warn(`warn  ${where}: ${message}`); };

/** Every term in the corpus, with the sense it belongs to. */
const corpus = new Map();
for (const f of readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'))) {
  const entry = JSON.parse(readFileSync(join(RAW_DIR, f), 'utf8'));
  for (const sense of entry.senses ?? []) {
    corpus.set(sense.term, { headword: entry.headword, definition: sense.definition });
  }
}

const STOP = new Set(
  ('to a an the of and or in on for that with it is not something someone but by as be are you your ' +
   'they their what which who this these those from into at than then rather over under about more ' +
   'most less own way work thing things people them there here when where how why can will would ' +
   'could no any one two both each its his her have has had does do done make made use used')
    .split(' ')
);
const bag = (text) =>
  new Set((text.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 3 && !STOP.has(w)));

function overlap(a, b) {
  const x = bag(a);
  const y = bag(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

const args = process.argv.slice(2);
const files =
  args.length === 0 || args[0] === '--all'
    ? readdirSync(REWRITE_DIR).filter((f) => /^\d\d-.*\.json$/.test(f)).map((f) => join(REWRITE_DIR, f))
    : args;

let senseCount = 0;
let twoSentence = 0;

for (const path of files) {
  const name = basename(path);
  let entry;
  try {
    entry = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(name, `unreadable JSON: ${error.message}`);
    continue;
  }
  if (!entry.headword) fail(name, 'missing headword');
  if (!Array.isArray(entry.senses) || entry.senses.length === 0) {
    fail(name, 'no senses');
    continue;
  }

  const siblings = new Set(entry.senses.map((s) => s.term));

  for (const sense of entry.senses) {
    senseCount++;
    const where = `${name} [${sense.term}]`;
    const definition = sense.definition ?? '';

    if (!corpus.has(sense.term)) {
      fail(where, `term is not in the corpus, so the merge will not find it`);
    }

    // Rule 10: one plain sentence.
    const sentences = (definition.match(/[.!?](\s|$)/g) ?? []).length;
    if (sentences > 1) {
      twoSentence++;
      if (!sense.needs_two) {
        fail(where, `${sentences} sentences and no "needs_two" flag`);
      } else {
        warn(where, `two sentences, flagged deliberately`);
      }
    }

    // Rule 11: length.
    if (!sense.needs_two && definition.length > MAX_DEFINITION) {
      fail(where, `definition is ${definition.length} characters, over the ${MAX_DEFINITION} limit`);
    }

    // Rule 12: no aside punctuation before the meaning lands.
    const aside = definition.match(/[:;]|\s[-–—]\s/);
    if (aside) fail(where, `definition contains "${aside[0].trim()}", which the brief rules out`);

    // Rule 13: the length tell, applied to the definition options.
    const distractors = sense.distractors ?? [];
    if (distractors.length !== N_DISTRACTORS) {
      fail(where, `${distractors.length} distractors, expected ${N_DISTRACTORS}`);
    } else {
      const longer = distractors.filter((d) => d.length >= definition.length).length;
      const shorter = distractors.filter((d) => d.length < definition.length).length;
      if (longer < 2 || shorter < 2) {
        fail(where, `length tell: ${longer} at or above ${definition.length} chars, ${shorter} below; needs 2 and 2`);
      }
      for (const d of distractors) {
        if (d === definition) fail(where, 'a distractor repeats the definition');
        if ((d.match(/[.!?](\s|$)/g) ?? []).length > 1) warn(where, `distractor runs to two sentences: "${d.slice(0, 50)}..."`);
      }
    }

    // Rule 14: word distractors must exist, be foreign, and be indefensible.
    const words = sense.word_distractors ?? [];
    if (words.length !== N_WORD_DISTRACTORS) {
      fail(where, `${words.length} word_distractors, expected ${N_WORD_DISTRACTORS}`);
    }
    if (new Set(words).size !== words.length) fail(where, 'duplicate word_distractors');
    for (const w of words) {
      if (!corpus.has(w)) { fail(where, `word distractor "${w}" is not a term in the corpus`); continue; }
      if (w === sense.term) fail(where, `word distractor "${w}" is the answer`);
      if (siblings.has(w)) fail(where, `word distractor "${w}" is a sibling sense of the same entry`);
      const score = overlap(definition, corpus.get(w).definition);
      if (score >= OVERLAP_LIMIT) {
        fail(where, `word distractor "${w}" overlaps the new definition at ${score.toFixed(2)}, so it is arguable`);
      }
    }
  }
}

console.log(`\n${senseCount} senses checked across ${files.length} files.`);
console.log(`${twoSentence} definitions run to two sentences.`);
console.log(failures ? `\n${failures} failures, ${warnings} warnings.` : `\nPASS. ${warnings} warnings.`);
process.exit(failures ? 1 : 0);
