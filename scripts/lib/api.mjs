/**
 * Talks to the live app the way the phone does: through the Worker's API with
 * the shared key. A refine session never needs a Cloudflare login, which
 * expires; the key does not.
 *
 * Reads VOCAB_URL and AUTH_SECRET from the environment, or from .secrets.local,
 * which is gitignored.
 */
import { existsSync, readFileSync } from 'node:fs';

function fromSecretsFile(name) {
  if (!existsSync('.secrets.local')) return undefined;
  const line = readFileSync('.secrets.local', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
}

const BASE = process.env.VOCAB_URL ?? fromSecretsFile('VOCAB_URL');
const SECRET = process.env.AUTH_SECRET ?? fromSecretsFile('AUTH_SECRET');

export async function api(path, init = {}) {
  if (!BASE || !SECRET) {
    throw new Error('Set VOCAB_URL and AUTH_SECRET in the environment or in .secrets.local');
  }
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'x-vocab-secret': SECRET,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401) throw new Error('The app rejected the key. Check AUTH_SECRET in .secrets.local.');
  if (response.status === 429) throw new Error('Too many failed attempts from this IP. Wait a minute.');
  return response;
}

export async function liveCorpus() {
  const response = await api('/api/corpus');
  if (!response.ok) throw new Error(`GET /api/corpus returned ${response.status}`);
  return (await response.json()).entries;
}

/** The fields a refine session writes. Everything else on a sense is the app's. */
export const CONTENT_FIELDS = [
  'term', 'accepted', 'gloss', 'gloss_distractors', 'definition', 'caution', 'example',
  'cues', 'distractors', 'word_distractors', 'prompt_version',
];

export const contentOf = (sense) =>
  Object.fromEntries(CONTENT_FIELDS.map((f) => [f, sense[f] ?? (f === 'prompt_version' ? null : undefined)]));

export const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
