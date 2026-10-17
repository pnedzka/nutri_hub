# CLAUDE.md: kontekst projektu (czytaj na początku każdej sesji)

Repo `pnedzka/nutri_hub` to **centrum aplikacji Nutri Partners**: https://nutripartners.vercel.app. Po zalogowaniu pracownik widzi kafelki aplikacji firmy. Opis funkcji i wdrożenia jest w `README.md`.

Właściciel: Paweł Nędzka. Rozmawiamy po polsku, interfejs jest po angielsku.

## Aplikacje (zespół Vercel `nutri-partners`, `team_J6D6ialuxylLwb8dN8Gy8YKc`)

| Aplikacja | Adres | Projekt Vercel | Repo |
| --- | --- | --- | --- |
| Centrum aplikacji (to repo) | https://nutripartners.vercel.app | `nutripartners` | `pnedzka/nutri_hub` |
| Document neutralizer, zarządzanie kontami (`/admin/uzytkownicy`) | https://nutridocumentation-nxdi.vercel.app | `nutri_documentation-nxdi` | `pnedzka/nutri_documentation` |
| E-mail signature generator (UI po polsku, bez logowania) | https://nutri-signatures.vercel.app | `nutri-signatures` | `pnedzka/nutri_signatures` |
| HubSpot owner lookup | https://whoisowner.vercel.app | `whoisowner` | `pnedzka/nutripartners` |
| Intranet (osobna baza kont, nie zmieniamy) | https://intranet.nutripartners.co | poza Vercelem | – |

## Ustalenia

- Kafelki są w `src/apps.ts` (`audience: 'everyone' | 'admin'`, `newTab` tylko dla intranetu). Nowa aplikacja to jeden wpis.
- Admin widzi dodatkowo tylko kafelek „User management” (decyzja z 17.10.2026).
- Nasze aplikacje otwierają się w tej samej karcie. W ich nagłówkach logo i „All apps” prowadzą z powrotem (`HUB_URL` / `VITE_HUB_URL`). Intranet otwiera się w nowej karcie.
- `/?q=…` przekierowuje na whoisowner (`src/lib/legacy.ts`), bo dawniej ta domena należała do owner lookup.
- Logowanie: wspólna baza Supabase neutralizatora (`https://edzjkumjutffodfpasmf.supabase.co`), tylko `signInWithPassword`.
  - Rola: `profiles.role` (`'admin'` / `'user'`), czytana w przeglądarce (RLS: własny wiersz). Centrum nie ma serwera ani klucza service_role.
- **Bez wspólnego logowania (SSO), zostajemy na `*.vercel.app`** (decyzja z 17.10.2026). Nie przekazywać tokenów w linku, bo rotacja refresh tokenów wylogowałaby obie aplikacje.
  - Na później: Vercel Microfrontends (podścieżki jednej domeny) albo subdomeny firmowe i cookie na domenie nadrzędnej.
- Design: Vite + React 19 + Tailwind v4 + TypeScript, `lucide-react`, `zustand`. Inter, tło `#F5F5F5`, tekst `#1A1A1A`, marka `#CC1F1F`, białe karty `border-gray-100`. Na telefonach pola dotykowe ≥ 44 px, `.safe-x`, `.safe-bottom`, pola 16 px.

## Praca z repo

- `npm test` (vitest), `npm run lint`, `npm run build`. Wszystko musi przejść przed pushem.
- Zmiany idą przez PR do `main` (squash merge). Vercel wdraża `main` automatycznie.
- Sandbox Claude Code nie łączy się z supabase.co ani *.vercel.app. Używaj narzędzi MCP: Supabase, Vercel.
