import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { APP_NAMES, canUse } from '../../shared/access.ts';
import { Card, CardBody } from '../components/Card';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ssoTarget, withToken } from '../lib/sso';

/** /sso?app=…: signs the person in to one of our apps (see lib/sso.ts) and opens it. */
export function SsoPage() {
  const [params] = useSearchParams();
  const user = useAuth((s) => s.user);
  const target = useMemo(() => ssoTarget(params.get('app'), params.get('to'), params.get('back')), [params]);
  const blocked = !target
    ? 'This link does not lead to one of our apps.'
    : user && !canUse(user, target.id)
      ? `You don't have access to ${APP_NAMES[target.id]}. Ask your administrator to give you access.`
      : null;
  const [error, setError] = useState<string | null>(null);
  // Once only: React StrictMode runs effects twice, and each token can be used once.
  const started = useRef(false);

  useEffect(() => {
    if (!target || blocked || started.current) return;
    started.current = true;
    api<{ tokenHash: string }>('/api/sso', { method: 'POST', body: { app: target.id } })
      .then(({ tokenHash }) => window.location.replace(withToken(target.url, tokenHash)))
      .catch((e: Error) => setError(e.message));
  }, [target, blocked]);

  const message = blocked ?? error;
  if (!message) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500">
        <span className="animate-spin h-5 w-5 mr-3 rounded-full border-2 border-gray-300 border-t-[#CC1F1F]" />
        Opening {target ? APP_NAMES[target.id] : 'the app'}…
      </div>
    );
  }
  return (
    <Card className="max-w-md mx-auto">
      <CardBody className="py-6 space-y-4">
        <p className="text-sm text-red-700">{message}</p>
        <Link
          to="/"
          className="flex items-center justify-center gap-2 min-h-11 rounded-lg bg-[#CC1F1F] px-4 py-2 text-sm font-medium text-white hover:bg-[#A01818]"
        >
          <LayoutGrid size={16} />
          All apps
        </Link>
      </CardBody>
    </Card>
  );
}
