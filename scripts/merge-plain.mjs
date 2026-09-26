/**
 * Merges a plain-wording batch into the raw corpus.
 *
 * Writes `gloss`, `gloss_distractors`, `caution`, and `definition`. Nothing else:
 * `example`, `cues`, `accepted`, and both distractor sets survived this pass.
 * Joins on headword plus term, like merge-rewrite.mjs, so a renamed term fails
 * loudly instead of being skipped.
 *
 * Usage: node scripts/merge-plain.mjs [--dry]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW_DIR = '.scratch/vocab-pwa/corpus/raw';
const PLAIN_DIR = '.scratch/vocab-pwa/corpus/plain';
const dry = process.argv.includes('--dry');

let merged = 0;
const missing = [];
const files = readdirSync(PLAIN_DIR).filter((f) => /^\d\d-.*\.json$/.test(f)).sort();

for (const file of files) {
  const plain = JSON.parse(readFileSync(join(PLAIN_DIR, file), 'utf8'));
  const raw = JSON.parse(readFileSync(join(RAW_DIR, file), 'utf8'));
  if (plain.headword !== raw.headword) {
    console.error(`FAIL ${file}: headword "${plain.headword}" does not match "${raw.headword}"`);
    process.exitCode = 1;
    continue;
  }
  const byTerm = new Map((plain.senses ?? []).map((s) => [s.term, s]));
  for (const sense of raw.senses ?? []) {
    const p = byTerm.get(sense.term);
    if (!p) { missing.push(`${file} [${sense.term}]`); continue; }
    sense.gloss = p.gloss;
    sense.gloss_distractors = p.gloss_distractors;
    sense.caution = p.caution;
    sense.definition = p.definition;
    merged++;
  }
  if (!dry) writeFileSync(join(RAW_DIR, file), `${JSON.stringify(raw, null, 2)}\n`);
}

console.log(`${merged} senses merged across ${files.length} files${dry ? ' (dry run)' : ''}.`);
if (missing.length) {
  console.error(`${missing.length} raw senses had no plain rewrite:\n  ${missing.join('\n  ')}`);
  process.exitCode = 1;
}
