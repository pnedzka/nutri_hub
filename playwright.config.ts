import { defineConfig, devices } from '@playwright/test';

// Functional tests (npm run e2e): the real app in a real browser, started by `vite` with a fake Supabase project.
// The API (/api/…) and Supabase are answered by the in-memory backend in e2e/backend.ts, so the tests touch no
// database, e-mail or file and run anywhere, also without network. Described in README, "Testy".
const PORT = 5179;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    locale: 'en-GB',
    timezoneId: 'Europe/Warsaw',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: chromium() } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions: chromium() }, grep: /@phone/ },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: 'http://supabase.test',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
      VITE_HUB_MODULES: 'news,leave,calls,purchase,contracts,complaints',
      VITE_SENTRY_DSN: '',
    },
  },
});

/** A browser installed elsewhere (PLAYWRIGHT_CHROMIUM=/path), otherwise the one from `npx playwright install chromium`. */
function chromium() {
  return process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {};
}
