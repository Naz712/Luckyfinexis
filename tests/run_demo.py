#!/usr/bin/env python3
"""Offline verification harness for the importer.

Runs the exact validation → preview → import pipeline the Streamlit app uses,
against an in-memory FakeDatabase that enforces the same unique constraints as
Supabase, seeded with the reference data in tests/seed.py. Proves:

  1. atw_mastersheet_sample.csv imports cleanly except the unknown-FC rows
     (siti.rahmah@finexis.com.sg), which are rejected AND reported.
  2. Re-importing the same file inserts nothing (idempotency).
  3. atw_mastersheet_messy.csv — all ten planted faults are caught and
     reported by row number with a reason; a bad prize cell (row 20) skips
     only the prize, not that client's passes.
  4. Edge cases: empty file, header-only file, file with a BOM, .xlsx upload.

Run from the repo root:  python tests/run_demo.py
"""
from __future__ import annotations

import codecs
import io
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from importer.core import RunLog, build_plan, execute_plan, validate_file  # noqa: E402
from importer.parsing import read_upload  # noqa: E402
from tests.fake_db import FakeDatabase  # noqa: E402
from tests.seed import make_reference  # noqa: E402

MONTH = "August"
FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    mark = "PASS" if cond else "FAIL"
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


def banner(title: str) -> None:
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def print_report(report) -> None:
    print(
        f"{len(report.ok_rows)} rows OK, {len(report.warning_rows)} warnings, "
        f"{len(report.error_rows)} errors"
    )
    problems = [(r, i) for r in report.rows for i in r.issues]
    if not problems:
        print("No problems found.")
        return
    print(f"{'Row':>4}  {'Severity':<8}  Problem")
    for r, issue in problems:
        scope = " [prize only — passes still import]" if issue.scope == "PRIZE" else ""
        print(f"{r.row_num:>4}  {issue.severity:<8}  {issue.message}{scope}")


def print_preview(plan) -> None:
    print(
        f"Will create {len(plan.clients_create)} clients, update {len(plan.clients_update)} clients, "
        f"insert {len(plan.ledger_new_refs)} ledger rows "
        f"({len(plan.ledger_existing_refs)} already present — updated in place), "
        f"insert {len(plan.prizes_new)} prizes ({len(plan.prizes_existing)} already present)."
    )
    if plan.skipped_rows:
        print(f"Skipping {len(plan.skipped_rows)} row(s) with errors.")


def load(path: pathlib.Path):
    df, err = read_upload(path.name, path.read_bytes())
    assert err is None, f"{path.name}: {err}"
    return df


def import_file(db, ref, df, label: str):
    report = validate_file(df, ref, MONTH)
    plan = build_plan(report, ref, db)
    log = RunLog()
    summary = execute_plan(db, ref, plan, log)
    print(f"\n--- run log ({label}) ---")
    print(log.text())
    return report, plan, summary


