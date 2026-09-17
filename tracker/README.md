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
| `src/screens/packs/` | The Meeting Pack tab: `Packs.tsx` (container, both pipelines), `PacksHome`, `NewPack` (real capture), `PackReport`, `CheckNumbers`, `AttachmentViewer`. |
| `src/lib/packsApi.ts` | The app's client for the pipeline server: where it is (build-time default, the Connect box, or `?api=`), the calls, and the media helpers (downscale, base64, recorder format). |
| `src/lib/ask.ts`, `src/components/Ask.tsx` | The assistant: its tools over the advisor's own book (ranked clients, quiet clients, one client, pace, what-if, pending, recent), the stand-in keyword router, and the sheet that renders the answer card. |
| `server/` | The pipeline server: holds the keys, transcribes the recap (Valsea), writes and reworks the report and runs the assistant's model turns (OpenAI), drops the audio. Node 22, no dependencies. `.env` is gitignored. |
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

## Meeting Pack: the real pipeline and the stand-in

The screens under `src/screens/packs/` follow the Claude Design handoff
(`design_handoff_meeting_pack`). The tab runs in one of two modes, shown and
changed at the bottom of the New pack screen ("Pipeline · …"):

- **Stand-in** (no server connected). The four tiles add sample inputs,
  "Make report" ticks through them on a timer and opens the sample report,
  "Rework all" animates without changing content. This is what the GitHub
  Pages link does out of the box.
- **Live** (server connected). "Record recap" records with the microphone,
  "Take photo" opens the camera, "Attach PDF" picks a file, "Type a few lines"
  takes text. "Make report" sends them to `server/`, which has Valsea
  transcribe the recap and drops the audio, then has OpenAI read the photo and
  the PDF and write the report as strict JSON, with the figures to confirm.
  The report renders exactly as the sample does, with the phone's own photo
  and PDF as the attachments and the crops. "Rework all" sends the flagged
  cards' notes and swaps in the revised cards. Approval is still in memory
  only, and "Share as PDF" is still a notice: there is no store yet.

### Running the real pipeline

The keys live in `server/.env`, which is gitignored. The app never sees them,
and they never appear in the repo, in logs or on screen; the server only
reports service and model names.

1. `cp server/.env.example server/.env` and fill in `VALSEA_API_KEY`,
   `VALSEA_BASE_URL` and `VALSEA_MODEL` from the Valsea dashboard, and
   `OPENAI_API_KEY`. Leave the Valsea lines blank to have OpenAI transcribe
   as well (`TRANSCRIBE_MODEL`).
2. `npm run api` (Node 22 or newer; nothing to install). It prints what is
   configured. `npm run api:mock` runs it with canned answers and no keys,
   which is enough to try the whole flow.
3. On the laptop: `npm run dev`, open http://localhost:5173, Packs → New pack
   → Connect → `http://localhost:8787`. The microphone works here because
   localhost counts as a secure context.
4. On a phone on the same Wi-Fi: `npm run dev -- --host`, open
   `http://<laptop-ip>:5173` on the phone, connect to
   `http://<laptop-ip>:8787`. Camera, PDF and typed lines work. The
   microphone does not over plain HTTP (browsers insist on HTTPS), so
   "Record recap" offers to pick a recording from the phone's voice memo app
   instead.
5. For the microphone on the phone, or to use the GitHub Pages link: set
   `ACCESS_CODE` in `.env`, restart the server, expose it over HTTPS with a
   tunnel (`cloudflared tunnel --url http://localhost:8787` or
   `ngrok http 8787`), then open
   `https://naz712.github.io/Luckyfinexis/?api=https://<tunnel-host>&code=<access code>`
   once on the phone. The setting sticks; Change and Disconnect are on the
   New pack screen.

`VITE_PACKS_API=http://…` at build time bakes a default server into a build.
The server accepts calls from localhost, private-LAN addresses and the Pages
origin (`ALLOW_ORIGINS` adds more), and only with the access code when one is
set.

### What happens to the data

- Nothing is written to disk. The recap audio exists in the server process
  only until Valsea returns the transcript; the response carries the time it
  was dropped, and the report shows it in the small print.
- The photo and the PDF go to OpenAI for the one report call and stay on the
  phone as the report's attachments and crops. The server keeps nothing
  between requests.
- What Valsea and OpenAI retain is governed by their own terms; check both
  before using this with a real client's meeting.

Model choices: `OPENAI_MODEL` defaults to `gpt-4.1`; `gpt-5` works and is
slower. `REPORT_PROVIDER=claude` with `ANTHROPIC_API_KEY` writes the report
with Claude (`CLAUDE_MODEL`, default `claude-opus-5`) with server-side refusal
fallbacks on by default (`CLAUDE_FALLBACKS=off` to turn them off). The Claude
path is written to the API docs but has not been run here; the OpenAI path
is the one to start with.

## Ask: the assistant

The speech-bubble button in every header opens "Ask about your book", a
bottom sheet that answers questions about this advisor's own data: best
clients, clients gone quiet, one client's cases, pace against the MDRT aim,
what one more case would do, pending and recent cases. It is restricted by
construction: every figure comes from the tools in `src/lib/ask.ts`, which
run inside the app over the same in-memory cases and the same `calc.ts` the
screens use. The model never receives the book; it receives the question,
decides which tools to call, and phrases what they return. Anything the
tools cannot answer comes back as "Not in the app".

- **With the pipeline server connected** (same server as Meeting Pack, `POST
  /ask`), the question goes to OpenAI with the tool definitions; the tool
  calls come back to the app, run here, and their results go back for the
  answer card. Follow-up questions keep the last few turns.
- **Without a server**, a keyword router in `ask.ts` understands the
  suggested kinds of question (best, quiet, what-if with an amount, pace,
  pending, recent, a client by name) and shows the tool's result directly.
  This is what the GitHub Pages link does.

"Contact" means the last case logged; the app has no call or meeting log
yet, and the answer says so. What-ifs assume the case is confirmed on the
date given (today when none), at the advisor's band, with the product's
placeholder revenue rate, like the Calculator.

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
