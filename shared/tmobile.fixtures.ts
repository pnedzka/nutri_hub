// Synthetic T-Mobile invoices for the parser's tests (shared/tmobile.test.ts): made-up numbers and amounts in the
// text layout of real invoices (as linesFromPages gives it), from before and after the 2026 change. Real invoices
// hold phone numbers and usage of employees and must never be added to this public repository.
//
// The expected rows are the output of the owner's reference script (parse_tmobile_invoice.py) for these texts:
// [msisdn, kind, category, roamingOperator, eventCount, durationS, dataMb, paidDurationS, paidDataMb, paidCount, netAmount].

export type ExpectedRow = [string, string, string, string | null, number, number | null, number | null, number | null, number | null, number | null, number];

export const LAYOUT_2026 = `STRONA INFORMACYJNA
Numer faktury:  509912345626  Twoja faktura dostępna jest
Termin płatności:  16.04.2026  w Krajowym Systemie eFaktur (KSeF)
Data i miejsce wystawienia:  02.04.2026, Warszawa  Numer faktury KSeF:
SPRZEDAWCA  NABYWCA  ADRESAT
Numer Klienta: 1.99999999
A  Twoja faktura  412,50 zł brutto  i
A+B+C  Prosimy o wpłatę  412,50 zł brutto i
FAKTURA PODSTAWOWA
Numer faktury:  509912345626
Data i miejsce wystawienia:  02.04.2026, Warszawa
Okres rozliczeniowy:  02.03.2026–01.04.2026
str. 2
Numer Klienta: 1.99999999  Numer faktury: 509912345626  Okres rozliczeniowy: 02.03.2026–01.04.2026  Data wystawienia: 02.04.2026
ZESTAWIENIE OPŁAT DLA WSZYSTKICH OFERT i
500100101  Magenta Biznes K.Dodatkowy  85,00 zł  -15,00 zł  12,40 zł  5,00 zł  0,00 zł  brak  107,99 zł
500100102  Magenta Biznes K.Dodatkowy  55,00 zł  -15,00 zł  0,00 zł  5,00 zł  0,00 zł  brak  55,35 zł
500100103  Magenta Biznes Internet M  50,00 zł  -5,00 zł  0,00 zł  5,00 zł  0,00 zł  brak  61,50 zł
Opłaty bez przypisanego numeru  0,00 zł  0,00 zł  0,00 zł  0,00 zł  1,09 zł  0,00 zł  1,09 zł
SUMA:  190,00 zł  -35,00 zł  12,40 zł  15,00 zł  1,09 zł  0,00 zł  225,93 zł
ROZLICZENIE SZCZEGÓŁOWE
500100101 – MAGENTA BIZNES K.DODATKOWY
A1  Abonamenty i opłaty cykliczne
Usługi telekomunikacyjne  OKRES ROZLICZENIOWY  KWOTA NETTO
Magenta Biznes K.Dodatkowy  02.04.2026–01.05.2026  85,00 zł
Rabat za zgody marketingowe  i  02.04.2026–01.05.2026  -15,00 zł
Razem:  70,00 zł netto  86,10 zł brutto
A2  Opłaty jednorazowe
Usługi telekomunikacyjne  OKRES ROZLICZENIOWY  KWOTA NETTO
Usługi PREMIUM i Infolinie  3,00 zł
Razem:  3,00 zł netto  3,69 zł brutto
A1+A2  Podsumowanie opłat  89,79 zł brutto
ZESTAWIENIE WYKONANYCH POŁĄCZEŃ
LICZBA JEDNOSTEK
KATEGORIA  LICZBA POŁĄCZEŃ  ROZLICZENIOWYCH  W TYM PŁATNYCH  KWOTA NETTO
INTERNET POŁĄCZENIA
Internet wysłano i odebrano  42  1234,567 MB  0 MB  0,00
POŁĄCZENIA
Połączenia do sieci Orange  12  25 min 30 s  0s  0,00
Połączenia do sieci Play  7  9 min 4 s  0s  0,00
Połączenia do sieci stacjonarnych  3  45 s  0s  0,00
Połączenia do sieci T-Mobile  20  60 min 0 s  0s  0,00
Połączenia międzynarodowe  i  5  12 min  2 min 10 s  9,40
ROAMING MIĘDZYNARODOWY  i
T-Mobile Austria
Wychodzące połączenia roamingowe  4  6 min 15 s  0s  0,00
Przychodzące połączenia roamingowe  2  3 min 2 s  0s  0,00
Wychodzące roamingowe SMS  3  0  0,00
str. 3
Numer Klienta: 1.99999999  Numer faktury: 509912345626  Okres rozliczeniowy: 02.03.2026–01.04.2026  Data wystawienia: 02.04.2026
LICZBA JEDNOSTEK
KATEGORIA  LICZBA POŁĄCZEŃ  ROZLICZENIOWYCH  W TYM PŁATNYCH  KWOTA NETTO
Wychodzące roamingowe MMS  1  0  0,00
ROAMING MIĘDZYNARODOWY - INTERNET  i
T-Mobile Austria
Internet roaming odebrano  6  120,5 MB  0 MB  0,00
Internet roaming wysłano  6  14,25 MB  0 MB  0,00
Tunisie Tel. Tunezja
Internet roaming odebrano  1  1,074 MB  1,074 MB  0,04
USŁUGI PREMIUM I INFOLINIE
SMS Premium  i
7353  1  1  3,00
Połączenia na Infolinie  i  1  1 min 30 s  0s  0,00
WIADOMOŚCI SMS/MMS
MMS krajowy  1  0  0,00
SMS krajowy  15  0  0,00
Strona podmiotowa BIP UKE, na której prowadzony jest rejestr numerów wykorzystywanych do świadczenia usługi o podwyższonej opłacie.
Klient ma prawo do złożenia żądania nieodpłatnego blokowania wszystkich lub poszczególnych rodzajów Usług Premium.
(opłata za połączenie zgodna z Cennikiem).
ZESTAWIENIE WYKORZYSTANIA JEDNOSTEK
RODZAJ JEDNOSTEK  PRZYSŁUGUJĄCE  WYKORZYSTANE
Limit danych w UE  18432 MB  134,75 MB
minuty międzynarodowe  100min 0s
500100102 – MAGENTA BIZNES K.DODATKOWY
A1  Abonamenty i opłaty cykliczne
Usługi telekomunikacyjne  OKRES ROZLICZENIOWY  KWOTA NETTO
Magenta Biznes K.Dodatkowy  02.04.2026–01.05.2026  55,00 zł
Razem:  40,00 zł netto  49,20 zł brutto
A1+A3  Podsumowanie opłat  55,35 zł brutto
ZESTAWIENIE WYKORZYSTANIA JEDNOSTEK
RODZAJ JEDNOSTEK  PRZYSŁUGUJĄCE  WYKORZYSTANE
Limit danych w UE  18432 MB
500100103 – MAGENTA BIZNES INTERNET M
A1  Abonamenty i opłaty cykliczne
Magenta Biznes Internet M  02.04.2026–01.05.2026  50,00 zł
A1+A3  Podsumowanie opłat  61,50 zł brutto
ZESTAWIENIE WYKONANYCH POŁĄCZEŃ
LICZBA JEDNOSTEK
KATEGORIA  LICZBA POŁĄCZEŃ  ROZLICZENIOWYCH  W TYM PŁATNYCH  KWOTA NETTO
INTERNET POŁĄCZENIA
Internet wysłano i odebrano  88  20480,125 MB  0 MB  0,00
ZESTAWIENIE WYKORZYSTANIA JEDNOSTEK
RODZAJ JEDNOSTEK  PRZYSŁUGUJĄCE  WYKORZYSTANE
Internet  102400 MB  20480,125 MB
PODSUMOWANIE OPŁAT BEZ PRZYPISANEGO NUMERU
A3  Inne opłaty
Odsetki za okres 20.02.2026 - 19.03.2026  i  01.04.2026  1,09 zł
Razem:  1,09 zł brutto
str. 4`;

