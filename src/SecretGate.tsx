/**
 * First run, and the only sign-in this app has.
 *
 * One user, one shared secret. There are no accounts, so this is a key rather
 * than a password: paste it once per device and it stays in local storage.
 */
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { clearSecret, setSecret } from './store';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Props {
  rejected: boolean;
  onAccepted: (secret: string) => void;
}

export default function SecretGate({ rejected, onAccepted }: Props) {
  const [value, setValue] = useState('');

  return (
    <Shell className="min-h-dvh justify-center">
      <Card className="stagger gap-5 px-5 py-6">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-muted text-brand">
          <KeyRound className="size-5" />
        </span>

        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-[1.7rem] leading-tight font-semibold tracking-tight">
            {rejected ? 'Key Refused' : 'Enter Key'}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
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
          <Button size="xl" type="submit" className="w-full" disabled={!value.trim()}>
            Unlock
          </Button>
        </form>
      </Card>
    </Shell>
  );
}
