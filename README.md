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
  - **Team** (`/team`, wszyscy zalogowani): katalog pracowników ze zdjęciem, stanowiskiem, działem, biurem, e-mailem, telefonami i LinkedIn; wyszukiwanie i filtr biura. Konta dezaktywowane są ukryte.
  - Intranet: https://intranet.nutripartners.co, w nowej karcie, z plakietką „Separate sign-in” (stary intranet, własna baza kont). Docelowo jego rolę przejmuje centrum.
- **My profile** (`/profile`, kliknięcie imienia w nagłówku): zdjęcie (kwadrat 512 px, przycinany w przeglądarce), imię i nazwisko, stanowisko, dział, telefon, komórka, LinkedIn (opcjonalnie), biuro. E-mail firmowy to adres logowania; zmienia go, razem z rolą i aplikacjami, tylko admin. Generator stopek wypełnia formularz tymi danymi.
- **Kafelki według uprawnień:** user widzi tylko aplikacje z `profiles.apps`, admin wszystkie. Bez żadnej aplikacji widać komunikat „You don't have access to any apps yet”.
- **User management** (`/users`, tylko Admin):
  - nowe konto: e-mail, imię i nazwisko, rola, **aplikacje** (pola wyboru), zaproszenie e-mailem albo hasło startowe;
  - lista kont: zdjęcie, stanowisko, data ostatniego logowania; zmiana imienia (ołówek), roli i **aplikacji** (ołówek przy aplikacjach → pola wyboru → Save), „Resend invitation” albo „Reset password” (link e-mailem), nowe hasło, usunięcie konta bez dokumentów;
  - **Edit** (`/users/<id>`): dane kontaktowe i zdjęcie osoby (te same pola co My profile) oraz **historia** konta: kto i kiedy założył konto, wysłał link, zmienił rolę, aplikacje, hasło, dane albo dezaktywował konto (`profile_events`);
  - **Deactivate / Reactivate:** dla osób, które odchodzą. Konto jest zablokowane w Supabase Auth (`ban_duration`) i ma `profiles.deactivated_at`: nie zaloguje się (w już otwartych aplikacjach najpóźniej po godzinie, gdy wygaśnie token), znika z Team i modułów, a jego dokumenty, urlopy i wpisy zostają. Reaktywacja przywraca dostęp;
  - **Offices:** lista biur (miasto + adres po angielsku do stopek), z której każdy wybiera swoje biuro;
  - admin ma zawsze wszystkie aplikacje; Intranet w uprawnieniach decyduje tylko o widoczności kafelka starego intranetu (osobne logowanie).
- **Phone calls analyser** (`/calls`, tylko Admin, sekcja Administration; na produkcji od 23.10.2026): import faktur T-Mobile (PDF) i raport połączeń pracowników. Opis w „Phone calls analyser” niżej.
- **Purchase Manager** (`/purchase`, uprawnienie `purchase`; od 28.10.2026 tylko w dev): przegląd produktów AI i propozycji bid sell z centralnej bazy Apex 2.0. Opis w „Purchase Manager” niżej.
- **Linki z e-maili** (zaproszenie 24 h, reset hasła 1 h) otwierają centrum: ustawiasz hasło i od razu jesteś zalogowany.
- Nasze aplikacje otwierają się w tej samej karcie. Logo i przycisk „All apps” („Wszystkie aplikacje”) w ich nagłówkach prowadzą z powrotem tutaj.
- **Moduły centrum (od 20.10.2026):** News i Leave działają w samym centrum, bez osobnego logowania i projektu Vercel (decyzja właściciela: centrum stanie się intranetem). Szczegóły w „Moduły: News i Leave”.
- **Stare linki wyszukiwania:** `nutripartners.vercel.app/?q=…` (dawniej HubSpot owner lookup) przekierowują na `whoisowner.vercel.app/?q=…`.

Ukrycie kafelka to tylko wygoda. O dostępie decydują same aplikacje i zasady RLS w Supabase.

## Moduły: News i Leave

**Tylko w dev (decyzja z 20.10.2026).** Moduły w budowie są włączone zmienną `VITE_HUB_MODULES` (`news,leave,calls`, tylko w Preview i Development; `calls` = Phone calls analyser, od 22.10.2026). Bez niej, czyli na produkcji, kafelki, strony i wybór w User management są ukryte, a API modułów odpowiada 404. Lista modułów w budowie jest w `shared/access.ts` (`DEV_MODULES`). Wydanie modułu: dodać go do `VITE_HUB_MODULES` w Production (i wdrożyć ponownie) albo usunąć z `DEV_MODULES`. W Production jest `calls` (Phone calls analyser wydany 23.10.2026), więc News i Leave są tam nadal ukryte.

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
- **Dostęp:** uprawnienia `news` i `leave` w User management. Konta z uprawnieniem `intranet` dostały oba (`db/schema.sql`; w dev i na produkcji zrobione 20.10.2026).
- **Plan Hobby pozwala na 12 funkcji** (pliki w `api/` poza `_lib`); jest ich 12 (ostatnia: `api/people.ts`, Team, My profile, zdjęcia i biura). Nowe endpointy łączyć w istniejących plikach (np. decyzje urlopowe to `PATCH /api/leave`, polubienia i komentarze `POST /api/news/post`, historia konta `GET /api/admin/users?history=<id>`, Phone calls analyser `/api/admin/users?resource=calls`, Purchase Manager `/api/admin/users?resource=purchase`).

