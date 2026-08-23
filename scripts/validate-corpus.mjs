// Validates generated corpus files against the output contract.
// Usage: node scripts/validate-corpus.mjs [--quiet]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW_DIR = '.scratch/vocab-pwa/corpus/raw';
const SOURCE = '.scratch/vocab-pwa/source-list.md';
const TYPES = ['recognition', 'reverse', 'production'];

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
  if (!expected.includes(hw)) {
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
console.log(entries.length === 84 ? 'valid, complete' : `valid so far, ${84 - entries.length} entries still to come`);
