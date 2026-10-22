import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Toasts } from './components/Toasts';
import { canUse, type AppId } from '../shared/access.ts';
import { available } from './apps';
import { useAuth } from './lib/auth';
import { CallsPage } from './pages/calls/CallsPage';
import { HomePage } from './pages/HomePage';
import { LeavePage } from './pages/leave/LeavePage';
import { LoginPage } from './pages/LoginPage';
import { NewsPage } from './pages/news/NewsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { SetupPage } from './pages/SetupPage';
import { SsoPage } from './pages/SsoPage';
import { TeamPage } from './pages/team/TeamPage';
import { UserEditPage } from './pages/UserEditPage';
import { UsersPage } from './pages/UsersPage';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
      <span className="animate-spin h-5 w-5 mr-3 rounded-full border-2 border-gray-300 border-t-[#CC1F1F]" />
      Loading…
    </div>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const role = useAuth((s) => s.user?.role);
  return role === 'admin' ? <>{children}</> : <Navigate to="/" replace />;
}

/** A module of the hub (News, Leave) for the people who may use it; the API checks access again. */
function AppOnly({ app, children }: { app: AppId; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  return user && canUse(user, app) ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const { status, init, passwordSetup } = useAuth();
  useEffect(() => init(), [init]);

  let content: ReactNode;
  if (status === 'loading') content = <Spinner />;
  else if (status === 'unconfigured') content = <SetupPage />;
  else if (status !== 'signedIn') content = <LoginPage />;
  else if (passwordSetup) content = <SetPasswordPage />;
  else
    content = (
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          {available('news') && <Route path="/news/*" element={<AppOnly app="news"><NewsPage /></AppOnly>} />}
          {available('leave') && <Route path="/leave/*" element={<AppOnly app="leave"><LeavePage /></AppOnly>} />}
          <Route path="/team" element={<TeamPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/users" element={<AdminOnly><UsersPage /></AdminOnly>} />
          <Route path="/users/:id" element={<AdminOnly><UserEditPage /></AdminOnly>} />
          <Route path="/calls" element={<AdminOnly><CallsPage /></AdminOnly>} />
          <Route path="/sso" element={<SsoPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    );

  return (
    <>
      {content}
      <Toasts />
    </>
  );
}
