#!/usr/bin/env python3
"""Regenerate the two test mastersheets at the repo root.

  atw_mastersheet_sample.csv — 32 rows; imports cleanly except the three rows
      for siti.rahmah@finexis.com.sg, a deliberate unknown FC that must be
      rejected and reported.

  atw_mastersheet_messy.csv  — the same rows with ten planted faults (see
      FAULTS below), every one of which the validator must catch and report
      by row number.

Totals are derived from the unit counts and the rates in tests/seed.py, the
same rates the offline harness seeds — matching what the challenge_types
table holds.

Run from the repo root:  python scripts/generate_test_files.py
"""
from __future__ import annotations

import copy
import csv
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.seed import CHALLENGE_TYPES  # noqa: E402

ACTIVITY_COLS = [ct[1] for ct in CHALLENGE_TYPES]  # csv_column, in sort order
RATE = {ct[1]: ct[4] for ct in CHALLENGE_TYPES}
PASS_TYPE = {ct[1]: ct[3] for ct in CHALLENGE_TYPES}

HEADERS = [
    "FC Email", "FC Code", "Client Name", "Client Mobile", "Client Email",
    "Total Gold Passes", "Purchase Qualifying Product", "Successful Referral Purchase",
    "Total Blue Passes", "Submit Referrals", "Attend Client Events",
    "Bring Guests For Events", "Submit Testimonial", "Download finConnect",
    "Monthly Draw", "Prize Won", "Pass Type", "Date Updated",
]

# (fc_code, fc_email) blocks; rows appear in this order, so with the header on
# spreadsheet row 1 the first data row below is row 2.
FC1 = ("FC001", "tan.weiming@finexis.com.sg")
FC2 = ("FC002", "lim.huiling@finexis.com.sg")
FC3 = ("FC003", "kumar.rajesh@finexis.com.sg")
FC4 = ("FC004", "wong.jiahui@finexis.com.sg")
FC5 = ("FC005", "siti.rahmah@finexis.com.sg")  # NOT in advisors — must be rejected

# (fc, name, mobile, email, units[PQP,SRP,REF,EVT,GST,TST,DL], prize, pass_type)
ROWS = [
    (FC1, "Alicia Ng",     "91230011", "alicia.ng@gmail.com",     (1, 0, 2, 1, 0, 0, 1), "", ""),          # row 2
    (FC1, "Marcus Teo",    "91230012", "marcus.teo@hotmail.com",  (0, 1, 0, 2, 1, 0, 0), "", ""),          # row 3
    (FC1, "Priya Nair",    "91230013", "priya.nair@gmail.com",    (2, 0, 1, 0, 0, 1, 1), "", ""),          # row 4
    (FC1, "Daniel Chua",   "91230014", "daniel.chua@yahoo.com",   (1, 1, 0, 1, 2, 0, 1),
        "Universal Studios Family Pass", "Gold"),                                                          # row 5
    (FC1, "Grace Ho",      "91230015", "grace.ho@gmail.com",      (0, 0, 3, 0, 0, 0, 1), "", ""),          # row 6
    (FC1, "Benjamin Ong",  "91230016", "benjamin.ong@gmail.com",  (1, 0, 0, 0, 0, 1, 0), "", ""),          # row 7
    (FC1, "Farhana Yusof", "91230017", "farhana.yusof@gmail.com", (0, 0, 2, 1, 1, 0, 1), "", ""),          # row 8
    (FC1, "Wei Jie Lam",   "91230018", "weijie.lam@gmail.com",    (2, 1, 0, 0, 0, 0, 1), "", ""),          # row 9
    (FC1, "Cheryl Goh",    "91230019", "cheryl.goh@gmail.com",    (0, 0, 1, 1, 0, 1, 0), "", ""),          # row 10
    (FC2, "Nurul Aini",    "82340021", "nurul.aini@gmail.com",    (1, 0, 0, 1, 1, 0, 1), "", ""),          # row 11
    (FC2, "Jason Phua",    "82340022", "jason.phua@gmail.com",    (0, 0, 2, 0, 0, 1, 0), "", ""),          # row 12
    (FC2, "Melissa Tan",   "82340023", "melissa.tan@gmail.com",   (0, 1, 1, 0, 0, 0, 1),
        "$50 CapitaVoucher", "Blue"),                                                                      # row 13
    (FC2, "Arjun Menon",   "82340024", "arjun.menon@gmail.com",   (1, 0, 0, 1, 0, 0, 0), "", ""),          # row 14
    (FC2, "Sophia Lee",    "82340025", "sophia.lee@gmail.com",    (0, 0, 0, 2, 1, 1, 1), "", ""),          # row 15
    (FC2, "Ryan Koh",      "82340026", "ryan.koh@gmail.com",      (1, 1, 1, 0, 0, 0, 0), "", ""),          # row 16
    (FC2, "Hafiz Rahman",  "82340027", "hafiz.rahman@gmail.com",  (0, 0, 2, 0, 1, 0, 1), "", ""),          # row 17
    (FC2, "Kevin Lim",     "82340028", "kevin.lim@gmail.com",     (2, 0, 0, 1, 0, 1, 0), "", ""),          # row 18
    (FC3, "Amanda Seah",   "93450031", "amanda.seah@gmail.com",   (0, 1, 1, 1, 0, 0, 1), "", ""),          # row 19
    (FC3, "Dinesh Pillai", "93450032", "dinesh.pillai@gmail.com", (3, 1, 0, 0, 1, 0, 1),
        "Staycation at MBS", "Gold"),                                                                      # row 20
    (FC3, "Jolene Yap",    "93450033", "jolene.yap@gmail.com",    (0, 0, 1, 0, 0, 1, 1), "", ""),          # row 21
    (FC3, "Terrence Foo",  "93450034", "terrence.foo@gmail.com",  (1, 0, 0, 2, 2, 0, 0), "", ""),          # row 22
    (FC3, "Siew Mei Wong", "93450035", "siewmei.wong@gmail.com",  (0, 0, 2, 0, 0, 0, 1), "", ""),          # row 23
    (FC3, "Aaron Tay",     "93450036", "aaron.tay@gmail.com",     (1, 1, 0, 1, 0, 1, 0), "", ""),          # row 24
    (FC3, "Vanessa Chin",  "93450037", "vanessa.chin@gmail.com",  (0, 0, 1, 1, 1, 0, 1), "", ""),          # row 25
    (FC4, "Zhi Hao Ng",    "84560041", "zhihao.ng@gmail.com",     (2, 0, 0, 0, 0, 0, 1), "", ""),          # row 26
    (FC4, "Rachel Yeo",    "84560042", "rachel.yeo@gmail.com",    (0, 1, 2, 1, 0, 1, 0),
        "Changi Jewel Voucher", "Blue"),                                                                   # row 27
    (FC4, "Imran Shah",    "84560043", "imran.shah@gmail.com",    (1, 0, 0, 0, 1, 0, 1), "", ""),          # row 28
    (FC4, "Clara Lim",     "84560044", "clara.lim@gmail.com",     (0, 0, 1, 2, 0, 0, 0), "", ""),          # row 29
    (FC4, "Joshua Sim",    "84560045", "joshua.sim@gmail.com",    (1, 0, 0, 0, 0, 1, 1), "", ""),          # row 30
    (FC5, "Elaine Chong",  "95670051", "elaine.chong@gmail.com",  (1, 0, 1, 1, 0, 0, 1), "", ""),          # row 31
    (FC5, "Muthu Kannan",  "95670052", "muthu.kannan@gmail.com",  (0, 1, 0, 0, 1, 1, 0), "", ""),          # row 32
    (FC5, "Felicia Woo",   "95670053", "felicia.woo@gmail.com",   (2, 0, 1, 0, 0, 0, 1), "", ""),          # row 33
]

