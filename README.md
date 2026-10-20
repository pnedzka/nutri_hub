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
  - **News** (`/news`) i **Leave** (`/leave`): moduły samego centrum, opisane niżej.
  - Intranet: https://intranet.nutripartners.co, w nowej karcie, z plakietką „Separate sign-in” (stary intranet, własna baza kont). Docelowo jego rolę przejmuje centrum.
- **Kafelki według uprawnień:** user widzi tylko aplikacje z `profiles.apps`, admin wszystkie. Bez żadnej aplikacji widać komunikat „You don't have access to any apps yet”.
- **User management** (`/users`, tylko Admin):
  - nowe konto: e-mail, imię i nazwisko, rola, **aplikacje** (pola wyboru), zaproszenie e-mailem albo hasło startowe;
  - lista kont: zmiana imienia (ołówek), roli i **aplikacji** (ołówek przy aplikacjach → pola wyboru → Save), ponowne wysłanie zaproszenia albo linku do resetu, nowe hasło, usunięcie konta bez dokumentów;
  - admin ma zawsze wszystkie aplikacje; Intranet w uprawnieniach decyduje tylko o widoczności kafelka starego intranetu (osobne logowanie).
- **Linki z e-maili** (zaproszenie 24 h, reset hasła 1 h) otwierają centrum: ustawiasz hasło i od razu jesteś zalogowany.
- Nasze aplikacje otwierają się w tej samej karcie. Logo i przycisk „All apps” („Wszystkie aplikacje”) w ich nagłówkach prowadzą z powrotem tutaj.
- **Moduły centrum (od 20.10.2026):** News i Leave działają w samym centrum, bez osobnego logowania i projektu Vercel (decyzja właściciela: centrum stanie się intranetem). Szczegóły w „Moduły: News i Leave”.
- **Stare linki wyszukiwania:** `nutripartners.vercel.app/?q=…` (dawniej HubSpot owner lookup) przekierowują na `whoisowner.vercel.app/?q=…`.

Ukrycie kafelka to tylko wygoda. O dostępie decydują same aplikacje i zasady RLS w Supabase.

## Moduły: News i Leave

- **Leave (urlopy):**
  - **My leave:** saldo urlopu wypoczynkowego (przeniesione z poprzednich lat, przyznane na ten rok, wykorzystane, czekające), formularz wniosku z podglądem liczby dni roboczych i lista własnych wniosków (oczekujące można anulować).
  - **Approvals:** wnioski do zatwierdzenia dla przełożonego i adminów, z saldem pracownika i komentarzem do decyzji.
  - **Calendar:** miesięczny kalendarz nieobecności. Wszyscy widzą, kto jest nieobecny; rodzaj urlopu i oczekujące wnioski widzi tylko pracownik, jego przełożony i admini.
  - **Employees** (admini): przełożony, liczba dni urlopu na rok, dni na bieżący rok, pierwszy rok w aplikacji i dni przeniesione ze starego intranetu.
  - Rodzaje: wypoczynkowy, na żądanie (4 dni w roku, w ramach wypoczynkowego), okolicznościowy, opieka nad dzieckiem (2 dni w roku), bezpłatny, L4 (wpisuje admin, nie zmniejsza salda). Admin może wpisać urlop za pracownika (od razu zatwierdzony).
  - Liczą się dni robocze, bez weekendów i świąt ustawowych (z Wigilią od 2025), z połówkami dnia. Niewykorzystane dni przechodzą na kolejny rok. Wniosek mieści się w jednym roku kalendarzowym.
  - E-maile: o nowym wniosku do przełożonego i adminów, o decyzji do pracownika.
- **News:**
  - **Lista wpisów** od najnowszych (po 12, „Load older posts”), z okładką (pierwsze zdjęcie), fragmentem tekstu i liczbą polubień, komentarzy i zdjęć.
  - **Wpis:** tekst (akapity i klikalne linki, bez HTML), galeria zdjęć na pełnym ekranie (strzałki, przesuwanie palcem, Esc), polubienia z listą osób i komentarze.
  - **Publikują** admini i redaktorzy. Redaktorów wybierają admini w samym module: News → **Editors**. Redaktor edytuje i usuwa swoje wpisy, admin wszystkie.
  - **Komentują i lajkują** wszyscy z dostępem do News. Autor edytuje i usuwa swój komentarz, admin usuwa każdy.
  - **Zdjęcia:** do 30 na wpis. Przeglądarka zmniejsza je do 2000 px (JPEG) i wysyła prosto do prywatnego bucketu Supabase Storage `intranet` (jednorazowy link od serwera). Oglądamy je przez podpisane linki ważne godzinę. Zdjęcia usunięte z wpisu i zdjęcia usuniętego wpisu serwer kasuje; zdjęcia dodane do wpisu, którego nie zapisano, zostają w buckecie (nie przeszkadzają).
  - **E-mail o nowym wpisie** do wszystkich z dostępem do News (bez autora), z linkiem do wpisu. Każdy dostaje osobną wiadomość (Resend batch). Edycja wpisu nie wysyła e-maili.

