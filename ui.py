"""HTML/CSS building blocks for app.py, implementing the Home.dc.html design
(operator-workspace look: white topbar with stepper, light left panel with the
campaign + pass-rate card, clean main column). Pure presentation — no logic."""
from __future__ import annotations

from importer.models import PASS_GOLD, ReferenceData

BLUE = "#1E3A9F"
BLUE_DARK = "#16297a"
GOLD = "#E2B93B"
GREEN = "#1B7A3D"
RED = "#B4232A"
INK = "#14142B"
MUTED = "#8A8FA3"
FAINT = "#A0A4B8"
BORDER = "#E8EAF2"

FONT_LINKS = """
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
"""

GLOBAL_CSS = """
<style>
  /* The header is flattened for the design, but it hosts the control that
     re-opens a collapsed sidebar — so that control is pulled out and given
     its own fixed position and size, otherwise the panel cannot be restored. */
  [data-testid="stHeader"] { background: transparent; }
  /* NB: do not hide stToolbar itself — the sidebar expand button lives
     inside it, and hiding it strands a collapsed sidebar. */
  [data-testid="stDecoration"], [data-testid="stAppDeployButton"],
  [data-testid="stMainMenu"] { display: none; }
  [data-testid="stExpandSidebarButton"],
  [data-testid="stSidebarCollapsedControl"] {
    position: fixed; top: 10px; left: 10px; z-index: 1000;
    width: 34px; height: 34px; overflow: visible; pointer-events: auto;
    display: flex; align-items: center; justify-content: center;
  }
  button[data-testid="stExpandSidebarButton"],
  [data-testid="stExpandSidebarButton"] button,
  [data-testid="stSidebarCollapsedControl"] button {
    width: 34px !important; height: 34px !important;
    min-width: 34px !important; min-height: 34px !important;
    padding: 0 !important; visibility: visible !important; opacity: 1 !important;
    background: #FFFFFF; border: 1px solid #E8EAF2; border-radius: 8px; color: #1E3A9F;
    box-shadow: 0 1px 3px rgba(16,24,40,.08);
  }
  .stApp { background: #F6F7FB; }
  .block-container { padding: 0 2.2rem 4rem; max-width: 1280px; }
  .stApp :where(h1, h2, h3, h4, p, span, div, button, input, label, small, li, td, th)
      :not([data-testid="stIconMaterial"]):not(.material-symbols-rounded) {
    font-family: 'Instrument Sans', 'Source Sans Pro', sans-serif;
  }
  .stApp h1 {
    background: none; padding: 0; font-size: 27px; font-weight: 600;
    letter-spacing: -.02em; color: #14142B;
  }
  .stApp h2, .stApp h3 {
    background: none; padding: 0; font-size: 19px; font-weight: 600;
    color: #14142B; letter-spacing: -.01em;
  }

  /* topbar */
  .st-key-topbar {
    background: #FFFFFF; border-bottom: 1px solid #E8EAF2;
    padding: 14px 24px 6px; margin: 0 -2.2rem 1.6rem;
  }
  .topbar-brand { display: flex; align-items: center; gap: 12px; padding-top: 4px; }
  .topbar-brand .mark {
    width: 28px; height: 28px; border-radius: 7px; background: #1E3A9F;
    display: flex; align-items: center; justify-content: center; flex: none;
  }
  .topbar-brand .mark i {
    width: 13px; height: 9px; border: 1.5px solid #fff; border-radius: 2px; display: block;
  }
  .topbar-brand b { font-size: 15px; font-weight: 600; letter-spacing: -.01em; color: #14142B; white-space: nowrap; }
  .stepper { display: flex; align-items: center; gap: 8px; justify-content: center; padding-top: 6px; }
  .stepper .num {
    width: 22px; height: 22px; border-radius: 50%; font-size: 11px; font-weight: 600;
    display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; flex: none;
  }
  .stepper .lbl { font-size: 13px; white-space: nowrap; }
  .stepper .line { width: 28px; height: 1.5px; background: #E0E3EE; margin: 0 4px; }
  .topbar-meta { font-size: 13px; color: #8A8FA3; white-space: nowrap; text-align: right; padding-top: 9px; }
  .st-key-logout_btn button {
    background: none; border: none; color: #5C6178; font-size: 13px; padding: 4px 8px;
  }
  .st-key-logout_btn button:hover { color: #14142B; background: none; border: none; }

  /* left panel */
  [data-testid="stSidebar"] {
    background: #FBFBFD; border-right: 1px solid #E8EAF2;
    min-width: 320px; max-width: 320px;
  }
  .panel-label {
    font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
    color: #A0A4B8; font-weight: 600; display: block; margin-bottom: 12px;
  }
  .campaign-row { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
  .globe { width: 46px; height: 46px; border-radius: 50%; background: #1E3A9F; flex: none; position: relative; overflow: hidden; }
  .globe i { position: absolute; box-sizing: border-box; }
  .globe .ring { inset: 0; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.35); }
  .globe .mer { top: 0; bottom: 0; left: 50%; width: 1.5px; background: rgba(255,255,255,.45); }
  .globe .oval { top: 0; bottom: 0; left: 50%; width: 26px; margin-left: -13px; border-radius: 50%;
                 border-left: 1.5px solid rgba(255,255,255,.45); border-right: 1.5px solid rgba(255,255,255,.45); }
  .globe .eq { left: 0; right: 0; top: 50%; height: 1.5px; background: rgba(255,255,255,.45); }
  .globe .lat1 { left: 0; right: 0; top: 26%; height: 1.5px; background: rgba(255,255,255,.3); }
  .globe .lat2 { left: 0; right: 0; top: 74%; height: 1.5px; background: rgba(255,255,255,.3); }
  .campaign-row .name { font-size: 18px; font-weight: 700; letter-spacing: -.01em; line-height: 1.2; color: #14142B; display: block; }
  .campaign-row .dates { font-size: 13px; color: #8A8FA3; }
  .rates-card { border: 1px solid #E8EAF2; border-radius: 10px; overflow: hidden; background: #fff; }
  .rates-card .row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 9px 14px; border-bottom: 1px solid #F1F2F7; font-size: 13px; color: #14142B;
  }
  .rates-card .row:last-child { border-bottom: none; }
  .rate-badge { display: flex; align-items: stretch; border-radius: 5px; overflow: hidden; flex: none; box-shadow: 0 1px 2px rgba(16,24,40,.14); }
  .rate-badge .stub { width: 7px; border-right: 1.5px dashed rgba(255,255,255,.85); box-sizing: border-box; }
  .rate-badge .val { color: #fff; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 500; padding: 3px 8px; display: flex; align-items: center; }
  .rates-legend { display: flex; gap: 14px; font-size: 12px; color: #8A8FA3; margin-top: 10px; }
  .rates-legend span { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .mini-ticket { width: 18px; height: 11px; border-radius: 3px; display: inline-flex; overflow: hidden; }
  .mini-ticket i { width: 6px; border-right: 1px dashed rgba(255,255,255,.9); box-sizing: border-box; display: block; }

  /* hide layout gaps left by style-only markdown blocks */
  [data-testid="stElementContainer"]:has([data-testid="stMarkdownContainer"] > style:only-child) {
    display: none;
  }
  [data-testid="stElementContainer"]:has([data-testid="stMarkdownContainer"] > link) {
    display: none;
  }

  /* month pills */
  [data-testid="stPills"] button, [data-testid="stButtonGroup"] button {
    border: 1px solid #E8EAF2; background: #fff; color: #8A8FA3;
    border-radius: 9px; padding: 9px 24px; font-weight: 500;
  }
  [data-testid="stPills"] button p, [data-testid="stButtonGroup"] button p {
    font-size: 14.5px; color: inherit;
  }
  [data-testid="stPills"] button:hover, [data-testid="stButtonGroup"] button:hover {
    border-color: #C9CEE0; color: #5C6178; background: #fff;
  }
  [data-testid="stPills"] button[aria-checked="true"],
  [data-testid="stButtonGroup"] button[aria-checked="true"] {
    border: 1.5px solid #1E3A9F; background: #F6F8FE; color: #1E3A9F; font-weight: 600;
  }
  [data-testid="stPills"] button[aria-checked="true"] p,
  [data-testid="stButtonGroup"] button[aria-checked="true"] p { font-weight: 600; }

  /* uploader dropzone */
  [data-testid="stFileUploaderDropzone"] {
    flex-direction: column; align-items: center; gap: 12px; padding: 52px 32px;
    border: 1.5px dashed #C9CEE0; border-radius: 14px; background: #FBFBFD;
  }
  [data-testid="stFileUploaderDropzone"]:hover { border-color: #1E3A9F; background: #F6F8FE; }
  [data-testid="stFileUploaderDropzoneInstructions"] {
    margin: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; order: 1;
  }
  [data-testid="stFileUploaderDropzoneInstructions"] > * { display: none; }
  [data-testid="stFileUploaderDropzoneInstructions"]::before {
    content: "↑"; width: 46px; height: 46px; border-radius: 11px; background: #EDF0F9;
    display: flex; align-items: center; justify-content: center; color: #1E3A9F; font-size: 19px;
  }
  [data-testid="stFileUploaderDropzone"] > span { order: 2; align-self: center; }
  [data-testid="stFileUploaderDropzone"] button[data-testid="stBaseButton-secondary"] {
    background: #1E3A9F; color: #fff; border: none; border-radius: 8px;
    padding: 10px 22px; font-size: 0;
  }
  [data-testid="stFileUploaderDropzone"] button[data-testid="stBaseButton-secondary"] > * { display: none; }
  [data-testid="stFileUploaderDropzone"] button[data-testid="stBaseButton-secondary"]::after {
    content: "Browse files"; font-size: 14px; font-weight: 600; color: #fff;
  }
  [data-testid="stFileUploaderDropzone"] button[data-testid="stBaseButton-secondary"]:hover {
    background: #16297a; border: none;
  }
  [data-testid="stFileChips"] { font-size: 13px; }
  [data-testid="stFileUploaderDropzone"]::after {
    content: "CSV or XLSX · 200 MB max · nothing is written until you press Confirm";
    font-size: 12.5px; color: #A0A4B8; order: 3;
  }

  /* cards */
  .file-card {
    border: 1px solid #E8EAF2; border-radius: 14px; background: #fff;
    display: flex; align-items: center; gap: 14px; padding: 18px 22px; margin-bottom: 4px;
  }
  .file-card .ftype {
    width: 42px; height: 42px; border-radius: 10px; background: #EDF0F9;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: #1E3A9F; flex: none;
  }
  .file-card .fname { font-size: 14.5px; font-weight: 600; color: #14142B; display: block; }
  .file-card .fmeta { font-size: 12.5px; color: #8A8FA3; }
  .file-card .fbody { flex: 1; }
  .badge-ok {
    display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600;
    color: #1B7A3D; background: #EAF6EE; border-radius: 999px; padding: 6px 14px; white-space: nowrap;
  }
  .badge-ok i { width: 7px; height: 7px; border-radius: 50%; background: #1B7A3D; display: block; }
  .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 4px 0; }
  .stat-card { border: 1px solid #E8EAF2; border-radius: 12px; background: #fff; padding: 18px 20px; }
  .stat-card .v { font-size: 24px; font-weight: 600; font-family: 'IBM Plex Mono', monospace; color: #14142B; display: block; }
  .stat-card .l { font-size: 12.5px; color: #8A8FA3; }
  .stat-card.good .v { color: #1B7A3D; }
  .stat-card.bad { border-color: #F0D9DB; background: #FDF7F7; }
  .stat-card.bad .v { color: #B4232A; }
  .stat-card.bad .l { color: #9A6A6D; }
  .issues-card { border: 1px solid #E8EAF2; border-radius: 12px; background: #fff; overflow: hidden; margin: 4px 0; }
  .issues-card .head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px; border-bottom: 1px solid #F1F2F7; background: #FBFBFD;
  }
  .issues-card .head b { font-size: 13px; font-weight: 600; color: #5C6178; }
  .issues-card .head span { font-size: 12.5px; color: #8A8FA3; }
  .issues-card .item {
    display: flex; align-items: center; gap: 12px; padding: 11px 20px;
    border-bottom: 1px solid #F1F2F7; font-size: 13.5px; color: #14142B;
  }
  .issues-card .item:last-child { border-bottom: none; }
  .issues-card .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .issues-card .txt { flex: 1; }
  .issues-card .cnt { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #8A8FA3; white-space: nowrap; }

  .stButton button[kind="primary"], .stButton button[data-testid="stBaseButton-primary"] {
    border-radius: 9px; font-weight: 600; padding: 12px 26px;
  }
  .muted-note { font-size: 13px; color: #8A8FA3; }
  [data-testid="stWidgetLabel"] p { font-size: 14px; font-weight: 600; color: #14142B; }
</style>
"""


