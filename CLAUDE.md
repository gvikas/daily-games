# Daily Games

Et daglig deduksjonsspill med mordgåte-tema (arbeidstittel). Spilleren rekonstruerer hvem som var hvor og når på en tegnet plantegning, og anklager morderen. En solver garanterer at hver sak har nøyaktig én løsning, slik at man ikke kan gjette seg frem.

Bygges av én person med AI-assistert koding. Innholdet (sakene) må kunne genereres.

## Språk
- Spillet og UI-tekst: engelsk (internasjonalt marked).
- Kode, inkludert kommentarer, commit-meldinger og navn: engelsk. Eksisterende norske kommentarer oversettes når filen likevel endres.
- Dokumentasjon i `docs/`: norsk.

## Les dette før du begynner
- `docs/design/concept.md`: hva spillet er og hvordan det spilles. Kilden til sannhet.
- `docs/design/decisions.md`: avgjorte valg. Ikke ta dem opp igjen uten å ha en grunn til det.
- `docs/specs/`: én fil per feature. Implementer det specen sier, og ingenting utenfor scope.

Ikke les `docs/research/` med mindre oppgaven krever det. Der ligger bakgrunnsmateriale, ikke krav.

## Stack
- Motor (regler, validering og solver): Node ≥ 20, ren ESM-JavaScript uten eksterne avhengigheter. Tester med `node:test`.
- `engine/` bruker ingen Node-API-er, slik at den kan importeres i nettleseren senere. Fil-I/O og CLI ligger i `scripts/`.
- Spillsiden er `site/play.html?case=<id>`: statisk HTML og JavaScript uten byggesteg. Den leser saken og plantegningen fra JSON og tegner kartet selv. Rammeverk for frontend er ikke valgt.
- `archive/` inneholder eldre versjoner av spillsiden. Den ligger bare lokalt (står i `.gitignore`), publiseres ikke og skal ikke endres.

## Saker og solver
- Saker ligger som JSON i `cases/<id>-<slug>.json`. Formatet er beskrevet i `docs/specs/done/001-case-format-and-solver.md`.
- Kjør `npm run solve <fil>` etter hver endring i en sak. Exit-kode 0 betyr gyldig, nøyaktig én løsning og lik fasiten. `--json` gir rapporten som JSON.
- `npm test` kjører alle tester. Nye ledetrådtyper skal ha egne tester.
- En sak som skal kunne spilles, har `floorplan` og presentasjonsfeltene (`intro`, `lead`, `hint`, `marker`, `ending`, `share`). Formatet er beskrevet i `docs/specs/done/006-data-driven-case-page.md`. `npm run solve` sjekker også disse feltene.
- Mistenkte kan ha et kort `label` (rolle, maks 7 tegn). Funnene bruker rollen, og navnet vises bare i introen og avslutningen. Detaljene står i spec 006.
- Spilleren har tre forsøk per sak. Forsøk og resultat lagres per sak i `localStorage` (`case-<id>-progress`). `play.html?case=<id>&reset` nullstiller saken, til testing. Den skal ikke lenkes til.
- `level` (`easy`, `medium`, `hard`, `tricky`) og `twist` (`empty-room`) er valgfrie og valideres av solveren. En `tricky`-sak har nøyaktig én `twist`. Nye vrier krever kode og en egen spec.
- Saker med id som starter på `test-`, er testsaker for hus og størrelser. De skal ikke inn i `site/cases/index.json`.
- `npm run check-text <id>` sjekker teksten i en sak: forbudte ord (listen står i `scripts/check-text.json`), navn i funn når saken har `label`, lange funn, og at hvert funn leses tilbake til sin `constraint` (spec 010). Både Cowork og Code kan kjøre den.
- `npm run blind-case <id>` og tilbakelesingen skriver til `cases/drafts/`, og `npm run playthrough <id>` lagrer skjermbilder i `.playthrough/<id>/`. Begge mappene står i `.gitignore`. Gjennomspillingen trenger Playwright (`npm install`, så `npx playwright install chromium`). `npm test` hopper over testene som trenger den, hvis den mangler.

## Plantegninger
- Hus ligger i `floorplans/<id>.json` som rektangler på et rutenett med dører. Ingen koordinater skrives for hånd: vegger, dører, romsentre og markører regnes ut i `engine/floorplan.js`.
- Modulene som `play.html` bruker (`engine/floorplan.js`, `engine/conflicts.js` og `engine/progress.js`, listen står i `scripts/lib/load.js`), skal ikke importere noe. De kopieres til `site/lib/` av `npm run publish-case`, og en test feiler hvis en kopi er utdatert eller en modul importerer noe.

## Publisere en sak
1. Cowork lager saken i `cases/`, kjører `npm run solve` (exit-kode 0) og `npm test`, og sier fra til Vikas at saken er klar. Tilsiktede advarsler fra solveren nevnes i den meldingen.
2. Vikas ber Code publisere.
3. Code kjører `/check-case <id>`: solveren, tilbakelesing av funnene med subagenten `case-reader`, `npm run check-text`, og gjennomspilling på mobilbredde med subagenten `case-playthrough`. Code rapporterer funnene og endrer ikke teksten. Feil i teksten går tilbake til Cowork.
4. Code kjører `npm run publish-case <id> <ÅÅÅÅ-MM-DD>`, sier fra hvis noe ikke lar seg vise, og committer og pusher.

`publish-case` validerer saken, kopierer den, plantegningen og modulene i `site/lib/` til `site/`, og fører saken inn i `site/cases/index.json` på datoen. `site/index.html` åpner da saken den dagen, uten at noen URL endres for hånd.
- Uten dato kopieres saken uten å bli ført opp. Det er bare lov for testsaker (id som starter på `test-`). En ekte sak publiseres alltid med datoen den gjelder, og først den dagen.
- GitHub Pages publiserer bare `site/`. Kopiene i `site/cases/`, `site/floorplans/` og `site/lib/` redigeres aldri for hånd.
- Kjør `npm run publish-case <id>` på nytt etter endringer i en sak, en plantegning eller en av modulene i `site/lib/`. `npm test` sier fra hvis kopiene er utdaterte.
- Ikke publiser en sak før dagen den gjelder. Fasiten ligger i JSON-filen og er offentlig så snart den er pushet.

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
- Når en implementering avviker fra specen, oppdater specen eller noter det i `decisions.md`.
- Prototyper: Cowork lager klikkbare prototyper i `docs/prototypes/`. Code kopierer dem uendret til `site/proto/` når Vikas ber om det. De kommer aldri inn i `site/cases/index.json`.
- Plantegninger: Cowork legger forslag til nye hus i `docs/prototypes/floorplans/`. Code validerer dem og flytter dem til `floorplans/`.

### Roadmap-siden
- `npm run roadmap` lager `docs/roadmap.html` fra `docs/roadmap.json` (Cowork), specs, saker og `decisions.md` (spec 009). Den leser også `docs/testrunder.json` (testrundene) og statuslinjene i `docs/design/forslag-til-sparring.md`. Begge eies av Cowork. Siden redigeres aldri for hånd.
- Code kjører den når en spec flyttes til `docs/specs/done/`, og når en sak publiseres. Cowork kjører den, eller ber om en ny kjøring, når `roadmap.json`, `decisions.md` eller en spec er endret.