export const LAYOUT_2026_ROWS: ExpectedRow[] = [
  ['500100101', 'data', 'Internet wysłano i odebrano', null, 42, null, 1234.567, null, 0.0, null, 0.0],
  ['500100101', 'voice_out', 'Połączenia do sieci Orange', null, 12, 1530, null, 0, null, null, 0.0],
  ['500100101', 'voice_out', 'Połączenia do sieci Play', null, 7, 544, null, 0, null, null, 0.0],
  ['500100101', 'voice_out', 'Połączenia do sieci stacjonarnych', null, 3, 45, null, 0, null, null, 0.0],
  ['500100101', 'voice_out', 'Połączenia do sieci T-Mobile', null, 20, 3600, null, 0, null, null, 0.0],
  ['500100101', 'voice_out', 'Połączenia międzynarodowe', null, 5, 720, null, 130, null, null, 9.4],
  ['500100101', 'voice_out_roaming', 'Wychodzące połączenia roamingowe', 'T-Mobile Austria', 4, 375, null, 0, null, null, 0.0],
  ['500100101', 'voice_in_roaming', 'Przychodzące połączenia roamingowe', 'T-Mobile Austria', 2, 182, null, 0, null, null, 0.0],
  ['500100101', 'sms_roaming', 'Wychodzące roamingowe SMS', 'T-Mobile Austria', 3, null, null, null, null, 0, 0.0],
  ['500100101', 'sms_roaming', 'Wychodzące roamingowe MMS', 'T-Mobile Austria', 1, null, null, null, null, 0, 0.0],
  ['500100101', 'data_roaming', 'Internet roaming odebrano', 'T-Mobile Austria', 6, null, 120.5, null, 0.0, null, 0.0],
  ['500100101', 'data_roaming', 'Internet roaming wysłano', 'T-Mobile Austria', 6, null, 14.25, null, 0.0, null, 0.0],
  ['500100101', 'data_roaming', 'Internet roaming odebrano', 'Tunisie Tel. Tunezja', 1, null, 1.074, null, 1.074, null, 0.04],
  ['500100101', 'premium', 'SMS Premium 7353', null, 1, null, null, null, null, 1, 3.0],
  ['500100101', 'premium', 'Połączenia na Infolinie', null, 1, 90, null, 0, null, null, 0.0],
  ['500100101', 'mms', 'MMS krajowy', null, 1, null, null, null, null, 0, 0.0],
  ['500100101', 'sms', 'SMS krajowy', null, 15, null, null, null, null, 0, 0.0],
  ['500100103', 'data', 'Internet wysłano i odebrano', null, 88, null, 20480.125, null, 0.0, null, 0.0],
];

