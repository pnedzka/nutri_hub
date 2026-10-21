import { useEffect } from 'react';
import { ArrowLeft, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '../components/Card';
import { ProfileForm } from '../components/ProfileForm';
import { RoleBadge } from '../components/RoleBadge';
import { useAuth } from '../lib/auth';
import { useMyProfile, usePeople } from '../lib/people';
import { ErrorNote, Loading } from './leave/ui';

/** My profile: the signed-in person's photo and company contact details, shown in Team and used in signatures. */
export function ProfilePage() {
  const user = useAuth((s) => s.user);
  const { load, error, offices, setPerson } = usePeople();
  const me = useMyProfile();
  useEffect(() => void load(), [load]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 pointer-coarse:min-h-11 mb-2 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={14} /> All apps
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">My profile</h1>
        <p className="text-sm text-gray-500 mt-1">Your colleagues see these details in Team.</p>
      </div>
      <Card>
        <CardHeader className="flex items-center gap-2">
          <UserRound size={16} className="text-[#CC1F1F]" />
          <h2 className="text-sm font-semibold text-gray-900">Contact details</h2>
          {user && <RoleBadge role={user.role} />}
        </CardHeader>
        <CardBody>
          {me ? (
            <ProfileForm key={me.id} person={me} offices={offices} onSaved={(saved) => {
              setPerson(saved);
              // The name in the header comes from the sign-in profile.
              if (saved.name !== user?.name) useAuth.setState((s) => (s.user ? { user: { ...s.user, name: saved.name } } : {}));
            }} />
          ) : error ? (
            <ErrorNote>{error}</ErrorNote>
          ) : (
            <Loading />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
