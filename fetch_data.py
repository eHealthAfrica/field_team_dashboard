"""
Field Team Dashboard - data fetch.

Pulls every submission of the "Field Team Daily Check-in" Kobo form and the
staff roster (the form's `c_data.csv` media file), cleans them, and writes:

  data/data.json    one row per check-in
  data/roster.json  everyone expected to check in (the denominator)

Run by the "Fetch KoboToolbox Data" GitHub Action with the KOBO_TOKEN secret.
Can also be run locally:  KOBO_TOKEN=... python fetch_data.py

The repo is public, so nothing personally identifying is written out: no
names, phone numbers, device IDs, GPS coordinates or photo links. Each person
is described by their post instead - "Fagge LGA" for an LGA Coordinator,
"Kano SC" for a State Coordinator - and matched to the roster with a short
one-way hash of the form's login key (name + phone).
"""

import csv
import hashlib
import io
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

KOBO_BASE = "https://kf.kobotoolbox.org"
ASSET_UID = "aV89vgirjJgfzTNDBDGGzE"
ROSTER_MEDIA = "c_data.csv"
DATA_DIR = "data"
WAT = timezone(timedelta(hours=1))



def load_dotenv(path=".env"):
    """For local runs: read KOBO_TOKEN from a gitignored .env file if it is
    not already set in the environment. The GitHub Action uses the secret."""
    if os.environ.get("KOBO_TOKEN") or not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            k, _, v = line.strip().partition("=")
            if k.strip() == "KOBO_TOKEN" and v.strip():
                os.environ["KOBO_TOKEN"] = v.strip().strip('"').strip("'")


load_dotenv()
TOKEN = os.environ.get("KOBO_TOKEN", "")
if not TOKEN:
    print("ERROR: KOBO_TOKEN environment variable not set.", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------- helpers

def kobo_get(url, raw=False):
    req = Request(url, headers={"Authorization": f"Token {TOKEN}"})
    with urlopen(req, timeout=60) as r:
        body = r.read()
    return body if raw else json.loads(body)


def user_hash(key):
    """Short one-way ID for a login key ('full name_phone'). Same function is
    used on the roster and on submissions so the two can be joined."""
    key = (key or "").strip().lower()
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12] if key else ""


def flatten(row):
    """Kobo keys are group paths ('grp_authed/grp_checkin/report_date').
    XLSForm names are unique, so key everything by its last segment - this
    keeps working if questions are moved between groups."""
    out = {}
    for k, v in row.items():
        out.setdefault(k.rsplit("/", 1)[-1], v)
    return out


def s(v):
    v = "" if v is None else str(v).strip()
    return "" if v in ("None", "nan") else v


