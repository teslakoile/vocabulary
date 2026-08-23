/**
 * Web Push, VAPID only.
 *
 * The notification carries no payload. That is deliberate: the app already
 * holds the whole corpus in IndexedDB, so the service worker can pick a card
 * itself, and skipping the payload skips the ECDH and AES-GCM content
 * encryption that Web Push otherwise requires. VAPID signing is still needed,
 * because Apple rejects an unsigned push.
 */

const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64url = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

/**
 * The keys are stored as raw base64url: 65 bytes of uncompressed public point,
 * 32 bytes of private scalar. Web Crypto will not take those directly, so they
 * are reassembled into a JWK.
 */
async function importSigningKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const raw = fromB64url(publicKey);
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error('VAPID public key is not an uncompressed P-256 point');
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64url(raw.slice(1, 33)),
      y: b64url(raw.slice(33, 65)),
      d: privateKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function vapidHeader(endpoint: string, publicKey: string, privateKey: string, subject: string): Promise<string> {
  const key = await importSigningKey(publicKey, privateKey);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      })
    )
  );
  const signed = `${header}.${claims}`;
  // ECDSA here produces the raw r||s pair JWS wants, not a DER structure.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signed)
  );
  return `vapid t=${signed}.${b64url(signature)}, k=${publicKey}`;
}

export interface PushSubscriptionJson {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
}

/**
 * Returns the push service's status code. 404 and 410 mean the subscription is
 * dead and the caller should clear it: leaving a dead one in place makes every
 * later nudge a silent failure.
 */
export async function sendPush(
  subscription: PushSubscriptionJson,
  env: { VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string },
  subject = 'mailto:vocabulary@localhost'
): Promise<number> {
  const authorization = await vapidHeader(
    subscription.endpoint,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
    subject
  );
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization,
      ttl: '43200',
      'content-length': '0',
    },
  });
  return response.status;
}
