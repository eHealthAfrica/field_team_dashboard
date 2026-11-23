"""
Field Consultants' Check-in & Field Performance Report - month-end generator.

Builds the monthly report (Word) and its evidence annex (Excel) for one
reporting cycle. A cycle runs from the 24th of the previous month to the 23rd
of the named month, e.g. "2026-11" = 24 Oct 2026 - 23 Nov 2026.

    python scripts/monthly_report.py                    # current cycle, to date
    python scripts/monthly_report.py --cycle 2026-11    # a specific cycle
    python scripts/monthly_report.py --refresh          # re-download from Kobo

Outputs go to reports/ (gitignored): the report contains staff names and must
never be committed to the public repository.

Needs KOBO_TOKEN in the environment or in .env (same as fetch_data.py).
"""

import argparse
import collections
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
os.chdir(ROOT)

import fetch_data as fd  # noqa: E402  (reuses the dashboard's cleaning rules)

from docx import Document  # noqa: E402
from docx.enum.section import WD_ORIENT  # noqa: E402
from docx.enum.table import WD_TABLE_ALIGNMENT  # noqa: E402
from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: E402
from docx.oxml import OxmlElement  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402
from docx.shared import Cm, Pt, RGBColor  # noqa: E402
from openpyxl import Workbook  # noqa: E402
from openpyxl.styles import Alignment, Font, PatternFill  # noqa: E402
from openpyxl.utils import get_column_letter  # noqa: E402

REPORT_DIR = os.path.join(ROOT, "reports")
CACHE = os.path.join(REPORT_DIR, "_kobo_cache.json")
# Expected valid days per cycle, set by the Programme Manager. Never scaled.
EXPECTED_DAYS = {"lc": 15, "sc": 22}
DEFAULT_EXPECTED_DAYS = None        # kept for the CLI flag; the per-role values apply


def exp_for(role):
    return EXPECTED_DAYS.get(role, EXPECTED_DAYS["lc"])


def exp_text(people):
    has = lambda r: any(p["role"] == r for p in people)
    parts = [f"{EXPECTED_DAYS['lc']} valid days for LGA Coordinators" if has("lc") else None,
             f"{EXPECTED_DAYS['sc']}{'' if has('lc') else ' valid days'} for State Coordinators" if has("sc") else None]
    return " and ".join(x for x in parts if x) or f"{EXPECTED_DAYS['lc']} valid days"
NAVY = "123B5D"                     # template header colour

# Invalid-record rules, applied the same way every cycle.
RULE_TEXT = {
    "outside_no_redeploy": "Outside the assigned LGA with no redeployment code",
    "date_mismatch": "Date problem: finished on a different day, or phone clock set back",
    "outside_cycle": "Report date outside the reporting cycle",
    "duplicate": "Extra check-in on a day already counted (one per consultant per day)",
}
DQ_FLAG_GROUPS = {
    "GPS precision / implausible location": ["same_gps_as_last", "far_from_last", "moved_during_form", "far_outside"],
    "Duplicate / suspicious submissions": ["copied_from_last", "other_user_on_phone", "rushed", "open_too_long"],
    "Incorrect phone date/time": ["clock_moved_back", "finished_other_day", "date_after_submission", "odd_hour"],
    "Other validation issues": ["retrieved_gt_issued", "tracks_gt_deployed", "charge_ne_deployed", "qc_gt_deployed",
                                "settlements_lt_wards", "mlos_new_gt_validated", "teams_gt_phones", "all_phones_faulty",
                                "many_activities", "many_wards", "meeting_only_day", "outside_field_work",
                                "evening_review_in_morning"],
}
ACT_LABEL = {
    "stk": "Stakeholder engagement", "trk": "Uploading tracks", "csup": "Campaign supervision", "eoc": "EOC meeting",
    "omeet": "Other meetings", "mlos": "MLoS validation", "dip": "DIP development", "plog": "Phone logistics",
    "ri": "RI supportive supervision", "pqc": "Phone QCs", "chg": "Daily charging of devices", "flag": "Campaign flag-off",
    "fbk": "Daily feedback", "erm": "Evening review meeting", "mdp": "Morning deployment of phones", "oth": "Other activities",
}
OUT_LABEL = {
    "mdp_phones": "Phones deployed", "mdp_teams": "Teams deployed", "csup_teams": "Teams supervised",
    "csup_settlements": "Settlements visited", "pqc_checked": "Phones QC'd", "trk_num": "Phones with tracks uploaded",
    "chg_charged": "Devices charged", "mlos_validated": "Settlements validated", "stk_num": "Stakeholders engaged",
}


# ----------------------------------------------------------------------------- dates

def cycle_bounds(cycle):
    y, m = map(int, cycle.split("-"))
    end = dt.date(y, m, 23)
    start = (dt.date(y, m, 1) - dt.timedelta(days=1)).replace(day=24)
    return start, end


