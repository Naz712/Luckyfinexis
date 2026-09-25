# finexis production tracker

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
| `src/lib/elite.ts` | finexis Elite: the scheme's tiers (new-FC tiers too, shown one at a time) and qualifying period, read from the catalogue. |
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
worked out from commission at the FA's band, and the detail sheet marks it
ESTIMATED), `wape_ytd`
(WAPE as finexis weights it; only a Custom goal reads it, and says when the
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
  a progress arc (confirmed, with pending, target, and a key under it), a
  verdict pill, "What it takes from here" (per month, per week, at your
  current rate), a pending strip, the other aim under it (the finexis Elite
  card under an MDRT goal, MDRT's two routes under an Elite goal, both under a
  custom goal), and "This year" rows (commission, gross revenue, premium,
  Elite credits).
- **Detail sheet** — slides up from a "This year" row, on that row's tab
  (Commission, Revenue, Premium, Elite; switching tabs changes everything
  below). A summary (confirmed, pending, then the goal bar with the gap and
  what is needed each month; for premium, the MDRT premium route and the
  year's average; for Elite, the tiers one at a time), month by month as bars or a running
  total (pending hatched in gold, the needed months dashed), the selected
  month's four figures, all months, and the cases since the tracker's launch
  (`TRACKER_LAUNCH` in `src/mock/data.ts`, a placeholder) by month, secured
  or pending, five to a page, each with the client's initials (the FC and
  their manager both see them). The sample's cases are made up to add up to
  the import; the server does not send cases yet.
- **Goals** — three aims: ① MDRT / COT / TOT on commission or premium, ② an
  Elite tier, ③ a custom goal on commission, gross revenue or WAPE with a
  cadence. ("Final Sprint" on the business's whiteboard is the name for this
  last-quarter push the whole app serves, not a goal of its own.) One at a time: a
  distance card, a projection chart (confirmed line, run rate, the pace that
  reaches the goal), and the chosen aim's settings.
- **Calculator** — for the final sprint: what a case brings in by 31 Dec, at
  the FC's own band only (no band switch). A card lists the plans with an
  insurer incentive running now, by provider, each with how many run and when
  they end and a link to its circular (or the circular's name until the file
  is attached). Then per policy, numbered steps: ① **Choose the plan**: a card
  with the insurer, the type of plan and the MDRT category, opening a picker
  with a search box and filters for the provider and the type of plan (term,
  critical illness, whole life, investment, universal life, savings and
  income, health; Singlife greyed out until its schedule comes); the premium
  type as a segmented control where there is a choice, and the premium term
  with − and +, which lands on the schedule row that covers it ("20" → "10 to
  24 years"; a term the schedule doesn't list says so). ② **Enter the
  premium**: how the client pays (a lump sum for the year, half-yearly,
  quarterly or monthly) and one payment as they pay it, the first coming in
  this month; switching converts the amount and keeps the year's premium.
  "For your client" shows the insurer's customer campaign where there is one
  (a cashback worked out on the premium, a discount, passes). **Riders**,
  optional: the rider groups the schedule lists for the plan, each with its
  own premium (paid the plan's way) and term. ③ **What you earn**: to the FC
  by 31 Dec by the firm's payout formula (commission and uplifts on the
  payments made by then, cash incentives in full), per payment and over a
  full year when paid in instalments, the plan and each rider, where that
  premium goes (the FC's share, the firm's, what stays with the insurer), and
  the insurer incentives on it, one panel each: whether this case qualifies
  (or what it is short of, the next tier up, a yes/no the FC ticks, or trip
  credits only), what the FC earns, the rest of the quarter where a tier
  depends on it, and the circular. Under the policies: **What it adds to your
  goals** (MDRT commission and premium credit on what is paid by 31 Dec,
  Elite credits as the first-year GR, marked * as assuming a yearly premium;
  the aim set in Goals, so far and with this case, the clients like this
  still needed, and the other aim under it as on Home), "Add another
  policy", and a pinned total to the FC by 31 Dec.

  **MDRT in the Calculator.** MDRT counts the schedule's commission alone;
  insurer incentives, uplifts included, are left out. It counts only what the
  client pays inside the production year (Jan to Dec): a lump sum or a single
  premium counts in full, monthly from this month counts this month to
  December (in September, 4 of 12), and the rest falls in the next year.
  Riders are paid with their plan. The goal maths uses the part that counts
  this year.

  **Circulars.** An incentive or client reward with `circular` in the
  catalogue shows "Read the circular": a URL, or a path published next to the
  page (the public sample points at `public/sample-circular.html`, made up).
- **Team** (a manager's team view) — the team's commission (the FCs', not the
  manager's own), on-track count, MDRT qualified, one row per FC with
  commission, MDRT progress and Elite credits, tap for their Home read-only,
  and a note on the latest import. The Calculator beside it shows the
  policies' figures without anyone's goal card.

## finexis Elite

Elite is the firm's own MDRT-style scheme, with a trip as the prize, tracked
apart from MDRT. Credits are first-year gross revenue (FYGR), counted afresh
each qualifying year; FCs whose RNF is recent qualify at lower tiers. The
tiers show one at a time: the lowest first, the next once it is reached. The FA's credits come from the import
(`elite_credits_ytd`); the Calculator estimates a case's credits the same way.
Insurer cash incentives don't count toward Elite.
The tiers, the new-FC tiers and the qualifying period are in the catalogue's
`elite` block: the confidential file carries the real scheme, the public build
made-up sample tiers.

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
made-up sample catalogue instead (its insurers are "Insurer A" to "C").
Details in `src/private/README.md`.

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

The app's date is pinned to 6 Sep 2026 so the sample reads the same every day.
For a copy to use for real, build with `VITE_REAL_DATE=1 npm run share`: it
takes the phone's own date, so pace and the incentives running follow the
calendar.

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
