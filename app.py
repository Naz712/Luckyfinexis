"""Campaign Mastersheet Importer.

Streamlit app that imports the marketing mastersheet (wide: one row per
client, one column per qualifying activity) into the Supabase pass ledger
(long: one row per award).

Flow: upload -> pick draw month -> validate (read-only) -> preview
(read-only) -> explicit Confirm -> batched idempotent import -> run log.

Credentials come from .streamlit/secrets.toml (see secrets.toml.example).
The service_role key is read once from st.secrets and passed straight to the
Supabase client — it is never logged, displayed, or written anywhere.
"""
from __future__ import annotations

import hashlib

import pandas as pd
import streamlit as st

from importer.core import RunLog, build_plan, execute_plan, validate_file
from importer.models import SEV_ERROR, ImporterError
from importer.parsing import read_upload

st.set_page_config(page_title="Campaign Mastersheet Importer", page_icon="🎟️", layout="wide")
st.title("🎟️ Campaign Mastersheet Importer")


# --------------------------------------------------------------------------
# Connection (service_role key: st.secrets only — never hardcoded, never shown)
# --------------------------------------------------------------------------

def _get_secrets() -> tuple[str | None, str | None]:
    try:
        section = st.secrets["supabase"]
        return section["url"], section["service_role_key"]
    except Exception:
        return None, None


SUPABASE_URL, _SERVICE_KEY = _get_secrets()
if not SUPABASE_URL or not _SERVICE_KEY or "PASTE" in _SERVICE_KEY:
    st.error(
        "Supabase credentials are not configured.\n\n"
        "Copy `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml` and fill in "
        "`service_role_key`. The key stays on the server — it is never displayed or logged. "
        "(The anon key cannot be used: all RLS policies are SELECT-only, so it cannot write.)"
    )
    st.stop()


@st.cache_resource(show_spinner=False)
def _db(url: str, _key: str):
    from importer.db import create_supabase_database

    return create_supabase_database(url, _key)


@st.cache_data(ttl=120, show_spinner="Loading reference data from Supabase…")
def _reference(url: str, _key: str):
    return _db(url, _key).load_reference()


with st.sidebar:
    if st.button("↻ Refresh reference data"):
        _reference.clear()

try:
    ref = _reference(SUPABASE_URL, _SERVICE_KEY)
    db = _db(SUPABASE_URL, _SERVICE_KEY)
except ImporterError as exc:
    st.error(str(exc))
    st.stop()
except Exception as exc:
    st.error(f"Could not load reference data from Supabase: {exc}")
    st.stop()

if ref.campaign is None:
    st.error(
        "No active campaign found in the campaigns table. "
        "Activate a campaign, then press “Refresh reference data”."
    )
    st.stop()
if not ref.challenge_types:
    st.error("No active challenge types configured — nothing can be awarded.")
    st.stop()

with st.sidebar:
    st.subheader("Active campaign")
    st.write(f"**{ref.campaign.name}**")
    if ref.campaign.start_date and ref.campaign.end_date:
        st.caption(f"{ref.campaign.start_date} → {ref.campaign.end_date}")
    st.caption(f"{len(ref.advisors_by_email)} advisors on file")
    st.subheader("Challenge types (from database)")
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "CSV column": ct.csv_column,
                    "Code": ct.code,
                    "Pass": ct.pass_type,
                    "Passes/unit": ct.passes_per_unit,
                }
                for ct in ref.challenge_types
            ]
        ),
        hide_index=True,
        use_container_width=True,
    )
    st.caption(
        "Column names and rates are read from challenge_types. "
        "If marketing renames a column, update that table — not this app."
    )

# --------------------------------------------------------------------------
# 1 · Upload
# --------------------------------------------------------------------------
st.subheader("1 · Upload")
uploaded = st.file_uploader(
    "Campaign mastersheet (.csv or .xlsx)",
    type=["csv", "xlsx"],
    help="Wide format: one row per client, one column per qualifying activity (unit counts).",
)

# --------------------------------------------------------------------------
# 2 · Draw selection
# --------------------------------------------------------------------------
st.subheader("2 · Draw month")
months = ref.months()
if not months:
    st.error("The active campaign has no draws configured — nothing to import into.")
    st.stop()
month = st.selectbox(
    "This file contains results for draw month:",
    months,
    format_func=lambda m: f"{m} — draw date {ref.month_date(m) or 'unknown'}",
)
if any(d.is_drawn for d in ref.draws if d.monthly_draw == month):
    st.warning(f"The {month} draw has already been drawn — importing will add passes after the fact.")

if uploaded is None:
    st.info("Upload the mastersheet to continue. Nothing is written until you press Confirm.")
    st.stop()

file_bytes = uploaded.getvalue()
df, parse_error = read_upload(uploaded.name, file_bytes)
if parse_error:
    st.error(parse_error)
    st.stop()

