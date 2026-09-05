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
| `src/mock/data.ts` | All mock tables. Section 1 holds every `PLACEHOLDER` reference value; Section 2 holds fake advisors, cases and goals. |
| `src/lib/calc.ts` | Pure calculations: `commissionForCase`, `metricsForCase`, `aggregate`, `pace`, `clientsNeeded`, period helpers, MDRT tiers. |
| `src/lib/format.ts` | Display formatting only (`S$12,345`, no decimals). |
| `src/screens/` | One file per bottom tab. Screens read only through `calc.ts` and `data.ts`. |
| `src/components/ui.tsx` | Small shared pieces (card, select, money input, segmented control). |

The "dev: FC / manager" pill in the header only renders in `npm run dev`. It
switches the current user between a financial consultant and their manager so
the manager-only Team tab can be checked.

## Status

- [x] Data layer and calculations
- [x] Calculator
- [x] Home / dashboard
- [x] Log a case
- [ ] Team (manager only)
- [ ] Lucky draw placeholder