def dropzone_title_css(month: str | None) -> str:
    label = f"Drop the {month} mastersheet here" if month else "Drop the mastersheet here"
    return (
        '<style>[data-testid="stFileUploaderDropzoneInstructions"]::after '
        f'{{ content: "{label}"; display: block; font-size: 15.5px; font-weight: 600; color: #14142B; }}</style>'
    )


def brand_html() -> str:
    return (
        '<div class="topbar-brand"><span class="mark"><i></i></span>'
        "<b>Lucky Draw Sheet Importer</b></div>"
    )


def stepper_html(done: int, active: int) -> str:
    """done: number of completed steps; active: 0-based index of the current one."""
    names = ["Upload", "Validate", "Confirm"]
    parts = ['<div class="stepper">']
    for i, name in enumerate(names):
        if i < done:
            num, bg, color, border = "✓", GREEN, "#fff", "none"
            lbl_color, weight = GREEN, "500"
        elif i == active:
            num, bg, color, border = str(i + 1), BLUE, "#fff", "none"
            lbl_color, weight = INK, "600"
        else:
            num, bg, color, border = str(i + 1), "#fff", FAINT, "1.5px solid #E0E3EE"
            lbl_color, weight = FAINT, "500"
        parts.append(
            f'<span class="num" style="background:{bg}; color:{color}; border:{border};">{num}</span>'
            f'<span class="lbl" style="color:{lbl_color}; font-weight:{weight};">{name}</span>'
        )
        if i < len(names) - 1:
            parts.append('<span class="line"></span>')
    parts.append("</div>")
    return "".join(parts)


