// Validates generated corpus files against the output contract.
// Usage: node scripts/validate-corpus.mjs [--quiet]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW_DIR = '.scratch/vocab-pwa/corpus/raw';
const SOURCE = '.scratch/vocab-pwa/source-list.md';
const TYPES = ['recognition', 'identify', 'reverse', 'production'];

const STOPWORDS = new Set([
  'your', 'their', 'them', 'that', 'this', 'with', 'from', 'into', 'over', 'they',
  'thing', 'things', 'some', 'itself', 'each', 'other', 'about', 'have', 'been',
]);

const errors = [];
const warnings = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// Kyle's list, verbatim. Everything must match one of these exactly.
const expected = readFileSync(SOURCE, 'utf8')
  .split('\n')
  .slice(1)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

if (expected.length !== 84) fail('source-list', `expected 84 headwords, found ${expected.length}`);


const files = (existsSync(RAW_DIR) ? readdirSync(RAW_DIR) : []).filter((f) => f.endsWith('.json')).sort();
// Every term in the corpus, so word distractors can be checked against it.
// Built before the per-file pass because a distractor may name any entry.
const MAX_DEFINITION = 90;
const WORD_OVERLAP_LIMIT = 0.1;
const allTerms = new Map();
for (const f of files) {
  try {
    const e = JSON.parse(readFileSync(join(RAW_DIR, f), 'utf8'));
    for (const s of e.senses ?? []) allTerms.set(s.term, { headword: e.headword, definition: s.definition || '' });
  } catch { /* the per-file pass reports the parse failure properly */ }
}
const OVERLAP_STOP = new Set(
  ('to a an the of and or in on for that with it is not something someone but by as be are you your ' +
   'they their what which who this these those from into at than then rather over under about more ' +
   'most less own way work thing things people them there here when where how why can will would ' +
   'could no any one two both each its his her have has had does do done make made use used')
    .split(' ')
);
const overlapBag = (t) =>
  new Set((String(t).toLowerCase().match(/[a-z']+/g) ?? []).filter((x) => x.length > 3 && !OVERLAP_STOP.has(x)));
function definitionOverlap(a, b) {
  const x = overlapBag(a);
  const y = overlapBag(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}
const entries = [];
const seenHeadwords = new Map();

for (const file of files) {
  const where = file;
  let entry;
  try {
    entry = JSON.parse(readFileSync(join(RAW_DIR, file), 'utf8'));
  } catch (e) {
    fail(where, `not valid JSON — ${e.message}`);
    continue;
  }
  if (entry.entries) {
    fail(where, 'contains a wrapper object; each file must be a single entry');
    continue;
  }
  const hw = entry.headword;
  if (typeof hw !== 'string' || !hw) { fail(where, 'missing headword'); continue; }
  // Words captured in the app carry the id D1 gave them and are not in the
  // original list, so only an id-less entry has to match it verbatim.
  if (!entry.id && !expected.includes(hw)) {
    const near = expected.find((e) => e.toLowerCase().replace(/[^a-z]/g, '') === hw.toLowerCase().replace(/[^a-z]/g, ''));
    fail(where, `headword "${hw}" is not in the source list verbatim${near ? ` (did you mean "${near}"?)` : ''}`);
    continue;
  }
  if (seenHeadwords.has(hw)) { fail(where, `duplicate headword, already in ${seenHeadwords.get(hw)}`); continue; }
  seenHeadwords.set(hw, file);

  if (!Array.isArray(entry.senses) || entry.senses.length === 0) { fail(where, 'no senses'); continue; }

  const termsInEntry = new Set();
  entry.senses.forEach((s, i) => {
    const w = `${file} sense ${i + 1}`;
    for (const f of ['term', 'definition', 'caution', 'example']) {
      if (typeof s[f] !== 'string' || !s[f].trim()) fail(w, `${f} is empty`);
    }
    if (termsInEntry.has(s.term)) fail(w, `duplicate term "${s.term}" within the entry`);
    termsInEntry.add(s.term);

    if (!Array.isArray(s.accepted)) fail(w, 'accepted must be an array');
    else if (s.accepted.some((a) => typeof a !== 'string')) fail(w, 'accepted must contain only strings');

    if (!Array.isArray(s.distractors)) fail(w, 'distractors must be an array');
    else {
      if (s.distractors.length !== 5) fail(w, `${s.distractors.length} distractors, needs exactly 5`);
      if (new Set(s.distractors.map((d) => d.toLowerCase().trim())).size !== s.distractors.length) {
        fail(w, 'distractors are not unique');
      }
      // Punctuation is another shape tell: if five options end with a full stop
      // and one does not, the odd one out is free information.
      const stopped = (t) => /[.!?]$/.test((t || '').trim());
      const odd = s.distractors.filter((d) => stopped(d) !== stopped(s.definition));
      if (odd.length) {
        warn(w, `${odd.length} distractor(s) punctuated differently from the definition`);
      }
      // In multiple choice the correct answer must not be identifiable by shape.
      // Definitions run to two sentences, so short fragments as distractors let
      // you score full marks by picking the longest option without knowing the
      // word. Requiring two longer and two shorter puts the answer mid-pack.
      const defLength = (s.definition || '').length;
      const longer = s.distractors.filter((d) => d.length >= defLength).length;
      const shorter = s.distractors.filter((d) => d.length < defLength).length;
      if (longer < 2 || shorter < 2) {
        fail(w, `length tell: ${longer} distractor(s) at or above the ${defLength}-char definition, ${shorter} below; needs at least 2 of each`);
      }
    }

    // A definition is one plain sentence. The first corpus opened with an
    // abstract paraphrase and explained itself in a second sentence, in 94% of
    // senses, and read as more complicated than an ordinary dictionary line.
    const definition = s.definition || '';
    const sentences = (definition.match(/[.!?](\s|$)/g) || []).length;
    if (sentences > 1 && !s.needs_two) {
      fail(w, `definition runs to ${sentences} sentences and is not flagged needs_two`);
    }
    if (!s.needs_two && definition.length > MAX_DEFINITION) {
      fail(w, `definition is ${definition.length} characters, over the ${MAX_DEFINITION} limit`);
    }
    const aside = definition.match(/[:;]|\s[-\u2013\u2014]\s/);
    if (aside) fail(w, `definition contains "${aside[0].trim()}", which delays the meaning`);

    // The recognition card asks "What does X mean?" with four short glosses.
    // All four share a grammatical form, or the card answers itself.
    if (typeof s.gloss !== 'string' || !s.gloss.trim()) fail(w, 'gloss is empty');
    else if (s.gloss.length > 40) fail(w, `gloss is ${s.gloss.length} characters, over 40`);
    if (!Array.isArray(s.gloss_distractors) || s.gloss_distractors.length !== 3) {
      fail(w, 'gloss_distractors must be an array of 3');
    } else if (s.gloss) {
      const verb = (t) => /^to\s/i.test(t);
      for (const g of s.gloss_distractors) {
        if (verb(g) !== verb(s.gloss)) fail(w, `gloss distractor "${g}" is a different form from "${s.gloss}"`);
      }
    }
    // Cautions were rewritten plain: short, no figures of speech.
    if ((s.caution || '').length > 180) fail(w, `caution is ${s.caution.length} characters, over 180`);

    // Wrong words for the card that shows the definition and asks for the word.
    // The failure mode here is a distractor you can argue for: two short plain
    // definitions collide far more easily than two long ones did.
    if (!Array.isArray(s.word_distractors)) fail(w, 'word_distractors must be an array');
    else {
      if (s.word_distractors.length !== 5) fail(w, `${s.word_distractors.length} word_distractors, needs exactly 5`);
      if (new Set(s.word_distractors).size !== s.word_distractors.length) fail(w, 'word_distractors are not unique');
      for (const word of s.word_distractors) {
        const other = allTerms.get(word);
        if (!other) { fail(w, `word distractor "${word}" is not a term in the corpus`); continue; }
        if (word === s.term) fail(w, `word distractor "${word}" is the answer`);
        if (termsInEntry.has(word) || (entry.senses || []).some((x) => x.term === word)) {
          fail(w, `word distractor "${word}" is a sibling sense of the same entry`);
        }
        const score = definitionOverlap(definition, other.definition);
        if (score >= WORD_OVERLAP_LIMIT) {
          fail(w, `word distractor "${word}" overlaps this definition at ${score.toFixed(2)}, so it is arguable`);
        }
      }
    }

    if (!Array.isArray(s.cues)) { fail(w, 'cues must be an array'); return; }
    if (s.cues.length < 3 || s.cues.length > 5) fail(w, `${s.cues.length} cues, needs 3 to 5`);

    // Leak check. Naming the term inside its own cue makes the card free.
    const forms = [s.term, ...(s.accepted || [])].filter((f) => typeof f === 'string');
    const stems = new Set();
    for (const form of forms) {
      for (const word of form.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
        // Multi-word terms like "pick your brain" carry function words that
        // appear in every other sentence; stemming those only makes noise.
        if (word.length >= 4 && !STOPWORDS.has(word)) {
          stems.add(word.slice(0, Math.max(4, word.length - 3)));
        }
      }
    }
    s.cues.forEach((c, ci) => {
      const cw = `${w} cue ${ci + 1}`;
      if (typeof c !== 'object' || c === null) { fail(cw, 'cue must be an object with text and setting'); return; }
      if (typeof c.text !== 'string' || !c.text.trim()) fail(cw, 'cue text is empty');
      if (c.setting !== 'work' && c.setting !== 'life') fail(cw, `setting is "${c.setting}", must be work or life`);
      const text = (c.text || '').toLowerCase();
      for (const form of forms) {
        if (text.includes(form.toLowerCase())) fail(cw, `names its own term "${form}"`);
      }
      for (const stem of stems) {
        if (text.includes(stem)) warn(cw, `possible cognate leak "${stem}…" — ${c.text.slice(0, 70)}`);
      }
    });

    // Soft quality check: a caution that just repeats the definition is a failed entry.
    const defWords = new Set(s.definition.toLowerCase().split(/[^a-z]+/).filter((x) => x.length > 4));
    const cauWords = (s.caution || '').toLowerCase().split(/[^a-z]+/).filter((x) => x.length > 4);
    const overlap = cauWords.filter((x) => defWords.has(x)).length;
    if (cauWords.length && overlap / cauWords.length > 0.5) {
      warn(w, `caution may be restating the definition (${Math.round((overlap / cauWords.length) * 100)}% word overlap)`);
    }
  });

  entries.push({ file, ...entry });
}

const missing = expected.filter((h) => !seenHeadwords.has(h));
if (missing.length) (process.argv.includes('--complete') ? fail : warn)('coverage', `${missing.length} headwords not generated: ${missing.join(', ')}`);

const senses = entries.flatMap((e) => e.senses);
const cues = senses.flatMap((s) => (Array.isArray(s.cues) ? s.cues : []));
const work = cues.filter((c) => c?.setting === 'work').length;

const quiet = process.argv.includes('--quiet');
if (!quiet) {
  console.log(`entries   ${entries.length} / 84`);
  console.log(`senses    ${senses.length}`);
  console.log(`cards     ${senses.length * TYPES.length}`);
  console.log(`cues      ${cues.length}  (${work} work / ${cues.length - work} life = ${Math.round((work / cues.length) * 100)}% work)`);
  console.log(`intake    ${Math.ceil((senses.length * TYPES.length) / 6)} days at 6 new cards/day`);
  console.log('');
}
if (warnings.length) {
  console.log(`${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ~ ${w}`);
  console.log('');
}
if (errors.length) {
  console.log(`${errors.length} error(s):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
}
console.log(missing.length === 0 ? `valid, complete (${entries.length} entries)` : `valid so far, ${missing.length} of the original list still to come`);
