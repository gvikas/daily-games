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
- Frontend er ikke bestemt. `site/` er fortsatt statiske HTML-prototyper med egne hardkodede data.

## Saker og solver
- Saker ligger som JSON i `cases/<id>-<slug>.json`. Formatet er beskrevet i `docs/specs/done/001-case-format-and-solver.md`.
- Kjør `npm run solve <fil>` etter hver endring i en sak. Exit-kode 0 betyr gyldig, nøyaktig én løsning og lik fasiten. `--json` gir rapporten som JSON.
- `npm test` kjører alle tester. Nye ledetrådtyper skal ha egne tester.

## Arbeidsflyt
- Research og sparring skjer i Claude Cowork og skrives til `docs/`.
- Utvikling skjer i Claude Code og tar utgangspunkt i en spec.
- Når en implementering avviker fra specen, oppdater specen eller noter det i `decisions.md`.