def current_cycle(today):
    return f"{today.year}-{today.month:02d}" if today.day <= 23 else \
        (f"{today.year + 1}-01" if today.month == 12 else f"{today.year}-{today.month + 1:02d}")


def days(a, b):
    return [a + dt.timedelta(days=k) for k in range((b - a).days + 1)]


def fmt(d):
    return d.strftime("%d %b %Y").lstrip("0")


# ----------------------------------------------------------------------------- data

def load(refresh):
    os.makedirs(REPORT_DIR, exist_ok=True)
    if refresh or not os.path.exists(CACHE):
        print("Downloading submissions from Kobo (a few minutes)...")
        raw = fd.fetch_submissions()
        roster = fd.fetch_roster()
        if roster is None:
            sys.exit("Could not download the roster (c_data.csv) from Kobo.")
        with open(CACHE, "w", encoding="utf-8") as fh:
            json.dump({"fetched": dt.datetime.now(fd.WAT).isoformat(), "raw": raw, "roster": roster}, fh)
    with open(CACHE, encoding="utf-8") as fh:
        c = json.load(fh)
    return c["raw"], c["roster"], c["fetched"]


def build(raw, roster_rows, start, end):
    """Records for the cycle, each with a validity verdict and reason."""
    staff = fd.clean_roster(roster_rows)
    names = {fd.user_hash(r.get("key_id")): fd.s(r.get("name_cdd")) for r in roster_rows}
    for p in staff:
        p["name"] = names.get(p["id"], "")
    who = {p["id"]: p["who"] for p in staff}

    recs, failed_logins = [], 0
    for r in raw:
        row = fd.clean(r, who)
        flat = fd.flatten(r)
        if row is None:
            failed_logins += 1
            continue
        d = dt.date.fromisoformat(row["date"])
        sub = fd.parse_dt(r.get("_submission_time"))
        sub_d = sub.date() if sub else d
        in_window = start <= d <= end
        if not in_window and not (start <= sub_d <= end):
            continue
        # A check-in sent during the cycle but dated outside it (wrong phone
        # date) is kept as an invalid record, counted on the day it was sent.
        out_of_cycle = not in_window
        if out_of_cycle:
            d = sub_d
        gps = fd.s(flat.get("gps")).split()
        atts = r.get("_attachments") or []
        row.update({
            "name": fd.s(flat.get("auth_name")),
            "gps_ok": len(gps) >= 2,
            "gps_acc": float(gps[3]) if len(gps) >= 4 else None,
            "selfie": any("selfie" in (str(a.get("question_xpath", "")) + str(a.get("filename", ""))).lower() for a in atts),
            "d": d, "out_of_cycle": out_of_cycle,
        })
        recs.append(row)
    recs.sort(key=lambda x: (x["date"], x["time"]))

    # Rule-based validity, one verdict per record.
    for x in recs:
        x["reason"] = None
        if x["out_of_cycle"]:
            x["reason"] = "outside_cycle"
        elif x["status"] == "outside_not_redeployed":
            x["reason"] = "outside_no_redeploy"
        elif "finished_other_day" in x["flags"] or "clock_moved_back" in x["flags"]:
            x["reason"] = "date_mismatch"
    seen = set()
    for x in recs:   # first valid record per consultant per day counts; later ones are duplicates
        key = (x["uid"] or x["name"], x["date"])
        if x["reason"] is None:
            if key in seen:
                x["reason"] = "duplicate"
            else:
                seen.add(key)
        x["valid"] = x["reason"] is None
    return staff, recs, failed_logins


# ----------------------------------------------------------------------------- analysis

