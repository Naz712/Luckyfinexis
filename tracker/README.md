# Finexis production tracker

Mobile-first React + Vite + TypeScript + Tailwind. Four tabs (Home, Goals,
Calculator, and Team for managers) plus an assistant. The data is the firm's
monthly production import: each FA's year-to-date commission, premium, MDRT
credit and Elite credits, as of each month end. Without a server the app shows
a bundled sample of that import. With the small server in `server/` and an
individual link, an FA sees their own rows and nothing else.

```bash
cd tracker
npm install
npm run dev        # http://localhost:5173, on the sample import
npm run api        # the server: the import, per-FA links, the assistant (see server/README.md)
npm run build      # typecheck + production build into dist/
```

## Where things live

| Path | What |
| --- | --- |
| `src/mock/data.ts` | Reference data (the broad product types, bandings, MDRT thresholds and floors) and the sample import rows. `PLACEHOLDER` marks values the business must supply. |
| `src/lib/importer.ts` | The import: the CSV parser, rows → advisers, rows → monthly production entries, rows visible to one FA. |
| `src/lib/calc.ts` | Pure calculations: entries → metrics, the two MDRT routes and the Risk-Protection floor, pace, series, goals. |
| `src/lib/format.ts` | Display formatting only (`S$12,345`, no decimals). |
| `src/lib/api.ts` | The server client: where it is, the signed-in FA, `/me` and `/ask`. |
| `src/lib/policies.ts`, `src/mock/policies.sample.ts` | The policy catalogue: types, pay options and term ranges, the quote (gross revenue, incentives, the FC's share, MDRT and Elite credit, later years), and the public made-up sample. |
| `src/lib/elite.ts` | Finexis Elite: the scheme's tiers (new-FC tiers too) and qualifying period, read from the catalogue. |
| `src/lib/aims.ts` | The aims beyond MDRT (an Elite tier, a custom goal) as figures, shared by Home, Goals and the Calculator. |
| `src/lib/privateRates.ts`, `src/private/` | Confidential schedules, incentives, payout formula and bandings, loaded from gitignored files when present. |
| `src/lib/ask.ts`, `src/components/Ask.tsx` | The assistant: its tools over the FA's own production, the stand-in keyword router, and the sheet, which also holds Connect and sign-in. |
| `src/screens/` | Home, Goals (+ editor), Calculator, Team. Screens read only through `calc.ts`. |
| `src/components/` | Small shared pieces (card, select, money input, segmented control), the SVG column chart, the bottom sheet, the slide-up page. |
| `server/` | Node 22, no dependencies: the import store, per-FA links, `/me`, `/ask`. Holds the keys. |
| `public/sample-import.csv` | The sample import as a file: exactly the columns the backend expects. |

A manager has two views, never mixed: the team (Team and the Calculator, with
none of the manager's own figures) and their own numbers (Home, Goals,
Calculator, as any FC). A signed-in manager opens on the team and switches
with "My numbers" / "My team". In the stand-in, the "Manager view" pill opens
the sample manager's team view and "FC view" returns to the sample FC.

## The data: a monthly production import

One CSV, one row per FA per month end, year-to-date figures:

```
fc_code, name, banding, manager_fc_code, as_of,
commission_ytd, gr_ytd, premium_ytd, wape_ytd,
mdrt_commission_ytd, mdrt_commission_risk_ytd, mdrt_premium_ytd, mdrt_premium_risk_ytd,
pending_commission, pending_premium, elite_credits_ytd, rnf_date
```

`fc_code`, `name`, `banding`, `as_of` and the three headline figures are
required. Optional: `gr_ytd` (first-year gross revenue; without it GR is
worked out from commission at the FA's band, and Home says so), `wape_ytd`
(WAPE as Finexis weights it; only a Custom goal reads it, and says when the
import has none) and `rnf_date` (a date or just the year), which marks new
FCs, who qualify for Elite at lower tiers. When the MDRT columns are missing, MDRT credit is taken as the
headline figure, all of it from Risk-Protection products; pending defaults to
0. Figures may carry `S$` and commas. Year-to-date resets each January.

The app turns each month into production entries (the difference from the
month before, split into a Risk-Protection entry and an Other Products entry
for MDRT's floor rule, plus one pending entry for the latest month). Every
screen and the assistant read those entries, so Home's hero, Goals, the
Calculator's "how far this gets you" and Team all agree with the import.

**How it gets in.** The admin loads it on the server, never an FA in the app:

```bash
cd tracker/server
npm run import -- path/to/production.csv                          # local server
node import.mjs path/to/production.csv https://<your-server>      # hosted server
```

A bad file is rejected whole, with line numbers. Without any import the server
serves the sample. On Render's free plan an uploaded file lives in memory until
the next deploy, so re-import after deploying (or set `IMPORT_FILE` on a disk).

## Sign-in: one link per FA

The server issues each FA an individual link: the app's address plus their FC
code and a key derived from `LINK_SECRET`. Opening it once signs that phone in
and drops the key from the address bar; from then on `/me` returns that FA's own
rows only (a manager also gets their team's). The admin gets every link with:

```bash
npm run links                                   # local: prints fc_code,name,link
node import.mjs --links https://<your-server>   # hosted
```

Changing `LINK_SECRET` invalidates every link. Typing a link in by hand is
possible in the assistant sheet under "Server and sign-in". Real single sign-on
with the firm's existing accounts (Microsoft Entra ID or Google Workspace) is
part of the deployment choice, written up separately.

## Screens

- **Home** — a blue hero that answers "am I on pace for the goal I set?" for
  whichever aim Goals has (with a Commission / Premium route switch for MDRT),
  a progress arc (confirmed, pending, target), a verdict pill, "What it takes
  from here" (per month, per week, at your current rate), a pending strip, the
  other MDRT route as one card, the Finexis Elite card with the distance to
  every tier, and "This year" rows (commission, gross revenue, premium, Elite
  credits). Each row opens its own page, sliding up: where it stands against
  any goal, a month-by-month chart, and every month's full figures.
- **Goals** — three aims: ① MDRT / COT / TOT on commission or premium, ② an
  Elite tier, ③ a custom goal on commission, gross revenue or WAPE with a
  cadence. ("Final Sprint" on the business's whiteboard is the name for this
  last-quarter push the whole app serves, not a goal of its own.) One at a time: a
  distance card, a projection chart (confirmed line, run rate, the pace that
  reaches the goal), and the chosen aim's settings.
- **Calculator** — band strip in the header; at the top, every insurer
  incentive running today (opens in place; tapping a plan adds it), and
  plans carrying one are tagged "· incentive" in the product dropdown; one
  card per policy, filled in
  the business's order: company and product dropdowns (Singlife greyed out
  until its schedule comes; riders are not products of their own: "Add a
  rider" on a plan offers the riders the schedule lists for it, on the plan's
  term, and Future First's riders go into its own premium at its rates), premium type where there is a choice (regular or
  limited pay, single premium, a plan), the annual premium and the premium
  term typed in years. The typed term lands on the schedule row that covers it ("20" →
  "10 to 24 years"); a term the schedule doesn't list says so. Each card then
  shows ① commission (the schedule's year-1 rate, to the FC by the firm's
  payout formula), ② insurer incentives running that day (commission uplifts,
  APE-based cash, cash on sales; tiers not reached yet and trip credits as
  notes), ③ MDRT commission and premium credit and ④ Elite credits (first-year
  GR × the product's multiplier, then the distance left to the next tier).
  "Full breakdown" opens under the card: each incentive's conditions, the
  later policy years and the schedule's fine print. "Your quarter so far"
  takes the rest of the quarter where a tier depends on it. A pinned total per
  client and "How far this gets you" against whichever aim Goals has (MDRT
  credit leaves cash incentives out), with the clients like this that reach
  each Elite tier.
- **Team** (a manager's team view) — the team's commission (the FCs', not the
  manager's own), on-track count, MDRT qualified, one row per FC with
  commission, MDRT progress and Elite credits, tap for their Home read-only,
  and a note on the latest import. The Calculator beside it shows the
  policies' figures without anyone's goal card.

## Finexis Elite

Elite is the firm's own MDRT-style scheme, with a trip as the prize, tracked
apart from MDRT. Credits are first-year gross revenue times each product's
Elite multiplier, counted afresh each qualifying year; FCs whose RNF is recent
qualify at lower tiers. The FA's credits come from the import
(`elite_credits_ytd`); the Calculator estimates a case's credits the same way.
Insurer cash incentives don't count toward Elite.
The tiers, the new-FC tiers and the qualifying period are in the catalogue's
`elite` block: the confidential file carries the real scheme, the public build
made-up sample tiers. Every product counts at the default multiplier (1×) until
the per-product multipliers are supplied (`multipliers_confirmed`).

## How MDRT is modelled

From "Membership Information for the 2027 Million Dollar Round Table" (MDRT,
Global edition dated 14 Mar 2026), Singapore row, entered 14 Sep 2026
(`MDRT_THRESHOLDS_CONFIRMED` is true):

- **Two routes.** Commission (first-year commission credit) and premium
  (first-year premium credit, 6% for single premium). MDRT's income route is
  not tracked by the firm and is left out.
- **The Risk-Protection floor.** Each product carries MDRT's category: life,
  ILPs, endowments, CI and disability are Risk-Protection; hospital plans are
  Other Products. Other Products credit counts only once Risk-Protection credit
  reaches half the entry-level MDRT requirement (`mdrt_floors`; the same floor
  applies to COT and TOT). Until then `RouteCredit.locked` holds the credit
  MDRT is not counting, and Home, Goals and the Calculator say so. The import's
  `*_risk_ytd` columns carry the split.
- **Not modelled.** Regular endowments of 15 years or less get only 6% premium
  credit (a term rule, not a product rule); the 5% cap on business written on
  the advisor's own family; replacements; group business.

## Confidential rates

The insurers' schedules and incentive circulars, the firm's payout formula
(FC earnings = share × (banding rate − deduction) × gross revenue) and the
banding table stay out of the repo. They live in `src/private/`
(gitignored): `policies.local.json` for the policy catalogue and payout
formula, `rates.local.json` for bandings. The app applies them at build
time. `npm run dev` and `npm run share` on a machine that has them use the
real figures; the public GitHub Pages build never has them and shows a
made-up sample catalogue instead. The Calculator's footnote says which is in
use. Details in `src/private/README.md`.

What the catalogue covers today: HSBC Life's remuneration schedule of 7 Sep
2026 (regular and single premium plans, universal life, and rider groups)
and FWD's schedule of July 2026 (plans open to new business), with the Q3
2026 incentives from both insurers' circulars. Left out: products with no
commission, riders that follow the basic plan's rate, group (EB) products,
trailer commissions, and FWD products the schedule marks withdrawn.

## Ask: the assistant

The speech-bubble button in every header opens "Ask about your book". It is
restricted by construction: every figure comes from tools in `src/lib/ask.ts`
that run in the app over the signed-in FA's own entries (pace, what one more
case would do, goals, Elite credits, production month by month, and the team
for a manager). With the server connected the question goes to the model with
the tool definitions; tool calls come back, run here, and the results go back
for the answer card. Without a server, a keyword router understands the
suggested kinds of question. Anything else comes back as "Not in the app". The
sheet also holds Connect (server address, access code) and sign-in.

## Light and dark

The app follows the phone's appearance setting. Colours are theme tokens in
`src/index.css`: `brand` is the solid blue surfaces and stays the same in both
themes; `accent` is emphasis on a card and lightens in dark mode; the surfaces
and neutrals all flip. Screens never hard-code a colour.

## Sharing a build

`npm run share` typechecks, builds, and inlines everything into
`dist/finexis-tracker.html`, a single file that opens from a phone or an email
attachment without a server. If `src/private/rates.local.json` is present it
carries the confidential rates, so treat the file accordingly.

## Trying it on a phone

Every push to the tracker branch runs `.github/workflows/tracker-pages.yml`,
which publishes the app to https://naz712.github.io/Luckyfinexis/ on the sample
import. Add it to the home screen and it installs with its own icon.

For real data: run the server on Render with the blueprint at the repo root
(`render.yaml`; enter the OpenAI key, an access code, an admin code and a link
secret when it asks), import the CSV, generate the links, and send each FA
their own. Their phone then shows their production, and the assistant runs
through the server's key. The free plan sleeps after fifteen idle minutes and
takes about half a minute to wake.

## Parked

Meeting Pack (a spoken recap, whiteboard photo or notes PDF turned into a
client report through a speech-to-text and report model) was built and then
taken out of scope. The last commit that carries it is 9d0072f.
