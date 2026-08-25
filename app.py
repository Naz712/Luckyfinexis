"""Campaign Mastersheet Importer.

Streamlit app that imports the marketing mastersheet (wide: one row per
client, one column per qualifying activity) into the Supabase pass ledger
(long: one row per award).

Flow: log in -> pick draw month -> upload -> validate (read-only) -> preview
(read-only) -> explicit Confirm -> batched idempotent import -> run log.

The UI implements the Claude Design project (Login.dc.html / Home.dc.html):
white topbar with an Upload/Validate/Confirm stepper, a light left panel with
the active campaign and pass-rate card, and a clean main column.

Credentials come from .streamlit/secrets.toml (see secrets.toml.example).
The service_role key is read once from st.secrets and passed straight to the
Supabase client — it is never logged, displayed, or written anywhere.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import time

import pandas as pd
import streamlit as st

import ui
from importer.core import RunLog, build_plan, execute_plan, validate_file
from importer.models import SEV_ERROR, ImporterError
from importer.parsing import read_upload

st.set_page_config(page_title="Lucky Draw Sheet Importer", page_icon="🎟️", layout="wide")
st.markdown(ui.FONT_LINKS, unsafe_allow_html=True)
st.markdown(ui.GLOBAL_CSS, unsafe_allow_html=True)

# --------------------------------------------------------------------------
# Login screen (Login.dc.html): dotted backdrop, centred hero, white card,
# and the tilted mastersheet + gold/blue lucky-draw pass illustrations.
# --------------------------------------------------------------------------

_LOGIN_CSS = """
<style>
  .stApp {
    background-color: #F3F5FA;
    background-image: radial-gradient(#DCE0EE 1px, transparent 1px);
    background-size: 26px 26px;
  }
  [data-testid="stForm"] {
    background: #FFFFFF;
    border: 1px solid #E8EBF5;
    border-radius: 16px;
    padding: 1.5rem 1.5rem 1.3rem;
    box-shadow: 0 24px 48px rgba(30, 58, 159, 0.10);
    max-width: 460px;
    margin: 0 auto;
    position: relative; z-index: 1;
  }
  [data-testid="stForm"] .stTextInput input { background: #FFFFFF; }
  [data-testid="stForm"] .stFormSubmitButton button {
    width: 100%;
    background: #1E3A9F; color: #FFFFFF;
    border: none; border-radius: 10px;
    font-weight: 600; padding: 0.62rem 0;
  }
  [data-testid="stForm"] .stFormSubmitButton button:hover { background: #16307F; color: #FFFFFF; }
  [data-testid="stAlertContainer"], .stAlert { max-width: 460px; margin: 0.6rem auto 0; }
  .login-hero { position: relative; z-index: 1; text-align: center; margin: 2.2rem 0 1.4rem; }
  .login-hero .app-icon {
    width: 56px; height: 56px; margin: 0 auto 1rem;
    background: #1E3A9F; border-radius: 15px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 10px 22px rgba(30, 58, 159, 0.35);
  }
  .login-hero .app-icon span {
    width: 24px; height: 17px; border: 3px solid #FFFFFF; border-radius: 5px; display: block;
  }
  .login-hero .login-title {
    font-size: 1.75rem; font-weight: 700; color: #171C3F; margin: 0; line-height: 1.2;
  }
  .login-hero .login-sub { color: #8A90A8; margin: 0.35rem 0 0; font-size: 0.95rem; }
  .login-note {
    text-align: center; color: #9AA0B5; font-size: 0.86rem;
    margin-top: 1.1rem; position: relative; z-index: 1;
  }
  .login-decor { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
  .decor-sheet {
    position: absolute; top: 42px; left: 4%; width: 330px;
    background: #FFFFFF; border-radius: 12px; transform: rotate(-7deg);
    box-shadow: 0 20px 40px rgba(30, 58, 159, 0.14); overflow: hidden;
  }
  .decor-sheet .sheet-head {
    background: #1E3A9F; height: 34px; display: flex; align-items: center;
    gap: 6px; padding: 0 12px;
  }
  .decor-sheet .sheet-head i {
    width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.55);
  }
  .decor-sheet .sheet-head b { color: #FFFFFF; font-size: 12px; margin-left: 6px; font-weight: 600; }
  .decor-sheet .sheet-cols, .decor-sheet .sheet-row {
    display: grid; grid-template-columns: 34px 1fr 1fr 1fr; align-items: center;
  }
  .decor-sheet .sheet-cols { background: #EFF2F9; color: #9AA0B5; font-size: 11px; }
  .decor-sheet .sheet-cols span { padding: 5px 8px; text-align: center; }
  .decor-sheet .sheet-row { border-top: 1px solid #EFF1F7; }
  .decor-sheet .rn { color: #9AA0B5; font-size: 11px; text-align: center; padding: 10px 0; }
  .decor-sheet .cell { padding: 10px 8px; }
  .decor-sheet .bar { display: block; height: 8px; border-radius: 4px; background: #D9DDEA; }
  .decor-sheet .bar.gold { background: #E9CE7F; }
  .decor-sheet .cell.sel { outline: 2px solid #2743B0; outline-offset: -2px; border-radius: 3px; }
  .ticket {
    position: absolute; width: 272px; height: 112px; border-radius: 14px;
    color: #FFFFFF; display: flex; overflow: hidden;
    box-shadow: 0 18px 36px rgba(23, 28, 63, 0.22);
  }
  .ticket .main { flex: 1; padding: 16px 12px 12px 18px; position: relative; }
  .ticket .star { position: absolute; right: 6px; top: -14px; font-size: 90px; opacity: 0.22; }
  .ticket .kicker { font-size: 10px; letter-spacing: 2.5px; font-weight: 700; opacity: 0.75; }
  .ticket .name { font-size: 24px; font-weight: 800; letter-spacing: 1px; margin-top: 2px; }
  .ticket .num { font-size: 11px; opacity: 0.8; margin-top: 10px; }
  .ticket .stub {
    width: 54px; border-left: 2px dashed rgba(255,255,255,0.75);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 18px;
  }
  .ticket.gold {
    background: linear-gradient(135deg, #DDAC2E, #C6961B);
    bottom: 7%; left: 4%; transform: rotate(-9deg);
  }
  .ticket.blue {
    background: linear-gradient(135deg, #2E4BC6, #1B3390);
    top: 46%; right: 3%; transform: rotate(8deg);
  }
  .sparkle { position: absolute; }
  @media (max-width: 1100px) { .decor-sheet, .ticket, .sparkle { display: none; } }
</style>
"""

_LOGIN_DECOR = """
<div class="login-decor">
  <div class="decor-sheet">
    <div class="sheet-head"><i></i><i></i><i></i><b>mastersheet_july.csv</b></div>
    <div class="sheet-cols"><span></span><span>A</span><span>B</span><span>C</span></div>
    <div class="sheet-row"><span class="rn">1</span><span class="cell"><span class="bar" style="width:82%"></span></span><span class="cell"><span class="bar" style="width:65%"></span></span><span class="cell"><span class="bar" style="width:74%"></span></span></div>
    <div class="sheet-row"><span class="rn">2</span><span class="cell"><span class="bar" style="width:70%"></span></span><span class="cell sel"><span class="bar" style="width:85%"></span></span><span class="cell"><span class="bar gold" style="width:60%"></span></span></div>
    <div class="sheet-row"><span class="rn">3</span><span class="cell"><span class="bar" style="width:76%"></span></span><span class="cell"><span class="bar" style="width:58%"></span></span><span class="cell"><span class="bar" style="width:68%"></span></span></div>
    <div class="sheet-row"><span class="rn">4</span><span class="cell"><span class="bar" style="width:64%"></span></span><span class="cell"><span class="bar" style="width:72%"></span></span><span class="cell"><span class="bar" style="width:52%"></span></span></div>
  </div>
  <div class="ticket gold">
    <div class="main">
      <span class="star">★</span>
      <div class="kicker">LUCKY DRAW</div>
      <div class="name">GOLD PASS</div>
      <div class="num">№ 000318</div>
    </div>
    <div class="stub">×2</div>
  </div>
  <div class="ticket blue">
    <div class="main">
      <span class="star">★</span>
      <div class="kicker">LUCKY DRAW</div>
      <div class="name">BLUE PASS</div>
      <div class="num">№ 002471</div>
    </div>
    <div class="stub">×1</div>
  </div>
  <span class="sparkle" style="top:11%; left:42%; color:#E3C04A; font-size:16px;">◆</span>
  <span class="sparkle" style="top:16%; right:12%; color:#E9CE7F; font-size:22px;">✦</span>
  <span class="sparkle" style="top:35%; right:28%; color:#AAB6E8; font-size:11px;">●</span>
  <span class="sparkle" style="top:42%; left:8%; color:#3D55B8; font-size:14px;">✦</span>
  <span class="sparkle" style="top:34%; right:7%; color:#4C63C4; font-size:18px;">✦</span>
  <span class="sparkle" style="bottom:24%; left:24%; color:#D9B23C; font-size:12px;">●</span>
  <span class="sparkle" style="bottom:38%; left:30%; color:#E3C04A; font-size:14px;">✦</span>
  <span class="sparkle" style="bottom:18%; right:20%; color:#8C9BD9; font-size:12px;">◆</span>
</div>
"""

_LOGIN_HERO = """
<div class="login-hero">
  <div class="app-icon"><span></span></div>
  <div class="login-title">Lucky Draw Sheet Importer</div>
  <p class="login-sub">admin access</p>
</div>
"""


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


# --------------------------------------------------------------------------
# Login — simple shared password from st.secrets. Fails closed when no
# password is configured.
# --------------------------------------------------------------------------

def _require_login() -> None:
    try:
        expected = st.secrets["auth"]["password"]
    except Exception:
        expected = None
    if not expected or "CHOOSE" in str(expected):
        st.error(
            "Login is not configured.\n\n"
            "Add an `[auth]` section with a `password` to `.streamlit/secrets.toml` "
            "(see `.streamlit/secrets.toml.example`). The app refuses to run without one."
        )
        st.stop()
    if st.session_state.get("authenticated"):
        return
    st.markdown(_LOGIN_CSS, unsafe_allow_html=True)
    st.markdown(_LOGIN_DECOR, unsafe_allow_html=True)
    st.markdown(_LOGIN_HERO, unsafe_allow_html=True)
    with st.form("login"):
        entered = st.text_input("Password", type="password", placeholder="Enter admin password")
        submitted = st.form_submit_button("Log in", type="primary", use_container_width=True)
    if submitted:
        if hmac.compare_digest(str(entered), str(expected)):
            st.session_state["authenticated"] = True
            st.rerun()
        time.sleep(1)  # slow down password guessing
        st.error("Wrong password.")
    st.markdown(
        '<p class="login-note">Shared admin password. The database key never leaves the server.</p>',
        unsafe_allow_html=True,
    )
    st.stop()


_require_login()

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

months = ref.months()
if not months:
    st.error("The active campaign has no draws configured — nothing to import into.")
    st.stop()


def _file_token(data: bytes, month: str | None) -> str:
    return hashlib.sha256(data).hexdigest()[:12] + ":" + str(month)


# --------------------------------------------------------------------------
# Topbar with the Upload / Validate / Confirm stepper
# --------------------------------------------------------------------------
_prev_file = st.session_state.get("uploader")
_prev_month = st.session_state.get("month")
if _prev_file is None:
    _done, _active = 0, 0
elif st.session_state.get("imported_token") == _file_token(_prev_file.getvalue(), _prev_month):
    _done, _active = 2, 2
else:
    _done, _active = 1, 1

with st.container(key="topbar"):
    c1, c2, c3 = st.columns([0.30, 0.40, 0.30], vertical_alignment="center")
    c1.markdown(ui.brand_html(), unsafe_allow_html=True)
    c2.markdown(ui.stepper_html(_done, _active), unsafe_allow_html=True)
    m1, m2 = c3.columns([0.72, 0.28], vertical_alignment="center")
    m1.markdown(
        f'<div class="topbar-meta">{len(ref.advisors_by_email)} advisors on file</div>',
        unsafe_allow_html=True,
    )
    with m2:
        if st.button("Log out", key="logout_btn"):
            st.session_state.clear()
            st.rerun()

# --------------------------------------------------------------------------
# Left panel: active campaign + pass rates (all read from the database)
# --------------------------------------------------------------------------
with st.sidebar:
    st.markdown(ui.sidebar_html(ref), unsafe_allow_html=True)
    st.markdown("")
    if st.button("↻ Refresh reference data", key="refresh_btn"):
        _reference.clear()
        st.rerun()

# --------------------------------------------------------------------------
# Main column
# --------------------------------------------------------------------------
st.title("File checked — ready to review" if _prev_file is not None else "Import a mastersheet")

month = st.pills(
    "Which draw month is this file for?",
    months,
    default=months[0],
    selection_mode="single",
    key="month",
)
if month is None:
    st.info("Pick a draw month to continue.")
    st.stop()
st.markdown(
    f'<span class="muted-note">Everything in the file is stamped with {month}&rsquo;s draws.</span>',
    unsafe_allow_html=True,
)
if any(d.is_drawn for d in ref.draws if d.monthly_draw == month):
    st.warning(f"The {month} draw has already been drawn — importing will add passes after the fact.")

uploaded = st.file_uploader(
    "Campaign mastersheet",
    type=["csv", "xlsx"],
    key="uploader",
    label_visibility="collapsed",
)
if uploaded is None:
    st.markdown(ui.dropzone_title_css(month), unsafe_allow_html=True)
    st.stop()

# a file is loaded — compact the dropzone into a "replace file" strip
st.markdown(
    """
    <style>
      [data-testid="stFileUploaderDropzone"] { padding: 12px 20px; flex-direction: row; }
      [data-testid="stFileUploaderDropzoneInstructions"]::before { display: none; }
      [data-testid="stFileUploaderDropzoneInstructions"]::after {
        content: "Drop a replacement file here, or"; font-size: 13px; font-weight: 500; color: #8A8FA3;
      }
      [data-testid="stFileUploaderDropzone"]::after { content: ""; }
    </style>
    """,
    unsafe_allow_html=True,
)

file_bytes = uploaded.getvalue()
df, parse_error = read_upload(uploaded.name, file_bytes)
if parse_error:
    st.error(parse_error)
    st.stop()

# ---- validate (read-only — nothing is written here) ----------------------
report = validate_file(df, ref, month)
if report.fatal:
    for msg in report.fatal:
        st.error(msg)
    st.stop()
if report.unexpected_columns:
    st.warning("Ignoring unexpected column(s): " + ", ".join(report.unexpected_columns))

try:
    plan = build_plan(report, ref, db)
except ImporterError as exc:
    st.error(str(exc))
    st.stop()
except Exception as exc:
    st.error(f"Could not build the import preview: {exc}")
    st.stop()

st.markdown(ui.file_card_html(uploaded.name, len(file_bytes), month), unsafe_allow_html=True)

flagged_rows = len(report.warning_rows) + len(report.error_rows)
passes_planned = sum(e.units * e.rate_applied for e in plan.ledger_entries)
st.markdown(
    ui.stat_cards_html(
        rows=len(report.rows),
        passes=passes_planned,
        clean=len(report.ok_rows),
        flagged=flagged_rows,
    ),
    unsafe_allow_html=True,
)

# ---- top issues + full per-row list --------------------------------------

def _issue_kind(message: str) -> str:
    """Collapse concrete values so identical problems group together."""
    kind = re.sub(r"'[^']*'", "…", message)
    kind = re.sub(r"\b\d+\b", "N", kind)
    return re.sub(r"\s+", " ", kind).strip()


_groups: dict[tuple[str, str], set[int]] = {}
for r in report.rows:
    for issue in r.issues:
        _groups.setdefault((issue.severity, _issue_kind(issue.message)), set()).add(r.row_num)
top_issues = sorted(
    ((sev, kind, len(rows_)) for (sev, kind), rows_ in _groups.items()),
    key=lambda t: (-t[2], t[0]),
)[:4]
st.markdown(ui.top_issues_html(top_issues), unsafe_allow_html=True)

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
prize_only = [r for r in report.error_rows if not r.blocked]
if problem_records:
    with st.expander(f"All flagged rows ({flagged_rows}) — row numbers match the spreadsheet (header = row 1)"):
        if prize_only:
            st.caption(
                f"{len(prize_only)} error row(s) are prize-only: their passes still import, "
                "only the prize is skipped."
            )
        st.dataframe(pd.DataFrame(problem_records), hide_index=True, use_container_width=True)
else:
    st.success("No problems found — every row is clean.")

# ---- preview (read-only) --------------------------------------------------
st.subheader("Preview")
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

st.markdown(
    '<span class="muted-note">Nothing has been written yet. '
    "The import runs only when you press Confirm.</span>",
    unsafe_allow_html=True,
)
file_token = _file_token(file_bytes, month)
if st.session_state.get("imported_token") == file_token:
    st.info(
        "This exact file and draw month were already imported in this session. "
        "Confirming again is safe — the import is idempotent and will update rows in place."
    )

confirm = st.button(f"Confirm import into {month} →", type="primary")

# --------------------------------------------------------------------------
# Import (the only place writes happen)
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
    st.subheader("Result")
    st.success("Import finished.")
    st.text(st.session_state["last_summary"])

if st.session_state.get("last_log"):
    st.subheader("Run log")
    st.code(st.session_state["last_log"], language="text")
    st.download_button(
        "Download run log",
        data=st.session_state["last_log"],
        file_name="import_run_log.txt",
        mime="text/plain",
    )
