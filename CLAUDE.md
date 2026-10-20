# CLAUDE.md: kontekst projektu (czytaj na początku każdej sesji)

Repo `pnedzka/nutri_hub` to **centrum aplikacji Nutri Partners**: https://nutripartners.vercel.app. Po zalogowaniu pracownik widzi kafelki aplikacji firmy. Opis funkcji i wdrożenia jest w `README.md`.

Właściciel: Paweł Nędzka. Rozmawiamy po polsku, interfejs jest po angielsku.

## Aplikacje (zespół Vercel `nutri-partners`, `team_J6D6ialuxylLwb8dN8Gy8YKc`)

| Aplikacja | Produkcja | Dev (`develop`) | Projekt Vercel | Repo |
| --- | --- | --- | --- | --- |
| Centrum aplikacji (to repo) | https://nutripartners.vercel.app | https://nutripartners-git-develop-nutri-partners.vercel.app | `nutripartners` (`prj_Xu6pDaxj1A9rgZ1qwHcHOFNOBINp`) | `pnedzka/nutri_hub` |
| Document neutralizer | https://nutridocumentation-nxdi.vercel.app | https://nutridocumentation-nxdi-git-develop-nutri-partners.vercel.app | `nutri_documentation-nxdi` (`prj_cqi64Tsx7I1JsNnzjulk1CEbYVXd`) | `pnedzka/nutri_documentation` |
| E-mail signature generator (UI po polsku) | https://nutri-signatures.vercel.app | https://nutri-signatures-git-develop-nutri-partners.vercel.app | `nutri-signatures` (`prj_yF2TYN35jQ7vcQz4wqabpjxFs43E`) | `pnedzka/nutri_signatures` |
| HubSpot owner lookup | https://whoisowner.vercel.app | https://whoisowner-git-develop-nutri-partners.vercel.app | `whoisowner` (`prj_Zp4K089NIbc4GOG49fLII8V6DjaW`) | `pnedzka/nutripartners` |
| Intranet (osobna baza kont, nie zmieniamy) | https://intranet.nutripartners.co | – | poza Vercelem | – |

`nutri-partners` to prywatne konto Vercel właściciela (plan Hobby), nie zespół. Projekt `nutri-partners1/nutripartners` to duplikat na innym koncie Vercel, poza naszym dostępem; buduje się z `pnedzka/nutripartners`, ale niczego nie blokuje.

## Ustalenia

- Kafelki są w `src/apps.ts` (`audience: 'app' | 'admin'`, `newTab` tylko dla intranetu). Nowa aplikacja to jeden wpis.
- **Zarządzanie kontami jest tylko w centrum** (`/users`, decyzja z 17.10.2026): zakładanie, zaproszenia, reset haseł, role, imiona i **uprawnienia do aplikacji**. Neutralizator już tego nie ma.
- Uprawnienia: `profiles.apps text[]` (`shared/access.ts`: `neutralizer`, `signatures`, `owner-lookup`, `intranet`). Admin ma wszystko. Każda aplikacja sprawdza dostęp sama; Intranet to tylko widoczność kafelka. Konta sprzed zmiany dostały wszystkie aplikacje, domyślna wartość kolumny to `'{}'`.
- Serwer centrum (`api/`) używa `SUPABASE_SECRET_KEY` i `RESEND_API_KEY`. Linki z e-maili prowadzą do centrum.
- Nasze aplikacje otwierają się w tej samej karcie. W ich nagłówkach logo i „All apps” prowadzą z powrotem (`HUB_URL` / `VITE_HUB_URL`). Intranet otwiera się w nowej karcie.
- `/?q=…` przekierowuje na whoisowner (`src/lib/legacy.ts`), bo dawniej ta domena należała do owner lookup.
- Logowanie: wspólna baza Supabase neutralizatora (`https://edzjkumjutffodfpasmf.supabase.co`; w dev `nutri-dev`, zob. „Środowiska”), hasło (`signInWithPassword`) tylko w centrum; aplikacje dostają sesję z centrum (niżej).
  - Rola i aplikacje: `profiles.role`, `profiles.apps`, czytane w przeglądarce (RLS: własny wiersz). Zmienia je tylko serwer centrum.
- **Jedno logowanie przez centrum, na `*.vercel.app`** (decyzja z 18.10.2026; subdomeny `nutripartners.co` odrzucone). Kafelek i aplikacja bez sesji prowadzą do `/sso`; centrum daje aplikacji jednorazowy token Supabase (`magiclink`) w `#sso=…`, a aplikacja zakłada z niego **własną** sesję. Szczegóły w README („Logowanie”).
  - Nie przekazywać samej sesji (access/refresh token) w linku: rotacja refresh tokenów wylogowałaby obie aplikacje.
  - Wylogowanie w aplikacji prowadzi do `/logout` centrum. Preview: `VITE_SSO_PREVIEW_ORIGINS` pozwala wracać na podglądy PR-ów.
- Design: Vite + React 19 + Tailwind v4 + TypeScript, `lucide-react`, `zustand`. Inter, tło `#F5F5F5`, tekst `#1A1A1A`, marka `#CC1F1F`, białe karty `border-gray-100`. Na telefonach pola dotykowe ≥ 44 px, `.safe-x`, `.safe-bottom`, pola 16 px.

## Środowiska: dev i produkcja (od 18.10.2026)

Decyzje właściciela: osobna baza dev, wersje dev widzi tylko on, na produkcję wydajemy wyłącznie na jego polecenie („wdrażaj”).

