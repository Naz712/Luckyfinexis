# Private reference data

The insurers' commission schedules, their incentive circulars, the firm's
payout formula and the banding table are confidential. They never go in the
repo, and the public GitHub Pages build never carries them. Everything in
this folder except this README and `rates.example.json` is gitignored.

Three files can live here:

- **`policies.local.json`**: the policy catalogue the Calculator and the
  assistant's what-ifs read. Each policy lists its schedule rows (premium
  term ranges, plans, MIPs, premium charges) with the commission rate by
  policy year (riders name the plans they attach to), and the incentives
  running on top of it (commission uplifts,
  APE-based cash rewards, trip credits), each with an optional `circular`
  link. It also carries the insurers' customer campaigns (`client_rewards`:
  cashbacks, discounts, passes), the payout formula
  (`fc_formula`: FC earnings = share × (banding rate − deduction) × gross
  revenue), the companies the Calculator lists (`insurers`) and the finexis
  Elite scheme (`elite`: tiers, new-FC tiers, qualifying period). The shape is the `Catalogue` type in `src/lib/policies.ts`;
  `src/mock/policies.sample.ts` is a made-up example of it. Without this
  file the app uses that sample.
- **`team.local.json`**: the team sheet, written by
  `node scripts/team-sheet.mjs sheet.csv [as-of date]`: each FC's name, email,
  managers, banding and year-to-date progress, with passwords as SHA-256
  hashes. When present, the app signs people in and shows these figures
  instead of the sample.
- **`rates.local.json`**: optional overrides for the banding table and the
  older product placeholders, shaped like `rates.example.json`.

Both are applied at build time, so:

- `npm run dev` on a machine that has them uses the real figures.
- `npm run share` bakes them into `dist/finexis-tracker.html`, a single file
  to send privately. Treat that file as confidential.
- The GitHub Actions build for the public site has neither file, so the site
  shows the sample (insurers "Insurer A" to "C").

When the rates move to the hosted database (Supabase), this folder goes away:
the catalogue becomes a protected table read after sign-in.
