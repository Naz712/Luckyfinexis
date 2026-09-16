# Finexis production tracker — clickable mockup

Mobile-first React + Vite + TypeScript + Tailwind mockup. No backend, no auth,
no persistence: everything lives in memory and resets on reload.

```bash
cd tracker
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

## Where things live

| Path | What |
| --- | --- |
| `src/mock/packs.ts` | Meeting Pack sample data: packs, inputs, numbers to confirm, report content per pack. |
| `src/mock/data.ts` | All mock tables. Section 1 holds every `PLACEHOLDER` reference value; Section 2 holds fake advisors, cases and goals; Section 3 mirrors the lucky-draw tables the importer writes (challenge types, draws, clients, pass ledger, prizes). |
| `src/lib/calc.ts` | Pure calculations: `commissionForCase`, `metricsForCase`, `aggregate`, `pace`, `clientsNeeded`, period helpers, MDRT tiers. |
| `src/lib/format.ts` | Display formatting only (`S$12,345`, no decimals). |
| `src/screens/` | One file per bottom tab (Home, Goals + GoalsEditor, Calculator, Log, Team, Draw). Screens read only through `calc.ts` and `data.ts`. |
| `src/components/ui.tsx` | Small shared pieces (card, select, money input, segmented control). |
| `src/components/BarChart.tsx` | Dependency-free SVG column chart used by the Home progress card. |

The "dev: FC / manager" pill in the header only renders in `npm run dev`. It
switches the current user between a financial consultant and their manager so
the manager-only Team tab can be checked.

## Sharing a build

`npm run share` typechecks, builds with the FC/manager switch enabled, and inlines
everything into `dist/finexis-tracker.html`, a single file that opens from a
phone or an email attachment without a server.

## Screens

- **Home** — a blue hero that answers "am I on pace for the goal I set?": the aim
  from Goals (MDRT/COT/TOT 2027 or your own commission goal), a Commission /
  Premium / Income route switch, a progress arc (confirmed, pending, target), a verdict
  pill, then "What it takes from here" (per month, per week, cases at your
  average), a pending strip, the other routes, and "This year" metric rows that
  expand in place. Tapping a case opens a detail sheet.
- **Goals** — one aim at a time (MDRT, COT, TOT or Custom), a distance card with
  all three qualifying routes, a projection chart (confirmed line, run rate, the pace
  that reaches the goal), custom targets edited in place with a cadence
  (year/half/quarter/month), and a list of every metric's goal.
- **Calculator** — band strip in the header, product cards opened from a product
  picker sheet (search by product, insurer or category), typical premium and
  estimated gross revenue pre-filled, a pinned total per client, and "How far this
  gets you" against the one goal set in Goals with a what-if figure.
- **Log** — client search against existing clients, the product picker sheet, an
  amount and term, a live "What this case adds" preview and the list of cases
  waiting on Merlin.
- **Clients** — the draw in view heads the screen ("September draw · Current", with
  past draws one tap away and their totals), then a searchable client list ordered
  recently-viewed first with gold and blue pass tickets per client. A client's page
  pushes in with Call, Email and Case actions, pass cards for this draw and the
  campaign, the prize if they won, a dated "How they earned it" timeline, and their
  plans. Case opens Log with the client's name filled in.
- **Packs** — Meeting Pack. After a consultation the FC drops in a voice recap, a
  photo of the whiteboard, a fact-find PDF or a few typed lines; a stand-in
  pipeline turns them into one report they go through with the client. A
  dashboard of packs (draft / approved), New pack with a processing state,
  the report (source markers on every card, simple bars, tap-a-card notes with
  red flags and "Rework all", a consultant-only "Just for you" card, attachment
  viewer), and Check numbers, where each extracted figure is confirmed against
  a crop of its original before the pack can be approved. Only the recording is
  deleted; photos and PDFs stay attached. "Log the term case" hands off to Log
  with client, product and premium prefilled.

## Placeholders to replace before go-live

All in Section 1 of `src/mock/data.ts`: insurers, products and their `comm_rate`,
banding rates, typical premiums, credit rates, and each metric's period type.
The MDRT thresholds are no longer placeholders: they are the Singapore row of
MDRT's 2027 membership chart (2026 production), entered on 14 Sep 2026, and
`MDRT_THRESHOLDS_CONFIRMED` is true. `TODAY` is pinned for stable demos.

## How MDRT is modelled

From "Membership Information for the 2027 Million Dollar Round Table" (MDRT,
Global edition dated 14 Mar 2026):

- **Three routes.** Commission (first-year commission credit), premium
  (first-year premium credit, 6% for single premium and money into funds) and
  income (first-year commission from this year's cases plus renewals, trails
  and other production income, held per advisor in `income_other_ytd` as a
  placeholder). Thresholds for all three are in `metric_thresholds`.
- **The Risk-Protection floor.** Each product carries MDRT's category
  (`mdrt_category`): life, ILPs, endowments, annuities, CI and disability are
  Risk-Protection; hospital plans, funds, portfolios and advice fees are Other
  Products. On the commission and premium routes, Other Products credit counts
  only once Risk-Protection credit reaches half the entry-level MDRT
  requirement (`mdrt_floors`; the same floor applies to COT and TOT). Until
  then `RouteCredit.locked` holds the credit MDRT is not counting, and Home,
  Goals and the Calculator say so.
- **Income minimums.** The income route also needs USD 46,000 (SGD 37,750) of
  new-business income and the same from Risk-Protection products; a route
  with an unmet minimum is never "closest" or "reached".
- **Not modelled.** Regular endowments of 15 years or less get only 6% premium
  credit (a term rule, not a product rule); the 5% cap on business written on
  the advisor's own family; replacements; group business.

## Meeting Pack: what is real and what is a stand-in

The screens under `src/screens/packs/` follow the Claude Design handoff
(`design_handoff_meeting_pack`). What runs today is the flow, not the
pipeline: "Make report" ticks through the inputs on a timer and opens the
sample report; "Rework all" shows the reworking and reworked states without
changing content; "Share as PDF" is a notice. The real version needs a small
backend that holds the speech-to-text and report-model keys, runs extract,
compose and rework, deletes the recording once transcribed, and stores the
approved report and its attachments. Nothing about the screens has to change
for that; `Packs.tsx` is the one place the stand-ins live.

## Light and dark

The app follows the phone's appearance setting. Colours are theme tokens in
`src/index.css`: `brand` is the solid blue surfaces (hero, blue cards, primary
buttons) and stays the same in both themes; `accent` is emphasis on a card and
lightens in dark mode; `surface`, `canvas`, `line`, `ink`, `body`, `muted` and
the small neutrals (`faint`, `hairline`, `dim`, `well`, `grid`, `dash`) all
flip. Screens never hard-code a colour, so a new theme is a token block.

## Trying it on a phone

Every push to the tracker branch (or main) runs `.github/workflows/tracker-pages.yml`,
which builds the app and publishes it to GitHub Pages at
https://naz712.github.io/Luckyfinexis/ (Pages must be switched to "GitHub Actions"
once in the repository settings). Open that link on a phone and add it to the home
screen: it installs with its own icon, opens full screen, and keeps working without
a connection thanks to a small service worker. The "Manager view" pill switches to the manager so the Team tab can be reviewed.

The same build can be wrapped as a native app later (Capacitor for iOS and Android)
once there is a backend and real sign-in; that needs a Mac and developer accounts
for TestFlight and Play testing.