DATES = ["2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18"]


def build_records() -> list[dict]:
    records = []
    for i, (fc, name, mobile, email, units, prize, pass_type) in enumerate(ROWS):
        rec = {
            "FC Email": fc[1],
            "FC Code": fc[0],
            "Client Name": name,
            "Client Mobile": mobile,
            "Client Email": email,
            "Monthly Draw": "August" if prize else "",
            "Prize Won": prize,
            "Pass Type": pass_type,
            "Date Updated": DATES[i % len(DATES)],
        }
        for col, value in zip(ACTIVITY_COLS, units):
            rec[col] = value
        compute_totals(rec)
        records.append(rec)
    return records


def compute_totals(rec: dict) -> None:
    gold = blue = 0
    for col in ACTIVITY_COLS:
        units = int(rec[col])
        if PASS_TYPE[col] == "gold":
            gold += units * RATE[col]
        else:
            blue += units * RATE[col]
    rec["Total Gold Passes"] = gold
    rec["Total Blue Passes"] = blue


def apply_faults(records: list[dict]) -> list[dict]:
    """The ten planted faults, one per row. Index = spreadsheet row - 2."""
    messy = copy.deepcopy(records)
    messy[0]["FC Email"] = "john.tan@finexis.com.sg"        # row 2: unknown FC email
    messy[2]["Total Blue Passes"] += 7                       # row 4: mismatched total
    messy[4]["Client Name"] = ""                             # row 6: blank client name
    messy[6]["Submit Referrals"] = "N/A"                     # row 8: N/A in a number column
    messy[8]["Client Mobile"] = "+65 9123 4567"              # row 10: formatted mobile
    messy[10]["Client Email"] = "nurul.aini@gmail.com"       # row 12: duplicate of row 11
    messy[12]["Attend Client Events"] = -1                   # row 14: negative count
    messy[14]["Bring Guests For Events"] = 99                # row 16: unit count of 99
    compute_totals(messy[14])  # keep this row's checksum consistent: only the
    # suspected-typo warning should fire, not a totals mismatch as well
    messy[16]["Client Name"] = "  Kevin Lim  "               # row 18: padded name
    messy[18]["Monthly Draw"] = "Augst"                      # row 20: misspelled draw month
    return messy


def write_csv(path: pathlib.Path, records: list[dict]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=HEADERS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)
    print(f"wrote {path} ({len(records)} data rows)")


if __name__ == "__main__":
    clean = build_records()
    write_csv(ROOT / "atw_mastersheet_sample.csv", clean)
    write_csv(ROOT / "atw_mastersheet_messy.csv", apply_faults(build_records()))
