import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The Supabase integration on Vercel names the public variables NEXT_PUBLIC_SUPABASE_*.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  // Environment and commit of the Vercel build, for error reports (src/lib/monitoring.ts).
  define: {
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV ?? ''),
    'import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? ''),
  },
  test: {
    include: ['src/**/*.test.ts', 'api/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
  },
})