export const LAYOUT_2025 = `Faktura nr:  501234567826 z dnia 02.01.2026
Nr rachunku:  00 0000 0000 0000 0000 0000 0000
Termin płatności:  16.01.2026
A1  Abonamenty i opłaty cykliczne  128,90  zł brutto  i
A  Twoja faktura VAT  160,00  zł brutto  i
A+B+C  Prosimy o wpłatę  160,00  zł brutto  i
Okres rozliczeniowy:  02.12.2025–01.01.2026
Twoja faktura VAT
Data i miejsce wystawienia:  02.01.2026, Warszawa
str. 1
Numer Klienta: 1.99999999  Numer faktury: 501234567826  Okres rozliczeniowy: 02.12.2025–01.01.2026  Data wystawienia: 02.01.2026
ZESTAWIENIE OPŁAT DLA WSZYSTKICH OFERT
A1 Abonamenty i opłaty cykliczne  A2 Opłaty jednorazowe  A3 Inne opłaty
500200201  Magenta Biznes K.Dodatkowy  85,00 zł  -25,00 zł  0,00 zł  0,00 zł  0,00 zł  0,00 zł  0,00 zł  0,00 zł  0,00 zł  0,00 zł  5,00 zł  0,00 zł  0,00 zł  65,00 zł  brak  79,95 zł
500200202  Magenta Biznes K.Podstawowy  55,00 zł  -15,00 zł  0,00 zł  0,00 zł  26,40 zł  0,00 zł  0,00 zł  0,00 zł  0,00 zł  0,00 zł  5,00 zł  0,00 zł  0,00 zł  71,40 zł  brak  87,82 zł
SUMA:  140,00 zł  -40,00 zł  0,00 zł  0,00 zł  26,40 zł  0,00 zł  0,00 zł  0,00 zł  0,00 zł  0,00 zł  10,00 zł  0,00 zł  0,00 zł  136,40 zł  brak  167,77 zł
Numer Klienta: 1.99999999  Numer faktury: 501234567826  Okres rozliczeniowy: 02.12.2025–01.01.2026  Data wystawienia: 02.01.2026
C  Stan konta z poprzedniego okresu rozliczeniowego
DATA  KWOTA BRUTTO
Twoja kwota do zapłaty z poprzedniego miesiąca  150,00 zł
WPŁATA  15.12.2025  -150,00 zł
Razem:  0,00 zł brutto
500200201 – MAGENTA BIZNES K.DODATKOWY
A1  Abonamenty i opłaty cykliczne
Usługi telekomunikacyjne  OKRES ROZLICZENIOWY  KWOTA NETTO
Magenta Biznes K.Dodatkowy  02.01.2026–01.02.2026  85,00 zł
Rabat za Obsługę Elektroniczną i terminową płatność  i  02.01.2026–01.02.2026  -10,00 zł
Razem:  60,00 zł netto  73,80 zł brutto
str. 5
Numer Klienta: 1.99999999  Numer faktury: 501234567826  Okres rozliczeniowy: 02.12.2025–01.01.2026  Data wystawienia: 02.01.2026
A3  Inne opłaty
Usługi nietelekomunikacyjne - opłaty naliczane z góry  OKRES ROZLICZENIOWY  KWOTA NETTO
Ochrona w sieci  02.01.2026–01.02.2026  5,00 zł
Razem:  5,00 zł netto  6,15 zł brutto
A1+A3  Podsumowanie opłat  79,95 zł brutto
ZESTAWIENIE WYKONANYCH POŁĄCZEŃ
LICZBA JEDNOSTEK
KATEGORIA  LICZBA POŁĄCZEŃ  ROZLICZENIOWYCH  W TYM PŁATNYCH  KWOTA NETTO
INTERNET POŁĄCZENIA
Internet wysłano i odebrano  56  298,828 MB  0 MB  0,00
POŁĄCZENIA
Połączenia do sieci Orange  8  6 min 6 s  0s  0,00
Połączenia do sieci Plus  1  42 s  0s  0,00
Połączenia do Centernet  2  1 min 1 s  0s  0,00
Połączenia inne  1  10 s  0s  0,00
Połączenia międzynarodowe  i  6  7 min 26 s  0s  0,00
WIADOMOŚCI SMS/MMS
SMS krajowy  7  0  0,00
SMS międzynarodowy  2  2  0,60
ZESTAWIENIE WYKORZYSTANIA JEDNOSTEK
RODZAJ JEDNOSTEK  Z POPRZEDNIEGO  Z BIEŻĄCEGO  WYKORZYSTANE  PRZENIESIONE
Limit danych w UE  20480 MB
minuty międzynarodowe  100min 0s
500200202 – MAGENTA BIZNES K.PODSTAWOWY
A1  Abonamenty i opłaty cykliczne
Usługi telekomunikacyjne  OKRES ROZLICZENIOWY  KWOTA NETTO
Magenta Biznes K.Podstawowy  02.01.2026–01.02.2026  55,00 zł
Razem:  40,00 zł netto  49,20 zł brutto
A2  Opłaty jednorazowe
Usługi telekomunikacyjne  OKRES ROZLICZENIOWY  KWOTA NETTO
Połączenia  i  26,40 zł
Razem:  26,40 zł netto  32,47 zł brutto
A1+A2+A3  Podsumowanie opłat  87,82 zł brutto
ZESTAWIENIE WYKONANYCH POŁĄCZEŃ
LICZBA JEDNOSTEK
KATEGORIA  LICZBA POŁĄCZEŃ  ROZLICZENIOWYCH  W TYM PŁATNYCH  KWOTA NETTO
POŁĄCZENIA
Połączenia do sieci T-Mobile  31  48 min 12 s  0s  0,00
Połączenia międzynarodowe  i  14  32 min 5 s  22 min 5 s  26,40
ROAMING MIĘDZYNARODOWY  i
Orange Francja
Wychodzące połączenia roamingowe  1  2 min 0 s  0s  0,00
ROAMING MIĘDZYNARODOWY - INTERNET  i
Orange Francja
Internet roaming wysłano  3  2,5 MB  0 MB  0,00
ZESTAWIENIE WYKORZYSTANIA JEDNOSTEK
RODZAJ JEDNOSTEK  Z POPRZEDNIEGO  Z BIEŻĄCEGO  WYKORZYSTANE  PRZENIESIONE
minuty międzynarodowe  100min 0s  100min 0s
str. 6`;

