# Private reference data

The product panel's real commission rates, credit rates, Elite credit rates
and banding table are confidential. They do not go in the repo, and the
public GitHub Pages build never carries them.

Put them in `rates.local.json` in this folder, shaped like
`rates.example.json`. The app loads that file when it is present (see
`src/lib/privateRates.ts`), so:

- `npm run dev` on your laptop uses the real figures.
- `npm run share` bakes them into `dist/finexis-tracker.html`, a single file
  you can send privately. Treat that file as confidential.
- The GitHub Actions build for the public site has no such file, so the site
  keeps the placeholders. The footer of the Calculator says which is in use.

Only the keys you include are overridden; everything else keeps its
placeholder. Product ids are the ones in `src/mock/data.ts`.
