import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Toasts } from './components/Toasts';
import { useAuth } from './lib/auth';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { SetupPage } from './pages/SetupPage';
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
          <Route path="/users" element={<AdminOnly><UsersPage /></AdminOnly>} />
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
