/**
 * Assigns the five wrong words on every identify card, evenly.
 *
 * A generation session cannot do this well and it is not the session's fault.
 * Each agent sees its own slice, reaches for the words that are obviously far
 * from its own senses, and the whole corpus converges on the same handful: in
 * one measured batch `wordsmith` was a wrong option in 12 of 23 senses. Two
 * things break when that happens. The overused word becomes learnable as
 * never-the-answer, and by the time its own card comes up you have been shown
 * it as wrong forty times.
 *
 * So the choice is made here instead, where the whole corpus is visible:
 *
 *   1. A word is eligible for a sense when it is not that sense's own term, not
 *      a sibling sense of the same entry, and its definition does not overlap
 *      the sense's definition enough to be arguable.
 *   2. Senses are served most-constrained first, so a sense with few eligible
 *      words is not left with none.
 *   3. Each sense takes the five least-used eligible words, which spreads usage
 *      about as evenly as the eligibility graph allows.
 *
 * Deterministic: same corpus in, same assignment out.
 *
 * Usage: node scripts/assign-word-distractors.mjs [--dry]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW_DIR = '.scratch/vocab-pwa/corpus/raw';
const WANTED = 5;
const OVERLAP_LIMIT = 0.1;
const dry = process.argv.includes('--dry');

const STOP = new Set(
  ('to a an the of and or in on for that with it is not something someone but by as be are you your ' +
   'they their what which who this these those from into at than then rather over under about more ' +
   'most less own way work thing things people them there here when where how why can will would ' +
   'could no any one two both each its his her have has had does do done make made use used')
    .split(' ')
);
const bag = (text) =>
  new Set((String(text).toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 3 && !STOP.has(w)));

function overlap(a, b) {
  const x = bag(a);
  const y = bag(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

/**
 * Pairs that a word-overlap score cannot catch.
 *
 * The metric compares vocabulary, so it catches two definitions written from
 * the same words. It misses two definitions that mean the same thing in
 * different words, and those are the ones that make a card unfair. The
 * generation agents read every sense and reported these, the pairs they found, plus
 * those added as meanings were split. Each scored under the overlap limit and would have passed.
 *
 * Symmetric: listing a pair once blocks it in both directions.
 */
const BLOCKED = [
  ['esoteric', 'obscure (verb)'],
  ['esoteric', 'obscure (adjective)'],
  ['obfuscate', 'obscure (verb)'],
  ['obfuscate', 'obscure (adjective)'],
  ['obscure (verb)', 'surreptitiously'],
  ['obscure (adjective)', 'surreptitiously'],
  ['deliberate', 'obfuscate'],
  ['eschew', 'obfuscate'],
  ['obfuscate', 'surreptitiously'],
  ['advocate', 'sponsorship'],
  ['advocate for', 'sponsorship'],
  ['bolster', 'sponsorship'],
  ['executive presence', 'gravitas'],
  ['executive presence', 'top brass'],
  ['incremental', 'progressive'],
  ['bolster', 'incremental'],
  ['incremental', 'trivial'],
  ['flywheel effect', 'progressive'],
  ['broad', 'substantial'],
  ['substantial', 'tectonic shift'],
  ['nontrivial', 'substantial'],
  ['long-horizon', 'nontrivial'],
  ['substantiate', 'verifiability'],
  ['substantiate', 'verifiable rewards'],
  ['substantiate', 'unequivocal'],
  ['bolster', 'substantiate'],
  ['institutional knowledge', 'lay of the land'],
  ['lay of the land', 'tacit knowledge'],
  ['lay of the land', 'sleuthing'],
  ['failure mode', 'watch outs'],
  ['fearless forecast', 'watch outs'],
  ['ducks in a row', 'play it by ear'],
  ['ducks in a row', 'north star'],
  ['harness', 'lean on'],
  ['lean on', 'scaffolding'],
  ['lean on', 'pick your brain'],
  ['amenable (person)', 'buy-in'],
  ['amenable (task)', 'buy-in'],
  ['attuned', 'cognizant'],
  ['daily driver', 'dogfooding'],
  ['blanket approval', 'run it by you'],
  ['disambiguate', 'elucidate'],
  ['amenable (person)', 'lend itself'],
  ['amenable (task)', 'lend itself'],
  ['amenable (person)', 'attuned'],
  ['amenable (task)', 'attuned'],
  ['first principles', 'primitive'],
  ['first principles', 'heuristic'],
  ['semantic layer', 'substrate'],
  ['primitive', 'substrate'],
  ['persist', 'serialize'],
  ['build that muscle', 'persistence'],
  ['despondent', 'persistence'],
  ['ephemeral', 'scaffolding'],
  ['squarely', 'unequivocal'],
  ['fearless forecast', 'unequivocal'],
  ['esoteric', 'tacit knowledge'],
  ['esoteric', 'institutional knowledge'],
  ['esoteric', 'obfuscate'],
  ['esoteric', 'nontrivial'],
  ['broad', 'continuum'],
  ['ephemeral', 'sandbox'],
  ['heuristic', 'tacit knowledge'],
  ['by and large', 'heuristic'],
  ['advocate for', 'bolster'],
  ['finesse', 'tacit knowledge'],
  ['obscure (verb)', 'tacit knowledge'],
  ['obscure (adjective)', 'tacit knowledge'],
  ['institutional knowledge', 'persist'],
  ['institutional knowledge', 'scaffolding'],
  ['institutional knowledge', 'lend itself'],
  ['fearless forecast', 'squarely'],
  ['squarely', 'wordsmith'],
  ['elucidate', 'wordsmith'],
  ['disambiguate', 'wordsmith'],
  ['deliberate', 'eschew'],
  ['eschew', 'front and center'],
  ['eschew', 'surreptitiously'],
  ['frontier', 'hyperscaler'],
  ['broad', 'by and large'],
  ['long-horizon', 'persistence'],
  ['dogfooding', 'long-horizon'],
  ['heuristic', 'play it by ear'],
  ['first principles', 'play it by ear'],
  ['pick your brain', 'run it by you'],
  ['pick your brain', 'tacit knowledge'],
  ['front and center', 'squarely'],
  ['build that muscle', 'community of practice'],
  ['build that muscle', 'center of excellence'],
  ['flywheel effect', 'incremental'],
  ['flywheel effect', 'second order effects'],
  ['broad', 'superset'],
  ['center of excellence', 'squarely'],
  ['diaspora', 'in pockets'],
  ['in pockets', 'obfuscate'],
  ['deliberate', 'ephemeral'],
  ['contrived', 'ephemeral'],
  ['sleuthing', 'tacit knowledge'],
  ['institutional knowledge', 'sleuthing'],
  ['harness', 'hot-swap'],
  ['hot-swap', 'lean on'],
  ['second order effects', 'trivial'],
  ['idempotent', 'second order effects'],
  ['dogfooding', 'substrate'],
  ['dogfooding', 'run it by you'],
  ['daily driver', 'diaspora'],
  ['broadly', 'by and large'],
  ['broad', 'broadly'],
  ['persistence', 'serialize'],
  ['primitive', 'scaffolding (AI)'],
  ['scaffolding (AI)', 'substrate'],
  ['carte blanche', 'run it by you'],
  ['stark', 'unequivocal'],
  ['making strides', 'inroads'],
  ['making strides', 'incremental'],
  ['making strides', 'progressive'],
  ['meat proxy', 'advocate'],
  ['misfire policy', 'failure mode'],
  ['race condition', 'dual-write problem'],
  ['race condition', 'failure mode'],
  ['oriented', 'attuned'],
];

