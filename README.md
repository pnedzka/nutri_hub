# Nutri Partners apps (centrum aplikacji)

Adres: **https://nutripartners.vercel.app** (projekt Vercel `nutripartners`, zespół `nutri-partners`).

Strona startowa dla pracowników Nutri Partners. Po zalogowaniu widać kafelki wszystkich aplikacji firmy, a admini widzą dodatkowo sekcję „Administration”. Interfejs jest po angielsku, wygląd taki sam jak w pozostałych aplikacjach.

## Funkcje

- **Logowanie e-mailem i hasłem** do wspólnej bazy użytkowników (Supabase neutralizatora). „Forgot your password?” prowadzi do neutralizatora.
- **Rola przy użytkowniku:** w nagłówku plakietka **Admin** albo **User** (`profiles.role`).
- **Kafelki „Your apps”** (wszyscy):
  - Document neutralizer: https://nutridocumentation-nxdi.vercel.app
  - E-mail signature generator: https://nutri-signatures.vercel.app
  - HubSpot owner lookup: https://whoisowner.vercel.app
  - Intranet: https://intranet.nutripartners.co, w nowej karcie, z plakietką „Separate sign-in” (własna baza kont)
- **Kafelek „User management”** (tylko Admin): zakładka Użytkownicy w neutralizatorze (`/admin/uzytkownicy`).
- Nasze aplikacje otwierają się w tej samej karcie. Logo i przycisk „All apps” („Wszystkie aplikacje”) w ich nagłówkach prowadzą z powrotem tutaj.
- **Stare linki wyszukiwania:** `nutripartners.vercel.app/?q=…` (dawniej HubSpot owner lookup) przekierowują na `whoisowner.vercel.app/?q=…`.

Ukrycie kafelka to tylko wygoda. O dostępie decydują same aplikacje i zasady RLS w Supabase.

## Dodawanie aplikacji

Wszystkie kafelki są w `src/apps.ts`. Nowa aplikacja to jeden wpis:

```ts
{
  id: 'crm-reports',                       // unikalny
  name: 'CRM reports',                     // po angielsku
  description: 'Weekly pipeline reports.',
  url: 'https://crm-reports.vercel.app',
  icon: BarChart3,                         // ikona z lucide-react
  audience: 'everyone',                    // albo 'admin': sekcja „Administration”
  newTab: true,                            // tylko dla aplikacji spoza naszej bazy kont
  note: 'Separate sign-in',                // opcjonalna plakietka
},
```

Potem `npm test`, PR do `main`, a Vercel wdroży zmianę. W nowej aplikacji warto dodać w nagłówku link do centrum, tak jak w pozostałych.

## Logowanie

- **Ta sama baza Supabase co Neutralizacja dokumentów** (`https://edzjkumjutffodfpasmf.supabase.co`). Konta zakłada się, zaprasza i resetuje tylko w neutralizatorze.
- Centrum **nie ma serwera** (brak katalogu `api/`). Imię i rolę czyta w przeglądarce z tabeli `profiles`, jako zalogowana osoba. RLS zwraca tylko jej własny wiersz. Wystarczy klucz publiczny (anon).
- Brak wiersza w `profiles` albo inna wartość niż `'admin'` oznacza rolę User.
- **Wspólnego logowania jeszcze nie ma.** Sesja Supabase jest przypisana do domeny, a każda aplikacja ma własną `*.vercel.app`, więc w każdej loguje się osobno.
  - Tokenów nie przekazujemy w linku. Supabase wymienia refresh token przy każdym odświeżeniu, więc dwie aplikacje z kopią tej samej sesji wylogowałyby się nawzajem.
  - Docelowo: jedna domena z podścieżkami (Vercel Microfrontends) albo subdomeny firmowe i cookie na domenie nadrzędnej.

## Wdrożenie (Vercel)

1. Usuń domenę `nutripartners.vercel.app` z projektu `whoisowner`: Settings → Domains → Remove.
2. Utwórz projekt **`nutripartners`** z tego repozytorium. Framework: Vite, bez zmian w ustawieniach builda.
3. **Settings → Environment Variables** (wszystkie środowiska):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://edzjkumjutffodfpasmf.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = klucz anon projektu neutralizatora
   - opcjonalnie `VITE_ACCOUNT_APP_URL`, gdy neutralizator zmieni adres
4. Settings → Domains: `nutripartners.vercel.app`.
5. Deployment Protection: Vercel Authentication tylko dla preview.

## Praca lokalna

```bash
npm install
cp .env.example .env.local   # uzupełnij klucz anon
npm run dev
npm test && npm run lint && npm run build
```
