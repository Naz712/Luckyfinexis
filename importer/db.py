"""Database access layer.

Everything the importer needs from Supabase sits behind these few methods, so
the validation/planning/execution logic can also run against the in-memory
FakeDatabase in tests/fake_db.py. All writes are upserts on the unique keys
that make re-imports idempotent.
"""
from __future__ import annotations

from datetime import date

from importer.models import (
    Advisor,
    Campaign,
    ChallengeType,
    Draw,
    ImporterError,
    ReferenceData,
)

_IN_CHUNK = 100  # values per PostgREST in_() filter, keeps URLs short


def _parse_date(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def create_supabase_database(url: str, service_role_key: str) -> "SupabaseDatabase":
    """Build the real client. Imported lazily so tests never need supabase."""
    from supabase import create_client

    return SupabaseDatabase(create_client(url, service_role_key))


class SupabaseDatabase:
    def __init__(self, client) -> None:
        self._c = client

    # -- reads ---------------------------------------------------------------

    def load_reference(self) -> ReferenceData:
        adv_rows = (
            self._c.table("advisors").select("id, fc_email, fc_code, fc_name").execute().data
        )
        advisors: dict[str, Advisor] = {}
        for a in adv_rows:
            email = (a.get("fc_email") or "").strip().lower()
            if email:
                advisors[email] = Advisor(
                    id=a["id"],
                    fc_email=email,
                    fc_code=(a.get("fc_code") or "").strip(),
                    fc_name=a.get("fc_name") or "",
                )

        camp_rows = (
            self._c.table("campaigns")
            .select("id, name, start_date, end_date")
            .eq("is_active", True)
            .execute()
            .data
        )
        if len(camp_rows) > 1:
            names = ", ".join(c.get("name", "?") for c in camp_rows)
            raise ImporterError(
                f"More than one active campaign ({names}) — deactivate all but one before importing."
            )
        campaign = None
        draws: list[Draw] = []
        if camp_rows:
            c = camp_rows[0]
            campaign = Campaign(
                id=c["id"],
                name=c.get("name") or "",
                start_date=_parse_date(c.get("start_date")),
                end_date=_parse_date(c.get("end_date")),
            )
            draw_rows = (
                self._c.table("draws")
                .select("id, campaign_id, monthly_draw, draw_date, pass_type, is_drawn")
                .eq("campaign_id", campaign.id)
                .execute()
                .data
            )
            draws = [
                Draw(
                    id=d["id"],
                    campaign_id=d["campaign_id"],
                    monthly_draw=(d.get("monthly_draw") or "").strip(),
                    draw_date=_parse_date(d.get("draw_date")),
                    pass_type=(d.get("pass_type") or "").strip().lower(),
                    is_drawn=bool(d.get("is_drawn")),
                )
                for d in draw_rows
            ]

        ct_rows = (
            self._c.table("challenge_types")
            .select("code, csv_column, label, pass_type, passes_per_unit, unit_noun, sort_order")
            .eq("is_active", True)
            .order("sort_order")
            .execute()
            .data
        )
        challenge_types = [
            ChallengeType(
                code=ct["code"],
                csv_column=(ct.get("csv_column") or "").strip(),
                label=ct.get("label") or ct["code"],
                pass_type=(ct.get("pass_type") or "").strip().lower(),
                passes_per_unit=int(ct.get("passes_per_unit") or 0),
                unit_noun=ct.get("unit_noun") or "unit",
                sort_order=int(ct.get("sort_order") or 0),
            )
            for ct in ct_rows
        ]

        return ReferenceData(
            advisors_by_email=advisors,
            campaign=campaign,
            draws=draws,
            challenge_types=challenge_types,
        )

    def existing_client_keys(self, keys: list[tuple[str, str]]) -> dict[tuple[str, str], str]:
        """Map (advisor_id, email lowercased) -> client id for keys already in DB."""
        by_advisor: dict[str, list[str]] = {}
        for advisor_id, email in keys:
            by_advisor.setdefault(advisor_id, []).append(email)
        found: dict[tuple[str, str], str] = {}
        for advisor_id, emails in by_advisor.items():
            for i in range(0, len(emails), _IN_CHUNK):
                rows = (
                    self._c.table("clients")
                    .select("id, advisor_id, client_email")
                    .eq("advisor_id", advisor_id)
                    .in_("client_email", emails[i : i + _IN_CHUNK])
                    .execute()
                    .data
                )
                for r in rows:
                    email = (r.get("client_email") or "").strip().lower()
                    found[(r["advisor_id"], email)] = r["id"]
        return found

    def existing_external_refs(self, refs: list[str]) -> set[str]:
        found: set[str] = set()
        refs = list(refs)
        for i in range(0, len(refs), _IN_CHUNK):
            rows = (
                self._c.table("pass_ledger")
                .select("external_ref")
                .in_("external_ref", refs[i : i + _IN_CHUNK])
                .execute()
                .data
            )
            found.update(r["external_ref"] for r in rows if r.get("external_ref"))
        return found

    def existing_prizes(self, draw_ids: set[str]) -> set[tuple[str, str, str]]:
        found: set[tuple[str, str, str]] = set()
        ids = list(draw_ids)
        for i in range(0, len(ids), _IN_CHUNK):
            rows = (
                self._c.table("prizes_won")
                .select("client_id, draw_id, prize_won")
                .in_("draw_id", ids[i : i + _IN_CHUNK])
                .execute()
                .data
            )
            found.update((r["client_id"], r["draw_id"], r.get("prize_won") or "") for r in rows)
        return found

    # -- writes (all idempotent upserts) --------------------------------------

    def upsert_clients(self, payloads: list[dict]) -> dict[tuple[str, str], str]:
        for i in range(0, len(payloads), 500):
            self._c.table("clients").upsert(
                payloads[i : i + 500], on_conflict="advisor_id,client_email"
            ).execute()
        # Re-select to get authoritative ids for both created and updated rows.
        keys = [(p["advisor_id"], p["client_email"]) for p in payloads]
        return self.existing_client_keys(keys)

    def upsert_ledger(self, rows: list[dict]) -> None:
        if rows:
            self._c.table("pass_ledger").upsert(rows, on_conflict="external_ref").execute()

    def upsert_prizes(self, rows: list[dict]) -> None:
        if rows:
            self._c.table("prizes_won").upsert(
                rows, on_conflict="client_id,draw_id,prize_won", ignore_duplicates=True
            ).execute()
