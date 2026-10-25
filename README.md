# Lilla boken

Ett enkelt bokföringsprogram för små svenska aktiebolag, till exempel ett enmansbolag eller ett vilande bolag med några få transaktioner i månaden. Du bokför verifikationer, sparar kvitton, följer upp resultat, balans och moms, och stänger året med ett utkast till årsredovisning (K2). Bokföringen kan exporteras som SIE4 till revisor eller bokföringsbyrå.

Appen körs lokalt på din egen dator och har ingen inloggning. All data ligger i din egen Postgres-databas. Du kan ha flera företag i samma installation.

Den följer bokföringslagens grundkrav: verifikationerna numreras i obruten serie, kan inte ändras eller raderas, och ett stängt år är låst. Lilla boken ersätter inte en revisor. Den gör inte heller deklarationer eller lönehantering.

## Krav

- macOS med Homebrew (`brew install postgresql@17`). Andra system fungerar, men då anger du `DATABASE_URL` själv och startar Postgres på eget sätt
- Node 24 eller senare
- Yarn 1

## Kom igång

```bash
cp .env.example .env.local
yarn
yarn db:start                   # brew services start postgresql@17
yarn db:setup                   # skapar databasen och tabeller, hämtar BAS 2026 från bas.se (idempotent)
yarn dev
```

Öppna http://localhost:3000 och skapa ditt första företag under Företag & inställningar.

## Så använder du appen

**Första gången**

1. Under **Företag** anger du namn och org.nr, väljer momsmetod (fakturerings- eller bokslutsmetoden) och momsperiod.
2. Bokför aktiekapitalet som första verifikation under **Ny verifikation**, till exempel 1930 debet och 2081 kredit.
3. Har bolaget redan bokföring från tidigare år? Då kan du inte lägga in ingående balanser i gränssnittet. Appen skapar ingående balanser bara när du stänger ett år i appen. Den passar därför bäst för bolag som börjar sin bokföring här.

**Löpande**

1. **Ny verifikation**: välj en mall, till exempel *Kortköp/direktbetalt 25 % moms* eller *Kundfaktura 25 % moms*, och fyll i datum, belopp och beskrivning. Du kan också fylla i raderna fritt.
2. Bifoga kvittot eller fakturan (bild eller PDF) direkt på verifikationen. Startsidan visar hur många verifikationer som saknar kvitto.
3. Har du bokfört fel? Öppna verifikationen och klicka **Skapa rättelse**. Felet rättas med en ny, omvänd verifikation och originalet ligger kvar.
4. Startsidan visar kassa och bank, resultatet hittills och beräknad bolagsskatt för det valda året.

**Varje momsperiod**

Under **Rapporter → Moms** ser du rutorna till momsdeklarationen. För över dem till Skatteverkets e-tjänst och bokför sedan momsredovisningen.

**Vid årets slut**

Se [Bokslut](#bokslut) nedan. Till revisorn exporterar du en SIE4-fil från Verifikationer.

## Vad som finns

| Sida | Innehåll |
|---|---|
| `/verifikationer` | Grundbok (kronologisk journal), länk till SIE4-export |
| `/verifikationer/ny` | Registrera verifikation: mallar för moms (25/12/6 %), fria rader, bilagor |
| `/verifikationer/:id` | Verifikationen, bilagor, knapp "Skapa rättelse" |
| `/huvudbok` | Saldo per konto, klicka för kontoutdrag med löpande saldo |
| `/rapporter/resultat`, `/rapporter/balans` | RR och BR per räkenskapsår |
| `/rapporter/moms` | Rutor 05, 10, 11, 12, 48, 49 per månad/kvartal/år |
| `/bokslut` | Checklista för bokslutsposter, stäng räkenskapsåret (resultatomföring 8999/2099, ingående balanser i nästa år, året låses), årsredovisning i K2-uppställning som utkast |
| `/konton` | BAS 2026, sök, lägg till, aktivera/inaktivera (delas mellan företagen) |
| `/foretag` | Företag: namn, org.nr, momsmetod (fakturerings-/bokslutsmetoden), momsperiod. Växla aktivt företag i sidopanelen |
| `/api/sie?ar=2026` | SIE4-fil (CP437) till revisor/bokföringsbyrå |

## Bokföringslagen i databasen

- Verifikationsnummer tilldelas i obruten serie per räkenskapsår (A1, A2, …) inne i en transaktion.
- `vouchers`, `voucher_lines` och `attachments` har triggers som stoppar UPDATE/DELETE. Fel rättas med "Skapa rättelse", som bokar alla rader omvänt och länkar till originalet.
- En deferrable trigger kräver att varje verifikation balanserar och har minst två rader.
- Bilagor sparas under `storage/<verifikations-id>/` (gitignorerat). Säkerhetskopiera `storage/` tillsammans med databasen.
- Räkenskapsår = kalenderår per företag, skapas automatiskt när ett datum i ett nytt år används.
- Momsmetoden styr vilka mallar som visas: faktureringsmetoden bokför fakturor mot 1510/2440, bokslutsmetoden bokför vid betalning direkt mot 1930.

## Kommandon

```bash
yarn check        # databastriggers + SIE-kodning (kräver att Postgres kör)
yarn bas:import   # hämtar BAS-kontoplanen från bas.se på nytt till db/bas2026.json
```

BAS-kontoplanen ägs av BAS-kontogruppen och följer inte med projektet. Den laddas ner från bas.se vid första `yarn db:setup` och sparas lokalt i `db/bas2026.json` (gitignorerad).

Nollställ allt: `dropdb lilla_boken && rm -rf storage && yarn db:setup`. **Varning:** detta raderar all bokföring och alla bilagor permanent. Gör en säkerhetskopia först (`pg_dump lilla_boken > backup.sql` och en kopia av `storage/`).

## Bokslut

1. Bokför bokslutsposterna (avskrivningar, periodiseringar, skatt) via mallarna under Bokslut.
2. Kontrollera RR och BR, stäng året. Appen bokför årets resultat på 8999/2099, skapar verifikation A1 "Ingående balanser" i nästa år (flaggad som IB, hamnar i `#IB` i SIE) och låser året.
3. Skriv ut Årsredovisning (utkast), komplettera med förvaltningsberättelse, noter och underskrifter. Lämna in till Bolagsverket inom 7 månader.
4. Efter årsstämman: boka om 2099 till 2091 (balanserat resultat) eller 2898 (utdelning) i det nya året.

Ett stängt år kan inte öppnas igen från gränssnittet. Föregående år måste stängas före nästa.

## Medvetet utelämnat

Inloggning, reskontror, EU-moms/omvänd skattskyldighet, radering av bilagor, fullständig årsredovisning med noter.

## Licens

MIT, se `LICENSE`. Gäller koden. BAS-kontoplanen omfattas inte, den ägs av BAS-kontogruppen.
