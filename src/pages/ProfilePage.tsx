import { useEffect } from 'react';
import { UserRound } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { MailboxCard } from '../components/MailboxCard';
import { ProfileForm } from '../components/ProfileForm';
import { RoleBadge } from '../components/AppHeader';
import { useAuth } from '../lib/auth';
import { useMyProfile, usePeople } from '../lib/people';
import { ErrorNote, Loading } from '../components/States';
import { PageHeader } from '../components/PageHeader';

/** My profile: the signed-in person's photo and company contact details, shown in Team and used in signatures. */
export function ProfilePage() {
  const user = useAuth((s) => s.user);
  const { load, error, offices, setPerson } = usePeople();
  const me = useMyProfile();
  useEffect(() => void load(), [load]);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="My profile">Your colleagues see these details in Team.</PageHeader>
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
      <MailboxCard admin={user?.role === 'admin'} />
    </div>
  );
}