def sidebar_html(ref: ReferenceData) -> str:
    campaign = ref.campaign
    dates = ""
    if campaign and campaign.start_date and campaign.end_date:
        dates = f"{campaign.start_date} → {campaign.end_date}"
    rows = []
    for ct in ref.challenge_types:
        color = GOLD if ct.pass_type == PASS_GOLD else BLUE
        rows.append(
            f'<div class="row"><span>{ct.label}</span>'
            f'<span class="rate-badge"><span class="stub" style="background:{color};"></span>'
            f'<span class="val" style="background:{color};">×{ct.passes_per_unit}</span></span></div>'
        )
    return f"""
<span class="panel-label">Active campaign</span>
<div class="campaign-row">
  <div class="globe"><i class="ring"></i><i class="mer"></i><i class="oval"></i><i class="eq"></i><i class="lat1"></i><i class="lat2"></i></div>
  <div><span class="name">{campaign.name if campaign else "—"}</span>
  <span class="dates">{dates}</span></div>
</div>
<span class="panel-label">Pass rates</span>
<div class="rates-card">{''.join(rows)}</div>
<div class="rates-legend">
  <span><span class="mini-ticket" style="background:{GOLD};"><i></i></span>gold draw</span>
  <span><span class="mini-ticket" style="background:{BLUE};"><i></i></span>blue draw</span>
</div>
"""