def analyse(staff, recs, start, end, as_of, expected_cfg, failed_logins):
    period_end = min(end, as_of)
    first_data = min((x["d"] for x in recs), default=start)
    live_start = max(start, first_data)
    live_days = days(live_start, period_end)
    # The PM's standard as written in the template; not scaled for drafts.

    by_uid = collections.defaultdict(list)
    for x in recs:
        by_uid[x["uid"] or x["name"]].append(x)

    people = []
    for p in staff:
        rs = by_uid.get(p["id"], [])
        vdays = sorted({x["d"] for x in rs if x["valid"]})
        people.append({
            **p, "total": len(rs), "invalid": sum(not x["valid"] for x in rs), "valid": sum(x["valid"] for x in rs),
            "valid_days": len(vdays), "total_days": len({x["d"] for x in rs}),
            "exp": exp_for(p["role"]), "met": len(vdays) >= exp_for(p["role"]),
            "last": max((x["d"] for x in rs), default=None),
            "reasons": collections.Counter(x["reason"] for x in rs if x["reason"]),
        })
    orphans = [x for x in recs if x["uid"] not in {p["id"] for p in staff}]

    states = []
    for st in sorted({p["state"] for p in staff}):
        ps = [p for p in people if p["state"] == st]
        rs = [x for x in recs if x["state"] == st]
        states.append({
            "state": st, "lgas": len({p["lga"] for p in ps if p["lga"]}), "expected": len(ps),
            "reporting": sum(1 for p in ps if p["total"]), "valid": sum(x["valid"] for x in rs), "total": len(rs),
            "met": sum(p["met"] for p in ps),
            "coverage": pct(sum(p["valid_days"] for p in ps), len(ps) * len(live_days)),
        })

    # Outside-LGA exceptions, one row per consultant
    outside = collections.defaultdict(list)
    for x in recs:
        if x["status"] in ("outside_not_redeployed", "outside_old_form", "within_state", "interstate"):
            outside[x["uid"] or x["name"]].append(x)
    out_rows = []
    for k, rs in outside.items():
        st = collections.Counter(x["status"] for x in rs)
        f = rs[0]
        found = collections.Counter(x["found_lga"] or "Outside programme area" for x in rs).most_common(1)[0][0]
        if st.get("outside_not_redeployed"):
            outcome = "Pending - no redeployment code"
        elif st.get("outside_old_form"):
            outcome = "Pending - old form version, redeployment unknown"
        else:
            outcome = "Verified - redeployment code entered"
        reasons = "; ".join(sorted({x["outside_reason"] for x in rs if x["outside_reason"]}))[:300]
        dists = [x["dist_km"] for x in rs if x["dist_km"] is not None]
        out_rows.append({
            "name": f["name"], "who": f["who"], "state": f["state"], "lga": f["home_lga"], "found": found,
            "days": len({x["d"] for x in rs}), "unverified_days": len({x["d"] for x in rs if x["status"] != "within_state" and x["status"] != "interstate"}),
            "max_km": max(dists) if dists else None, "reasons": reasons, "outcome": outcome,
        })
    out_rows.sort(key=lambda r: (not r["outcome"].startswith("Pending"), -r["days"]))

    # Data quality
    flag_n = collections.Counter(f for x in recs for f in x["flags"])
    def with_any(group):   # records carrying at least one flag in the group
        return sum(1 for x in recs if any(f in DQ_FLAG_GROUPS[group] for f in x["flags"]))
    dq = [
        ("Missing consultant name", failed_logins, "Login not matched to the roster; form cannot be submitted as a named consultant"),
        ("Missing phone number", 0, "Blocked by the form (pre-flight check)"),
        ("Incorrect phone date/time", with_any("Incorrect phone date/time"), "Form flags: clock set back, finished another day, odd hour"),
        ("Missing coordinates", sum(not x["gps_ok"] for x in recs), "GPS is mandatory in the form"),
        ("GPS precision / implausible location", with_any("GPS precision / implausible location"), "Same GPS as last, >50 km jump, moved during form, >20 km outside"),
        ("Missing / unusable photo evidence", sum(not x["selfie"] for x in recs), "Selfie with a random gesture is mandatory"),
        ("Duplicate / suspicious submissions", sum(1 for x in recs if x["reason"] == "duplicate" or any(f in DQ_FLAG_GROUPS["Duplicate / suspicious submissions"] for f in x["flags"])), "Same-day repeats, copied summary, shared phone, rushed or left open"),
        ("Other validation issues", with_any("Other validation issues"), "Consistency and plausibility checks built into the form"),
    ]

    # Activities by state (activity-days) and outputs (each LGA counted once per day)
    act = collections.defaultdict(collections.Counter)
    for x in recs:
        if x["valid"]:
            for a in x["acts"]:
                act[x["state"]][a] += 1
    lga_day = {}
    for x in recs:
        if not x["valid"]:
            continue
        o = lga_day.setdefault((x["date"], x["work_state"], x["work_lga"]), {})
        for k, v in x["out"].items():
            o[k] = o.get(k, 0) + v if k == "stk_num" else max(o.get(k, 0), v)
    daily = collections.defaultdict(lambda: collections.Counter())
    for (d, st, _), o in lga_day.items():
        for k, v in o.items():
            daily[d][k] += v
    outputs = {}
    for k in OUT_LABEL:
        vals = [(d, daily[d][k]) for d in sorted(daily) if daily[d][k]]
        if vals:
            pk = max(vals, key=lambda t: t[1])
            outputs[k] = {"days": len(vals), "avg": round(sum(v for _, v in vals) / len(vals)), "peak": pk[1], "peak_day": pk[0]}

    total, valid = len(recs), sum(x["valid"] for x in recs)
    return {
        "live_start": live_start, "period_end": period_end, "live_days": live_days, "expected": exp_text(people),
        "expected_cfg": expected_cfg, "people": people, "states": states, "outside": out_rows, "dq": dq,
        "act": act, "outputs": outputs, "orphans": orphans, "failed_logins": failed_logins,
        "total": total, "valid": valid, "invalid": total - valid,
        "reasons": collections.Counter(x["reason"] for x in recs if x["reason"]),
        "reporting": sum(1 for p in people if p["total"]), "met": sum(p["met"] for p in people),
        "below_valid": [p for p in people if not p["met"]],
        "below_total": [p for p in people if p["total"] < p["exp"]],
        "security": [x for x in recs if x["security"]], "critical": [x for x in recs if x["critical"]],
        "flags": flag_n, "recs": recs,
    }


