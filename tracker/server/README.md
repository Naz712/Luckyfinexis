# Finexis tracker assistant server

Holds the OpenAI key and runs one model turn per question for the app's
assistant (the Ask sheet): the conversation so far and the app's tool
definitions go in, and back comes either the tool calls to run or the
answer card. The tools themselves run in the app, over the consultant's
own records; only their results pass through here on the way to the model.
It also holds the firm's monthly production import and hands each FA their
own rows. Node 22 or newer, no dependencies.

    cp .env.example .env      # fill in the key; .env is gitignored
    npm start                 # http://localhost:8787
    npm run mock              # canned answers, no key

Routes: `GET /` (a hint for anyone who opens the address in a browser),
`GET /health` (what is configured: service and model name, never the key,
and what the import holds), `POST /ask` (one model turn: `messages` and
`tools` in, the assistant's `message` out), `GET /me` (the signed-in FA's
rows), `POST /admin/import` and `GET /admin/links` (below). Setup for a
phone, through the Render blueprint at the repo root or a tunnel, is in
`../README.md`.

## The production import

One CSV a month, with the columns `fc_code, name, banding, manager_fc_code,
as_of, commission_ytd, premium_ytd, mdrt_commission_ytd,
mdrt_commission_risk_ytd, mdrt_premium_ytd, mdrt_premium_risk_ytd,
pending_commission, pending_premium, elite_credits_ytd` (one row per FA per
month end; `../public/sample-import.csv` is the shape). Set `ADMIN_CODE` in
`.env`, then:

    npm run import -- path/to/file.csv                                  # to this machine's server
    node import.mjs path/to/file.csv https://finexis-packs-api.onrender.com   # to the hosted one
    npm run links                                                       # every FA's individual link, as CSV

A file with any bad line is rejected as a whole (the reply names each line)
and the previous import stays. `npm run links` is how each FA gets in: the
link carries their FC code and a key derived from `LINK_SECRET`, and the
server only ever sends an FA their own rows (a manager also gets their
team's). Until a real file is uploaded the sample is served.

On Render's free plan the uploaded file lives in memory until the next
deploy, so re-import after deploying (or set `IMPORT_FILE` to a path on a
Render disk).