## Phone calls analyser

Admin wgrywa miesięczną fakturę T-Mobile (PDF), a centrum pokazuje, kto ile dzwonił. Zastępuje skrypty właściciela na Macu (parser PDF → SQL → Supabase).

- **Import:** przeciągnięcie jednego lub kilku PDF-ów naraz (do 24) → lista z podglądem każdej faktury (okres, numer, dopasowani pracownicy, pominięte numery, „Replaces the saved invoice”, gdy faktura już jest w bazie; duplikaty i błędy oznaczone) → **Import N invoices**. Faktury zapisują się po kolei; nieudana zostaje na liście do ponowienia. Zastąpienie faktury usuwa jej stare dane w tej samej transakcji, więc nie trzeba niczego usuwać ręcznie.
  - PDF czyta przeglądarka (`pdfjs-dist`, ładowany tylko na tej stronie) i parser `shared/tmobile.ts` (port `parse_tmobile_invoice.py`: oba układy faktur, sprzed i po zmianie z 2026). Do serwera idzie tylko JSON (do ~50 KB), PDF nie opuszcza komputera.
  - Parser zatrzymuje import, gdy brakuje numeru faktury lub okresu, gdy jakiejś linii tabel połączeń nie rozumie albo gdy zestawienie opłat i część szczegółowa wymieniają inne numery.
  - Numery dopasowuje serwer do `profiles.mobile` (ostatnie 9 cyfr, także konta dezaktywowane). **Zapisywane są tylko numery pracowników**; numer bez profilu jest pomijany, numer w dwóch profilach też (do poprawienia w profilach). Osoba jest zapisana w wierszu w chwili importu, więc późniejsza zmiana numeru w profilu nie przepisuje historii.
- **Raport:** wybór okresu, ranking z paskami **podzielony na działy** (`profiles.department`, obecny dział osoby; bez działu na końcu) (połączenia wychodzące = krajowe + wykonane w roamingu, bez „Połączenia inne” (decyzja z 23.10.2026; ich koszt zostaje), minuty, średnia długość, komórkowe/stacjonarne/międzynarodowe/roaming, SMS, koszt zmienny netto), **średnia na dzień roboczy** = połączenia / (dni robocze okresu bez weekendów i świąt − zatwierdzone dni urlopu osoby z Leave), tabela porównawcza miesięcy, eksport CSV (średniki, przecinki dziesiętne).
- **Zasady z faktury:** faktura podaje sumy miesięczne na numer, nie pojedyncze połączenia; przychodzących krajowych na niej nie ma; numer na fakturze bez wykazu połączeń = 0 połączeń; „–” = numeru nie ma na fakturze.
- **Technicznie:** strona `src/pages/calls/`, API w `api/_lib/calls.ts` wpięte w `api/admin/users.ts` (`?resource=calls`, bo limit 12 funkcji), reguły z testami w `shared/calls.ts` i `shared/tmobile.ts` (fixtury syntetyczne: `shared/tmobile.fixtures.ts`).
- **Dane:** tabele `phone_invoices`, `phone_invoice_lines` (numery pracowników na fakturze), `phone_usage` (sumy na numer i kategorię), `phone_call_records` (pusta, na przyszłe bilingi), funkcja `import_phone_invoice` (import w jednej transakcji, tylko `service_role`) i widok `v_phone_monthly_kpi` (`db/schema.sql`). RLS bez polityk: tylko serwer centrum.
- **Prywatność:** czas rozmów pracowników to dane osobowe z monitoringu pracy: dostęp tylko dla adminów, w logach i Sentry tylko kody błędów, bez numerów i danych o rozmowach. **Do repo (publicznego) nie trafiają faktury ani prawdziwe numery.** Pracownicy powinni być o tym poinformowani (regulamin, RODO).

## Purchase Manager

Ekran Purchase Managera (Michał Roman) w projekcie Apex 2.0. Dane są w **centralnej bazie** (Supabase `nutri-central-db`, `blbcudymvackpudywdyy`), nie w bazie użytkowników centrum. Na razie tylko w dev (`purchase` w `DEV_MODULES`).

