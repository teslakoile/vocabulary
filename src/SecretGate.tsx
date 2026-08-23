/**
 * First run, and the only sign-in this app has.
 *
 * One user, one shared secret. There are no accounts, so this is a key rather
 * than a password: paste it once per device and it stays in local storage.
 */
import { useState } from 'react';
import { clearSecret, setSecret } from './store';

interface Props {
  rejected: boolean;
  onAccepted: (secret: string) => void;
}

export default function SecretGate({ rejected, onAccepted }: Props) {
  const [value, setValue] = useState('');

  return (
    <main className="shell">
      <h1>{rejected ? 'That key was refused' : 'Paste your key'}</h1>
      <p>
        {rejected
          ? 'The server did not accept the key stored on this device. Paste it again.'
          : 'This is stored on this device only, and there is no way to recover it. Keep a copy in your password manager.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          clearSecret();
          setSecret(value);
          onAccepted(value.trim());
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="password"
          placeholder="key"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="current-password"
          spellCheck={false}
          enterKeyHint="go"
        />
        <button className="primary" type="submit" disabled={!value.trim()}>
          Unlock
        </button>
      </form>
    </main>
  );
}
