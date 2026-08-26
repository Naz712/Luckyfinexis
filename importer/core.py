"""Validation, planning and execution for the mastersheet import.

Nothing in this module talks to Streamlit, and nothing writes to the database
except execute_plan(). validate_file() and build_plan() are strictly read-only.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime

import pandas as pd

from importer.models import (
    FileReport,
    ImportPlan,
    ImportSummary,
    ImporterError,
    LedgerEntry,
    PrizeAward,
    PrizeItem,
    ReferenceData,
    RowReport,
    SCOPE_PRIZE,
    SEV_ERROR,
    PASS_BLUE,
    PASS_GOLD,
)

# Columns every mastersheet must carry, besides one column per active
# challenge type (those come from challenge_types.csv_column — never hardcoded).
FIXED_COLUMNS = [
    "FC Email",
    "FC Code",
    "Client Name",
    "Client Mobile",
    "Client Email",
    "Total Gold Passes",
    "Total Blue Passes",
    "Monthly Draw",
    "Prize Won",
    "Pass Type",
    "Date Updated",
]

ADVISOR_DOMAIN = "@finexis.com.sg"
UNIT_TYPO_THRESHOLD = 20  # unit counts above this are flagged as suspected typos

WRITE_CHUNK = 200  # rows per batched upsert


def expected_columns(ref: ReferenceData) -> list[str]:
    return FIXED_COLUMNS + [ct.csv_column for ct in ref.challenge_types]


# ---------------------------------------------------------------------------
# Cell helpers
# ---------------------------------------------------------------------------

def raw_text(v) -> str:
    """Cell as text WITHOUT trimming (needed to detect padded values)."""
    if v is None:
        return ""
    if isinstance(v, float):
        if math.isnan(v):
            return ""
        if v.is_integer():
            return str(int(v))
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return str(v)


def text(v) -> str:
    return raw_text(v).strip()


def parse_units(v) -> tuple[int | None, str | None]:
    """Parse an activity cell into a non-negative int. Blank counts as 0.
    Returns (value, None) or (None, reason)."""
    t = text(v)
    if t == "":
        return 0, None
    try:
        f = float(t)
    except ValueError:
        return None, "is not a number"
    if not f.is_integer():
        return None, "is not a whole number"
    n = int(f)
    if n < 0:
        return None, "is negative"
    return n, None


_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d %b %Y", "%d-%b-%Y", "%d %B %Y")


def parse_date_cell(v) -> tuple[date | None, str | None]:
    """Returns (date, None), (None, 'empty') or (None, 'unparseable')."""
    if isinstance(v, datetime):
        return v.date(), None
    if isinstance(v, date):
        return v, None
    t = text(v)
    if t == "":
        return None, "empty"
    token = t.split("T")[0].split(" ")[0]
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(token, fmt).date(), None
        except ValueError:
            continue
    return None, "unparseable"


def normalize_mobile(v) -> tuple[str, list[str]]:
    """Strip formatting from a mobile number; report what was changed."""
    original = text(v)
    digits = re.sub(r"\D", "", original)
    if len(digits) == 10 and digits.startswith("65"):
        digits = digits[2:]  # drop the +65 country code
    notes: list[str] = []
    if original and digits != original:
        notes.append(f"Client Mobile reformatted from '{original}' to '{digits}'")
    if digits and (len(digits) != 8 or digits[0] not in "689"):
        notes.append(f"Client Mobile '{original}' does not look like an 8-digit Singapore number")
    return digits, notes


# ---------------------------------------------------------------------------
# Validation (read-only — writes nothing)
# ---------------------------------------------------------------------------

def validate_file(df: pd.DataFrame, ref: ReferenceData, selected_month: str) -> FileReport:
    report = FileReport(selected_month=selected_month)

    headers = [str(c).replace("\ufeff", "").strip() for c in df.columns]
    df = df.copy()
    df.columns = headers

    expected = expected_columns(ref)
    missing = [c for c in expected if c not in headers]
    report.unexpected_columns = [c for c in headers if c not in expected]
    if missing:
        report.fatal.append(
            "Missing expected column(s): " + ", ".join(missing)
            + ". Expected columns are: " + ", ".join(expected)
        )
        return report  # cannot trust per-row validation without the columns

    gold_types = [ct for ct in ref.challenge_types if ct.pass_type == PASS_GOLD]
    blue_types = [ct for ct in ref.challenge_types if ct.pass_type == PASS_BLUE]

    # first occurrence of each (advisor, client email), for duplicate detection
    seen_emails: dict[tuple[str, str], int] = {}

    for idx in df.index:
        r = df.loc[idx]
        rep = RowReport(row_num=int(idx) + 2)  # header is spreadsheet row 1

        # --- advisor ------------------------------------------------------
        rep.fc_email = text(r["FC Email"]).lower()
        rep.fc_code = text(r["FC Code"])
        if rep.fc_email == "":
            rep.add_error("FC Email is empty")
        else:
            rep.advisor = ref.advisors_by_email.get(rep.fc_email)
            if rep.advisor is None:
                rep.add_error(f"FC Email '{rep.fc_email}' not found in advisors")
            if not rep.fc_email.endswith(ADVISOR_DOMAIN):
                rep.add_warning(f"FC Email domain is not {ADVISOR_DOMAIN}: '{rep.fc_email}'")
        if rep.advisor is not None:
            if rep.fc_code == "":
                rep.add_warning("FC Code is empty")
            elif rep.fc_code.upper() != rep.advisor.fc_code.upper():
                rep.add_warning(
                    f"FC Code '{rep.fc_code}' does not match the advisor's stored code "
                    f"'{rep.advisor.fc_code}'"
                )

        # --- client identity ---------------------------------------------
        name_raw = raw_text(r["Client Name"])
        rep.client_name = name_raw.strip()
        if rep.client_name == "":
            rep.add_error("Client Name is empty")
        elif name_raw != rep.client_name:
            rep.add_warning(
                f"Client Name has leading/trailing whitespace; will import as '{rep.client_name}'"
            )

        rep.client_email = text(r["Client Email"]).lower()
        if rep.client_email == "":
            rep.add_error("Client Email is empty")
        elif "@" not in rep.client_email:
            rep.add_warning(f"Client Email '{rep.client_email}' does not look like an email address")

        rep.client_mobile, mobile_notes = normalize_mobile(r["Client Mobile"])
        for note in mobile_notes:
            rep.add_warning(note)

        # duplicate client email within the file, per advisor
        if rep.client_email:
            key = (rep.fc_email, rep.client_email)
            if key in seen_emails:
                rep.add_error(
                    f"Duplicate Client Email '{rep.client_email}' for the same advisor — "
                    f"first seen at row {seen_emails[key]}"
                )
            else:
                seen_emails[key] = rep.row_num

        # --- activity unit counts ----------------------------------------
        unit_parse_failed = False
        for ct in ref.challenge_types:
            cell = r[ct.csv_column]
            value, err = parse_units(cell)
            if err:
                rep.add_error(f"{ct.csv_column} = '{text(cell)}' {err}")
                unit_parse_failed = True
                continue
            rep.units[ct.code] = value
            if value > UNIT_TYPO_THRESHOLD:
                rep.add_warning(
                    f"{ct.csv_column} = {value} looks unusually high — suspected typo"
                )

        # --- totals checksum (never a source of truth) --------------------
        rep.computed_gold = sum(rep.units.get(ct.code, 0) * ct.passes_per_unit for ct in gold_types)
        rep.computed_blue = sum(rep.units.get(ct.code, 0) * ct.passes_per_unit for ct in blue_types)
        if not unit_parse_failed:
            for col, computed in (
                ("Total Gold Passes", rep.computed_gold),
                ("Total Blue Passes", rep.computed_blue),
            ):
                t = text(r[col])
                if t == "":
                    continue  # no checksum provided
                sheet_val, err = parse_units(t)
                if err:
                    rep.add_warning(f"{col} = '{t}' {err} — checksum skipped")
                elif sheet_val != computed:
                    rep.add_warning(
                        f"{col}: sheet says {sheet_val}, computed {computed} (units × rate)"
                    )

        # --- selected month must have the draws we need --------------------
        for pt, types in ((PASS_GOLD, gold_types), (PASS_BLUE, blue_types)):
            if any(rep.units.get(ct.code, 0) > 0 for ct in types):
                if ref.draw_for(selected_month, pt) is None:
                    rep.add_error(
                        f"No {pt} draw exists for {selected_month} — cannot award {pt} passes"
                    )

        # --- date updated --------------------------------------------------
        rep.date_updated, derr = parse_date_cell(r["Date Updated"])
        if derr == "unparseable":
            rep.add_warning(
                f"Date Updated '{text(r['Date Updated'])}' could not be parsed — "
                "the draw date will be used instead"
            )
        elif derr == "empty":
            rep.add_warning("Date Updated is empty — the draw date will be used instead")

        # --- prize / month conflict handling -------------------------------
        # Two sources state the month: the draw selected in the app, and the
        # Monthly Draw column. On prize rows a disagreement REJECTS the prize
        # (never guessed, never fuzzy-matched) but the row's passes still import.
        prize_raw = text(r["Prize Won"])
        md_raw = text(r["Monthly Draw"])
        pt_raw = text(r["Pass Type"]).lower()
        if prize_raw:
            if md_raw == "":
                rep.add_error("Prize Won given but Monthly Draw is empty", scope=SCOPE_PRIZE)
            elif pt_raw not in (PASS_GOLD, PASS_BLUE):
                rep.add_error(
                    f"Pass Type '{text(r['Pass Type'])}' must be gold or blue on a prize row",
                    scope=SCOPE_PRIZE,
                )
            else:
                matched = ref.match_month(md_raw)
                if matched is None:
                    rep.add_error(f"Monthly Draw '{md_raw}' matches no draw", scope=SCOPE_PRIZE)
                elif matched != selected_month:
                    rep.add_error(
                        f"Monthly Draw says {matched} but file imported as {selected_month}",
                        scope=SCOPE_PRIZE,
                    )
                else:
                    draw = ref.draw_for(matched, pt_raw)
                    if draw is None:
                        rep.add_error(
                            f"No {pt_raw} draw exists for {matched}", scope=SCOPE_PRIZE
                        )
                    else:
                        rep.prize = PrizeAward(
                            monthly_draw=matched,
                            pass_type=pt_raw,
                            prize_won=prize_raw,
                            draw_id=draw.id,
                        )
        elif md_raw:
            matched = ref.match_month(md_raw)
            if matched is None:
                rep.add_warning(
                    f"Monthly Draw '{md_raw}' matches no draw (no prize on this row — nothing skipped)"
                )
            elif matched != selected_month:
                rep.add_warning(
                    f"Monthly Draw says {matched} but file imported as {selected_month} "
                    "(no prize on this row)"
                )

        report.rows.append(rep)

    return report


def suggest_month(filename: str, df: pd.DataFrame | None, ref: ReferenceData) -> tuple[str | None, str | None]:
    """Best-effort guess of which draw month a mastersheet is for.

    Used only to PRE-SELECT the month in the UI — the human still confirms,
    and validation still rejects prize rows that contradict the selection.
    Sources, in order of trust:
      1. the file's Monthly Draw column, when every filled value maps to the
         same known draw month (typos like 'Augst' simply don't match);
      2. a known month name appearing in the filename.
    Returns (month, human-readable reason) or (None, None).
    """
    if df is not None:
        headers = {str(c).replace("\ufeff", "").strip(): c for c in df.columns}
        col = headers.get("Monthly Draw")
        if col is not None:
            found = set()
            for v in df[col]:
                t = text(v)
                if t:
                    matched = ref.match_month(t)
                    if matched:
                        found.add(matched)
            if len(found) == 1:
                month = found.pop()
                return month, f"the file's Monthly Draw column says {month}"
    low = (filename or "").lower()
    for month in ref.months():
        if month.lower() in low:
            return month, f"the filename mentions {month}"
    return None, None


# ---------------------------------------------------------------------------
# =========================  THE UNPIVOT  ===================================
# ---------------------------------------------------------------------------

def unpivot_row(row: RowReport, ref: ReferenceData, month: str) -> list[LedgerEntry]:
    """Turn one WIDE mastersheet row into LONG pass_ledger entries.

    The CSV is wide: one row per client, one column per qualifying activity,
    each cell holding a UNIT COUNT (a 2 in "Attend Client Events" means two
    events attended). pass_ledger is long: one row per award.

    For every activity column with units > 0 we emit one ledger entry:

      units        <- the cell value (unit count, NOT passes)
      rate_applied <- challenge_types.passes_per_unit for that activity.
                      Rates and the column-to-code mapping are NOT hardcoded
                      here: ref.challenge_types is read from the database
                      (csv_column = header to look for, code = value stored,
                      passes_per_unit = rate). If marketing renames a column
                      or changes a rate, update the challenge_types table —
                      this code picks it up without a code change.
      draw_id      <- the selected month's draw whose pass_type matches the
                      activity's pass_type (gold activities -> gold draw,
                      blue activities -> blue draw)
      external_ref <- f"{month}:{client_email}:{challenge_code}"
                      Deterministic, so re-importing the same file upserts the
                      same rows instead of double-awarding (unique index on
                      pass_ledger.external_ref).

    passes_awarded is a GENERATED column (units * rate_applied) — never sent.
    To add, remove or re-rate an activity: edit the challenge_types table.
    """
    if row.advisor is None:
        return []
    entries: list[LedgerEntry] = []
    for ct in ref.challenge_types:
        units = row.units.get(ct.code, 0)
        if units <= 0:
            continue
        draw = ref.draw_for(month, ct.pass_type)
        if draw is None:
            continue  # validation already flagged this row
        noun = ct.unit_noun if units == 1 else f"{ct.unit_noun}s"
        entries.append(
            LedgerEntry(
                row_num=row.row_num,
                client_key=(row.advisor.id, row.client_email),
                external_ref=f"{month}:{row.client_email}:{ct.code}",
                challenge_code=ct.code,
                pass_type=ct.pass_type,
                units=units,
                rate_applied=ct.passes_per_unit,
                draw_id=draw.id,
                draw_date=draw.draw_date,
                date_updated=row.date_updated,
                description=f"{units} {noun} — {ct.label}",
            )
        )
    return entries


# ---------------------------------------------------------------------------
# Planning (read-only — queries the DB, writes nothing)
# ---------------------------------------------------------------------------

def build_plan(report: FileReport, ref: ReferenceData, db) -> ImportPlan:
    if ref.campaign is None:
        raise ImporterError("No active campaign — cannot plan an import.")
    month = report.selected_month
    rows = report.importable()

    # clients (deduped on the upsert key)
    payload_by_key: dict[tuple[str, str], dict] = {}
    for r in rows:
        key = (r.advisor.id, r.client_email)
        payload_by_key[key] = {
            "advisor_id": r.advisor.id,
            "client_email": r.client_email,
            "client_name": r.client_name,
            "client_mobile": r.client_mobile,
        }
    existing_ids = db.existing_client_keys(list(payload_by_key))
    creates = sorted(k for k in payload_by_key if k not in existing_ids)
    updates = sorted(k for k in payload_by_key if k in existing_ids)

    # ledger rows via the unpivot
    entries: list[LedgerEntry] = []
    for r in rows:
        entries.extend(unpivot_row(r, ref, month))
    refs = [e.external_ref for e in entries]
    existing_refs = db.existing_external_refs(refs)
    new_refs = set(refs) - existing_refs

    # prizes
    prizes = [
        PrizeItem(
            row_num=r.row_num,
            client_key=(r.advisor.id, r.client_email),
            draw_id=r.prize.draw_id,
            prize_won=r.prize.prize_won,
        )
        for r in rows
        if r.prize is not None and not r.prize_blocked
    ]
    existing_prize_tuples = db.existing_prizes({p.draw_id for p in prizes}) if prizes else set()
    prizes_existing = [
        p
        for p in prizes
        if p.client_key in existing_ids
        and (existing_ids[p.client_key], p.draw_id, p.prize_won) in existing_prize_tuples
    ]
    prizes_new = [p for p in prizes if p not in prizes_existing]

    skipped = [(r.row_num, r.reasons()) for r in report.rows if r.blocked]
    prize_skips = [
        (r.row_num, [i.message for i in r.issues if i.severity == SEV_ERROR and i.scope == SCOPE_PRIZE])
        for r in report.rows
        if not r.blocked and r.prize_blocked
    ]

    return ImportPlan(
        month=month,
        campaign_id=ref.campaign.id,
        campaign_name=ref.campaign.name,
        rows_total=len(report.rows),
        rows_importable=len(rows),
        client_payloads=list(payload_by_key.values()),
        clients_create=creates,
        clients_update=updates,
        ledger_entries=entries,
        ledger_new_refs=new_refs,
        ledger_existing_refs=set(refs) & existing_refs,
        prizes=prizes,
        prizes_new=prizes_new,
        prizes_existing=prizes_existing,
        skipped_rows=skipped,
        prize_skips=prize_skips,
    )


# ---------------------------------------------------------------------------
# Execution (the ONLY function that writes)
# ---------------------------------------------------------------------------

class RunLog:
    """Timestamped, copyable run log. Never contains credentials."""

    def __init__(self) -> None:
        self._lines: list[str] = []

    def add(self, message: str) -> None:
        self._lines.append(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {message}")

    def text(self) -> str:
        return "\n".join(self._lines)


def _chunks(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def execute_plan(db, ref: ReferenceData, plan: ImportPlan, log: RunLog, progress=None) -> ImportSummary:
    """Write the plan: clients -> pass_ledger -> prizes, batched, idempotent."""
    ledger_batches = max(1, math.ceil(len(plan.ledger_entries) / WRITE_CHUNK)) if plan.ledger_entries else 0
    prize_batches = max(1, math.ceil(len(plan.prizes_new) / WRITE_CHUNK)) if plan.prizes_new else 0
    total_steps = 1 + ledger_batches + prize_batches
    step = 0

    def tick(label: str) -> None:
        nonlocal step
        step += 1
        if progress:
            progress(step, total_steps, label)

    log.add(
        f"Import started — campaign '{plan.campaign_name}', draw month {plan.month}: "
        f"{plan.rows_importable} of {plan.rows_total} rows importable"
    )
    for row_num, msgs in plan.skipped_rows:
        log.add(f"SKIPPED row {row_num}: {'; '.join(msgs)}")
    for row_num, msgs in plan.prize_skips:
        log.add(f"PRIZE SKIPPED row {row_num}: {'; '.join(msgs)} (passes still imported)")

    # 1. clients — upsert on (advisor_id, client_email); emails are normalised
    #    to lowercase before this point, so the key is case-insensitive
    id_by_key = db.upsert_clients(plan.client_payloads)
    tick("Clients upserted")
    log.add(f"Clients: {len(plan.clients_create)} created, {len(plan.clients_update)} updated")

    # 2. pass ledger — upsert on external_ref (idempotent)
    payloads = []
    for e in plan.ledger_entries:
        client_id = id_by_key.get(e.client_key)
        if client_id is None:
            raise ImporterError(f"No client id after upsert for {e.client_key} (row {e.row_num})")
        effective_date = e.date_updated or e.draw_date
        payloads.append(
            {
                "client_id": client_id,
                "campaign_id": plan.campaign_id,
                "draw_id": e.draw_id,
                "challenge_code": e.challenge_code,
                "units": e.units,
                "rate_applied": e.rate_applied,
                "status": "confirmed",
                "occurred_on": effective_date.isoformat() if effective_date else None,
                "confirmed_on": effective_date.isoformat() if effective_date else None,
                "date_updated": e.date_updated.isoformat() if e.date_updated else None,
                "external_ref": e.external_ref,
                "description": e.description,
            }
        )
    done = 0
    for chunk in _chunks(payloads, WRITE_CHUNK):
        db.upsert_ledger(chunk)
        done += len(chunk)
        tick(f"Pass ledger {done}/{len(payloads)}")
        log.add(f"Ledger batch written: {done}/{len(payloads)} rows")
    log.add(
        f"Pass ledger: {len(plan.ledger_new_refs)} inserted, "
        f"{len(plan.ledger_existing_refs)} updated in place"
    )

    # 3. prizes — upsert on (client_id, draw_id, prize_won), duplicates ignored
    prize_payloads = []
    for p in plan.prizes_new:
        client_id = id_by_key.get(p.client_key)
        if client_id is None:
            raise ImporterError(f"No client id after upsert for prize row {p.row_num}")
        prize_payloads.append(
            {"client_id": client_id, "draw_id": p.draw_id, "prize_won": p.prize_won}
        )
    done = 0
    for chunk in _chunks(prize_payloads, WRITE_CHUNK):
        db.upsert_prizes(chunk)
        done += len(chunk)
        tick(f"Prizes {done}/{len(prize_payloads)}")
    log.add(
        f"Prizes: {len(plan.prizes_new)} inserted, {len(plan.prizes_existing)} already present, "
        f"{len(plan.prize_skips)} skipped by validation"
    )

    summary = ImportSummary(
        month=plan.month,
        campaign_name=plan.campaign_name,
        rows_total=plan.rows_total,
        rows_imported=plan.rows_importable,
        rows_skipped=len(plan.skipped_rows),
        prize_cells_skipped=len(plan.prize_skips),
        clients_created=len(plan.clients_create),
        clients_updated=len(plan.clients_update),
        ledger_inserted=len(plan.ledger_new_refs),
        ledger_updated=len(plan.ledger_existing_refs),
        prizes_inserted=len(plan.prizes_new),
        prizes_already_present=len(plan.prizes_existing),
        gold_passes=sum(e.units * e.rate_applied for e in plan.ledger_entries if e.pass_type == PASS_GOLD),
        blue_passes=sum(e.units * e.rate_applied for e in plan.ledger_entries if e.pass_type == PASS_BLUE),
    )
    for line in summary.as_text().splitlines():
        log.add(line)
    return summary
