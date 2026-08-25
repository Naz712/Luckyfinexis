"""Dataclasses shared across the importer: reference data, row reports, plans."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

PASS_GOLD = "gold"
PASS_BLUE = "blue"

SEV_WARNING = "WARNING"
SEV_ERROR = "ERROR"

# Scope controls what an ERROR blocks.
#   ROW   — the whole row is skipped (no client upsert, no ledger, no prize).
#   PRIZE — only the prize insert is skipped; the row's pass_ledger entries
#           still import. A bad prize cell must not discard the client's passes.
SCOPE_ROW = "ROW"
SCOPE_PRIZE = "PRIZE"

STATUS_OK = "OK"


class ImporterError(Exception):
    """Fatal, user-facing importer problem (bad config, unreachable schema, ...)."""


@dataclass(frozen=True)
class Advisor:
    id: str
    fc_email: str  # stored lowercased
    fc_code: str
    fc_name: str


@dataclass(frozen=True)
class Campaign:
    id: str
    name: str
    start_date: date | None
    end_date: date | None


@dataclass(frozen=True)
class Draw:
    id: str
    campaign_id: str
    monthly_draw: str
    draw_date: date | None
    pass_type: str  # 'gold' | 'blue'
    is_drawn: bool


@dataclass(frozen=True)
class ChallengeType:
    code: str
    csv_column: str
    label: str
    pass_type: str  # 'gold' | 'blue'
    passes_per_unit: int
    unit_noun: str
    sort_order: int


@dataclass
class ReferenceData:
    """Everything the importer needs to read from the database up front."""

    advisors_by_email: dict[str, Advisor]  # keyed by lowercased fc_email
    campaign: Campaign | None
    draws: list[Draw]
    challenge_types: list[ChallengeType]  # active only, ordered by sort_order

    def draw_for(self, monthly_draw: str, pass_type: str) -> Draw | None:
        for d in self.draws:
            if d.monthly_draw == monthly_draw and d.pass_type == pass_type:
                return d
        return None

    def match_month(self, text: str) -> str | None:
        """Exact (case-insensitive) match against known draw months. Never fuzzy."""
        t = text.strip().lower()
        for m in self.months():
            if m.lower() == t:
                return m
        return None

    def months(self) -> list[str]:
        seen: dict[str, date] = {}
        for d in self.draws:
            key = d.monthly_draw
            dt = d.draw_date or date.max
            if key not in seen or dt < seen[key]:
                seen[key] = dt
        return [m for m, _ in sorted(seen.items(), key=lambda kv: kv[1])]

    def month_date(self, month: str) -> date | None:
        dates = [d.draw_date for d in self.draws if d.monthly_draw == month and d.draw_date]
        return min(dates) if dates else None


@dataclass(frozen=True)
class Issue:
    severity: str  # SEV_WARNING | SEV_ERROR
    scope: str  # SCOPE_ROW | SCOPE_PRIZE
    message: str


@dataclass(frozen=True)
class PrizeAward:
    """A fully validated prize cell (draw already resolved)."""

    monthly_draw: str
    pass_type: str
    prize_won: str
    draw_id: str


@dataclass
class RowReport:
    """Validation outcome for one CSV row. Row numbers are spreadsheet-style:
    the header is row 1, the first data row is row 2."""

    row_num: int
    fc_email: str = ""
    fc_code: str = ""
    advisor: Advisor | None = None
    client_name: str = ""
    client_email: str = ""  # trimmed + lowercased; the client upsert key
    client_mobile: str = ""
    units: dict[str, int] = field(default_factory=dict)  # challenge code -> units
    computed_gold: int = 0
    computed_blue: int = 0
    date_updated: date | None = None
    prize: PrizeAward | None = None
    issues: list[Issue] = field(default_factory=list)

    def add_error(self, message: str, scope: str = SCOPE_ROW) -> None:
        self.issues.append(Issue(SEV_ERROR, scope, message))

    def add_warning(self, message: str) -> None:
        self.issues.append(Issue(SEV_WARNING, SCOPE_ROW, message))

    @property
    def status(self) -> str:
        if any(i.severity == SEV_ERROR for i in self.issues):
            return SEV_ERROR
        if self.issues:
            return SEV_WARNING
        return STATUS_OK

    @property
    def blocked(self) -> bool:
        """True when the whole row must be skipped."""
        return any(i.severity == SEV_ERROR and i.scope == SCOPE_ROW for i in self.issues)

    @property
    def prize_blocked(self) -> bool:
        """True when the prize (but possibly not the row) must be skipped."""
        return self.blocked or any(
            i.severity == SEV_ERROR and i.scope == SCOPE_PRIZE for i in self.issues
        )

    def reasons(self) -> list[str]:
        return [i.message for i in self.issues]


@dataclass
class FileReport:
    selected_month: str
    fatal: list[str] = field(default_factory=list)  # file cannot be processed at all
    unexpected_columns: list[str] = field(default_factory=list)
    rows: list[RowReport] = field(default_factory=list)

    @property
    def ok_rows(self) -> list[RowReport]:
        return [r for r in self.rows if r.status == STATUS_OK]

    @property
    def warning_rows(self) -> list[RowReport]:
        return [r for r in self.rows if r.status == SEV_WARNING]

    @property
    def error_rows(self) -> list[RowReport]:
        return [r for r in self.rows if r.status == SEV_ERROR]

    def importable(self) -> list[RowReport]:
        return [r for r in self.rows if not r.blocked]


@dataclass(frozen=True)
class LedgerEntry:
    """One future pass_ledger row, produced by the unpivot."""

    row_num: int
    client_key: tuple[str, str]  # (advisor_id, client_email lowercased)
    external_ref: str
    challenge_code: str
    pass_type: str
    units: int
    rate_applied: int
    draw_id: str
    draw_date: date | None
    date_updated: date | None
    description: str


@dataclass(frozen=True)
class PrizeItem:
    row_num: int
    client_key: tuple[str, str]
    draw_id: str
    prize_won: str


@dataclass
class ImportPlan:
    """Everything the Confirm button will write, computed read-only."""

    month: str
    campaign_id: str
    campaign_name: str
    rows_total: int
    rows_importable: int
    client_payloads: list[dict]
    clients_create: list[tuple[str, str]]
    clients_update: list[tuple[str, str]]
    ledger_entries: list[LedgerEntry]
    ledger_new_refs: set[str]
    ledger_existing_refs: set[str]
    prizes: list[PrizeItem]
    prizes_new: list[PrizeItem]
    prizes_existing: list[PrizeItem]
    skipped_rows: list[tuple[int, list[str]]]
    prize_skips: list[tuple[int, list[str]]]


@dataclass
class ImportSummary:
    month: str
    campaign_name: str
    rows_total: int
    rows_imported: int
    rows_skipped: int
    prize_cells_skipped: int
    clients_created: int
    clients_updated: int
    ledger_inserted: int
    ledger_updated: int
    prizes_inserted: int
    prizes_already_present: int
    gold_passes: int
    blue_passes: int

    def as_text(self) -> str:
        return "\n".join(
            [
                f"Import complete — campaign '{self.campaign_name}', draw month {self.month}",
                f"  Rows: {self.rows_imported} imported, {self.rows_skipped} skipped "
                f"of {self.rows_total} total",
                f"  Clients: {self.clients_created} created, {self.clients_updated} updated",
                f"  Pass ledger: {self.ledger_inserted} inserted, "
                f"{self.ledger_updated} updated in place (idempotent re-run)",
                f"  Passes recorded: {self.gold_passes} gold, {self.blue_passes} blue",
                f"  Prizes: {self.prizes_inserted} inserted, "
                f"{self.prizes_already_present} already present, "
                f"{self.prize_cells_skipped} skipped by validation",
            ]
        )
