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
- Saker med id som starter på `test-`, er testsaker for hus og størrelser. De skal ikke inn i `site/cases/index.json`.

## Plantegninger
- Hus ligger i `floorplans/<id>.json` som rektangler på et rutenett med dører. Ingen koordinater skrives for hånd: vegger, dører, romsentre og markører regnes ut i `engine/floorplan.js`.
- `engine/floorplan.js` skal ikke importere noe. Den kopieres til `site/lib/floorplan.js`, og en test feiler hvis kopien er utdatert.

## Publisere en sak
GitHub Pages publiserer bare `site/`. Filene i `site/cases/`, `site/floorplans/` og `site/lib/` er kopier og skal ikke redigeres for hånd.
1. `npm run solve cases/<id>-<slug>.json` skal gi exit-kode 0.
2. `npm run publish-case <id> <ÅÅÅÅ-MM-DD>` validerer saken, kopierer den, plantegningen og `engine/floorplan.js` til `site/`, og fører saken inn i `site/cases/index.json` på den datoen. `site/index.html` åpner da saken den dagen, uten at noen URL endres for hånd.
3. Uten dato kopieres saken uten å bli ført opp. Den kan åpnes med `play.html?case=<id>`.
4. Kjør `npm run publish-case <id>` på nytt etter endringer i en publisert sak, en plantegning eller `engine/floorplan.js`. `npm test` sier fra hvis kopiene er utdaterte.
5. Ikke publiser en sak før dagen den gjelder. Fasiten ligger i JSON-filen og er offentlig så snart den er pushet.

## Arbeidsflyt
- Research og sparring skjer i Claude Cowork og skrives til `docs/`.
- Utvikling skjer i Claude Code og tar utgangspunkt i en spec.
- Når en implementering avviker fra specen, oppdater specen eller noter det i `decisions.md`.
