import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { legacyRedirect } from './lib/legacy';

const redirect = legacyRedirect(new URL(window.location.href));
if (redirect) {
  window.location.replace(redirect);
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