# --------------------------------------------------------------------------
# 3 · Validate (read-only — nothing is written here)
# --------------------------------------------------------------------------
st.subheader("3 · Validation")
report = validate_file(df, ref, month)
if report.fatal:
    for msg in report.fatal:
        st.error(msg)
    st.stop()
if report.unexpected_columns:
    st.warning("Ignoring unexpected column(s): " + ", ".join(report.unexpected_columns))

ok_n, warn_n, err_n = len(report.ok_rows), len(report.warning_rows), len(report.error_rows)
c1, c2, c3 = st.columns(3)
c1.metric("Rows OK", ok_n)
c2.metric("Warnings", warn_n)
c3.metric("Errors", err_n)
st.caption(f"{ok_n} rows OK, {warn_n} warnings, {err_n} errors — row numbers match the spreadsheet (header = row 1).")

prize_only = [r for r in report.error_rows if not r.blocked]
if prize_only:
    st.caption(
        f"{len(prize_only)} of the {err_n} error rows have prize-only errors: "
        "their passes still import, only the prize is skipped."
    )

problem_records = [
    {
        "Row": r.row_num,
        "Status": r.status + (" (prize only)" if r.status == SEV_ERROR and not r.blocked else ""),
        "Client": r.client_email or r.client_name or "—",
        "Severity": issue.severity,
        "Problem": issue.message,
    }
    for r in report.rows
    for issue in r.issues
]
if problem_records:
    st.dataframe(pd.DataFrame(problem_records), hide_index=True, use_container_width=True)
else:
    st.success("No problems found.")

# --------------------------------------------------------------------------
# 4 · Preview (read-only — queries the DB, writes nothing)
# --------------------------------------------------------------------------
st.subheader("4 · Preview")
try:
    plan = build_plan(report, ref, db)
except ImporterError as exc:
    st.error(str(exc))
    st.stop()
except Exception as exc:
    st.error(f"Could not build the import preview: {exc}")
    st.stop()

st.markdown(
    f"- Will **create {len(plan.clients_create)} clients** and "
    f"**update {len(plan.clients_update)} clients**\n"
    f"- Will **insert {len(plan.ledger_new_refs)} pass_ledger rows**"
    + (
        f" ({len(plan.ledger_existing_refs)} already present — updated in place, no double award)"
        if plan.ledger_existing_refs
        else ""
    )
    + f"\n- Will **insert {len(plan.prizes_new)} prizes**"
    + (f" ({len(plan.prizes_existing)} already present — skipped)" if plan.prizes_existing else "")
    + f"\n- Will **skip {len(plan.skipped_rows)} rows** with errors"
    + (f" and **{len(plan.prize_skips)} prize cells** (passes still import)" if plan.prize_skips else "")
)

if plan.rows_importable == 0:
    st.error("Every row has errors — there is nothing to import.")
    st.stop()

st.caption("Nothing has been written yet. The import runs only when you press Confirm.")
file_token = hashlib.sha256(file_bytes).hexdigest()[:12] + ":" + month
if st.session_state.get("imported_token") == file_token:
    st.info(
        "This exact file and draw month were already imported in this session. "
        "Confirming again is safe — the import is idempotent and will update rows in place."
    )

confirm = st.button(f"✅ Confirm import into {month}", type="primary")

# --------------------------------------------------------------------------
# 5 · Import (the only place writes happen)
# --------------------------------------------------------------------------
if confirm:
    log = RunLog()
    log.add(f"File: {uploaded.name} (sha256 {hashlib.sha256(file_bytes).hexdigest()[:12]}, {len(report.rows)} data rows)")
    log.add(f"Target: campaign '{ref.campaign.name}', draw month {month}")
    bar = st.progress(0.0, text="Starting…")

    def _progress(done: int, total: int, label: str) -> None:
        bar.progress(min(done / max(total, 1), 1.0), text=label)

    try:
        summary = execute_plan(db, ref, plan, log, _progress)
    except Exception as exc:
        log.add(f"IMPORT FAILED: {exc}")
        st.session_state["last_summary"] = None
        st.session_state["last_log"] = log.text()
        st.error(f"Import failed — see the run log below. ({exc})")
    else:
        bar.progress(1.0, text="Done")
        st.session_state["imported_token"] = file_token
        st.session_state["last_summary"] = summary.as_text()
        st.session_state["last_log"] = log.text()

if st.session_state.get("last_summary"):
    st.subheader("5 · Result")
    st.success("Import finished.")
    st.text(st.session_state["last_summary"])

# --------------------------------------------------------------------------
# 6 · Run log (copyable)
# --------------------------------------------------------------------------
if st.session_state.get("last_log"):
    st.subheader("6 · Run log")
    st.code(st.session_state["last_log"], language="text")
    st.download_button(
        "Download run log",
        data=st.session_state["last_log"],
        file_name="import_run_log.txt",
        mime="text/plain",
    )
