# Daily Games

A daily deduction game with a murder-mystery theme (working title). Reconstruct who was where and when on a drawn floor plan, then accuse the killer. A solver guarantees every case has exactly one solution, so guessing doesn't pay.

## Structure

- `site/` – the playable game, published to GitHub Pages on every push to `main`
- `.github/workflows/pages.yml` – the deploy workflow
- `engine/` – rules, validation and solver (plain JavaScript, no dependencies)
- `site/play.html?case=<id>` – the game page. It reads the case and its floor plan from JSON and draws the map
- `cases/` – cases as JSON
- `floorplans/` – houses as rectangles on a grid, with doors
- `scripts/solve.js` – checks a case: `npm run solve cases/003-the-silent-encore.json`
- `scripts/publish-case.js` – copies a checked case into `site/`: `npm run publish-case 003 2026-11-12`
- `test/` – `npm test`

## Run locally

Open `site/index.html` in a browser, or serve the folder:

```bash
python3 -m http.server -d site 8000
```