export const LAYOUT_2025_ROWS: ExpectedRow[] = [
  ['500200201', 'data', 'Internet wysłano i odebrano', null, 56, null, 298.828, null, 0.0, null, 0.0],
  ['500200201', 'voice_out', 'Połączenia do sieci Orange', null, 8, 366, null, 0, null, null, 0.0],
  ['500200201', 'voice_out', 'Połączenia do sieci Plus', null, 1, 42, null, 0, null, null, 0.0],
  ['500200201', 'voice_out', 'Połączenia do Centernet', null, 2, 61, null, 0, null, null, 0.0],
  ['500200201', 'voice_out', 'Połączenia inne', null, 1, 10, null, 0, null, null, 0.0],
  ['500200201', 'voice_out', 'Połączenia międzynarodowe', null, 6, 446, null, 0, null, null, 0.0],
  ['500200201', 'sms', 'SMS krajowy', null, 7, null, null, null, null, 0, 0.0],
  ['500200201', 'sms', 'SMS międzynarodowy', null, 2, null, null, null, null, 2, 0.6],
  ['500200202', 'voice_out', 'Połączenia do sieci T-Mobile', null, 31, 2892, null, 0, null, null, 0.0],
  ['500200202', 'voice_out', 'Połączenia międzynarodowe', null, 14, 1925, null, 1325, null, null, 26.4],
  ['500200202', 'voice_out_roaming', 'Wychodzące połączenia roamingowe', 'Orange Francja', 1, 120, null, 0, null, null, 0.0],
  ['500200202', 'data_roaming', 'Internet roaming wysłano', 'Orange Francja', 3, null, 2.5, null, 0.0, null, 0.0],
];

