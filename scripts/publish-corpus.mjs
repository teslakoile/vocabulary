/**
 * Last step of a refine session: send what changed back to the live app.
 *
 * Compares every raw file with the live corpus and publishes an entry when its
 * content differs, or when it is still waiting in the backlog. Publishing goes
 * through PUT /api/entries/:id/content, which creates cards for new senses at
 * the end of the intake queue and never touches existing cards, so schedules
 * and review history survive.
 *
 * Tags go separately, through PATCH /api/entries/:id, and are sent whenever they
 * differ from the live entry.
 *
 * Refuses to run while the corpus validator fails.
 *
 * Usage: node scripts/publish-corpus.mjs [--dry]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { api, contentOf, liveCorpus } from './lib/api.mjs';

const RAW_DIR = '.scratch/vocab-pwa/corpus/raw';
const dry = process.argv.includes('--dry');

try {
  execFileSync('node', ['scripts/validate-corpus.mjs', '--complete'], { stdio: 'pipe' });
} catch (error) {
  console.error(String(error.stdout ?? '') + String(error.stderr ?? ''));
  console.error('The corpus does not validate. Nothing was published.');
  process.exit(1);
}

const live = new Map((await liveCorpus()).map((e) => [e.id, e]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const sameTags = (a = [], b = []) => same([...a].sort(), [...b].sort());

const toPublish = [];
for (const file of readdirSync(RAW_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const raw = JSON.parse(readFileSync(join(RAW_DIR, file), 'utf8'));
  if (raw.archived_at) continue;
  if (!raw.id) {
    console.error(`${file} has no id. Run scripts/pull-corpus.mjs first.`);
    process.exit(1);
  }
  const current = live.get(raw.id);
  if (!current) {
    console.error(`${file}: entry ${raw.id} does not exist in the app.`);
    process.exit(1);
  }
  const liveSenses = [...current.senses].sort((a, b) => a.position - b.position).map(contentOf);
  const localSenses = raw.senses.map(contentOf);
  const waiting = current.status !== 'ready' || current.flagged_at;
  const retag = !sameTags(raw.tags, current.tags);
  if (waiting || raw.headword !== current.headword || !same(liveSenses, localSenses)) {
    toPublish.push({ file, raw, reason: waiting ? 'backlog' : 'changed', retag });
  } else if (retag) {
    toPublish.push({ file, raw, reason: 'tags', retag, contentSame: true });
  }
}

console.log(`${toPublish.length} entries to publish${dry ? ' (dry run)' : ''}.`);
let failed = 0;
for (const { file, raw, reason, retag, contentSame } of toPublish) {
  if (dry) { console.log(`  ${raw.headword}  (${reason})`); continue; }
  if (!contentSame) {
    const response = await api(`/api/entries/${raw.id}/content`, {
      method: 'PUT',
      body: JSON.stringify({ headword: raw.headword, senses: raw.senses }),
    });
    if (response.ok) console.log(`  published ${raw.headword}  (${reason})`);
    else {
      failed++;
      console.error(`  FAILED ${raw.headword} (${file}): ${response.status} ${await response.text()}`);
      continue;
    }
  }
  if (retag) {
    // Tags live on the entry, not the sense, and have their own endpoint.
    const response = await api(`/api/entries/${raw.id}`, { method: 'PATCH', body: JSON.stringify({ tags: raw.tags }) });
    if (response.ok) { if (contentSame) console.log(`  tagged ${raw.headword}  (${raw.tags.join(', ')})`); }
    else {
      failed++;
      console.error(`  FAILED tags for ${raw.headword} (${file}): ${response.status} ${await response.text()}`);
    }
  }
}
if (failed) process.exit(1);
