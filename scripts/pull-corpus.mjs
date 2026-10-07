/**
 * Step one of a refine session: bring the repo up to date with the live app.
 *
 * D1 is where content lives. The phone captures words there, and Fix this
 * edits them there. This writes every ready entry into corpus/raw/ so the
 * session starts from what is actually live, and writes the backlog, meaning
 * captured words with no content and flagged words, to corpus/backlog.json.
 *
 * Any raw file that changes here changed in the app. Read `git diff` before
 * editing, so an in-app fix is never regenerated away. Each sense's topics come
 * back too, so publish before pulling again, or topics you wrote locally are
 * overwritten by what is live.
 *
 * Usage: node scripts/pull-corpus.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentOf, liveCorpus, slug } from './lib/api.mjs';

const RAW_DIR = '.scratch/vocab-pwa/corpus/raw';
const BACKLOG = '.scratch/vocab-pwa/corpus/backlog.json';

const files = existsSync(RAW_DIR) ? readdirSync(RAW_DIR).filter((f) => f.endsWith('.json')) : [];
const byId = new Map();
const byHeadword = new Map();
let highest = 0;
for (const f of files) {
  const raw = JSON.parse(readFileSync(join(RAW_DIR, f), 'utf8'));
  if (raw.id) byId.set(raw.id, f);
  byHeadword.set(raw.headword, f);
  highest = Math.max(highest, Number(f.split('-')[0]) || 0);
}

/** The file an entry lives in, or the one a refine session should create. */
function fileFor(entry) {
  const known = byId.get(entry.id) ?? byHeadword.get(entry.headword);
  if (known) return known;
  highest += 1;
  const name = `${String(highest).padStart(2, '0')}-${slug(entry.headword) || 'word'}.json`;
  byId.set(entry.id, name);
  return name;
}

const entries = await liveCorpus();
let written = 0;
let changed = 0;
const backlog = [];

for (const entry of entries.sort((a, b) => a.id.localeCompare(b.id))) {
  const file = fileFor(entry);
  const waiting = entry.archived_at === null && (entry.status !== 'ready' || entry.flagged_at);

  if (waiting) {
    backlog.push({
      id: entry.id,
      headword: entry.headword,
      file,
      reason: entry.status !== 'ready' ? 'captured' : 'flagged',
      capture_note: entry.capture_note,
      flag_note: entry.flag_note,
      senses: entry.senses.map(contentOf),
    });
  }
  if (entry.status !== 'ready' || !entry.senses.length) continue;

  const record = {
    id: entry.id,
    headword: entry.headword,
    ...(entry.capture_note ? { capture_note: entry.capture_note } : {}),
    ...(entry.archived_at ? { archived_at: entry.archived_at } : {}),
    senses: entry.senses.sort((a, b) => a.position - b.position).map(contentOf),
  };
  const path = join(RAW_DIR, file);
  const next = `${JSON.stringify(record, null, 2)}\n`;
  const before = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (before !== next) {
    writeFileSync(path, next);
    changed++;
  }
  written++;
}

writeFileSync(BACKLOG, `${JSON.stringify(backlog, null, 2)}\n`);
console.log(`${written} ready entries pulled, ${changed} files changed.`);
console.log(`${backlog.length} in the backlog: ${backlog.filter((b) => b.reason === 'captured').length} captured, ${backlog.filter((b) => b.reason === 'flagged').length} flagged.`);
for (const b of backlog) {
  const why = b.reason === 'flagged' ? `flagged${b.flag_note ? `: ${b.flag_note}` : ''}` : `captured${b.capture_note ? `: ${b.capture_note}` : ''}`;
  console.log(`  ${b.headword}  (${why})  -> ${b.file}`);
}
if (changed) console.log('\nChanged files reflect edits made in the app. Read `git diff` before regenerating anything.');