const blocked = new Set();
for (const [a, b] of BLOCKED) {
  blocked.add(`${a}\u0000${b}`);
  blocked.add(`${b}\u0000${a}`);
}
const isBlocked = (a, b) => blocked.has(`${a}\u0000${b}`);

/**
 * Stable, alphabet-independent tie-break.
 *
 * Sorting equally-used candidates by name looked harmless and was not: the
 * words picked for a sense came out alphabetically clustered, which put the
 * correct answer first or last among its six options on 89 of 95 cards. Hashing
 * the pair keeps the assignment deterministic while making the order carry no
 * information about the answer.
 */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const files = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json')).sort();
const entries = files.map((f) => ({ file: f, data: JSON.parse(readFileSync(join(RAW_DIR, f), 'utf8')) }));
// Archived words are out of practice, so they are neither assigned nor offered.
const live = entries.filter(({ data }) => !data.archived_at);

const senses = [];
for (const { file, data } of live) {
  for (const sense of data.senses ?? []) {
    senses.push({ file, headword: data.headword, sense, siblings: new Set((data.senses ?? []).map((s) => s.term)) });
  }
}

// Eligibility, computed once against every other term in the corpus.
for (const item of senses) {
  item.eligible = senses
    .filter((other) => other !== item)
    .filter((other) => !item.siblings.has(other.sense.term))
    // A label such as "(verb)" names a part of speech, which would give away
    // the answer on another word's card, so labelled terms are never offered.
    .filter((other) => !other.sense.term.includes('('))
    .filter((other) => !isBlocked(item.sense.term, other.sense.term))
    .filter((other) => overlap(item.sense.definition, other.sense.definition) < OVERLAP_LIMIT)
    .map((other) => other.sense.term);
}

const tooTight = senses.filter((i) => i.eligible.length < WANTED);
for (const item of tooTight) {
  console.error(`FAIL ${item.file} [${item.sense.term}]: only ${item.eligible.length} eligible words, needs ${WANTED}`);
}
if (tooTight.length) process.exit(1);

const used = new Map(senses.map((i) => [i.sense.term, 0]));
const order = [...senses].sort(
  (a, b) => a.eligible.length - b.eligible.length || a.sense.term.localeCompare(b.sense.term)
);

for (const item of order) {
  const picked = [...item.eligible]
    .sort(
      (a, b) =>
        used.get(a) - used.get(b) ||
        hash(`${item.sense.term}|${a}`) - hash(`${item.sense.term}|${b}`)
    )
    .slice(0, WANTED);
  item.sense.word_distractors = picked;
  for (const w of picked) used.set(w, used.get(w) + 1);
}

if (!dry) {
  for (const { file, data } of entries) {
    writeFileSync(join(RAW_DIR, file), `${JSON.stringify(data, null, 2)}\n`);
  }
}

const counts = [...used.values()].sort((a, b) => a - b);
const distinct = [...used.values()].filter((n) => n > 0).length;
console.log(`${senses.length} senses assigned ${WANTED} wrong words each${dry ? ' (dry run, nothing written)' : ''}.`);
console.log(`${distinct} of ${used.size} terms used at least once.`);
console.log(`usage per word: min ${counts[0]}, median ${counts[counts.length >> 1]}, max ${counts[counts.length - 1]}`);
const worst = [...used.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log(`most used: ${worst.map(([w, n]) => `${w} ${n}x`).join(', ')}`);
