// Merges repaired distractors back into the corpus, matching on headword + term.
// Nothing else in the source entry is touched.
// Usage: node scripts/merge-distractors.mjs [--dry]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW = '.scratch/vocab-pwa/corpus/raw';
const FIX = '.scratch/vocab-pwa/corpus/distractors';
const dry = process.argv.includes('--dry');

let merged = 0;
let skipped = 0;
const problems = [];

for (const file of readdirSync(FIX).filter((f) => /^\d\d-.*\.json$/.test(f))) {
  const fixPath = join(FIX, file);
  const rawPath = join(RAW, file);
  if (!existsSync(rawPath)) { problems.push(`${file}: no matching source entry`); continue; }

  let fix;
  try {
    fix = JSON.parse(readFileSync(fixPath, 'utf8'));
  } catch (e) {
    problems.push(`${file}: not valid JSON — ${e.message}`);
    continue;
  }
  const raw = JSON.parse(readFileSync(rawPath, 'utf8'));

  if (fix.headword !== raw.headword) {
    problems.push(`${file}: headword "${fix.headword}" does not match source "${raw.headword}"`);
    continue;
  }

  let touched = false;
  for (const sense of raw.senses) {
    const replacement = fix.senses?.find((s) => s.term === sense.term);
    if (!replacement) { problems.push(`${file}: no replacement for term "${sense.term}"`); continue; }
    if (!Array.isArray(replacement.distractors) || replacement.distractors.length !== 5) {
      problems.push(`${file} / ${sense.term}: ${replacement.distractors?.length ?? 0} distractors, needs 5`);
      continue;
    }
    const defLength = sense.definition.length;
    const longer = replacement.distractors.filter((d) => d.length >= defLength).length;
    const shorter = replacement.distractors.filter((d) => d.length < defLength).length;
    if (longer < 2 || shorter < 2) {
      problems.push(`${file} / ${sense.term}: still a length tell (${longer} long, ${shorter} short)`);
      continue;
    }
    sense.distractors = replacement.distractors;
    touched = true;
  }

  if (touched) {
    if (!dry) writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
    merged++;
  } else skipped++;
}

console.log(`${merged} entries merged${dry ? ' (dry run, nothing written)' : ''}, ${skipped} skipped`);
if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}
