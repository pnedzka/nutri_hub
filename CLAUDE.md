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
| Commission calculator (kalkulator prowizji ICT i BDM, UI po polsku; logowanie przez `/sso`, liczby podaje jego `api/standards` po sprawdzeniu uprawnienia `commission`) | https://commissionanalyzer.vercel.app | – (podglądy gałęzi PR, z hubem dev i `nutri-dev`) | `commission_analyzer` (`prj_jwteEKdTPcLBTOeRV3xU54rZoxvi`) | `pnedzka/commission_analyzer` |
| Intranet (stary, osobna baza kont; docelowo zastąpi go samo centrum, zob. „Moduły centrum”) | https://intranet.nutripartners.co | – | poza Vercelem | – |

`nutri-partners` to prywatne konto Vercel właściciela (plan Hobby), nie zespół. Projekt `nutri-partners1/nutripartners` to duplikat na innym koncie Vercel, poza naszym dostępem; buduje się z `pnedzka/nutripartners`, ale niczego nie blokuje.

## Ustalenia

- **Strona główna = dashboard z widgetami, aplikacje w menu bocznym** (decyzja z 23.11.2026, README „Dashboard”): widgety Contracts i Sales leaderboard z kontraktów intranetu (`dashboard_api` w `nutri-central-db`), Latest news, Calendar (24.11.2026: święta i nieobecności z Leave dla osób z `leave`; wydarzenia wspólnego kalendarza Google tylko dla adminów, Board i Administration, bo są tam prywatne wpisy). Widoczność: `canSeeWidget` w `shared/dashboard.ts` (rola + `profiles.department`): Contracts = admini, Board, Administration; leaderboard jak w starym intranecie. Wygląd zawsze w stylu centrum, nie starego intranetu (prośba właściciela). Konkursy sprzedażowe: `/contests` (admini), tabela `public.contests` (migracja `hub_contests`: dev i produkcja 23.11.2026), punkty w `shared/contest.ts` (S i P, EUR, względem lidera). Plan dalszych widgetów: Claude Doc „Plan: dashboard z widgetami w centrum aplikacji”.
- Kafelki są w `src/apps.ts` (`audience: 'app' | 'everyone' | 'admin'`, `newTab` tylko dla starego intranetu; `everyone` to Team). Nowa aplikacja to jeden wpis; moduł centrum ma `url` ze ścieżką (`/news`, `/leave`).
- **Zarządzanie kontami jest tylko w centrum** (`/users`, decyzja z 17.10.2026): zakładanie, zaproszenia, reset haseł, role, imiona i **uprawnienia do aplikacji**. Neutralizator już tego nie ma.
- Uprawnienia: `profiles.apps text[]` (`shared/access.ts`: `neutralizer`, `signatures`, `owner-lookup`, `commission`, `news`, `leave`, `leave-admin`, `purchase`, `contracts`, `contracts-admin`, `contracts-sign`, `contracts-for-others`, `complaints`, `complaints-admin`, `intranet`, `create-users`). Admin ma wszystko. `create-users` (Create user accounts, od 29.10.2026) to uprawnienie, nie aplikacja: pozwala zapraszać nowe osoby (tylko rola user, tylko własne aplikacje zapraszającego, tylko zaproszenie e-mailem; `newAccountProblem`); poza `DEFAULT_APPS`, `/api/sso` go nie obsługuje. Każda aplikacja sprawdza dostęp sama (News i Leave: `requireApp` w `api/_lib/auth.ts`); Intranet to tylko widoczność kafelka starego intranetu. Konta sprzed zmiany dostały wszystkie aplikacje, domyślna wartość kolumny to `'{}'`.
- **Profile (od 21.10.2026, decyzja właściciela: wszystkie propozycje):** kolumny `profiles` `job_title`, `department`, `phone`, `mobile`, `linkedin_url`, `office_id` (tabela `offices`: miasto + adres po angielsku do stopek, prowadzą admini), `avatar_path` (bucket `intranet`, `avatars/<id>/…jpg`, linki podpisane na dobę), `deactivated_at`; historia zmian w `profile_events`. Schemat w `db/schema.sql` tego repo; zastosowany na `nutri-dev` i na produkcji (21.10.2026, migracje `hub_profiles_offices` i `hub_profiles_columns`). Biura na start: Rzeszów (Lwowska 114/2) i Lublin (Lubelskich Olimpijczyków 1/8), bez kodów pocztowych.
- **Profile na produkcji od 21.10.2026** (PR #30, wydanie #31; stopki: PR #33, wydanie #34).
  - E-mail firmowy = adres logowania (bez osobnego pola). Pracownik sam zmienia swoje dane w **My profile** (`/profile`, także imię); adres logowania, rolę i aplikacje zmienia tylko admin (User management → Edit, `/users/<id>`).
  - **Team** (`/team`) widzi każdy zalogowany. Zakładka **Org chart** (24.11.2026, prośba właściciela): drzewko z `profiles.manager_id` (`managerId` w `TeamMember`), `shared/orgChart.ts`, README „Team”. API: `api/people.ts` (12. funkcja, limit planu wyczerpany), reguły i walidacja w `shared/profile.ts`, zapis w `api/_lib/profiles.ts` (`saveProfile`, `logProfileEvent`).
  - **Dezaktywacja** zamiast usuwania (osoba odchodzi): ban w Supabase Auth + `deactivated_at`; `requireUser` odrzuca takie konto (403), `appPeople` je pomija, reset hasła go nie wysyła. Inne aplikacje odcina ban (sesja wygasa w ciągu godziny).
  - RLS: `offices` czyta każdy zalogowany (generator stopek), `profile_events` tylko serwer; własny wiersz `profiles` czyta właściciel (stopki wypełniają się z niego).
- **Phone calls analyser** (`/calls`, kafelek `calls` w Administration, tylko admin; **na produkcji od 23.10.2026**: PR #35, wydanie #36, włączony przez `VITE_HUB_MODULES=calls` w Production): import faktur T-Mobile (PDF) i raport połączeń pracowników. Zastępuje skrypty właściciela z `~/Claude/telecom-kpi/` (projekt Supabase `nutri-telecom-kpi` do usunięcia po imporcie trzech faktur na produkcji).
  - PDF czyta przeglądarka (`pdfjs-dist`, `src/pages/calls/pdf.ts`) i `shared/tmobile.ts` (port `parse_tmobile_invoice.py`; wynik dla 3 prawdziwych faktur zgodny co do wiersza); serwer dostaje JSON. API: `api/_lib/calls.ts` przez `api/admin/users.ts?resource=calls` (limit funkcji).
  - Numery łączy z `profiles.mobile` (ostatnie 9 cyfr); zapisuje tylko numery pracowników, osobę w wierszu w chwili importu. Średnia na dzień roboczy odejmuje zatwierdzone urlopy (`leave_requests`). Ranking, porównanie miesięcy i CSV są podzielone na działy (`profiles.department` w chwili raportu, `byDepartment` w `shared/calls.ts`).
  - Połączenia = krajowe wychodzące + wykonane w roamingu, **bez „Połączenia inne”** (decyzja z 23.10.2026, `NOT_COUNTED` w `shared/calls.ts` i widok; ich koszt się liczy). Dlatego wyniki mogą być niższe niż w starym `report.html`.
  - Tabele `phone_*`, funkcja `import_phone_invoice`, widok `v_phone_monthly_kpi` (`db/schema.sql`); zastosowane na `nutri-dev` (22–23.10.2026) i na produkcji (23.10.2026), migracje `hub_phone_calls`, `hub_phone_calls_import` (dev też `hub_phone_calls_view_without_other`; na produkcji widok od razu w tej wersji).
  - Repo jest publiczne: **żadnych faktur, prawdziwych numerów ani danych o rozmowach** w kodzie, testach i Sentry (fixtury są syntetyczne, logi tylko z kodem błędu).
- **Purchase Manager** (`/purchase`, uprawnienie `purchase`, w dev od 28.10.2026, **na produkcji od 29.10.2026**, poza `DEV_MODULES`): interfejs Purchase Managera (Michał Roman, m.roman@nutripartners.co) projektu Apex 2.0: przegląd produktów AI i propozycji bid sell. Dane w osobnej bazie `nutri-central-db` (`blbcudymvackpudywdyy`, schematy `raw`/`core`); serwer woła tylko funkcje `purchase_api` (`db/central/purchase_api.sql`, kopia w plikach projektu Apex 2.0: `central-db/purchase_api.sql`) zmiennymi `CENTRAL_DB_URL` + `CENTRAL_DB_SECRET_KEY`. DDL tej bazy uruchamia właściciel w SQL Editorze; schemat `purchase_api` musi być w Data API → Exposed schemas.
  - Zasady właściciela: przegląd i scalanie produktów robi wyłącznie Purchase Manager w interfejsie (Claude nie zatwierdza produktów). Ceny sprzedaży, marże i transport są poza zakresem: ekran pokazuje tylko ceny zakupu.
  - `purchase` nie jest zaznaczane nowym kontom (`DEFAULT_APPS` w `shared/access.ts`).
- **Generator kontraktów** (`/contracts`, uprawnienia `contracts`, `contracts-admin`, `contracts-sign`, `contracts-for-others` (tworzy kontrakty za handlowców bez prawa akceptacji, Klaudia Adamek, 25.11.2026, `db/central/contracts_for_others.sql`); w `DEV_MODULES`, **na produkcji od 24.11.2026** przez `VITE_HUB_MODULES`; decyzje właściciela z 23.11.2026): zastępuje generator ze starego intranetu (kod intranetu: prywatne repo `pnedzka/nutri-partnersapp`, `src/components/contract/`; tylko jako wzór, bez przenoszenia śmieci). Obieg: handlowiec → akceptacja Jadwigi po wpisaniu zamówienia w enova → podpis Marcina Niećko do 100 000 EUR netto, powyżej zatwierdza Marcin i podpisuje zarząd (admini z działu `Board`, czyli Paweł i Kacper; Marcin też ma dział Board, ale nie jest adminem, decyzja z 24.11.2026) → handlowiec pobiera kontrakt + OWS/OWZ (2 PDF-y) i wgrywa skan od klienta. Dane w `nutri-central-db` (schematy `contracts`, `contracts_api`, bucket `contracts`; `db/central/contracts_api.sql` `db/central/contracts_cn_drafts.sql` (kody CN, szkice) i `db/central/contracts_enova_order.sql` (obowiązkowy Internal order number z enova, edycja po akceptacji) uruchamia właściciel). Zakładka **Archive (intranet)**: stare kontrakty tylko do odczytu z `raw.intranet_records` (`db/central/contracts_archive.sql`, 24.11.2026). Kody CN opcjonalne, słownik `core.cn_codes` (HS 2022 na start), kod zapamiętywany przy produkcie. PDF w przeglądarce (`pdfmake`, lazy). Opis w README, „Generator kontraktów”.
- **Reklamacje** (`/complaints`, uprawnienia `complaints` i `complaints-admin`; etap 1 w dev od 25.11.2026, w `DEV_MODULES`; decyzje właściciela z 25.11.2026: handlowcy zgłaszają sami, `complaints-admin` tylko Jadwiga Woźny, kwoty opcjonalne, import 7 starych reklamacji z intranetu, najpierw etap 1): zgłoszenie z numeru kontraktu sprzedaży (i opcjonalnie zakupu), dane z generatora kontraktów albo z `contracts_api.archive_rows()` (nie z `core.deals`: błędne przypisania firm), statusy Open → Investigating → With supplier → Resolved → Closed, pliki w buckecie `complaints`, powiadomienia R1–R4 (`api/_lib/complaintNotices.ts`). Dane w `nutri-central-db` (schematy `complaints`, `complaints_api`; `db/central/complaints_api.sql` uruchamia właściciel). Stary moduł: `nutri-partnersapp`, `src/components/complaints/`. Repo publiczne: żadnych prawdziwych reklamacji w kodzie i testach; import starych tylko przez MCP. Opis w README, „Reklamacje”.
- **Skrzynka w bazie wiedzy** (My profile; kod na produkcji od 11.11.2026: PR #66, wydanie #67; karta działa tam dopiero po dodaniu trzech zmiennych niżej w Production; decyzja właściciela: handlowiec podłącza skrzynkę sam, hasłem w centrum): serwer sprawdza hasło przez IMAP, zapisuje je **tylko w n8n** (credential) i zakłada workflow „Central DB - Mail ingest - <adres>”; w `nutri-central-db` tylko stan (`mailbox_api`, `db/central/mailbox_api.sql`, `core.mailbox_connections`). Kod: `api/_lib/mailbox.ts` przez `api/people.ts?resource=mailbox`, `shared/mailboxApi.ts`, `src/components/MailboxCard.tsx`. Zmienne: `MAIL_IMAP_HOST`, `N8N_API_URL`, `N8N_API_KEY` (opis w README, „Skrzynka w bazie wiedzy”). Hasła nigdy w logach, Sentry ani bazie. Admin może podłączyć skrzynkę innej osoby w User management → Edit (ta sama karta, `&user=<id>`, `connected_by` = admin; decyzja z 23.11.2026).
- **Powiadomienia** (od 23.11.2026, na produkcji z wydaniem News i Leave; migracja `hub_notifications`: dev i produkcja 23.11.2026; plan zaakceptowany przez właściciela: Claude Doc https://claude.ai/artifact/GbEC7mTYiSS27ziV1zKahD, README „Powiadomienia”): dzwonek w belce + `/notifications`, tabela `public.notifications` w bazie centrum (nie w `nutri-central-db`: wspólna dla dev i prod), `notify()` w `api/_lib/notifications.ts` = dzwonek + e-mail. E-maile zawsze po polsku w wyglądzie Nutri APEX (`api/_lib/apexMail.ts`, jak e-maile n8n i kontraktów), dzwonek po angielsku. Nowe zdarzenie w module = wywołanie `notify()`, nie własny e-mail. Codzienne przypomnienia: Vercel Cron `/api/daily` (`CRON_SECRET`).
- Serwer centrum (`api/`) używa `SUPABASE_SECRET_KEY` i `RESEND_API_KEY`. Linki z e-maili prowadzą do centrum.
- Nasze aplikacje otwierają się w tej samej karcie. W ich nagłówkach logo i „All apps” prowadzą z powrotem (`HUB_URL` / `VITE_HUB_URL`). Stary intranet otwiera się w nowej karcie.
- `/?q=…` przekierowuje na whoisowner (`src/lib/legacy.ts`), bo dawniej ta domena należała do owner lookup.
- Logowanie: wspólna baza Supabase neutralizatora (`https://edzjkumjutffodfpasmf.supabase.co`; w dev `nutri-dev`, zob. „Środowiska”), hasło (`signInWithPassword`) tylko w centrum; aplikacje dostają sesję z centrum (niżej).
  - Rola i aplikacje: `profiles.role`, `profiles.apps`, czytane w przeglądarce (RLS: własny wiersz). Zmienia je tylko serwer centrum.
- **Jedno logowanie przez centrum, na `*.vercel.app`** (decyzja z 18.10.2026; subdomeny `nutripartners.co` odrzucone). Kafelek i aplikacja bez sesji prowadzą do `/sso`; centrum daje aplikacji jednorazowy token Supabase (`magiclink`) w `#sso=…`, a aplikacja zakłada z niego **własną** sesję. Szczegóły w README („Logowanie”).
  - Nie przekazywać samej sesji (access/refresh token) w linku: rotacja refresh tokenów wylogowałaby obie aplikacje.
  - Wylogowanie w aplikacji prowadzi do `/logout` centrum. Preview: `VITE_SSO_PREVIEW_ORIGINS` pozwala wracać na podglądy PR-ów.
- Design: Vite + React 19 + Tailwind v4 + TypeScript, `lucide-react`, `zustand`. Inter, tło `#F5F5F5`, tekst `#1A1A1A`, marka `#CC1F1F`, białe karty `border-gray-100`. Na telefonach pola dotykowe ≥ 44 px, `.safe-x`, `.safe-bottom`, pola 16 px. **Górna belka i stopka są wspólne dla wszystkich aplikacji** (od 12.11.2026): `src/components/AppHeader.tsx` (logo do centrum, nazwa aplikacji, osoba: zdjęcie lub inicjały, imię i plakietka Admin/User do „My profile”, „Sign out”; własne zakładki aplikacji jako `nav`, drugi wiersz) i `src/components/Footer.tsx` („© rok Nutri Partners · nazwa”, „All apps”, „My profile”, wersja ze skrótu commita `VITE_VERCEL_GIT_COMMIT_SHA`, poza produkcją znaczek „Dev”; na ekranach logowania bez linków). Oryginał jest w tym repo; w neutralizatorze, stopkach i whoisowner są identyczne kopie (różnice tylko w propsach: `appName`, `hubUrl`, `lang: 'pl'` w stopkach, `logoSrc`). Zmieniać tutaj i kopiować bez zmian do pozostałych repo (także `commission_analyzer`, jeszcze bez nich). Zdjęcie w belce poza centrum: `src/lib/headerPhoto.ts` (identyczny w neutralizatorze, stopkach i whoisowner) czyta `profiles.avatar_path` i podpisuje link sesją użytkownika; pozwala na to polityka `intranet_avatars_read` (odczyt `avatars/%` w buckecie `intranet` dla zalogowanych, `db/schema.sql`; dev i produkcja 12.11.2026).

## Stan (20.10.2026)

Na produkcji i działa (właściciel potwierdził): centrum z User management i uprawnieniami, środowiska dev i produkcja, jedno logowanie we wszystkich trzech aplikacjach. Pracownicy dostali wiadomość o centrum i o HubSpot owner lookup.

**News i Leave na produkcji:** wycofane 20.10.2026, wydane ponownie: News 23.11.2026, Leave 24.11.2026 (Production `VITE_HUB_MODULES` = `calls,news,contracts,leave`, zob. „Moduły centrum”). Konta z `intranet` (13) mają `news` i `leave` (PR #17). Automatyczne code review działa we wszystkich czterech repo.

**Monitoring wydany na produkcję 20.10.2026** (PR #24 centrum i wydania 3 aplikacji): Sentry we wszystkich 4 aplikacjach, `/api/health` + UptimeRobot, czytelne błędy klucza serwera w centrum (zob. „Monitorowanie”).

## Nowa aplikacja: checklista

Funkcja dla pracowników może też być **modułem centrum**, jak News i Leave (zob. „Moduły centrum”): ścieżka w `src/App.tsx`, kafelek z `url` ze ścieżką, API w `api/` (limit funkcji!), identyfikator w `shared/access.ts`. Wtedy punkty 1–4 i 8 odpadają. Poniżej osobna aplikacja.

Szablonem jest whoisowner (`pnedzka/nutripartners`): Vite na froncie, funkcje Vercela w `api/`, logowanie przez centrum.

1. **Repo** `pnedzka/<nazwa>` zakłada właściciel na GitHubie i dodaje do sesji Claude Code. Gałęzie: `main` (produkcja) i `develop` (dev).
2. **Kod z whoisowner:**
   - logowanie: `src/lib/supabase.ts`, `src/lib/auth.ts`, `src/lib/sso.ts`, `src/lib/api.ts`, `api/_lib/auth.ts`, `api/_lib/supabase.ts`, `api/_lib/http.ts`;
   - wygląd: `src/components/` (`Layout`, `Card`, `Button`, `Input`, `Toasts`), `src/lib/toast.ts`, `src/index.css`, `public/logo.png`;
   - górna belka i stopka: `src/components/AppHeader.tsx` i `src/components/Footer.tsx` **z tego repo, bez zmian** (w `Layout` z propsami `appName`, `hubUrl={HUB_URL}`, `user`, `onSignOut`), a zdjęcie osoby do belki z `src/lib/headerPhoto.ts` z whoisowner (`useHeaderPhoto(supabase, zalogowany)` → `avatarUrl`);
   - konfiguracja: `vercel.json` (`framework: vite`, region `fra1`, rewrite SPA), `eslint.config.js`, `tsconfig*.json`, `vite.config.ts`.
   - Zmienić `APP_ID` w `src/lib/sso.ts` i `api/_lib/auth.ts` na identyfikator nowej aplikacji.
3. **Projekt Vercel** zakłada właściciel w panelu, bo MCP nie może (403). Ustawienia:
   - import repo, Production Branch `main`;
   - Deployment Protection: Vercel Authentication, „Only Preview Deployments”.
4. **Zmienne środowiskowe:**
   - Production: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (baza produkcyjna).
   - Preview: te same zmienne z wartościami `nutri-dev`, plus `VITE_HUB_URL` → centrum dev.
   - Klucz tajny Supabase dodawać tylko wtedy, gdy serwer aplikacji naprawdę go potrzebuje.
5. **Centrum (to repo):**
   - identyfikator w `shared/access.ts` (`APP_IDS`, `APP_NAMES`);
   - kafelek w `src/apps.ts`, adres z `VITE_<APP>_URL` z domyślnym adresem produkcyjnym;
   - adres w `APP_URLS` (`src/lib/sso.ts`), żeby kafelek przechodził przez jedno logowanie;
   - w Preview centrum: `VITE_<APP>_URL` → adres dev aplikacji, a nazwę projektu dopisać do `VITE_SSO_PREVIEW_ORIGINS`.
6. **Dostęp:** w User management (dev i produkcja) zaznaczyć nową aplikację wybranym osobom. Admin ma dostęp automatycznie.
7. **Dokumentacja:**
   - wiersz w tabeli „Aplikacje” wyżej i w README centrum;
   - `CLAUDE.md` i `README.md` w nowym repo (wzór: `nutri_signatures/CLAUDE.md`);
   - w nagłówku aplikacji logo i „All apps” prowadzą do `HUB_URL`.
8. **Pierwsze wdrożenie `develop`:** jeśli `develop` jest na tym samym commicie co `main`, Vercel go nie wdroży. Wtedy użyć `create_deployment` (zob. „Pułapki”).

## Moduły centrum: News i Leave (od 20.10.2026, na produkcji od 23–24.11.2026)

**Włączanie modułów:** moduły z listy `DEV_MODULES` (`shared/access.ts`: `news`, `leave`, `calls`, `contracts`, `complaints`) działają tylko tam, gdzie `VITE_HUB_MODULES` je wymienia (`news,leave,calls,purchase,contracts` w Preview i Development centrum). **Na produkcji zmienna ma `calls,news,contracts,leave`**: Phone calls analyser od 23.10.2026, News od 23.11.2026, Contracts i Leave od 24.11.2026 (stan sprawdzony w Vercelu 25.11.2026). Moduł spoza zmiennej: kafelek, trasy i wybór w User management są ukryte (`available()` w `src/apps.ts`), `requireApp` odpowiada 404, a e-maile z zaproszeniem go nie wymieniają. **Wydanie:** na polecenie właściciela dodać moduł do `VITE_HUB_MODULES` w Production i wdrożyć ponownie (albo usunąć go z `DEV_MODULES`).

**Decyzja właściciela (20.10.2026):** zamiast osobnej aplikacji intranetu (`pnedzka/nutri_intranet`, projekt Vercel `nutri-intranet`) kolejne funkcje są **modułami samego centrum**: kafelki News i Leave, działające jak pozostałe, z osobnymi uprawnieniami. Centrum docelowo staje się intranetem. Kod przeniesiono z `nutri_intranet` (PR-y #3 i #4 tamtego repo); tamto repo i projekt Vercel są do archiwizacji.

- **Układ:** ekrany `src/pages/news/`, `src/pages/leave/` (trasy `/news/*`, `/leave/*` w `src/App.tsx`, `AppOnly`), API `api/news/`, `api/leave/`, reguły z testami `shared/leave.ts`, `shared/news.ts`, typy `shared/leaveApi.ts`, `shared/newsApi.ts`.
  - Serwer: `requireApp(request, 'news' | 'leave')` (`api/_lib/auth.ts`), ludzie modułu `appPeople()` (`api/_lib/people.ts`), uprawnienia w `api/_lib/leave.ts` (`canDecide`, `seesType`) i `api/_lib/news.ts` (`isEditor`, `canEditPost`, `canEditComment`, `canDeleteComment`), e-maile `api/_lib/notify.ts` (`sendMail`, `sendToEach`: Resend batch, osobna wiadomość dla każdego).
  - **Plan Hobby: 12 funkcji**, jest 12 (`api/admin/users` (też historia konta i Phone calls analyser, `?resource=calls`), `auth/accept`, `auth/recover`, `sso`, `people` (Team, My profile, zdjęcia, biura), `leave/index` (GET, POST, PATCH = decyzje), `leave/calendar`, `leave/employees`, `news/index`, `news/post` (GET, PUT, DELETE, POST = polubienia i komentarze), `news/upload`, `news/editors`). Nowe endpointy łączyć w istniejących plikach.
- **Dane:** `db/schema.sql` tego repo: `leave_settings`, `leave_allowances`, `leave_requests`, `news_editors`, `news_posts`, `news_comments`, `news_likes`, prywatny bucket Storage `intranet` (nazwa zostaje). RLS bez polityk: czyta i zapisuje tylko serwer centrum (`db()`, klucz secret). Zastosowane na `nutri-dev` i na produkcji (20.10.2026, migracja `hub_news_leave_modules`).
- **Dostęp:** uprawnienia `news` i `leave` w User management. Konta z `intranet` dostają oba (`update` na początku `db/schema.sql`; dev i produkcja: zrobione 20.10.2026). `/api/sso` nie wydaje tokenów dla `news`, `leave` ani `intranet`.
- **Urlopy:**
  - **Leave administration** (`leave-admin`, 25.11.2026, prośba właściciela: Klaudia Adamek z administracji): wpis urlopu za kogoś i L4, rodzaje nieobecności, Employees, bez roli Admin; **wniosków nie zatwierdza** (zatwierdzają tylko przełożeni i admini, decyzja z 25.11.2026); `managesLeave` w `api/_lib/leave.ts`. Wzór na kolejne moduły: `<moduł>-admin` jako podpozycja modułu w `AppPicker` (`SUB`), mapowana na moduł w `isAvailable`, dopisana do `HUB_OWN` w `api/sso.ts`.
  - pracownik składa wniosek; akceptuje albo odrzuca **jego przełożony lub dowolny admin**, a admin może też wpisać urlop za pracownika; **delegacje** zatwierdzają też osoby z „Approves business trips” (Leave → Employees, tabela `leave_trip_approvers`, migracja `hub_leave_trip_approvers`: dev i produkcja 24.11.2026; prośba właściciela, np. Marcin Niećko);
  - **przełożonego ustawia admin w User management** (przy zakładaniu konta i w Edit, `profiles.manager_id`; decyzja właściciela z 24.11.2026, zmienia tę z 19.10; migracja `hub_profiles_manager`: dev i produkcja 24.11.2026; `leave_settings.manager_id` nie jest już czytane); roczny wymiar i saldo startowe ustawiają admini w module (Leave → Employees, tabela `leave_settings`);
  - saldo w **dniach, z połówkami**; weekendy i święta ustawowe się nie liczą; niewykorzystane dni przechodzą na następny rok; liczbę dni ustawia admin osobno dla każdego pracownika;
  - rodzaje: wypoczynkowy, na żądanie (4 dni w roku, wliczane do wypoczynkowego), okolicznościowy, opieka nad dzieckiem (2 dni), bezpłatny, L4 (wpisuje tylko admin, nie zmniejsza salda);
  - kalendarz nieobecności widzą wszyscy z dostępem do Leave, ale tylko jako „nieobecny”; rodzaj urlopu widzi pracownik, jego przełożony i admini;
  - e-maile: o nowym wniosku do przełożonego i adminów, o decyzji do pracownika.
  - **Kalendarz Google (24.11.2026, prośba właściciela):** zatwierdzone urlopy i delegacje (nowy rodzaj `business_trip`, nie zmniejsza salda; migracja `hub_leave_business_trip`: dev i produkcja 24.11.2026) są kopiowane do wspólnego kalendarza Google firmy (`api/_lib/googleCalendar.ts`, konto usługi Google, zmienne `GOOGLE_CALENDAR_ID` + `GOOGLE_SERVICE_ACCOUNT` w Production i Preview; zapisuje tylko produkcja, `VERCEL_ENV`, dev tylko czyta do widgetu Calendar). Tytuł bez rodzaju poza urlop/delegacja/nieobecność. Stary intranet: bez synchronizacji (decyzja właściciela, interesuje go tylko centrum). Opis w README, „Leave”.
- **Newsy:** blog o wydarzeniach w firmie i powitaniach nowych osób; wpis z galerią zdjęć (do 30, zmniejszane w przeglądarce do 2000 px), komentarzami i polubieniami.
  - **News Manager (23.11.2026, decyzja właściciela: pełny zakres jak w starym intranecie + migracja):** `/news/manage` (szkice, wyszukiwarka, Publish / Move to drafts), w edytorze autor, opis, osobna okładka, formatowanie (`blocks` w `shared/news.ts`, nigdy HTML), wyszukiwarka w liście, „Latest news” na stronie głównej. E-mail tylko przy pierwszej publikacji (`published_at`). Import starych wpisów (18 z Firestore `newsArticles`) przez News → Manager z pliku z workflow n8n `NetTcDqeF6a3cY5G`; kolumny `status`, `published_at`, `summary`, `cover`, `created_by`, `legacy_id`, `legacy_author` (migracja `hub_news_manager`: dev i produkcja 23.11.2026). Zasada Pawła: ze starego kodu intranetu brać funkcje, nie rozwiązania (stary kod jest chaotyczny).
  - Publikują admini i **wybrani redaktorzy**; redaktorów wybierają admini w module (News → Editors, tabela `news_editors`), nie w User management (decyzja z 19.10.2026).
  - Komentują i lajkują wszyscy z dostępem do News. Autor edytuje i usuwa swój komentarz, admin usuwa każdy.
  - Nowy news: e-mail do wszystkich z dostępem do News (bez autora), z linkiem do wpisu.
- **Do ustalenia:** kiedy wyłączyć stary intranet (kafelek `intranet`) i czy przepiąć adres `intranet.nutripartners.co` na centrum.

## Monitorowanie (od 20.10.2026, na produkcji we wszystkich 4 aplikacjach)

Po awarii z 20.10.2026 (w Production centrum był klucz `nutri-dev`, pracownicy widzieli „Your session has expired”, zgłosili to po ok. 2,5 h):
- **Sentry:** organizacja `nutri-partners`, projekt `nutri-apps`, region EU (`https://de.sentry.io`), plan Developer (5000 błędów/mies.), tylko Error monitoring (bez replay i tracingu). Jeden projekt dla 4 aplikacji, tag `app` (`hub`, `neutralizer`, `owner-lookup`, `signatures`), `side` (`browser`, `server`), `where`, środowisko `production`/`preview`. E-mail do właściciela przy każdym nowym błędzie. Repozytoria nie są podpięte do Sentry (decyzja właściciela).
  - Zmienne `SENTRY_DSN` + `VITE_SENTRY_DSN` (ten sam DSN, nie jest sekretem) są w Production i Preview wszystkich 4 projektów Vercel.
  - Kod: na serwerze zamiast `console.error` używać `logError(where, error, details?)` z `api/_lib/monitoring.ts`; `handle()` zgłasza resztę i czeka na wysłanie (`flushErrors`); w stopkach handlery opakowuje `monitored()`. SDK `@sentry/node` bez domyślnych integracji (krótki cold start).
  - Prywatność: bez ciasteczek, nagłówków, treści żądań, query i fragmentu adresu (`#sso=…`); w neutralizatorze bez treści dokumentów, w whoisowner bez treści wyszukiwań. Nowe zgłoszenia pisać tak samo.
  - **Claude ma konektor Sentry (MCP)**: `search_issues` / `search_errors` z `organizationSlug: nutri-partners`, `regionUrl: https://de.sentry.io`. Przy zgłoszeniu problemu zacząć od nierozwiązanych błędów w Sentry.
  - Test: `GET /api/health?test=sentry` na centrum dev (poza produkcją) wysyła błąd testowy; potem oznaczyć go w Sentry jako rozwiązany.
- **`/api/health`** centrum (funkcja `api/sso.ts`, GET, rewrite w `vercel.json`, bo limit 12 funkcji): Supabase Auth i baza kluczem serwera, klucz Resend. 200 albo 503 z `checks`. Opis w README („Monitorowanie i błędy”).
- **UptimeRobot** (konto właściciela, plan darmowy): monitor HTTP `https://nutripartners.vercel.app/api/health` co 5 min, alert e-mail. Inne aplikacje nie mają monitorów (opcjonalnie: ich strony główne).
- Diagnoza bez Sentry: logi Supabase (`edge_logs`: `request.sb.apikey.apikey.prefix` i `.error` pokazują, jakim kluczem łączy się serwer; `bad_checksum`/`invalid` = zły klucz). Logi runtime Vercela dla centrum są dla MCP niedostępne (403), tak jak `web_fetch_vercel_url`, więc `/api/health` sprawdza właściciel w przeglądarce.

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
  - linki między aplikacjami: `VITE_HUB_URL` (neutralizator, whoisowner, stopki) → centrum dev; w centrum `VITE_NEUTRALIZER_URL`, `VITE_SIGNATURES_URL`, `VITE_OWNER_LOOKUP_URL` → aplikacje dev (`VITE_INTRANET_URL` z czasów `nutri_intranet` nie jest już czytana; do usunięcia);
  - centrum: `VITE_SSO_PREVIEW_ORIGINS` = `https://(nutridocumentation-nxdi|whoisowner|nutri-signatures|nutri-intranet|commissionanalyzer|commission-analyzer)-[a-z0-9-]+-nutri-partners\.vercel\.app` (wpis `nutri-intranet` jest zbędny) (jedno logowanie wraca też na podglądy PR-ów aplikacji);
  - neutralizator: `ANTHROPIC_API_KEY` także w Preview; whoisowner: HubSpot i Claude mają te same klucze w obu środowiskach (HubSpot tylko do odczytu);
  - stopki: `BLOB_READ_WRITE_TOKEN` tylko w Production i Development, więc w dev zapisane stopki zostają w przeglądarce i nie zmieniają wspólnej listy zespołu.
  - wszystkie 4 projekty: `SENTRY_DSN`, `VITE_SENTRY_DSN` (ten sam DSN w Production i Preview);
  - centrum: `CENTRAL_DB_URL`, `CENTRAL_DB_SECRET_KEY` (Purchase Manager, ta sama baza `nutri-central-db` w obu środowiskach);
  - centrum: `VITE_HUB_MODULES` = `news,leave,calls,purchase,contracts` w Preview i Development, a w Production osobna zmienna = `calls,news,contracts,leave` (wydane moduły; kolejny dopisać dopiero na polecenie właściciela);
  - Nowa zmienna o różnych wartościach w dev i na produkcji: dodać osobno dla Production i dla Preview. Zmienne działają od następnego wdrożenia.

### Procedura

1. **Praca:** gałąź od `develop`, PR do `develop`, squash. Każdy PR ma własny podgląd (baza dev), a po scaleniu zmiana jest pod adresem dev. Właściciel sprawdza ją tam.
2. **Wydanie** (tylko po „wdrażaj”, całość albo wybrane aplikacje): PR `develop` → `main` z listą zmian, scalany **merge commitem** (nie squash, żeby gałęzie się nie rozjechały). Potem sprawdzić wdrożenie produkcyjne (`list_deployments`, `target: production`). Cofnięcie: Vercel → Deployments → Instant Rollback.
3. **Schemat bazy:** zmiana w `db/schema.sql`, najpierw zastosowana na `nutri-dev` (MCP Supabase), a przy wydaniu na produkcji, przed scaleniem do `main`. Build nie migruje bazy (brak `POSTGRES_URL_NON_POOLING`).
4. **Pilna poprawka:** PR do `main` (squash), potem `main` scalić do `develop`.

### Pułapki

- MCP Supabase zawiesza się (timeout 60 s, bez efektu) na poleceniach `drop …`, np. `drop policy if exists`. Dłuższy SQL dzielić na części.
- Gałąź założona na tym samym commicie co `main` nie uruchamia wdrożenia. Wtedy `create_deployment` z `gitSource` (`type: github`, `org: pnedzka`, `repo`, `ref: develop`).
- Projekt centrum: od 23.11.2026 (właściciel zatwierdził dostęp konektora do zespołu) narzędzia MCP Vercel działają z `teamId: team_J6D6ialuxylLwb8dN8Gy8YKc`, także `web_fetch_vercel_url` i `create_deployment`. Gdy znów jest 403: `authorize_team_access` i zatwierdzenie przez właściciela.
- Darmowa baza dev usypia się po 7 dniach bez użycia: Supabase → `nutri-dev` → Restore.

## Praca z repo

- `npm test` (vitest), `npm run lint`, `npm run build`, a przy zmianach interfejsu `npm run e2e` (testy funkcjonalne Playwright z backendem w pamięci, `e2e/`, README „Testy”; w sandboxie Claude: `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`). Wszystko musi przejść przed pushem. Poprawka błędu w interfejsie = najpierw scenariusz e2e, który go pokazuje (prośba właściciela z 24.11.2026).
- PR-y idą do `develop` (squash). Na produkcję tylko na polecenie właściciela, zob. „Środowiska” wyżej.
- **Code review automatyczne** (od 20.10.2026): `.github/workflows/claude-code-review.yml` (GitHub Actions, `anthropics/claude-code-action`, plugin `code-review`) komentuje PR, gdy przestaje być szkicem (Ready for review) i po kolejnych pushach; nie blokuje scalania. PR-y wydań (`develop` → `main`) i synchronizacji (`main` → `develop`) pomija. Od 23.11.2026 loguje się do Claude API przez Workload Identity Federation (token OIDC GitHuba wymieniany na krótki token Anthropic; własna reguła `nutri-hub-code-review` (`fdrl_01Aiue1oAKvNWPTTNYsbHudw`) dla `pnedzka/nutri_hub` w Anthropic Console → Workload identity, to samo konto serwisowe `svac_016XoZKYukjmwMiJXzAP3yTK` co w whoisowner), bez klucza w sekretach GitHuba; ID są w pliku workflow (nie są tajne). Potrzebuje `id-token: write` i aplikacji Claude na GitHubie. Akcja działa tylko wtedy, gdy plik workflow jest identyczny na `main` (domyślna gałąź), więc jego zmiany wprowadza się na `main`.
- Sandbox Claude Code nie łączy się z supabase.co ani *.vercel.app. Używaj narzędzi MCP: Supabase, Vercel.