def pct(a, b):
    return round(100 * a / b) if b else 0


# ----------------------------------------------------------------------------- Word helpers

def shade(cell, hex_):
    tc = cell._tc.get_or_add_tcPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear"); sh.set(qn("w:color"), "auto"); sh.set(qn("w:fill"), hex_)
    tc.append(sh)


def table(doc, header, rows, widths=None, size=8.5):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]
        c.text = ""
        run = c.paragraphs[0].add_run(str(h)); run.bold = True; run.font.size = Pt(size); run.font.color.rgb = RGBColor(255, 255, 255)
        shade(c, NAVY)
    for r in rows:
        cells = t.add_row().cells
        for i, v in enumerate(r):
            cells[i].text = ""
            run = cells[i].paragraphs[0].add_run("" if v is None else str(v)); run.font.size = Pt(size)
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Cm(w)
    doc.add_paragraph()
    return t


def h1(doc, text):
    p = doc.add_heading(text, level=1)
    for r in p.runs:
        r.font.color.rgb = RGBColor(0x12, 0x3B, 0x5D)


def para(doc, text, italic=False, size=10):
    p = doc.add_paragraph()
    r = p.add_run(text); r.italic = italic; r.font.size = Pt(size)
    return p


def todo(text):
    return f"[To complete: {text}]"


# ----------------------------------------------------------------------------- report

