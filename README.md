# Daily Games

A daily deduction game with a murder-mystery theme (working title). Reconstruct who was where and when on a drawn floor plan, then accuse the killer. A solver guarantees every case has exactly one solution, so guessing doesn't pay.

## Structure

- `site/` – the playable game, published to GitHub Pages on every push to `main`
- `.github/workflows/pages.yml` – the deploy workflow
- `engine/` – rules, validation and solver (plain JavaScript, no dependencies)
- `cases/` – cases as JSON
- `scripts/solve.js` – checks a case: `npm run solve cases/001-the-stopped-clock.json`
- `test/` – `npm test`

## Run locally

Open `site/index.html` in a browser, or serve the folder:

```bash
python3 -m http.server -d site 8000
```
