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

- **Home** — this period's metrics as tiles (tap one for the cases behind it) and a
  progress card charting commission per week or per month, with a verdict against
  the previous period and a streak.
- **Goals** — switch between MDRT, COT, TOT and a custom goal; a distance card with
  pace and weeks left; "Edit goals" sets the amount and cadence (year, half,
  quarter, month) per metric.
- **Calculator** — gross revenue × banding per product, total per client, clients
  needed to close the goal. Premium can estimate gross revenue via the product's
  placeholder rate.
- **Log** — record a closed case as pending until Merlin confirms it.
- **Team** (manager only) — each FC's commission, goal, MDRT route and pace, with a
  read-only drill-down.
- **Clients** — every client with their plans and Around The World passes for the
  selected draw month (gold and blue, broken down by how they were earned), with a
  prominent "passes as of" cut-off and prize wins.

## Placeholders to replace before go-live

All in Section 1 of `src/mock/data.ts`: insurers, products and their `comm_rate`,
banding rates, credit rates, MDRT thresholds (2026 membership figures; confirm the
2027 chart), and each metric's period type. `TODAY` is pinned for stable demos.
