# Nutri Partners apps (centrum aplikacji)

Adres: **https://nutripartners.vercel.app** (projekt Vercel `nutripartners`, zespół `nutri-partners`).

Strona startowa dla pracowników Nutri Partners i **jedyne miejsce zarządzania kontami** wspólnej bazy użytkowników. Po zalogowaniu każdy widzi kafelki aplikacji, do których ma dostęp; admini widzą dodatkowo sekcję „Administration”. Interfejs jest po angielsku, wygląd taki sam jak w pozostałych aplikacjach.

## Funkcje

- **Logowanie e-mailem i hasłem** do wspólnej bazy użytkowników (Supabase neutralizatora). „Forgot password?” wysyła link do ustawienia nowego hasła.
- **Rola przy użytkowniku:** w nagłówku plakietka **Admin** albo **User** (`profiles.role`).
- **Kafelki „Your apps”** (wszyscy):
  - Document neutralizer: https://nutridocumentation-nxdi.vercel.app
  - E-mail signature generator: https://nutri-signatures.vercel.app
  - HubSpot owner lookup: https://whoisowner.vercel.app
  - Intranet: https://intranet.nutripartners.co, w nowej karcie, z plakietką „Separate sign-in” (własna baza kont)
- **Kafelki według uprawnień:** user widzi tylko aplikacje z `profiles.apps`, admin wszystkie. Bez żadnej aplikacji widać komunikat „You don't have access to any apps yet”.
- **User management** (`/users`, tylko Admin):
  - nowe konto: e-mail, imię i nazwisko, rola, **aplikacje** (pola wyboru), zaproszenie e-mailem albo hasło startowe;
  - lista kont: zmiana imienia (ołówek), roli i **aplikacji** (ołówek przy aplikacjach → pola wyboru → Save), ponowne wysłanie zaproszenia albo linku do resetu, nowe hasło, usunięcie konta bez dokumentów;
  - admin ma zawsze wszystkie aplikacje; Intranet w uprawnieniach decyduje tylko o widoczności kafelka (osobne logowanie).
- **Linki z e-maili** (zaproszenie 24 h, reset hasła 1 h) otwierają centrum: ustawiasz hasło i od razu jesteś zalogowany.
- Nasze aplikacje otwierają się w tej samej karcie. Logo i przycisk „All apps” („Wszystkie aplikacje”) w ich nagłówkach prowadzą z powrotem tutaj.
- **Stare linki wyszukiwania:** `nutripartners.vercel.app/?q=…` (dawniej HubSpot owner lookup) przekierowują na `whoisowner.vercel.app/?q=…`.

Ukrycie kafelka to tylko wygoda. O dostępie decydują same aplikacje i zasady RLS w Supabase.

## Uprawnienia do aplikacji

- Kolumna `profiles.apps` (`text[]`) w Supabase neutralizatora: identyfikatory z `shared/access.ts` (`neutralizer`, `signatures`, `owner-lookup`, `intranet`). Admin (`role = 'admin'`) ma dostęp do wszystkiego.
- **Każda aplikacja sprawdza dostęp sama** (neutralizator, generator stopek, owner lookup); centrum tylko ukrywa kafelki.
- Konta sprzed wprowadzenia uprawnień dostały wszystkie aplikacje; nowe konto ma tylko te, które zaznaczy admin.
- Zmienia je tylko serwer centrum (klucz secret); RLS pozwala zalogowanemu tylko czytać własny profil.

## Dodawanie aplikacji

Kafelki są w `src/apps.ts`, a identyfikatory aplikacji w `shared/access.ts` (`APP_IDS`, `APP_NAMES`). Nowa aplikacja to identyfikator w `shared/access.ts`, jeden wpis w `src/apps.ts` i sprawdzenie `profiles.apps` w samej aplikacji:

```ts
{
  id: 'crm-reports',                       // unikalny
  name: 'CRM reports',                     // po angielsku
  description: 'Weekly pipeline reports.',
  url: 'https://crm-reports.vercel.app',
  icon: BarChart3,                         // ikona z lucide-react
  audience: 'app',                         // według uprawnień; 'admin': sekcja „Administration”
  newTab: true,                            // tylko dla aplikacji spoza naszej bazy kont
  note: 'Separate sign-in',                // opcjonalna plakietka
},
```

Potem `npm test`, PR do `main`, a Vercel wdroży zmianę. W nowej aplikacji warto dodać w nagłówku link do centrum, tak jak w pozostałych.

## Logowanie