def i(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def f1(v):
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return None


def yes(v):
    return s(v).lower() == "yes"


def parse_dt(v):
    v = s(v)
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(WAT)


# ---------------------------------------------------------------- roster

def fetch_roster():
    """Download c_data.csv from the form's media files. Returns None (and the
    existing roster.json is kept) if it can't be found or read."""
    try:
        listing = kobo_get(f"{KOBO_BASE}/api/v2/assets/{ASSET_UID}/files/?file_type=form_media")
        for item in listing.get("results", []):
            name = (item.get("metadata") or {}).get("filename", "")
            if name.endswith(ROSTER_MEDIA):
                body = kobo_get(item["content"], raw=True).decode("utf-8-sig")
                return list(csv.DictReader(io.StringIO(body)))
        print(f"  WARNING: {ROSTER_MEDIA} not found in form media", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"  WARNING: roster fetch failed: {e}", file=sys.stderr)
    return None


def post_label(role, state, lga):
    return f"{state} SC" if role == "sc" else f"{lga} LGA"


def clean_roster(rows):
    out = []
    for r in rows:
        out.append({
            "id":    user_hash(r.get("key_id")),
            "role":  "sc" if s(r.get("role")) == "state_coordinator" else "lc",
            "state": s(r.get("stateName")),
            "lga":   s(r.get("lgaName")),
        })
    out = [r for r in out if r["id"]]
    out.sort(key=lambda r: (r["state"], r["role"] != "sc", r["lga"], r["id"]))
    # One person per post, except where an LGA has two coordinators
    # (e.g. Kano - Fagge): number those "#1", "#2" in a stable order.
    posts = {}
    for r in out:
        posts.setdefault((r["role"], r["state"], r["lga"]), []).append(r)
    for (role, state, lga), people in posts.items():
        for n, r in enumerate(people, 1):
            r["who"] = post_label(role, state, lga) + (f" #{n}" if len(people) > 1 else "")
    return out


def load_saved_roster():
    try:
        with open(os.path.join(DATA_DIR, "roster.json"), encoding="utf-8") as fh:
            return json.load(fh).get("staff", [])
    except (OSError, ValueError):
        return []


# ---------------------------------------------------------------- submissions

ACTIVITIES = ["stk", "trk", "csup", "eoc", "omeet", "mlos", "dip", "plog",
              "ri", "pqc", "chg", "flag", "fbk", "erm", "mdp", "oth"]

# numeric outputs: dashboard key -> form field
OUTPUTS = {
    "stk_num": "stk_num",
    "trk_num": "trk_num",
    "csup_wards": "csup_wards",
    "csup_teams": "csup_teams",
    "csup_settlements": "csup_settlements",
    "mlos_validated": "mlos_validated",
    "mlos_new": "mlos_new",
    "dip_wards": "dip_wards",
    "plog_issued": "plog_issued",
    "plog_retrieved": "plog_retrieved",
    "pqc_checked": "pqc_checked",
    "pqc_issues": "pqc_issues",
    "chg_charged": "chg_charged",
    "chg_not": "chg_not",
    "erm_attendees": "erm_attendees",
    "mdp_phones": "mdp_phones",
    "mdp_teams": "mdp_teams",
}


def fetch_submissions():
    rows, url = [], f"{KOBO_BASE}/api/v2/assets/{ASSET_UID}/data/?format=json&limit=1000"
    while url:
        page = kobo_get(url)
        rows.extend(page.get("results", []))
        url = page.get("next")
    return rows


def clean(raw, who_by_id):
    r = flatten(raw)

    # Submissions from a failed login have no auth fields - drop them.
    if not s(r.get("auth_name")):
        return None

    checkin = parse_dt(r.get("checkin_time")) or parse_dt(r.get("starttime"))
    submitted = parse_dt(r.get("_submission_time"))
    date = s(r.get("report_date"))[:10] or (checkin.strftime("%Y-%m-%d") if checkin else "")
    if not date:
        return None

    acts = [a for a in s(r.get("activity_type")).split() if a in ACTIVITIES]
    result = s(r.get("result")) or "inside"
    # Older form versions have no redeployment question, so an "outside"
    # check-in from them can't be classed as redeployed or not.
    if result == "inside":
        status = "home_lga"
    elif "redeploy_status" in r:
        status = s(r.get("redeploy_status")) or "outside_not_redeployed"
    else:
        status = "outside_old_form"

    challenges = []
    for a in acts:
        if yes(r.get(f"{a}_challenges")):
            challenges.append({"act": a, "desc": s(r.get(f"{a}_challenge_desc"))})

    uid = user_hash(r.get("concat_user"))
    role = "sc" if s(r.get("auth_role")) == "state_coordinator" else "lc"

    row = {
        "id":        raw.get("_id"),
        "date":      date,
        "time":      checkin.strftime("%H:%M") if checkin else "",
        "hour":      checkin.hour if checkin else None,
        "lag_h":     round((submitted - checkin).total_seconds() / 3600, 1) if submitted and checkin else None,
        "uid":       uid,
        "who":       who_by_id.get(uid) or post_label(role, s(r.get("auth_state")), s(r.get("auth_lga_name"))) + " (not on roster)",
        "role":      role,
        "state":     s(r.get("auth_state")),
        "home_lga":  s(r.get("auth_lga_name")),
        "work_state": s(r.get("work_state")) or s(r.get("auth_state")),
        "work_lga":  s(r.get("work_lga_name")) or s(r.get("active_lga_name")),
        "status":    status,              # home_lga | within_state | interstate | outside_not_redeployed | outside_old_form
        "form_version": s(raw.get("__version__")),
        "old_form":  "redeploy_status" not in r,   # version without the redeployment question
        "found_lga": s(r.get("actual_lga_name")),
        "dist_km":   f1(r.get("distance_km")) if result == "outside" else None,
        "outside_reason": s(r.get("outside_lga_reason")),
        "acts":      acts,
        "out":       {k: i(r.get(v)) for k, v in OUTPUTS.items() if s(r.get(v)) != ""},
        "dip_status": s(r.get("dip_status")),
        "challenges": challenges,
        "security":  yes(r.get("security_any")),
        "security_desc": s(r.get("security_desc")),
        "critical":  yes(r.get("critical_any")),
        "critical_desc": s(r.get("critical_desc")),
        "flags":     s(r.get("flag_list")).split(),
        "form_min":  f1(r.get("form_minutes")),
        "notes":     s(r.get("additional_notes")),
    }
    return row


def debug_first(raw):
    """Print the flattened keys of one submission so field-mapping problems
    show up in the Action log straight away."""
    if not raw:
        return
    r = flatten(raw[0])
    keep = ("auth_role", "auth_state", "auth_lga", "report_date", "checkin_time", "result", "redeploy", "work_",
            "activity_type", "flag_", "security_any", "critical_any", "distance_km")
    print("  --- DEBUG: first submission (selected fields) ---")
    for k in sorted(r):
        if k.startswith(keep):
            print(f"    {k}: {r[k]!r}")
    print("  --- END DEBUG ---")


# ---------------------------------------------------------------- main

def write(name, payload):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, name)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"  wrote {path}")


def main():
    fetched_at = datetime.now(WAT).strftime("%Y-%m-%d %H:%M WAT")

    print("Fetching roster ...")
    roster = fetch_roster()
    if roster is not None:
        staff = clean_roster(roster)
        print(f"  {len(staff)} staff on the roster")
        write("roster.json", {"fetched_at": fetched_at, "staff": staff})
    else:
        staff = load_saved_roster()
    who_by_id = {p["id"]: p.get("who", "") for p in staff}

    print(f"Fetching submissions for {ASSET_UID} ...")
    raw = fetch_submissions()
    print(f"  {len(raw)} raw submissions")
    debug_first(raw)

    rows = [x for x in (clean(r, who_by_id) for r in raw) if x]
    rows.sort(key=lambda x: (x["date"], x["time"]))
    print(f"  {len(rows)} valid rows ({len(raw) - len(rows)} dropped: no login or no date)")
    if raw and not rows:
        print("  WARNING: 0 valid rows - check the DEBUG output against clean().", file=sys.stderr)

    write("data.json", {"fetched_at": fetched_at, "total": len(rows), "rows": rows})


if __name__ == "__main__":
    main()