def write_docx(a, cycle, start, end, fetched, path):
    doc = Document()
    st = doc.styles["Normal"]; st.font.name = "Aptos"; st.font.size = Pt(10)
    sec = doc.sections[0]
    sec.left_margin = sec.right_margin = Cm(1.8); sec.top_margin = sec.bottom_margin = Cm(1.6)

    month = dt.date(*map(int, cycle.split("-")), 1).strftime("%B %Y")
    partial = a["period_end"] < end
    nd, exp = len(a["live_days"]), a["expected"]

    p = doc.add_paragraph(); r = p.add_run("FIELD CONSULTANTS’"); r.bold = True; r.font.size = Pt(12); r.font.color.rgb = RGBColor(0x12, 0x3B, 0x5D)
    t = doc.add_paragraph(); r = t.add_run("CHECK-IN & FIELD PERFORMANCE REPORT"); r.bold = True; r.font.size = Pt(20); r.font.color.rgb = RGBColor(0x12, 0x3B, 0x5D)
    para(doc, "Submission compliance, field presence, activity delivery and data quality", italic=True)
    table(doc, ["REPORTING DETAILS", "DETAILS"], [
        ["Reporting month / period", f"{month} cycle: {fmt(start)} – {fmt(end)}" + (f" (draft, data to {fmt(a['period_end'])})" if partial else "")],
        ["Programme / project", "eHealth Africa field team (LGA and State Coordinators)"],
        ["State / operational area", f"{len(a['states'])} states: " + ", ".join(s["state"] for s in a["states"])],
        ["Prepared by", todo("name, role")], ["Reviewed by", todo("name, role")],
        ["Date of submission", todo("DD Month YYYY")], ["Version", "Draft 1 (generated " + dt.datetime.now(fd.WAT).strftime("%d %b %Y %H:%M") + " WAT)"],
    ], widths=[5.5, 12])
    para(doc, "Reporting principle: verified check-in submissions are the evidence base. Submitted records are distinguished from valid records "
              "using written rules (section 2), exceptions are explained, and every corrective action has an owner and a due date.", size=9)

    # 1 Executive summary
    h1(doc, "1. Executive summary")
    below = len(a["below_valid"]); pend = sum(1 for o in a["outside"] if o["outcome"].startswith("Pending"))
    best = sorted(a["states"], key=lambda s: -s["coverage"])[:2]; worst = sorted(a["states"], key=lambda s: s["coverage"])[:2]
    para(doc, f"Over {nd} reporting day{'s' if nd != 1 else ''} ({fmt(a['live_start'])} – {fmt(a['period_end'])}), {a['reporting']} of {len(a['people'])} "
              f"consultants submitted check-ins: {a['total']:,} submissions, of which {a['valid']:,} ({pct(a['valid'], a['total'])}%) were valid. "
              f"{a['met']} consultants ({pct(a['met'], len(a['people']))}%) reached the expected valid days ({exp}); {below} did not. "
              f"{len(a['outside'])} consultants checked in outside their assigned LGA at least once; {pend} of these still need verification. "
              f"Coordinators raised {len(a['security'])} security incidents and {len(a['critical'])} critical issues.")
    table(doc, ["Executive summary element", "Narrative / result"], [
        ["Overall performance status", todo("Green / Amber / Red, with a brief explanation - reviewer's judgement against the agreed standard")],
        ["Key achievement(s)", f"Highest valid-day coverage: {', '.join(f'{s['state']} ({s['coverage']}%)' for s in best)}. "
                               f"{pct(a['valid'], a['total'])}% of submissions valid."],
        ["Key concern(s)", f"{below} consultants below the expected valid days; lowest coverage in {', '.join(f'{s['state']} ({s['coverage']}%)' for s in worst)}; "
                           f"{pend} unverified outside-LGA exceptions."],
        ["Management attention required", todo("decision, support or escalation required")],
        ["Overall conclusion", todo("one-paragraph assessment")],
    ], widths=[5.5, 12])

    # 2 Scope and method
    h1(doc, "2. Reporting scope and methodology")
    table(doc, ["Item", "Specification"], [
        ["Reporting period", f"{fmt(start)} – {fmt(end)} (cycle ends on the 23rd)" + (f"; this draft covers data to {fmt(a['period_end'])}" if partial else "")],
        ["Expected reporting days", f"{exp}, as set by the Programme Manager" + (f". The cycle is not finished (data to {a['period_end']}), so counts below these are so far, not final" if a["period_end"] < end else "")],
        ["Consultant population", f"{len(a['people'])} on the approved roster (form media c_data.csv): "
                                  f"{sum(p['role'] == 'lc' for p in a['people'])} LGA Coordinators, {sum(p['role'] == 'sc' for p in a['people'])} State Coordinators"],
        ["Data source(s)", "KoboToolbox form 'Field Team Daily Check-in' (asset aV89vgirjJgfzTNDBDGGzE): submissions, GPS boundary check, selfie, form-built quality flags"],
        ["Cut-off date and time", fetched[:16].replace("T", " ") + " WAT"],
        ["Validation approach", "A submission is invalid if: " + "; ".join(f"({i + 1}) {t}" for i, t in enumerate(RULE_TEXT.values())) +
                                ". Valid days = distinct days with at least one valid submission."],
        ["Exclusions / limitations", f"Form live from {fmt(a['live_start'])}. Check-ins on old form versions cannot record redeployment "
                                     f"(listed for review, not counted invalid). {a['failed_logins']} submissions from logins not on the roster excluded. "
                                     f"Activity figures are self-reported. {todo('leave, onboarding, network downtime, approved exceptions')}"],
    ], widths=[5.5, 12])

    # 3 Dashboard
    h1(doc, "3. Performance dashboard")
    miss_gps = sum(not x["gps_ok"] for x in a["recs"])
    table(doc, ["Indicator", "Result", "Calculation / definition"], [
        ["Consultants expected to report", len(a["people"]), "Active consultants on the approved roster"],
        ["Consultants with ≥1 submission", a["reporting"], "Unique consultants with at least one record"],
        ["Total check-in submissions", f"{a['total']:,}", "All records dated within the period"],
        ["Valid submissions", f"{a['valid']:,}", "Records passing the validation rules (section 2)"],
        ["Invalid submissions", f"{a['invalid']:,}", "; ".join(f"{RULE_TEXT[k].split(' (')[0]}: {v}" for k, v in a["reasons"].most_common())],
        ["Valid submission rate", f"{pct(a['valid'], a['total'])}%", "Valid ÷ total submissions × 100"],
        ["Consultants meeting expected days", f"{a['met']} / {pct(a['met'], len(a['people']))}%", f"Consultants with at least the expected valid days for their role ({exp})"],
        ["Consultants below expected valid days", below, "Fewer valid days than expected for their role (Annex B)"],
        ["Consultants below expected total counts", len(a["below_total"]), "Fewer total check-in records than the expected days for their role (Annex C)"],
        ["Outside-assigned-LGA exceptions", f"{len(a['outside'])} consultants / {sum(o['days'] for o in a['outside'])} days", "Days with a check-in outside the assigned LGA (Annex D)"],
        ["Records with missing coordinates", f"{miss_gps} / {pct(miss_gps, a['total'])}%", "Submissions without GPS ÷ all submissions"],
        ["Records with identity/contact flags", a["failed_logins"] + a["flags"].get("other_user_on_phone", 0), "Unmatched logins + phone last used by another consultant"],
    ], widths=[6, 3, 8.5])

    # 4 Compliance
    h1(doc, "4. Submission compliance and coverage")
    para(doc, "4.1 Consultant-level submission summary - consultants not meeting the threshold (full list of all consultants in Annex A).", size=10)
    rows = [[i + 1, p["name"] or p["who"], p["state"], p["lga"] or "State Coordinator", p["total"], p["invalid"], p["valid"], p["valid_days"], "Not met"]
            for i, p in enumerate(sorted(a["below_valid"], key=lambda p: (p["valid_days"], p["state"], p["lga"])))]
    table(doc, ["S/N", "Consultant", "State", "LGA", "Total", "Invalid", "Valid", "Valid days", "Status"], rows,
          widths=[1, 4.5, 2.2, 2.6, 1.3, 1.3, 1.3, 1.5, 1.6], size=7.5)
    para(doc, "4.2 Coverage by state", size=10)
    srows = [[s["state"], s["lgas"], s["expected"], s["reporting"], f"{s['valid']:,}", f"{s['coverage']}%", s["expected"] - s["met"]] for s in a["states"]]
    srows.append(["TOTAL", sum(s["lgas"] for s in a["states"]), len(a["people"]), a["reporting"], f"{a['valid']:,}",
                  f"{pct(sum(p['valid_days'] for p in a['people']), len(a['people']) * nd)}%", below])
    table(doc, ["State", "LGAs covered", "Expected consultants", "Reporting consultants", "Valid submissions", "Coverage rate", "Below threshold"], srows,
          widths=[2.6, 2, 2.4, 2.4, 2.4, 2.2, 2.2], size=8)
    para(doc, "Coverage rate = valid days ÷ (consultants × reporting days). " + todo("interpret differences between states and LGAs"), italic=True, size=9)

    # 5 Geography
    h1(doc, "5. Geographic presence and field deployment verification")
    para(doc, "The form checks every check-in against the assigned LGA boundary and records redeployment release codes. "
              "A GPS exception is not treated as misconduct until reviewed.", size=9.5)
    grows = [[o["name"] or o["who"], f"{o['state']} / {o['lga'] or 'State Coordinator'}", o["found"], o["days"],
              f"{o['max_km']} km" if o["max_km"] is not None else "GPS boundary check", o["outcome"], o["reasons"] or todo("follow-up")]
             for o in a["outside"] if o["outcome"].startswith("Pending")]
    table(doc, ["Consultant", "Assigned state / LGA", "Detected location", "Days outside", "Distance / evidence", "Verification outcome", "Reason given / follow-up"],
          grows, widths=[3.2, 3, 2.6, 1.4, 2, 3, 3], size=7.5)
    ver = sum(1 for o in a["outside"] if o["outcome"].startswith("Verified"))
    table(doc, ["Geographic verification summary", "Value"], [
        ["Consultants with an outside-LGA check-in", len(a["outside"])],
        ["Verified by redeployment code (approved deployment)", ver],
        ["Pending - old form version (redeployment not recordable)", sum(1 for o in a["outside"] if "old form" in o["outcome"])],
        ["Pending - no redeployment code", sum(1 for o in a["outside"] if "no redeployment" in o["outcome"])],
        ["Missing or unusable coordinate records", miss_gps],
    ], widths=[11, 6.5])

    # 6 Activities
    h1(doc, "6. Field activities and delivery")
    top_acts = [k for k, _ in collections.Counter({k: sum(c[k] for c in a["act"].values()) for k in ACT_LABEL}).most_common(6)]
    arows = [[s] + [a["act"][s][k] for k in top_acts] for s in sorted(a["act"])]
    table(doc, ["State"] + [ACT_LABEL[k] for k in top_acts], arows, size=7.5)
    para(doc, "Activity-days: number of valid check-ins logging each activity. Outputs below count each LGA once per day "
              "(redeployed staff in one LGA report the same phones and teams) and are never added across days, because the form asks for today's figures.", italic=True, size=9)
    table(doc, ["Output", "Days reported", "Average per day", "Peak day"],
          [[OUT_LABEL[k], v["days"], f"{v['avg']:,}", f"{v['peak']:,} on {fmt(dt.date.fromisoformat(v['peak_day']))}"] for k, v in a["outputs"].items()],
          widths=[6, 3, 3.5, 5])
    para(doc, "Narrative assessment: " + todo("what the activity data means for implementation progress, coverage and quality; note that activity is self-reported"), size=9.5)

    # 7 Data quality
    h1(doc, "7. Data quality and audit findings")
    table(doc, ["Data-quality dimension", "Records flagged", "How detected", "Resolved", "Outstanding", "Corrective measure"],
          [[n, c, how, todo(""), todo(""), todo("")] for n, c, how in a["dq"]], widths=[4, 1.8, 5.2, 1.7, 1.8, 3], size=8)
    para(doc, "Data quality conclusion: " + todo("is the dataset fit for management use; limitations; records withheld"), size=9.5)

    # 8 Exceptions
    h1(doc, "8. Performance exceptions and root-cause analysis")
    para(doc, f"8.1 Consultants below the expected valid days: {below} (listed in 4.1 and Annex B, with invalid-record reasons).", size=10)
    rc = collections.Counter()
    for p in a["below_valid"]:
        if p["total"] == 0:
            rc["No check-in at all in the period"] += 1
        elif p["reasons"]:
            rc["Submissions made but some invalid (" + ", ".join(RULE_TEXT[k].split(' (')[0].lower() for k in p["reasons"]) + ")"] += 1
        else:
            rc["Checked in on too few days"] += 1
    table(doc, ["Observed gap", "Consultants", "Likely root cause", "Proposed response"],
          [[g, n, todo("evidence-based cause"), todo("response")] for g, n in rc.most_common()], widths=[6.5, 2, 4.5, 4.5])

    # 9-12 judgement sections
    h1(doc, "9. Risks, decisions and management support")
    table(doc, ["Risk / decision required", "Likelihood", "Impact", "Mitigation / decision", "Owner", "Due date"],
          [[todo(""), "", "", "", "", ""]] * 2, size=8)
    h1(doc, "10. Corrective action and improvement tracker")
    acts = []
    if below:
        acts.append(f"Follow up the {below} consultants below the expected valid days (Annex B)")
    if pend:
        acts.append(f"Verify the {pend} pending outside-LGA exceptions (Annex D)")
    old = sum(1 for o in a["outside"] if "old form" in o["outcome"])
    if old:
        acts.append("Ensure all consultants update to the current form version")
    if len(a["security"]):
        acts.append(f"Review the {len(a['security'])} security incidents with State teams (Annex E)")
    table(doc, ["ID", "Finding / action", "Priority", "Responsible", "Due date", "Success measure", "Status"],
          [[f"A{i + 1:02d}", t, todo(""), todo(""), todo(""), todo(""), "Open"] for i, t in enumerate(acts)], size=8)
    h1(doc, "11. Conclusion and priorities for the next period")
    table(doc, ["Area", "Conclusion / next-period priority"],
          [[k, todo("")] for k in ["Overall performance judgement", "Priority 1", "Priority 2", "Priority 3", "Support required from management", "Expected improvement by next report"]],
          widths=[6, 11.5])
    h1(doc, "12. Review and approval")
    table(doc, ["Prepared by", "Reviewed by", "Approved by"], [["Name:\nRole:\nSignature:\nDate:"] * 3])

    h1(doc, "Annexes (Excel workbook)")
    table(doc, ["Annex", "Content"], [
        ["A", "Consultant-level submission and validity summary (all consultants)"],
        ["B", "Consultants below the expected valid days"], ["C", "Consultants below the expected total check-in records"],
        ["D", "Outside-assigned-LGA exception log and verification notes"],
        ["E", "Security incidents and critical issues"], ["F", "Data-quality flags, record level (Kobo IDs)"],
        ["G", "Daily attendance grid"], ["H", "Activities and outputs by state"],
    ], widths=[2, 15.5])
    h1(doc, "Indicator definitions and reporting rules")
    table(doc, ["Term / indicator", "Definition applied"], [
        ["Total submissions", "Check-in records dated within the reporting period, before validity exclusions."],
        ["Valid submission", "A record that breaks none of the rules in section 2. Only the first valid record per consultant per day counts."],
        ["Invalid submission", "A record excluded by a rule; the reason is listed per record in Annex F."],
        ["Valid days", "Distinct days with at least one valid check-in."],
        ["Compliance threshold", f"{exp}, as set by the Programme Manager."],
        ["Outside-LGA exception", "Check-in outside the assigned LGA by the form's GPS boundary check. Verified when a redeployment release code was entered."],
        ["Coverage rate", "Valid days ÷ (consultants × reporting days)."],
        ["Reporting population", "Approved roster in the form (c_data.csv) at the cut-off."],
    ], widths=[4.5, 13])
    para(doc, "Personal information: phone numbers, device identifiers and precise coordinates are not reproduced in this report.", italic=True, size=8.5)
    doc.save(path)


