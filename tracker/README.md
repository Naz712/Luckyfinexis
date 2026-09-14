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

- **Sign in** — each consultant signs in with their email or FC code and lands on
  their own pages; the manager's account adds the Team tab. The password is a
  placeholder shared by every demo account (listed on the sign-in page) until
  real authentication exists. Who is signed in is remembered on the device;
  everything else resets on reload.
- **Home** — a blue hero that answers "am I on pace for the goal I set?": the aim
  from Goals (MDRT/COT/TOT 2027 or your own commission goal), a Commission /
  Premium route switch, a progress arc (confirmed, pending, target), a verdict
  pill, then "What it takes from here" (per month, per week, cases at your
  average), a pending strip, the other route, and "This year" metric rows that
  expand in place. Tapping a case opens a detail sheet.
- **Goals** — one aim at a time (MDRT, COT, TOT or Custom), a distance card with
  both qualifying routes, a projection chart (confirmed line, run rate, the pace
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

## Placeholders to replace before go-live

All in Section 1 of `src/mock/data.ts`: insurers, products and their `comm_rate`,
banding rates, typical premiums, credit rates, MDRT thresholds (labelled for 2027
membership because 2026 production counts toward it; the Singapore values are
still the 2026-chart figures until the 2027 row is entered and
`MDRT_THRESHOLDS_CONFIRMED` flipped), and each metric's period type. `TODAY` is
pinned for stable demos.

## Trying it on a phone

Every push to the tracker branch (or main) runs `.github/workflows/tracker-pages.yml`,
which builds the app and publishes it to GitHub Pages at
https://naz712.github.io/Luckyfinexis/ (Pages must be switched to "GitHub Actions"
once in the repository settings). Open that link on a phone and add it to the home
screen: it installs with its own icon, opens full screen, and keeps working without
a connection thanks to a small service worker. Sign in with any demo account.

The same build can be wrapped as a native app later (Capacitor for iOS and Android)
once there is a backend to sign in against; that needs a Mac and developer accounts
for TestFlight and Play testing.