def file_card_html(filename: str, size_bytes: int, month: str) -> str:
    ext = "XLSX" if filename.lower().endswith((".xlsx", ".xlsm", ".xls")) else "CSV"
    if size_bytes >= 1024 * 1024:
        size = f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        size = f"{max(size_bytes // 1024, 1)} KB"
    return f"""
<div class="file-card">
  <div class="ftype">{ext}</div>
  <div class="fbody"><span class="fname">{filename}</span>
  <span class="fmeta">{size} · {month} draw</span></div>
  <span class="badge-ok"><i></i>Parsed</span>
</div>
"""


def stat_cards_html(rows: int, passes: int, clean: int, flagged: int) -> str:
    flagged_cls = "stat-card bad" if flagged else "stat-card"
    return f"""
<div class="stat-grid">
  <div class="stat-card"><span class="v">{rows:,}</span><span class="l">client rows</span></div>
  <div class="stat-card"><span class="v">{passes:,}</span><span class="l">passes to create</span></div>
  <div class="stat-card good"><span class="v">{clean:,}</span><span class="l">rows clean</span></div>
  <div class="{flagged_cls}"><span class="v">{flagged:,}</span><span class="l">rows need attention</span></div>
</div>
"""


def top_issues_html(items: list[tuple[str, str, int]]) -> str:
    """items: (severity, label, row count) — most frequent first."""
    if not items:
        return ""
    rows = "".join(
        f'<div class="item"><span class="dot" style="background:{RED if sev == "ERROR" else GOLD};"></span>'
        f'<span class="txt">{label}</span><span class="cnt">{count} row{"s" if count != 1 else ""}</span></div>'
        for sev, label, count in items
    )
    return (
        '<div class="issues-card"><div class="head"><b>Top issues</b>'
        "<span>full list below</span></div>" + rows + "</div>"
    )