def write_xlsx(a, start, end, path):
    wb = Workbook()
    hdr_font = Font(bold=True, color="FFFFFF"); hdr_fill = PatternFill("solid", fgColor=NAVY)

    def sheet(title, header, rows, first=False):
        ws = wb.active if first else wb.create_sheet()
        ws.title = title[:31]
        ws.append(header)
        for c in ws[1]:
            c.font = hdr_font; c.fill = hdr_fill; c.alignment = Alignment(wrap_text=True, vertical="center")
        for r in rows:
            ws.append(list(r))
        for i, h in enumerate(header, 1):
            ws.column_dimensions[get_column_letter(i)].width = max(10, min(45, len(str(h)) + 4))
        ws.freeze_panes = "A2"
        return ws

    ppl = sorted(a["people"], key=lambda p: (p["state"], p["role"] != "sc", p["lga"]))
    reason_cols = list(RULE_TEXT)
    sheet("A Consultant summary", ["Consultant", "Role", "State", "LGA", "Total submissions", "Invalid", "Valid", "Valid days",
                                   "Days with any submission", "Expected days", "Met?", "Last check-in"] + [f"Invalid: {k}" for k in reason_cols],
          [[p["name"], "State Coordinator" if p["role"] == "sc" else "LGA Coordinator", p["state"], p["lga"], p["total"], p["invalid"], p["valid"],
            p["valid_days"], p["total_days"], p["exp"], "Met" if p["met"] else "Not met", p["last"].isoformat() if p["last"] else "None"] +
           [p["reasons"].get(k, 0) for k in reason_cols] for p in ppl], first=True)
    sheet("B Below valid days", ["Consultant", "State", "LGA", "Total submissions", "Invalid", "Valid days", "Reason / explanation", "Supervisor assessment", "Action"],
          [[p["name"], p["state"], p["lga"], p["total"], p["invalid"], p["valid_days"], "", "", ""] for p in sorted(a["below_valid"], key=lambda p: (p["valid_days"], p["state"]))])
    sheet("C Below total days", ["Consultant", "State", "LGA", "Days with any submission", "Total submissions"],
          [[p["name"], p["state"], p["lga"], p["total_days"], p["total"]] for p in sorted(a["below_total"], key=lambda p: (p["total_days"], p["state"]))])
    sheet("D Outside LGA", ["Consultant", "Assigned state", "Assigned LGA", "Detected LGA", "Days outside", "Max distance (km)", "Verification outcome", "Reasons given", "Supervisor notes"],
          [[o["name"], o["state"], o["lga"], o["found"], o["days"], o["max_km"], o["outcome"], o["reasons"], ""] for o in a["outside"]])
    sheet("E Security & critical", ["Date", "Type", "Consultant", "State worked", "LGA worked", "Description", "Kobo ID"],
          [[x["date"], "Security", x["name"], x["work_state"], x["work_lga"], x["security_desc"], x["id"]] for x in a["security"]] +
          [[x["date"], "Critical", x["name"], x["work_state"], x["work_lga"], x["critical_desc"], x["id"]] for x in a["critical"]])
    sheet("F Record flags", ["Date", "Time", "Consultant", "State", "Valid?", "Invalid reason", "Location status", "Quality flags", "Selfie", "GPS accuracy (m)", "Kobo ID"],
          [[x["date"], x["time"], x["name"], x["state"], "Valid" if x["valid"] else "Invalid", RULE_TEXT.get(x["reason"], ""), x["status"],
            ", ".join(x["flags"]), "Yes" if x["selfie"] else "No", x["gps_acc"], x["id"]] for x in a["recs"] if x["reason"] or x["flags"]])
    dlist = a["live_days"]
    by = collections.defaultdict(set)
    for x in a["recs"]:
        if x["valid"]:
            by[x["uid"] or x["name"]].add(x["d"])
    sheet("G Daily attendance", ["Consultant", "State", "LGA"] + [d.strftime("%d %b") for d in dlist] + ["Valid days"],
          [[p["name"], p["state"], p["lga"]] + ["✓" if d in by.get(p["id"], set()) else "" for d in dlist] + [p["valid_days"]] for p in ppl])
    acts = list(ACT_LABEL)
    sheet("H Activities by state", ["State"] + [ACT_LABEL[k] for k in acts],
          [[s] + [a["act"][s][k] for k in acts] for s in sorted(a["act"])])
    wb.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cycle", help="YYYY-MM: the cycle ending on the 23rd of that month (default: current cycle)")
    ap.add_argument("--as-of", help="YYYY-MM-DD: last day of data to include (default: today)")
    ap.add_argument("--expected-days", type=int, default=DEFAULT_EXPECTED_DAYS)
    ap.add_argument("--refresh", action="store_true", help="re-download from Kobo instead of using the cache")
    args = ap.parse_args()

    today = dt.datetime.now(fd.WAT).date()
    as_of = dt.date.fromisoformat(args.as_of) if args.as_of else today
    cycle = args.cycle or current_cycle(as_of)
    start, end = cycle_bounds(cycle)

    raw, roster, fetched = load(args.refresh)
    staff, recs, failed = build(raw, roster, start, min(end, as_of))
    a = analyse(staff, recs, start, end, as_of, args.expected_days, failed)

    tag = f"{cycle}" + ("_draft-" + a["period_end"].isoformat() if a["period_end"] < end else "")
    docx_path = os.path.join(REPORT_DIR, f"Field_Consultants_Report_{tag}.docx")
    xlsx_path = os.path.join(REPORT_DIR, f"Field_Consultants_Report_{tag}_Annex.xlsx")
    write_docx(a, cycle, start, end, fetched, docx_path)
    write_xlsx(a, start, end, xlsx_path)
    print(f"Cycle {cycle}: {fmt(start)} - {fmt(end)}; data {fmt(a['live_start'])} - {fmt(a['period_end'])} ({len(a['live_days'])} days)")
    print(f"  {a['total']} submissions, {a['valid']} valid; {a['met']}/{len(a['people'])} met the expected valid days ({a['expected']})")
    print(f"  wrote {os.path.relpath(docx_path)}\n  wrote {os.path.relpath(xlsx_path)}")


if __name__ == "__main__":
    main()
