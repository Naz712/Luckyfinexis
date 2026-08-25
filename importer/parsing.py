"""Reading the uploaded mastersheet into a DataFrame of raw cell values.

Guarantees given to the validator:
  - every cell is either a str, an int/float (xlsx), or a date/datetime (xlsx);
    missing values arrive as "" (never NaN)
  - completely blank rows are dropped, but the original positional index is
    preserved so spreadsheet row numbers (header = row 1) stay accurate
  - a UTF-8 BOM is stripped
"""
from __future__ import annotations

import io
import math

import pandas as pd


def _cell_text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and math.isnan(v):
        return ""
    return str(v).strip()


def read_upload(filename: str, data: bytes) -> tuple[pd.DataFrame | None, str | None]:
    """Return (dataframe, None) or (None, user-facing error message)."""
    if not data or not data.strip():
        return None, "The file is empty — there is nothing to import."

    name = (filename or "").lower()
    try:
        if name.endswith((".xlsx", ".xlsm", ".xls")):
            df = pd.read_excel(io.BytesIO(data), dtype=object)
        else:
            # keep_default_na=False keeps literal "N/A" as text instead of NaN,
            # so the validator can report it. utf-8-sig strips a BOM if present.
            # skip_blank_lines=False keeps blank lines in the index so row
            # numbers keep matching what the user sees in Excel.
            df = pd.read_csv(
                io.BytesIO(data),
                dtype=str,
                keep_default_na=False,
                encoding="utf-8-sig",
                skip_blank_lines=False,
            )
    except pd.errors.EmptyDataError:
        return None, "The file is empty — there is nothing to import."
    except Exception as exc:  # unreadable/corrupt file
        return None, f"Could not read the file: {exc}"

    # Normalise all missing values to "" so validation never sees NaN.
    df = df.where(pd.notna(df), "")

    if df.shape[1] == 0:
        return None, "The file has no columns."

    # Drop rows where every cell is blank (common in Excel exports); the
    # original index is preserved, so row numbering stays correct.
    mask = df.apply(lambda r: any(_cell_text(v) for v in r), axis=1)
    df = df[mask]

    if df.shape[0] == 0:
        return None, "The file contains only headers — no data rows to import."

    return df, None
