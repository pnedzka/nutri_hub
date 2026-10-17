import { useEffect, type ReactNode } from 'react';
import { Layout } from './components/Layout';
import { Toasts } from './components/Toasts';
import { useAuth } from './lib/auth';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
      <span className="animate-spin h-5 w-5 mr-3 rounded-full border-2 border-gray-300 border-t-[#CC1F1F]" />
      Loading…
    </div>
  );
}

export default function App() {
  const { status, init } = useAuth();
  useEffect(() => init(), [init]);

  let content: ReactNode;
  if (status === 'loading') content = <Spinner />;
  else if (status === 'unconfigured') content = <SetupPage />;
  else if (status !== 'signedIn') content = <LoginPage />;
  else
    content = (
      <Layout>
        <HomePage />
      </Layout>
    );

  return (
    <>
      {content}
      <Toasts />
    </>
  );
}