- **Products to review:** otwarte pozycje `core.review_queue` (nowe produkty AI i niepewne dopasowania nazw), najpierw te z największą liczbą ofert. Przy każdej: nazwa z oferty, propozycja AI, pewność, uzasadnienie, liczba ofert i do 5 podobnych produktów z katalogu.
  - Akcje: **Approve**, **Edit and approve** (nazwa, kategoria), **Merge into this** / **Merge with…** (duplikat), **Match to this** / **Other product…** (złe dopasowanie), **Not a product**.
  - **Approve selected:** masowe zatwierdzenie pozycji, których AI jest pewne w co najmniej 90% (inne serwer pomija).
  - Filtry: typ, kategoria, pewność poniżej 90% / 80%, tylko z ofertami, wyszukiwanie po nazwie.
  - **Undo** (pasek na dole ekranu): cofa ostatnią własną decyzję, kolejne kliknięcia cofają wcześniejsze. Każda decyzja zapisuje przed wykonaniem migawkę zmienianych wierszy (`core.review_undo_log`, `db/central/purchase_undo.sql`), a cofnięcie ją przywraca (produkty, aliasy, oferty, zapytania, propozycje bid sell, kolejka nazw). Decyzji sprzed uruchomienia tego pliku nie da się cofnąć.
- **Bid sell proposals:** BID BUY z Apex Bid z najtańszymi świeżymi ofertami dostawców na ten sam produkt. Purchase Manager wybiera ofertę i zatwierdza propozycję albo ją odrzuca (z powodem); decyzję można cofnąć. **Tylko ceny zakupu:** sugerowana cena sprzedaży, marża i transport są poza zakresem (decyzja z 28.10.2026), więc ekran ich nie pokazuje.
- Każda decyzja zapisuje e-mail osoby, która ją podjęła (`decided_by`, `reviewed_by`). Logika decyzji jest w bazie (funkcje `core.review_*` z `central-db/product_review.sql` projektu Apex 2.0).
- **Technicznie:** ekrany `src/pages/purchase/`, API `api/_lib/purchase.ts` wpięte w `api/admin/users.ts` (`?resource=purchase`, limit 12 funkcji; dostęp: `requireApp(…, 'purchase')`, nie tylko admini), typy i walidacja z testami w `shared/purchaseApi.ts`.
- **Połączenie z bazą:** serwer woła tylko funkcje schematu `purchase_api` (`db/central/purchase_api.sql`, SECURITY DEFINER, wykonuje je tylko `service_role`) kluczem secret centralnej bazy. Zmienne (Production i Preview, ta sama baza): `CENTRAL_DB_URL` = `https://blbcudymvackpudywdyy.supabase.co`, `CENTRAL_DB_SECRET_KEY` = klucz secret `nutri-central-db`.
- **Uruchomienie:** (1) `db/central/purchase_api.sql`, potem `db/central/purchase_undo.sql` w SQL Editorze `nutri-central-db`; (2) Project Settings → Data API → Exposed schemas: dopisać `purchase_api`; (3) zmienne wyżej w Vercelu; (4) `purchase` w `VITE_HUB_MODULES` (Preview); (5) uprawnienie Purchase Manager w User management. Nowe konta nie dostają go domyślnie (`DEFAULT_APPS`).

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

## Monitorowanie i błędy

- **Sentry** zbiera błędy wszystkich czterech aplikacji (przeglądarka i serwer) w jednym projekcie. Tagi: `app` (`hub`, `neutralizer`, `owner-lookup`, `signatures`), `side` (`browser`, `server`), `where` (miejsce w kodzie), środowisko (`production`, `preview`). Przy nowym rodzaju błędu Sentry wysyła e-mail.
  - Zmienne: `SENTRY_DSN` (serwer) i `VITE_SENTRY_DSN` (przeglądarka), ta sama wartość, w Production i Preview. Bez nich nic nie jest wysyłane.
  - Serwer: `api/_lib/monitoring.ts` (`logError` zamiast `console.error`; `handle` zgłasza nieoczekiwane błędy i odpowiedzi 5xx). Przeglądarka: `src/lib/monitoring.ts`.
  - Do Sentry nie trafiają ciasteczka, nagłówki, treść żądań ani fragment adresu (`#sso=…`, linki z e-maili). Osobę opisuje id konta i e-mail.
- **`GET /api/health`** sprawdza, czy serwer centrum łączy się z Supabase (Auth i baza) swoim kluczem i czy jest klucz Resend. Odpowiada 200 albo 503 z listą `checks` (bez szczegółów). Monitor (UptimeRobot) wywołuje go co 5 minut i wysyła alert, gdy odpowiedź nie jest 200.
  - Test Sentry poza produkcją: `/api/health?test=sentry` wysyła błąd testowy.

## Praca lokalna

```bash
npm install
cp .env.example .env.local   # uzupełnij klucz anon
npm run dev
npm test && npm run lint && npm run build
```
