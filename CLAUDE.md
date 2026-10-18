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
- **Zarządzanie kontami jest tylko w centrum** (`/users`, decyzja z 17.10.2026): zakładanie, zaproszenia, reset haseł, role, imiona i **uprawnienia do aplikacji**. Neutralizator już tego nie ma.
- Uprawnienia: `profiles.apps text[]` (`shared/access.ts`: `neutralizer`, `signatures`, `owner-lookup`, `intranet`). Admin ma wszystko. Każda aplikacja sprawdza dostęp sama; Intranet to tylko widoczność kafelka. Konta sprzed zmiany dostały wszystkie aplikacje, domyślna wartość kolumny to `'{}'`.
- Serwer centrum (`api/`) używa `SUPABASE_SECRET_KEY` i `RESEND_API_KEY`. Linki z e-maili prowadzą do centrum.
- Nasze aplikacje otwierają się w tej samej karcie. W ich nagłówkach logo i „All apps” prowadzą z powrotem (`HUB_URL` / `VITE_HUB_URL`). Intranet otwiera się w nowej karcie.
- `/?q=…` przekierowuje na whoisowner (`src/lib/legacy.ts`), bo dawniej ta domena należała do owner lookup.
- Logowanie: wspólna baza Supabase neutralizatora (`https://edzjkumjutffodfpasmf.supabase.co`), tylko `signInWithPassword`.
  - Rola i aplikacje: `profiles.role`, `profiles.apps`, czytane w przeglądarce (RLS: własny wiersz). Zmienia je tylko serwer centrum.
- **Bez wspólnego logowania (SSO), zostajemy na `*.vercel.app`** (decyzja z 17.10.2026). Nie przekazywać tokenów w linku, bo rotacja refresh tokenów wylogowałaby obie aplikacje.
  - Na później: Vercel Microfrontends (podścieżki jednej domeny) albo subdomeny firmowe i cookie na domenie nadrzędnej.
- Design: Vite + React 19 + Tailwind v4 + TypeScript, `lucide-react`, `zustand`. Inter, tło `#F5F5F5`, tekst `#1A1A1A`, marka `#CC1F1F`, białe karty `border-gray-100`. Na telefonach pola dotykowe ≥ 44 px, `.safe-x`, `.safe-bottom`, pola 16 px.

## Praca z repo

- `npm test` (vitest), `npm run lint`, `npm run build`. Wszystko musi przejść przed pushem.
- Środowiska (od 18.10.2026): `develop` = dev (baza Supabase `nutri-dev`, zmienne Preview), `main` = produkcja. PR-y idą do `develop` (squash). Na produkcję tylko na polecenie właściciela: PR `develop` → `main` scalany merge commitem. Szczegóły w README, sekcja „Środowiska”.
- Sandbox Claude Code nie łączy się z supabase.co ani *.vercel.app. Używaj narzędzi MCP: Supabase, Vercel.
