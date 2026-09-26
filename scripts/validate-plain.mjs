/**
 * Checks a plain-wording batch before it is merged into the corpus.
 *
 * Covers the new `gloss` and `gloss_distractors`, which make the recognition
 * card read "bolster means ... to strengthen", and the rewritten `caution`.
 * The form rule matters most: if the answer starts with "to" and the three
 * wrong ones do not, the card can be answered by grammar alone.
 *
 * Usage: node scripts/validate-plain.mjs [files...]   (default: every batch file)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const DIR = '.scratch/vocab-pwa/corpus/plain';
const MAX_GLOSS = 40;
const MAX_CAUTION = 180;
const MAX_DEFINITION = 90;

let failures = 0;
const fail = (where, message) => { failures++; console.error(`FAIL  ${where}: ${message}`); };

const words = (t) => t.trim().split(/\s+/).length;
const form = (g) => (/^to\s/i.test(g) ? 'verb' : 'other');
const FIGURATIVE = /\bin gym clothes|on contact|swallowed|like a\b|as if\b/i;

const args = process.argv.slice(2);
const files = args.length
  ? args
  : readdirSync(DIR).filter((f) => /^\d\d-.*\.json$/.test(f)).map((f) => join(DIR, f));

let senses = 0;
for (const path of files) {
  const name = basename(path);
  let entry;
  try { entry = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { fail(name, e.message); continue; }
  for (const s of entry.senses ?? []) {
    senses++;
    const w = `${name} [${s.term}]`;
    const g = s.gloss ?? '';
    if (!g) { fail(w, 'missing gloss'); continue; }
    if (g.length > MAX_GLOSS) fail(w, `gloss is ${g.length} chars, over ${MAX_GLOSS}`);
    if (words(g) < 2 || words(g) > 6) fail(w, `gloss is ${words(g)} words, needs 2 to 6`);
    const root = s.term.toLowerCase().split(/[\s/-]+/).filter((p) => p.length > 3).map((p) => p.slice(0, 5));
    if (root.some((r) => g.toLowerCase().includes(r))) fail(w, `gloss "${g}" reuses the headword`);

    const d = s.gloss_distractors ?? [];
    if (d.length !== 3) fail(w, `${d.length} gloss_distractors, needs 3`);
    if (new Set([g, ...d].map((x) => x.toLowerCase())).size !== d.length + 1) fail(w, 'gloss options repeat');
    for (const x of d) {
      if (x.length > MAX_GLOSS) fail(w, `distractor "${x}" over ${MAX_GLOSS} chars`);
      if (words(x) < 2 || words(x) > 6) fail(w, `distractor "${x}" is ${words(x)} words`);
      if (form(x) !== form(g)) fail(w, `distractor "${x}" is a different form from "${g}"`);
    }
    const longer = d.filter((x) => x.length >= g.length).length;
    if (longer < 1 || d.length - longer < 1) fail(w, `length tell: ${longer} of 3 at or above the ${g.length}-char gloss`);

    const c = s.caution ?? '';
    const sentences = (c.match(/[.!?](\s|$)/g) ?? []).length;
    if (!c) fail(w, 'missing caution');
    if (c.length > MAX_CAUTION) fail(w, `caution is ${c.length} chars, over ${MAX_CAUTION}`);
    if (sentences > 2) fail(w, `caution runs to ${sentences} sentences`);
    if (/[;]|\s[-–—]\s/.test(c)) fail(w, 'caution has a semicolon or dash aside');
    if (/\b(it|this) is not\b|\bis not a\b/i.test(c)) fail(w, 'caution uses "it is not" construction');
    if (FIGURATIVE.test(c)) fail(w, 'caution uses a figure of speech');

    const def = s.definition ?? '';
    if (!def) fail(w, 'missing definition');
    if (def.length > MAX_DEFINITION) fail(w, `definition is ${def.length} chars`);
    if ((def.match(/[.!?](\s|$)/g) ?? []).length > 1) fail(w, 'definition runs to two sentences');
    if (/[:;]|\s[-–—]\s/.test(def)) fail(w, 'definition has an aside');
  }
}
console.log(`\n${senses} senses across ${files.length} files.`);
console.log(failures ? `${failures} failures.` : 'PASS.');
process.exit(failures ? 1 : 0);