| | Produkcja | Dev |
| --- | --- | --- |
| Gałąź | `main` | `develop` i gałęzie PR-ów |
| Zmienne w Vercelu | Production | Preview |
| Supabase | `nutri-documentation` (`edzjkumjutffodfpasmf`) | `nutri-dev` (`xmcwvpgtaxlpswxghuqq`, plan Free) |
| Dostęp | publiczny, chroni logowanie aplikacji | Vercel Authentication (tylko konto właściciela) i logowanie aplikacji |

- **Baza dev** ma ten sam schemat co produkcja (`db/schema.sql` w `nutri_documentation`), ale osobne konta i dokumenty. Konto testowe: `p.nedzka@nutripartners.co` (admin, wszystkie aplikacje). Kolejne konta zakłada się w User management centrum dev; zaproszenia z dev wychodzą prawdziwym mailem (Resend) i prowadzą do adresu dev.
- **Zmienne Preview** (produkcyjnych nie ruszamy; kod czyta `VITE_*` przed `NEXT_PUBLIC_*`, a `SUPABASE_URL` przed `NEXT_PUBLIC_SUPABASE_URL`):
  - wszystkie 4 projekty: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (klucz publishable `nutri-dev`), `SUPABASE_URL`;
  - centrum i neutralizator: `SUPABASE_SECRET_KEY` (klucz tajny `nutri-dev`, wpisuje go właściciel);
  - whoisowner i stopki: `SUPABASE_ANON_KEY`;
  - linki między aplikacjami: `VITE_HUB_URL` (neutralizator, whoisowner, stopki) → centrum dev; w centrum `VITE_NEUTRALIZER_URL`, `VITE_SIGNATURES_URL`, `VITE_OWNER_LOOKUP_URL` → aplikacje dev;
  - centrum: `VITE_SSO_PREVIEW_ORIGINS` = `https://(nutridocumentation-nxdi|whoisowner|nutri-signatures)-[a-z0-9-]+-nutri-partners\.vercel\.app` (jedno logowanie wraca też na podglądy PR-ów aplikacji);
  - neutralizator: `ANTHROPIC_API_KEY` także w Preview; whoisowner: HubSpot i Claude mają te same klucze w obu środowiskach (HubSpot tylko do odczytu);
  - stopki: `BLOB_READ_WRITE_TOKEN` tylko w Production i Development, więc w dev zapisane stopki zostają w przeglądarce i nie zmieniają wspólnej listy zespołu.
  - Nowa zmienna o różnych wartościach w dev i na produkcji: dodać osobno dla Production i dla Preview. Zmienne działają od następnego wdrożenia.

### Procedura

1. **Praca:** gałąź od `develop`, PR do `develop`, squash. Każdy PR ma własny podgląd (baza dev), a po scaleniu zmiana jest pod adresem dev. Właściciel sprawdza ją tam.
2. **Wydanie** (tylko po „wdrażaj”, całość albo wybrane aplikacje): PR `develop` → `main` z listą zmian, scalany **merge commitem** (nie squash, żeby gałęzie się nie rozjechały). Potem sprawdzić wdrożenie produkcyjne (`list_deployments`, `target: production`). Cofnięcie: Vercel → Deployments → Instant Rollback.
3. **Schemat bazy:** zmiana w `db/schema.sql`, najpierw zastosowana na `nutri-dev` (MCP Supabase), a przy wydaniu na produkcji, przed scaleniem do `main`. Build nie migruje bazy (brak `POSTGRES_URL_NON_POOLING`).
4. **Pilna poprawka:** PR do `main` (squash), potem `main` scalić do `develop`.

### Pułapki

- MCP Supabase zawiesza się (timeout 60 s, bez efektu) na poleceniach `drop …`, np. `drop policy if exists`. Dłuższy SQL dzielić na części.
- Gałąź założona na tym samym commicie co `main` nie uruchamia wdrożenia. Wtedy `create_deployment` z `gitSource` (`type: github`, `org: pnedzka`, `repo`, `ref: develop`).
- Projekt centrum: narzędzia MCP Vercel wołać bez `teamId` (z `teamId` dają 404). Logi runtime i `web_fetch_vercel_url` dla centrum zwracają 403; diagnozować przez logi Supabase (`query_logs`, `edge_logs`).
- Darmowa baza dev usypia się po 7 dniach bez użycia: Supabase → `nutri-dev` → Restore.

## Praca z repo

- `npm test` (vitest), `npm run lint`, `npm run build`. Wszystko musi przejść przed pushem.
- PR-y idą do `develop` (squash). Na produkcję tylko na polecenie właściciela, zob. „Środowiska” wyżej.
- **Code review automatyczne** (od 20.10.2026): `.github/workflows/claude-code-review.yml` (GitHub Actions, `anthropics/claude-code-action`, plugin `code-review`) komentuje PR, gdy przestaje być szkicem (Ready for review) i po kolejnych pushach; nie blokuje scalania. PR-y wydań (`develop` → `main`) pomija. Potrzebuje sekretu repo `ANTHROPIC_API_KEY` (GitHub → Settings → Secrets and variables → Actions, wpisuje właściciel) i aplikacji Claude na GitHubie. Akcja działa tylko wtedy, gdy plik workflow jest identyczny na `main` (domyślna gałąź), więc jego zmiany wprowadza się na `main`.
- Sandbox Claude Code nie łączy się z supabase.co ani *.vercel.app. Używaj narzędzi MCP: Supabase, Vercel.