def main() -> int:
    ref = make_reference()
    sample_path = ROOT / "atw_mastersheet_sample.csv"
    messy_path = ROOT / "atw_mastersheet_messy.csv"

    # ------------------------------------------------------------------ sample
    banner(f"SAMPLE FILE — {sample_path.name}, imported as {MONTH}")
    db = FakeDatabase(ref)
    df = load(sample_path)
    report = validate_file(df, ref, MONTH)
    print_report(report)
    plan = build_plan(report, ref, db)
    print_preview(plan)

    siti_rows = {r.row_num for r in report.error_rows}
    check("sample: 29 rows OK", len(report.ok_rows) == 29, f"got {len(report.ok_rows)}")
    check("sample: 0 warnings", len(report.warning_rows) == 0, f"got {len(report.warning_rows)}")
    check(
        "sample: only the 3 siti.rahmah rows (31-33) are errors",
        siti_rows == {31, 32, 33},
        f"got {sorted(siti_rows)}",
    )
    check(
        "sample: siti rows are reported, not silently skipped",
        all(
            any("siti.rahmah@finexis.com.sg" in m and "not found" in m for m in r.reasons())
            for r in report.error_rows
        ),
    )

    log = RunLog()
    summary = execute_plan(db, ref, plan, log)
    print("\n--- run log (sample, first import) ---")
    print(log.text())
    check("sample: 29 clients created", summary.clients_created == 29)
    check("sample: 92 ledger rows inserted", summary.ledger_inserted == 92, f"got {summary.ledger_inserted}")
    check("sample: 4 prizes inserted", summary.prizes_inserted == 4, f"got {summary.prizes_inserted}")
    check(
        "sample: skipped rows named in the run log",
        all(f"SKIPPED row {n}:" in log.text() for n in (31, 32, 33)),
    )
    passes_after_first = db.total_passes()
    ledger_count_after_first = len(db.ledger)

    # ------------------------------------------------------- idempotent re-run
    banner("SAMPLE FILE — imported a SECOND time (idempotency check)")
    report2 = validate_file(df, ref, MONTH)
    plan2 = build_plan(report2, ref, db)
    print_preview(plan2)
    log2 = RunLog()
    summary2 = execute_plan(db, ref, plan2, log2)
    print("\n--- run log (sample, second import) ---")
    print(log2.text())
    check("re-run: 0 clients created, 29 updated", summary2.clients_created == 0 and summary2.clients_updated == 29)
    check("re-run: 0 ledger rows inserted", summary2.ledger_inserted == 0, f"got {summary2.ledger_inserted}")
    check("re-run: 92 ledger rows updated in place", summary2.ledger_updated == 92, f"got {summary2.ledger_updated}")
    check("re-run: 0 prizes inserted", summary2.prizes_inserted == 0, f"got {summary2.prizes_inserted}")
    check(
        "re-run: ledger row count unchanged (no double award)",
        len(db.ledger) == ledger_count_after_first,
        f"{ledger_count_after_first} -> {len(db.ledger)}",
    )
    check(
        "re-run: total passes unchanged (no double award)",
        db.total_passes() == passes_after_first,
        f"{passes_after_first} -> {db.total_passes()}",
    )

    # ------------------------------------------------------------------- messy
    banner(f"MESSY FILE — {messy_path.name}, imported as {MONTH} (fresh database)")
    db_m = FakeDatabase(ref)
    df_m = load(messy_path)
    report_m = validate_file(df_m, ref, MONTH)
    print_report(report_m)
    plan_m = build_plan(report_m, ref, db_m)
    print_preview(plan_m)

    planted = [
        (2, "not found in advisors"),          # unknown FC email
        (4, "sheet says"),                     # mismatched total
        (6, "Client Name is empty"),           # blank client name
        (8, "is not a number"),                # "N/A" in a number column
        (10, "reformatted"),                   # formatted mobile
        (12, "Duplicate Client Email"),        # duplicate client email
        (14, "is negative"),                   # negative count
        (16, "suspected typo"),                # unit count of 99
        (18, "whitespace"),                    # padded name
        (20, "matches no draw"),               # misspelled Monthly Draw
    ]
    all_msgs = {r.row_num: " | ".join(r.reasons()) for r in report_m.rows}
    print("\nPlanted-fault coverage:")
    for row_num, needle in planted:
        check(
            f"messy: row {row_num} caught ({needle})",
            needle in all_msgs.get(row_num, ""),
            f"row {row_num} issues: {all_msgs.get(row_num, '<none>')}",
        )
    check(
        "messy: siti rows 31-33 still rejected",
        all("not found in advisors" in all_msgs.get(n, "") for n in (31, 32, 33)),
    )

    log_m = RunLog()
    summary_m = execute_plan(db_m, ref, plan_m, log_m)
    print("\n--- run log (messy) ---")
    print(log_m.text())

    blocked = {n for n, _ in plan_m.skipped_rows}
    check(
        "messy: blocked rows are exactly 2, 6, 8, 12, 14, 31, 32, 33",
        blocked == {2, 6, 8, 12, 14, 31, 32, 33},
        f"got {sorted(blocked)}",
    )
    check(
        "messy: row 20 prize skipped but its passes imported",
        any(n == 20 for n, _ in plan_m.prize_skips)
        and any(":dinesh.pillai@gmail.com:" in ref_ for ref_ in db_m.ledger),
        f"prize_skips={plan_m.prize_skips}",
    )
    check(
        "messy: row 20 prize not inserted",
        not any("Staycation at MBS" in p[2] for p in db_m.prizes),
    )
    check("messy: 3 prizes inserted (rows 5, 13, 27)", summary_m.prizes_inserted == 3)
    check(
        "messy: warning rows 4, 10, 16, 18 still imported",
        all(
            any(f":{email}:" in ref_ for ref_ in db_m.ledger)
            for email in ("priya.nair@gmail.com", "cheryl.goh@gmail.com",
                          "ryan.koh@gmail.com", "kevin.lim@gmail.com")
        ),
    )

    # -------------------------------------------------------------- edge cases
    banner("EDGE CASES — empty file, header-only, BOM, xlsx")
    _, err = read_upload("empty.csv", b"")
    check("empty file rejected with a message", err is not None, str(err))
    print(f"  empty file -> {err}")

    header_only = sample_path.read_bytes().split(b"\n", 1)[0] + b"\n"
    _, err = read_upload("header_only.csv", header_only)
    check("header-only file rejected with a message", err is not None, str(err))
    print(f"  header-only file -> {err}")

    bom_bytes = codecs.BOM_UTF8 + sample_path.read_bytes()
    df_bom, err = read_upload("sample_bom.csv", bom_bytes)
    check("BOM file parses", err is None, str(err))
    if err is None:
        report_bom = validate_file(df_bom, ref, MONTH)
        check(
            "BOM file validates identically to the plain file",
            (len(report_bom.ok_rows), len(report_bom.warning_rows), len(report_bom.error_rows))
            == (len(report.ok_rows), len(report.warning_rows), len(report.error_rows)),
        )

    from importer.core import suggest_month

    sm, why = suggest_month("upload.csv", df_m, ref)
    check(
        "suggest_month: messy file's Monthly Draw column wins (typo 'Augst' ignored)",
        sm == "August" and "Monthly Draw" in (why or ""),
        f"got {sm!r} / {why!r}",
    )
    df_blank = df.copy()
    df_blank["Monthly Draw"] = ""
    sm, why = suggest_month("mastersheet_september.csv", df_blank, ref)
    check("suggest_month: filename fallback", sm == "September", f"got {sm!r} / {why!r}")
    sm, why = suggest_month("upload.csv", df_blank, ref)
    check("suggest_month: no signal -> no guess", sm is None and why is None, f"got {sm!r}")

    xlsx_buf = io.BytesIO()
    pd.read_csv(sample_path, dtype=str, keep_default_na=False).to_excel(xlsx_buf, index=False)
    df_x, err = read_upload("sample.xlsx", xlsx_buf.getvalue())
    check("xlsx upload parses", err is None, str(err))
    if err is None:
        report_x = validate_file(df_x, ref, MONTH)
        check(
            "xlsx validates identically to the csv",
            (len(report_x.ok_rows), len(report_x.warning_rows), len(report_x.error_rows))
            == (len(report.ok_rows), len(report.warning_rows), len(report.error_rows)),
            f"xlsx: {len(report_x.ok_rows)}/{len(report_x.warning_rows)}/{len(report_x.error_rows)}",
        )

    banner("RESULT")
    if FAILURES:
        print(f"{len(FAILURES)} CHECK(S) FAILED:")
        for f in FAILURES:
            print(f"  - {f}")
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
