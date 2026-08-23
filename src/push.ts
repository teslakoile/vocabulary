/**
 * Push subscription.
 *
 * On iOS this only works from a home-screen install, and the permission prompt
 * needs a real tap: Safari ignores `requestPermission` called on load. So this
 * is offered as a card with a button rather than fired automatically, which is
 * also the honest way round given the app works fine without it.
 */
import { getSecret } from './store';

const ASKED_KEY = 'vocab.nudge.asked';

export const pushSupported = (): boolean =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const nudgeState = (): 'unsupported' | 'granted' | 'denied' | 'unasked' | 'dismissed' => {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return localStorage.getItem(ASKED_KEY) ? 'dismissed' : 'unasked';
};

export const dismissNudgeOffer = (): void => localStorage.setItem(ASKED_KEY, '1');

const toUint8 = (base64url: string): Uint8Array<ArrayBuffer> => {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/**
 * Ask, subscribe, and hand the subscription to the Worker along with this
 * device's timezone, which is what makes 1pm mean 1pm wherever you are.
 */
export async function enableNudge(): Promise<'granted' | 'denied' | 'failed'> {
  dismissNudgeOffer();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const secret = getSecret();
  if (!secret) return 'failed';

  try {
    const keyResponse = await fetch('/api/vapid-key', { headers: { 'x-vocab-secret': secret } });
    const { key } = (await keyResponse.json()) as { key: string };
    if (!key) return 'failed';

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8(key),
      }));

    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'x-vocab-secret': secret, 'content-type': 'application/json' },
      body: JSON.stringify({
        push_subscription: subscription.toJSON(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    return 'granted';
  } catch {
    return 'failed';
  }
}
