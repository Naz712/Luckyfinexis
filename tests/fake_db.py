"""In-memory stand-in for SupabaseDatabase.

Implements the same method surface as importer.db.SupabaseDatabase and
enforces the same unique constraints:
    clients      UNIQUE(advisor_id, client_email)
    pass_ledger  UNIQUE(external_ref)
    prizes_won   UNIQUE(client_id, draw_id, prize_won)
so the offline harness genuinely exercises the idempotency path.
"""
from __future__ import annotations

import uuid

from importer.models import ReferenceData


def _uid(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"https://luckyfinexis.test/{name}"))


class FakeDatabase:
    def __init__(self, ref: ReferenceData) -> None:
        self._ref = ref
        # (advisor_id, client_email) -> {"id", "client_name", "client_mobile"}
        self.clients: dict[tuple[str, str], dict] = {}
        # external_ref -> ledger row dict
        self.ledger: dict[str, dict] = {}
        # {(client_id, draw_id, prize_won)}
        self.prizes: set[tuple[str, str, str]] = set()
        # write accounting, so the harness can assert idempotency
        self.ledger_inserted = 0
        self.ledger_updated = 0
        self.prizes_inserted = 0
        self.prizes_ignored = 0

    # -- reads ---------------------------------------------------------------

    def load_reference(self) -> ReferenceData:
        return self._ref

    def existing_client_keys(self, keys):
        return {k: self.clients[k]["id"] for k in keys if k in self.clients}

    def existing_external_refs(self, refs):
        return {r for r in refs if r in self.ledger}

    def existing_prizes(self, draw_ids):
        return {p for p in self.prizes if p[1] in draw_ids}

    # -- writes --------------------------------------------------------------

    def upsert_clients(self, payloads):
        for p in payloads:
            key = (p["advisor_id"], p["client_email"])
            if key in self.clients:
                self.clients[key].update(
                    client_name=p["client_name"], client_mobile=p["client_mobile"]
                )
            else:
                self.clients[key] = {
                    "id": _uid(f"client/{key[0]}/{key[1]}"),
                    "client_name": p["client_name"],
                    "client_mobile": p["client_mobile"],
                }
        return {
            (p["advisor_id"], p["client_email"]): self.clients[(p["advisor_id"], p["client_email"])]["id"]
            for p in payloads
        }

    def upsert_ledger(self, rows):
        for row in rows:
            ref = row["external_ref"]
            if ref in self.ledger:
                self.ledger[ref].update(row)
                self.ledger_updated += 1
            else:
                self.ledger[ref] = dict(row)
                self.ledger_inserted += 1

    def upsert_prizes(self, rows):
        for row in rows:
            key = (row["client_id"], row["draw_id"], row["prize_won"])
            if key in self.prizes:
                self.prizes_ignored += 1
            else:
                self.prizes.add(key)
                self.prizes_inserted += 1

    # -- harness helpers ------------------------------------------------------

    def total_passes(self) -> tuple[int, int]:
        gold = blue = 0
        by_id = {d.id: d for d in self._ref.draws}
        for row in self.ledger.values():
            passes = row["units"] * row["rate_applied"]
            if by_id[row["draw_id"]].pass_type == "gold":
                gold += passes
            else:
                blue += passes
        return gold, blue
