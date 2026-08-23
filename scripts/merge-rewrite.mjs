/**
 * Merges a rewrite batch into the raw corpus.
 *
 * Touches three fields and nothing else: `definition`, `distractors`, and the
 * new `word_distractors`. `caution`, `example`, `cues`, and `accepted` are the
 * fields that survived this rewrite, so the merge must not go near them.
 *
 * Joins on headword plus term, the same pair merge-distractors.mjs uses, so a
 * renamed term surfaces as an unmatched sense rather than a silent skip.
 *
 * Usage: node scripts/merge-rewrite.mjs [--dry]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW_DIR = '.scratch/vocab-pwa/corpus/raw';
const REWRITE_DIR = '.scratch/vocab-pwa/corpus/rewrite';
const dry = process.argv.includes('--dry');

const files = readdirSync(REWRITE_DIR).filter((f) => /^\d\d-.*\.json$/.test(f)).sort();
if (files.length === 0) {
  console.error(`no rewrite files in ${REWRITE_DIR}`);
  process.exit(1);
}

let merged = 0;
let unmatched = 0;
const missing = [];

for (const file of files) {
  const rewritePath = join(REWRITE_DIR, file);
  const rawPath = join(RAW_DIR, file);

  let rewrite, raw;
  try {
    rewrite = JSON.parse(readFileSync(rewritePath, 'utf8'));
    raw = JSON.parse(readFileSync(rawPath, 'utf8'));
  } catch (error) {
    console.error(`FAIL ${file}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }

  if (rewrite.headword !== raw.headword) {
    console.error(`FAIL ${file}: headword "${rewrite.headword}" does not match raw "${raw.headword}"`);
    process.exitCode = 1;
    continue;
  }

  const bySenseTerm = new Map((rewrite.senses ?? []).map((s) => [s.term, s]));

  for (const sense of raw.senses ?? []) {
    const replacement = bySenseTerm.get(sense.term);
    if (!replacement) {
      unmatched++;
      missing.push(`${file} [${sense.term}]`);
      continue;
    }
    sense.definition = replacement.definition;
    sense.distractors = replacement.distractors;
    sense.word_distractors = replacement.word_distractors;
    bySenseTerm.delete(sense.term);
    merged++;
  }

  for (const leftover of bySenseTerm.keys()) {
    console.error(`FAIL ${file}: rewrite has term "${leftover}" that the raw entry does not`);
    process.exitCode = 1;
  }

  if (!dry) writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
}

console.log(`${merged} senses merged across ${files.length} files${dry ? ' (dry run, nothing written)' : ''}.`);
if (unmatched) {
  console.error(`\n${unmatched} raw senses had no rewrite:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exitCode = 1;
}
