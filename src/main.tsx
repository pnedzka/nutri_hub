import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { legacyRedirect } from './lib/legacy';
import { initMonitoring, onUncaughtError } from './lib/monitoring';

initMonitoring();

const redirect = legacyRedirect(new URL(window.location.href));
if (redirect) {
  window.location.replace(redirect);
} else {
  createRoot(document.getElementById('root')!, { onUncaughtError }).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}
