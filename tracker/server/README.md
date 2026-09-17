# Meeting Pack pipeline server

Holds the API keys and does the three things the app cannot do on its own:
transcribe the recap (Valsea), write the report from the transcript, photo
and notes (OpenAI, as strict JSON), and rework flagged cards. Node 22 or
newer, no dependencies.

    cp .env.example .env      # fill in the keys; .env is gitignored
    npm start                 # http://localhost:8787
    PACKS_MOCK=1 npm start    # canned answers, no keys

Routes: `GET /health`, `POST /packs/make`, `POST /packs/rework`. The app side
is `../src/lib/packsApi.ts`. Setup on a laptop, a phone and through a tunnel
is in `../README.md` under "Running the real pipeline".