- **Ta sama baza Supabase co Neutralizacja dokumentów** (`https://edzjkumjutffodfpasmf.supabase.co`). Konta zakłada się, zaprasza i resetuje tylko tutaj, w centrum (User management).
- Imię, rolę i aplikacje przeglądarka czyta z tabeli `profiles` jako zalogowana osoba (RLS: własny wiersz, klucz anon).
- Zarządzanie kontami robi serwer centrum (`api/`): `api/admin/users.ts`, `api/auth/accept.ts` (link z e-maila), `api/auth/recover.ts` („Forgot password?”). Używa klucza secret Supabase i wysyła e-maile przez Resend.
- Brak wiersza w `profiles` albo inna wartość niż `'admin'` oznacza rolę User.
- **Jedno logowanie (od 18.10.2026).** Każda aplikacja ma własną `*.vercel.app`, a sesja Supabase jest przypisana do domeny, więc centrum wpuszcza do aplikacji jednorazowym tokenem:
  1. Kafelek prowadzi do `/sso?app=…` (`src/pages/SsoPage.tsx`, `src/lib/sso.ts`). Aplikacja bez sesji też tam odsyła, z `to` (strona w aplikacji) i `back` (jej adres).
  2. Centrum (po zalogowaniu, jeśli trzeba) sprawdza dostęp i prosi `POST /api/sso` o jednorazowy token Supabase (`generateLink` typu `magiclink`, bez e-maila).
  3. Otwiera aplikację z tokenem we fragmencie adresu (`#sso=…`, nie trafia do serwerów). Aplikacja od razu usuwa go z adresu i zakłada **własną** sesję (`verifyOtp`), więc rotacja refresh tokenów nie wylogowuje innych aplikacji.
  - Token trafia tylko pod skonfigurowane adresy aplikacji (`VITE_*_URL`). W Preview także na podglądy PR-ów pasujące do `VITE_SSO_PREVIEW_ORIGINS` (wyrażenie regularne na całe origin).
  - Wylogowanie w aplikacji (globalne `signOut`) kończy się na `/logout` centrum, które też się wylogowuje. Inaczej centrum od razu zalogowałoby z powrotem.
  - Aplikacja chroni się przed pętlą: drugi powrót do centrum w ciągu minuty albo nieudany token pokazuje jej własny formularz logowania.

## Środowiska: dev i produkcja

| | Produkcja | Dev |
| --- | --- | --- |
| Gałąź | `main` | `develop` (i gałęzie PR-ów) |
| Adres | https://nutripartners.vercel.app | https://nutripartners-git-develop-nutri-partners.vercel.app (tylko po zalogowaniu do Vercela) |
| Baza Supabase | `nutri-documentation` (`edzjkumjutffodfpasmf`) | `nutri-dev` (`xmcwvpgtaxlpswxghuqq`), osobne konta testowe |
| Zmienne w Vercelu | Production | Preview |

W Preview kafelki prowadzą do wersji dev aplikacji (`VITE_NEUTRALIZER_URL`, `VITE_SIGNATURES_URL`, `VITE_OWNER_LOOKUP_URL`), przeglądarka używa `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, a serwer `SUPABASE_URL` i `SUPABASE_SECRET_KEY` bazy dev. Konta testowe zakłada się w User management wersji dev.

1. **Praca:** gałąź od `develop` i PR do `develop` (squash). Każdy PR ma własny podgląd; po scaleniu zmiana jest pod stałym adresem dev.
2. **Wydanie na produkcję** (na polecenie właściciela): PR `develop` → `main`, scalany **merge commitem**, nie squashem, żeby gałęzie się nie rozjechały. Vercel wdraża `main` w ok. minutę. Cofnięcie: Vercel → Deployments → poprzednie wdrożenie → Instant Rollback.
3. **Zmiany schematu bazy:** najpierw na `nutri-dev`, przy wydaniu ta sama zmiana na produkcji, przed scaleniem do `main`. Pełny schemat: `db/schema.sql` w `nutri_documentation`.
4. **Pilna poprawka:** PR do `main`, potem `main` scalić do `develop`.

Darmowa baza dev usypia się po 7 dniach bez użycia. Wybudzenie: Supabase → projekt `nutri-dev` → Restore (ok. minuty).

## Wdrożenie (Vercel)

1. Usuń domenę `nutripartners.vercel.app` z projektu `whoisowner`: Settings → Domains → Remove.
2. Utwórz projekt **`nutripartners`** z tego repozytorium. Framework: Vite, bez zmian w ustawieniach builda.
3. **Settings → Environment Variables** (wszystkie środowiska):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://edzjkumjutffodfpasmf.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = klucz anon projektu neutralizatora
   - `SUPABASE_SECRET_KEY` = klucz secret (service role) tego samego projektu, **tylko serwer** (Supabase → Project Settings → API Keys → **Secret keys**, prefiks `sb_secret_`; nie klucz publishable `sb_publishable_` ani anon, z nimi serwer nie widzi żadnych kont i zwraca 503)
   - `RESEND_API_KEY` = klucz Resend do e-maili z zaproszeniami i resetem hasła
   - opcjonalnie `MAIL_FROM` (domyślnie `Nutri APEX <no-reply@nutripartners.co>`) i `APP_URL` (adres w linkach z e-maili)
4. Settings → Domains: `nutripartners.vercel.app`.
5. Deployment Protection: Vercel Authentication tylko dla preview.

## Praca lokalna

```bash
npm install
cp .env.example .env.local   # uzupełnij klucz anon
npm run dev
npm test && npm run lint && npm run build
```
