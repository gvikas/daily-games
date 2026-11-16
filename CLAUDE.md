# Daily Games

Et daglig deduksjonsspill med mordgåte-tema (arbeidstittel). Spilleren rekonstruerer hvem som var hvor og når på en tegnet plantegning, og anklager morderen. En solver garanterer at hver sak har nøyaktig én løsning, slik at man ikke kan gjette seg frem.

Bygges av én person med AI-assistert koding. Innholdet (sakene) må kunne genereres.

## Språk
- Spillet, UI-tekst og kode: engelsk (internasjonalt marked).
- Dokumentasjon i `docs/`: norsk.

## Les dette før du begynner
- `docs/design/concept.md`: hva spillet er og hvordan det spilles. Kilden til sannhet.
- `docs/design/decisions.md`: avgjorte valg. Ikke ta dem opp igjen uten å ha en grunn til det.
- `docs/specs/`: én fil per feature. Implementer det specen sier, og ingenting utenfor scope.

Ikke les `docs/research/` med mindre oppgaven krever det. Der ligger bakgrunnsmateriale, ikke krav.

## Mappestruktur
- `docs/research/`: markedsanalyse og råmateriale (Cowork)
- `docs/design/`: konsept og beslutningslogg (Cowork)
- `docs/specs/`: feature-specs skrevet for implementering (Cowork → Code)
- `docs/prototypes/`: klikkbare HTML-prototyper fra konseptfasen
- `docs/playtest.md`: testfunn, som går tilbake til sparring

## Stack
- Motor (regler, validering og solver): Node ≥ 20, ren ESM-JavaScript uten eksterne avhengigheter. Tester med `node:test`.
- `engine/` bruker ingen Node-API-er, slik at den kan importeres i nettleseren senere. Fil-I/O og CLI ligger i `scripts/`.
- Spillsiden er `site/play.html?case=<id>`: statisk HTML og JavaScript uten byggesteg. Den leser saken og plantegningen fra JSON og tegner kartet selv. Rammeverk for frontend er ikke valgt.
- `site/002.html` og `site/v3.html` er eldre prototyper med hardkodede data. De skal stå urørt.

## Saker og solver
- Saker ligger som JSON i `cases/<id>-<slug>.json`. Formatet er beskrevet i `docs/specs/done/001-case-format-and-solver.md`.
- Kjør `npm run solve <fil>` etter hver endring i en sak. Exit-kode 0 betyr gyldig, nøyaktig én løsning og lik fasiten. `--json` gir rapporten som JSON.
- `npm test` kjører alle tester. Nye ledetrådtyper skal ha egne tester.
- En sak som skal kunne spilles, har `floorplan` og presentasjonsfeltene (`intro`, `lead`, `hint`, `marker`, `ending`, `share`). Formatet er beskrevet i `docs/specs/done/006-data-driven-case-page.md`. `npm run solve` sjekker også disse feltene.
- Mistenkte kan ha et kort `label` (rolle, f.eks. «Barmaid»). Når det finnes, viser `play.html` rollen i stedet for navnet på chips, brikker, notater, anklage og i hjelpetekster. Funnene bruker da rollen («the barmaid»), og navnet brukes bare i åpningsscenen og avslutningen. Saker uten `label` viser navn som før.
- Spilleren har tre forsøk per sak. Forsøk og resultat lagres per sak i `localStorage` (`case-<id>-progress`). `play.html?case=<id>&reset` nullstiller saken, til testing. Den skal ikke lenkes til.
- `level` (`easy`, `medium`, `hard`, `tricky`) og `twist` (`empty-room`) er valgfrie og valideres av solveren. En `tricky`-sak har nøyaktig én `twist`. Nye vrier krever kode og en egen spec.
- Saker med id som starter på `test-`, er testsaker for hus og størrelser. De skal ikke inn i `site/cases/index.json`.

## Plantegninger
- Hus ligger i `floorplans/<id>.json` som rektangler på et rutenett med dører. Ingen koordinater skrives for hånd: vegger, dører, romsentre og markører regnes ut i `engine/floorplan.js`.
- Modulene som `play.html` bruker (`engine/floorplan.js`, `engine/conflicts.js` og `engine/progress.js`, listen står i `scripts/lib/load.js`), skal ikke importere noe. De kopieres til `site/lib/` av `npm run publish-case`, og en test feiler hvis en kopi er utdatert eller en modul importerer noe.

## Publisere en sak
GitHub Pages publiserer bare `site/`. Filene i `site/cases/`, `site/floorplans/` og `site/lib/` er kopier og skal ikke redigeres for hånd.
1. `npm run solve cases/<id>-<slug>.json` skal gi exit-kode 0.
2. `npm run publish-case <id> <ÅÅÅÅ-MM-DD>` validerer saken, kopierer den, plantegningen og `engine/floorplan.js` til `site/`, og fører saken inn i `site/cases/index.json` på den datoen. `site/index.html` åpner da saken den dagen, uten at noen URL endres for hånd.
3. Uten dato kopieres saken uten å bli ført opp. Den kan åpnes med `play.html?case=<id>`.
4. Kjør `npm run publish-case <id>` på nytt etter endringer i en publisert sak, en plantegning eller en av modulene i `site/lib/`. `npm test` sier fra hvis kopiene er utdaterte.
5. Ikke publiser en sak før dagen den gjelder. Fasiten ligger i JSON-filen og er offentlig så snart den er pushet.

## Arbeidsdeling
To Claude-økter jobber i dette repoet. Saksformatet er kontrakten mellom dem.

| | Cowork | Code |
|---|---|---|
| Eier og redigerer | `cases/*.json` og alt i `docs/` | `site/`, `engine/`, `scripts/`, `test/`, `floorplans/`, `CLAUDE.md`, `package.json` |
| Kjører | `npm run solve` og `npm test`, for å sjekke saker | Alt, inkludert `npm run publish-case`, commit og push |
| Trenger noe nytt | Skriver en spec i `docs/specs/` eller et notat i `docs/design/forslag-til-sparring.md` | Bygger det fra specen |

Regler:
- Code endrer ikke innholdet i en sak (ledetråder, tekster, fasit) uten å si fra. Rene formatendringer ved en migrering er greit, og skal nevnes i svaret.
- Cowork endrer ikke kode. Trenger en sak noe formatet eller siden ikke støtter, skrives behovet opp, og Code bygger det.
- `docs/playtest.md` og `docs/design/decisions.md` skrives av begge. Legg bare til nederst, og skriv aldri om det den andre har skrevet.
- Filene i `site/cases/`, `site/floorplans/` og `site/lib/` er kopier. Ingen redigerer dem for hånd.
- Når en implementering avviker fra specen, oppdater specen eller noter det i `decisions.md`.

### Roadmap-siden
- `npm run roadmap` lager `docs/roadmap.html` fra `docs/roadmap.json` (Cowork), specs, saker og `decisions.md` (spec 009). Siden redigeres aldri for hånd.
- Code kjører den når en spec flyttes til `docs/specs/done/`, og når en sak publiseres. Cowork kjører den, eller ber om en ny kjøring, når `roadmap.json`, `decisions.md` eller en spec er endret.

### Overlevering av en sak
1. Cowork lager saken i `cases/`, kjører `npm run solve` (exit-kode 0) og `npm test`, og sier fra til Vikas at saken er klar. Advarsler fra solveren som er tilsiktet, står i `docs/playtest.md`.
2. Vikas ber Code publisere: `npm run publish-case <id> <dato>`, commit og push.
3. Code spiller saken gjennom i `play.html?case=<id>` på mobilbredde før push, og sier fra hvis noe i saken ikke lar seg vise.
