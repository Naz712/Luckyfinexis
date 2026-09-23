# Private reference data

The insurers' commission schedules, their incentive circulars, the firm's
payout formula and the banding table are confidential. They never go in the
repo, and the public GitHub Pages build never carries them. Everything in
this folder except this README and `rates.example.json` is gitignored.

Two files can live here:

- **`policies.local.json`**: the policy catalogue the Calculator's dropdowns
  and the assistant's what-ifs read. Each policy lists its options (premium
  term, plan, MIP, premium charge) with the commission rate by policy year,
  and the incentives running on top of it (commission uplifts, APE-based cash
  rewards, trip credits). It also carries the payout formula
  (`fc_formula`: FC earnings = share × (banding rate − deduction) × gross
  revenue). The shape is the `Catalogue` type in `src/lib/policies.ts`;
  `src/mock/policies.sample.ts` is a made-up example of it. Without this
  file the app uses that sample.
- **`rates.local.json`**: optional overrides for the banding table and the
  older product placeholders, shaped like `rates.example.json`.

Both are applied at build time, so:

- `npm run dev` on a machine that has them uses the real figures.
- `npm run share` bakes them into `dist/finexis-tracker.html`, a single file
  to send privately. Treat that file as confidential.
- The GitHub Actions build for the public site has neither file, so the site
  shows the sample. The Calculator's footnote says which is in use.

When the rates move to the hosted database (Supabase), this folder goes away:
the catalogue becomes a protected table read after sign-in.
