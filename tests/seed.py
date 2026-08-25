"""Reference data used by the offline harness (tests/fake_db.py) and by
scripts/generate_test_files.py, mirroring what the real Supabase tables hold.

siti.rahmah@finexis.com.sg is deliberately NOT seeded — rows for her in the
sample files are the planted unknown-FC case and must be rejected.
"""
from __future__ import annotations

import uuid
from datetime import date

from importer.models import (
    Advisor,
    Campaign,
    ChallengeType,
    Draw,
    PASS_BLUE,
    PASS_GOLD,
    ReferenceData,
)


def uid(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"https://luckyfinexis.test/{name}"))


ADVISORS = [
    # (fc_code, fc_email, fc_name)
    ("FC001", "tan.weiming@finexis.com.sg", "Tan Wei Ming"),
    ("FC002", "lim.huiling@finexis.com.sg", "Lim Hui Ling"),
    ("FC003", "kumar.rajesh@finexis.com.sg", "Rajesh Kumar"),
    ("FC004", "wong.jiahui@finexis.com.sg", "Wong Jia Hui"),
]

CHALLENGE_TYPES = [
    # (code, csv_column, label, pass_type, passes_per_unit, unit_noun, sort_order)
    ("PURCHASE_PRODUCT", "Purchase Qualifying Product", "Purchase Qualifying Product", PASS_GOLD, 1, "product", 1),
    ("REFERRAL_PURCHASE", "Successful Referral Purchase", "Successful Referral Purchase", PASS_GOLD, 2, "purchase", 2),
    ("SUBMIT_REFERRAL", "Submit Referrals", "Submit Referrals", PASS_BLUE, 1, "referral", 3),
    ("ATTEND_EVENT", "Attend Client Events", "Attend Client Events", PASS_BLUE, 5, "event", 4),
    ("BRING_GUEST", "Bring Guests For Events", "Bring Guests For Events", PASS_BLUE, 2, "guest", 5),
    ("TESTIMONIAL", "Submit Testimonial", "Submit Testimonial", PASS_BLUE, 3, "testimonial", 6),
    ("DOWNLOAD_APP", "Download finConnect", "Download finConnect", PASS_BLUE, 1, "download", 7),
]

CAMPAIGN_NAME = "Around The World 2026"

DRAW_MONTHS = [
    ("July", date(2026, 7, 31)),
    ("August", date(2026, 8, 31)),
    ("September", date(2026, 9, 30)),
]


def make_reference() -> ReferenceData:
    advisors = {
        email: Advisor(id=uid(f"advisor/{email}"), fc_email=email, fc_code=code, fc_name=name)
        for code, email, name in ADVISORS
    }
    campaign = Campaign(
        id=uid("campaign/atw-2026"),
        name=CAMPAIGN_NAME,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    draws = [
        Draw(
            id=uid(f"draw/{month}/{pass_type}"),
            campaign_id=campaign.id,
            monthly_draw=month,
            draw_date=draw_date,
            pass_type=pass_type,
            is_drawn=False,
        )
        for month, draw_date in DRAW_MONTHS
        for pass_type in (PASS_GOLD, PASS_BLUE)
    ]
    challenge_types = [
        ChallengeType(
            code=code,
            csv_column=csv_column,
            label=label,
            pass_type=pass_type,
            passes_per_unit=rate,
            unit_noun=noun,
            sort_order=sort_order,
        )
        for code, csv_column, label, pass_type, rate, noun, sort_order in CHALLENGE_TYPES
    ]
    return ReferenceData(
        advisors_by_email=advisors,
        campaign=campaign,
        draws=draws,
        challenge_types=challenge_types,
    )
