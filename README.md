# Luckyfinexis
Lucky Draw Pass Book Feature

## Campaign Mastersheet Importer

Streamlit app that imports the marketing campaign mastersheet into Supabase.
Marketing maintains a **wide** CSV — one row per client, one column per
qualifying activity, each cell a **unit count** (a 2 in "Attend Client Events"
means two events attended). The database stores a **long** ledger — one row
per award. The importer unpivots, awarding `units × passes_per_unit` passes
per activity.

### Setup

```bash
pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
# edit .streamlit/secrets.toml and paste the service_role key
streamlit run app.py
```

The service_role key is read from `st.secrets` only. It is never hardcoded,
never logged, and never shown in the UI. `.streamlit/secrets.toml` is
gitignored — do not commit it. The anon key cannot be used: all RLS policies
are SELECT-only, so it cannot write.

The app is gated behind a simple shared login password, also set in
`secrets.toml` (`[auth] password`). It fails closed: with no password
configured (or the placeholder still in place) the app refuses to run.

### How an import works

1. **Upload** a `.csv` or `.xlsx` mastersheet. It can hold one month or the
   whole campaign — each row's `Monthly Draw` cell says which draw its passes
   go to (gold activities to the gold draw, blue to the blue draw).
2. **Draw month fallback** — only if some rows leave `Monthly Draw` blank or
   misspell it does the app ask which draw those rows should go to,
   pre-selecting the month the rest of the file (or its filename) suggests.
   Rows that name their own month keep it. The app stops if no campaign is
   active.
3. **Validate** (read-only): per-row report — unknown FC emails, wrong
   domain, FC code mismatches, blank names/emails, non-numeric or negative
   counts, suspected typos (> 20 units), duplicate client emails per advisor,
   totals checksum (recomputed from units × rate — the sheet's Total columns
   are never trusted), and prize/month conflicts. Errors block only their own
   row; one bad row never stops the file.
4. **Preview** (read-only): "X rows OK, Y warnings, Z errors", every problem
   row with its row number and reason, and exactly what will be written.
5. **Confirm** — only now does anything write. Clients are upserted on
   `(advisor_id, lower(client_email))`, ledger rows on `external_ref`
   (`{month}:{client_email}:{challenge_code}` — deterministic, so re-importing
   the same file updates in place instead of double-awarding), prizes on
   `(client_id, draw_id, prize_won)` with duplicates ignored. Batched, with a
   progress bar.
6. A copyable **run log** records everything, including every skipped row and
   the reason.

### Month rules

A row's passes go to the month in its own `Monthly Draw` cell. A blank or
unrecognised value ("Augst") falls back to the file-level month chosen in the
app, with a warning; with no fallback chosen, such rows are errors. When a
sheet has such rows the app shows, in order: a red block stating how many
rows have no month, the draw months to pick from (nothing pre-selected; the
likely month is suggested underneath), and once one is clicked a green line
saying where those rows went and whether they are clean. Because
the ledger key includes the month, one running mastersheet can be re-uploaded
whenever it changes: rows already imported update in place, new rows are
added, nothing double-awards.

Prizes are stricter: a prize is only recorded against the month the row
itself names — never the fallback, never fuzzy-matched. An unknown month or a
blank month with `Prize Won` filled rejects **the prize only**; the row's
pass ledger entries still import.

### Column mapping and rates live in the database

The activity-column-to-challenge-code mapping and the pass rates are **not**
hardcoded. They are read from `challenge_types` (`csv_column` = header to look
for, `code` = value stored, `passes_per_unit` = rate). If marketing renames a
column or changes a rate, update that table — no code change. The unpivot
itself is in `importer/core.py` (`unpivot_row`, clearly commented).

### Layout

```
app.py                       Streamlit UI (the only file that touches st.*)
importer/models.py           dataclasses: reference data, row reports, plans
importer/parsing.py          csv/xlsx reading (BOM, blank rows, empty files)
importer/core.py             validation, the unpivot, planning, execution
importer/db.py               Supabase access layer (all writes are upserts)
tests/seed.py                reference data mirroring the Supabase tables
tests/fake_db.py             in-memory DB enforcing the same unique constraints
tests/run_demo.py            offline verification harness (see below)
scripts/generate_test_files.py  regenerates the two test mastersheets
```

### Test files

- `atw_mastersheet_sample.csv` — 32 rows; imports cleanly except three rows
  for `siti.rahmah@finexis.com.sg`, a deliberate unknown FC that must be
  rejected and reported.
- `atw_mastersheet_messy.csv` — the same rows with ten planted faults
  (unknown FC, mismatched total, blank name, "N/A" count, formatted mobile,
  duplicate email, negative count, a 99, padded name, misspelled draw month).

### Verifying without touching the database

```bash
python tests/run_demo.py
```

runs the full validate → preview → import pipeline against an in-memory fake
that enforces the same unique constraints as Supabase, seeded from
`tests/seed.py`: both test files, a double-import idempotency proof, and the
empty/header-only/BOM/xlsx edge cases. It exits non-zero if any check fails.
