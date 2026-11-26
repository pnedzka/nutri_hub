import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The release number shown in the footer ("Version 26.1"); raise it in package.json with each release.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The Supabase integration on Vercel names the public variables NEXT_PUBLIC_SUPABASE_*.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  // Environment and commit of the Vercel build, for error reports (src/lib/monitoring.ts).
  define: {
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV ?? ''),
    'import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? ''),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
  test: {
    include: ['src/**/*.test.ts', 'api/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
  },
})
