import { useState, type FormEvent } from 'react';
import { Lock, Mail } from 'lucide-react';
import { Button } from '../components/Button';
import { Card, CardBody } from '../components/Card';
import { Input } from '../components/Input';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { signIn, status, error: authError, signOut, linkError, requestReset } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestReset(email.trim());
      setResetSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (reset: boolean) => {
    setResetMode(reset);
    setResetSent(false);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
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
            {status === 'error' ? (
              <div className="space-y-4">
                <p className="text-sm text-red-700">{authError}</p>
                <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
                  Back to sign in
                </Button>
              </div>
            ) : resetMode ? (
              <form onSubmit={sendReset} className="space-y-4">
                <div>
                  <h1 className="text-base font-semibold text-gray-900">Forgot password?</h1>
                  <p className="mt-1 text-sm text-gray-500">We'll send you a link to set a new password.</p>
                </div>
                <Input label="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} leftIcon={<Mail size={16} />} />
                {error && <p className="text-sm text-red-600">{error}</p>}
                {resetSent ? (
                  <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
                    If an account with this address exists, we have sent a link to it. Check your inbox (and spam folder).
                  </p>
                ) : (
                  <Button type="submit" className="w-full" isLoading={busy}>
                    Send link
                  </Button>
                )}
                <button type="button" className="w-full text-xs text-gray-500 hover:text-gray-700" onClick={() => switchMode(false)}>
                  Back to sign in
                </button>
              </form>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {linkError && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{linkError}</p>}
                <Input label="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} leftIcon={<Mail size={16} />} />
                <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} leftIcon={<Lock size={16} />} />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" isLoading={busy}>
                  Sign in
                </Button>
                <button type="button" className="w-full text-xs text-gray-500 hover:text-gray-700" onClick={() => switchMode(true)}>
                  Forgot password?
                </button>
                <p className="text-xs text-gray-500 text-center">Use your Nutri Partners account. Accounts are created by an administrator.</p>
              </form>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
