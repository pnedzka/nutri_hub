import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '../components/Button';
import { Card, CardBody } from '../components/Card';
import { Input } from '../components/Input';
import { MIN_PASSWORD, useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

/** Shown after opening an invitation or password-reset link: the user picks their own password. */
export function SetPasswordPage() {
  const { user, passwordSetup, setPassword, signOut } = useAuth();
  const toast = useToast();
  const [password, setValue] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invite = passwordSetup === 'invite';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== repeat) return setError("The passwords don't match.");
    setBusy(true);
    try {
      await setPassword(password);
      toast.success(invite ? 'Password set. Welcome!' : 'Password changed');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="Nutri Partners" width={180} height={35} />
          <p className="mt-3 text-sm text-gray-500">Apps</p>
        </div>
        <Card>
          <CardBody className="py-6">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h1 className="text-base font-semibold text-gray-900">{invite ? 'Set your account password' : 'Set a new password'}</h1>
                <p className="mt-1 text-sm text-gray-500 break-all">{user?.email}</p>
              </div>
              {/* Lets password managers save the new password under the right login. */}
              <input type="email" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
              <Input label="Password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setValue(e.target.value)} leftIcon={<KeyRound size={16} />} />
              <Input label="Repeat password" type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} leftIcon={<KeyRound size={16} />} />
              <p className="text-xs text-gray-500">At least {MIN_PASSWORD} characters.</p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" isLoading={busy}>
                {invite ? 'Set password and continue' : 'Save password'}
              </Button>
              <button type="button" className="w-full text-xs text-gray-500 hover:text-gray-700" onClick={() => void signOut()}>
                Cancel and sign out
              </button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