- **Technicznie:** ekrany w `src/pages/news/` i `src/pages/leave/`, API w `api/news/` i `api/leave/`, reguły z testami w `shared/` (`leave.ts`, `news.ts`), uprawnienia w `api/_lib/leave.ts` i `api/_lib/news.ts`, e-maile w `api/_lib/notify.ts`.
- **Dane:** tabele `leave_*` i `news_*` oraz prywatny bucket Storage `intranet` (`db/schema.sql`). Mają RLS bez polityk: czyta i zapisuje je tylko serwer centrum kluczem secret, po sprawdzeniu dostępu (`requireApp` w `api/_lib/auth.ts`).
- **Dostęp:** uprawnienia `news` i `leave` w User management. Konta z uprawnieniem `intranet` dostały oba (`db/schema.sql`; w dev zrobione 20.10.2026, na produkcji przy wydaniu).
- **Plan Hobby pozwala na 12 funkcji** (pliki w `api/` poza `_lib`); jest ich 11. Nowe endpointy łączyć w istniejących plikach (np. decyzje urlopowe to `PATCH /api/leave`, polubienia i komentarze `POST /api/news/post`).

## Uprawnienia do aplikacji

- Kolumna `profiles.apps` (`text[]`) w Supabase neutralizatora: identyfikatory z `shared/access.ts` (`neutralizer`, `signatures`, `owner-lookup`, `news`, `leave`, `intranet`). Admin (`role = 'admin'`) ma dostęp do wszystkiego.
- **Każda aplikacja sprawdza dostęp sama** (neutralizator, generator stopek, owner lookup, a News i Leave serwer centrum); centrum tylko ukrywa kafelki.
- Konta sprzed wprowadzenia uprawnień dostały wszystkie aplikacje; nowe konto ma tylko te, które zaznaczy admin.
- Zmienia je tylko serwer centrum (klucz secret); RLS pozwala zalogowanemu tylko czytać własny profil.

## Dodawanie aplikacji

Kafelki są w `src/apps.ts`, a identyfikatory aplikacji w `shared/access.ts` (`APP_IDS`, `APP_NAMES`). Nowa aplikacja w centrum wymaga:
- identyfikatora w `shared/access.ts`;
- wpisu w `src/apps.ts`;
- adresu w `APP_URLS` (`src/lib/sso.ts`), jeśli korzysta z jednego logowania;
- sprawdzenia `profiles.apps` w samej aplikacji.

Pełna lista kroków (repo, projekt Vercel, zmienne dev i produkcji) jest w `CLAUDE.md`, w sekcji „Nowa aplikacja: checklista”. Przykładowy wpis:

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

Potem `npm test` i PR do `develop`; na produkcję zmiana trafia z najbliższym wydaniem (zob. „Środowiska”). W nagłówku nowej aplikacji logo i „All apps” prowadzą do centrum, tak jak w pozostałych.

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
3. **Zmiany schematu bazy:** najpierw na `nutri-dev`, przy wydaniu ta sama zmiana na produkcji, przed scaleniem do `main`. Pełny schemat: `db/schema.sql` w `nutri_documentation`, a tabele News i Leave w `db/schema.sql` tego repo.
4. **Pilna poprawka:** PR do `main`, potem `main` scalić do `develop`.

Darmowa baza dev usypia się po 7 dniach bez użycia. Wybudzenie: Supabase → projekt `nutri-dev` → Restore (ok. minuty).

## Wdrożenie (Vercel)

1. Usuń domenę `nutripartners.vercel.app` z projektu `whoisowner`: Settings → Domains → Remove.
2. Utwórz projekt **`nutripartners`** z tego repozytorium. Framework: Vite, bez zmian w ustawieniach builda.
3. **Settings → Environment Variables** (wszystkie środowiska):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://edzjkumjutffodfpasmf.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = klucz anon projektu neutralizatora
   - `SUPABASE_SECRET_KEY` = klucz secret (service role) tego samego projektu, **tylko serwer** (Supabase → Project Settings → API Keys → **Secret keys**, prefiks `sb_secret_`; nie klucz publishable `sb_publishable_` ani anon, z nimi serwer nie widzi żadnych kont i zwraca 503)
   - `RESEND_API_KEY` = klucz Resend do e-maili z zaproszeniami, resetem hasła i powiadomieniami News i Leave
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
