/**
 * First run, and the only sign-in this app has.
 *
 * One user, one shared secret. There are no accounts, so this is a key rather
 * than a password: paste it once per device and it stays in local storage.
 */
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { clearSecret, setSecret } from './store';
import { Shell, Sky } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  rejected: boolean;
  onAccepted: (secret: string) => void;
}

export default function SecretGate({ rejected, onAccepted }: Props) {
  const [value, setValue] = useState('');

  return (
    <Shell className="min-h-dvh gap-0 pb-0">
      <div className="stagger flex flex-1 flex-col justify-center gap-6 py-10">
        <div className="flex flex-col gap-2">
          <p className="font-serif text-title leading-none">Vocabulary</p>
          <h1 className="headword">{rejected ? 'Key Refused' : 'Enter Key'}</h1>
          <p className="max-w-[34ch] text-lead">
            {rejected
              ? 'The server did not accept the key stored on this device. Paste it again.'
              : 'This is stored on this device only, and there is no way to recover it. Keep a copy in your password manager.'}
          </p>
        </div>

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!value.trim()) return;
            clearSecret();
            setSecret(value);
            onAccepted(value.trim());
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="password"
            placeholder="Key"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="current-password"
            spellCheck={false}
            enterKeyHint="go"
          />
          <Button size="xl" type="submit" className="w-full pr-5" disabled={!value.trim()}>
            Unlock
            <ArrowRight />
          </Button>
        </form>
      </div>

      <Sky />
    </Shell>
  );
}
