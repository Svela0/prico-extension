# Prico: Prissjekker – kildekoden til utvidelsen

Dette er koden som kjører i nettleseren din når du har installert
[Prico: Prissjekker](https://chromewebstore.google.com/detail/prico-prissjekker/hollkbchblipmahfdclpdjldkfhgfgca).
Vi har lagt den ut så du kan se selv hva utvidelsen gjør – og ikke gjør.

Prico sier fra når varen du ser på i en norsk nettbutikk er billigere i en
annen butikk. Den er gratis, har ingen konto og viser ikke reklame.
Nettsted: [prico.no](https://prico.no) · Personvern: [prico.no/privacy.html](https://prico.no/privacy.html)

*English: this is the full source of the Prico browser extension, a Norwegian
price checker. It is published so anyone can verify what it reads and sends.
The summary below is in Norwegian; the code and its comments are mostly in English.*

## Kort fortalt

| Spørsmål | Svar |
|---|---|
| Hvilke servere snakker utvidelsen med? | Bare `api.prico.no`. I tillegg hentes produktbildene i vinduet fra butikkenes egne bildeservere, som når du besøker butikken. |
| Hva sendes? | Adressen til produktsida du står på og varens navn/varenummer – bare i butikkene Prico dekker. |
| Sendes det noe om deg? | Nei. Ingen bruker-ID, ingen konto, ingen informasjonskapsler, ingen sporing. |
| Hva skjer på andre nettsteder? | Ingenting. Utvidelsen avslutter før den leser noe fra sida. |
| Lastes det kode eller skrifttyper utenfra? | Nei. Alt ligger i pakken. |

## Hvorfor ber den om tilgang til alle nettsteder?

Nettleseren viser advarselen «lese og endre alle dataene dine på alle
nettsteder». Grunnen er at lista over butikker vokser, og at hver nye butikk
ellers ville krevd en ny versjon som nettleseren slår av til du har godkjent
den på nytt.

Tilgangen brukes bare i butikkene på lista. Slik kan du kontrollere det:

1. `content.js` starter med å spørre bakgrunnsskriptet om nettstedet er en
   butikk (meldingen `ER_BUTIKK`, nederst i fila). Er svaret nei, stopper
   skriptet der.
2. `background.js` svarer ut fra en liste den henter én gang i døgnet fra
   `api.prico.no/hosts` (`hentHosts` og `finnButikk`). `hosts_fallback.json`
   er lista en ny installasjon starter med.
3. Vinduet du åpner fra ikonet har den samme sperra (`connector.js`, søk etter
   «ONLY ON OUR STORES»): på andre nettsteder leser og sender det ingenting.

## Hva som sendes til api.prico.no

Alle kallene er vanlige `fetch`-kall; søk etter `fetch(` i koden for å se dem.

| Kall | Når | Innhold |
|---|---|---|
| `/hosts` | én gang i døgnet | ingenting (henter butikklista) |
| `/prices` | når du åpner en produktside i en butikk på lista | sidas adresse og varens navn/varenummer (`fetchPrices` i `background.js`) |
| `/price_report` | når prisen på sida avviker fra den vi har lagret | sidas adresse, prisen på sida og prisen vi hadde (`meldPrisavvik` i `background.js`) |
| `/price_history` | når du åpner prishistorikken i vinduet | adressen til varen |
| `/demo`, `/retailers` | på velkomstsida etter installasjon | ingenting |

Serveren ser IP-adressen din, slik enhver nettside gjør når du besøker den.
Den brukes ikke til å kjenne deg igjen.

## Hva som lagres i nettleseren din

Bare innstillinger og mellomlagring, i `chrome.storage.local` – ingenting av
det sendes videre:

- butikklista (`prico_hosts`) og de siste prisene som ble hentet (`latestPrices`)
- valgene dine i vinduet: medlemspriser, outlet, originaldeler, minste rabatt, lyst/mørkt tema
- hvilke varsler du har lukket (`prico_demp`)
- `prico_fra`: klikker du deg fra prico.no til en butikk, husker utvidelsen den
  adressen i tre minutter, så butikksida ikke møter deg med et varsel om et
  valg du nettopp tok

## Filene

| Fil | Hva den gjør |
|---|---|
| `manifest.json` | tillatelser og hvilke filer som hører til |
| `content.js` | kjører på nettsidene: sjekker om sida er en butikk, leser varen, viser varselet |
| `background.js` | henter butikklista og prisene fra api.prico.no |
| `structure.html`, `connector.js`, `styles/main.css`, `tema.js` | vinduet som åpnes fra ikonet |
| `onboarding.html`, `onboarding.js` | velkomstsida etter installasjon |
| `hosts_fallback.json` | butikklista en ny installasjon starter med |
| `fonts/`, `images/` | skrifttypen Inter (SIL Open Font License) og ikonene |

## Prøv koden selv

1. Last ned denne mappa (grønn «Code»-knapp → «Download ZIP») og pakk ut.
2. Åpne `chrome://extensions`, slå på «Utviklermodus».
3. Velg «Last inn upakket» og pek på mappa.

Du kan også sammenligne med versjonen du har installert: i
`chrome://extensions` står utvidelsens ID, og filene ligger i nettleserens
profilmappe under `Extensions/<ID>/`.

## Versjon

Koden her er versjon **1.13**. Butikkene (Chrome og Edge) bruker noen dager
på å godkjenne en ny versjon, så den du har installert kan være en eller to
versjoner eldre. Mappa oppdateres ved hver ny versjon.

Det som ikke ligger her er serveren (prisinnsamlingen og databasen bak
api.prico.no). Den kjører hos oss og ikke i nettleseren din.

## Rettigheter og kontakt

Koden er lagt ut for innsyn. Alle rettigheter tilhører Prico, med unntak av
skrifttypen Inter (`fonts/LICENSE-inter.txt`).

Fant du noe som ser feil ut, eller noe du lurer på?
[prico.no/kontakt.html](https://prico.no/kontakt.html) eller opprett en sak
(«Issue») her.
