# Field Team Dashboard

Dashboard for the eHA **Field Team Daily Check-in** KoboToolbox form (asset `aV89vgirjJgfzTNDBDGGzE`): one check-in per day from every LGA Coordinator and State Coordinator on the roster (347 staff, 15 states).

Live site: https://ehealthafrica.github.io/field_team_dashboard/

## How it works

```
KoboToolbox ──(hourly, :00)──▶ fetch_data.py ──▶ data/*.json committed ──(hourly, :10)──▶ build ──▶ GitHub Pages
```

- `.github/workflows/fetch-data.yml` runs `fetch_data.py` every hour. It needs the repo secret **`KOBO_TOKEN`**.
  - `data/data.json`: cleaned check-ins.
  - `data/roster.json`: everyone expected to check in, taken from the form's `c_data.csv` media file, so it stays in sync with the form.
- `.github/workflows/deploy.yml` builds and deploys on every push and at :10 past each hour. It needs its own schedule because commits pushed with `GITHUB_TOKEN` don't trigger other workflows.
- The page re-polls the data every 10 minutes.

**Privacy (the repo is public):** the fetch script never writes staff names, phone numbers, device IDs, GPS coordinates or photo links. Coordinators are identified by post (e.g. "Fagge LGA", "Kano SC") and matched to the roster with a short one-way hash of their login key.

## Pages and indicators

| Page | What it answers |
|---|---|
| Executive summary | Reporting rate vs. roster, staff active, % inside own LGA, verified redeployments, outside-LGA check-ins without redeployment, % with QA flags, security/critical issues; daily trends, activity mix, check-in time of day, per-state table |
| Attendance | Who checked in and who didn't: per-person daily grid, "not in today" list (CSV) |
| Field outputs | Totals per activity (phones deployed, teams supervised, wards/settlements, QC, charging, tracks, MLoS, DIP, stakeholders), key ratios, latest DIP status per LGA, outputs by state |
| Data quality | The form's 24 automated QA flags: counts, staff with most flags, flagged check-ins with Kobo IDs (CSV) |
| Issues | Activity challenges, security incidents, critical escalations and outside-LGA reasons in one log (CSV) |

Filters (date range, state, role) apply to every page. Pages can be linked directly, e.g. `#attendance`.

## Month-end report

The Field Consultants' Check-in & Field Performance Report is generated from Kobo for each cycle, which runs from the **24th of the previous month to the 23rd**:

```bash
pip install python-docx openpyxl
python scripts/monthly_report.py --refresh          # current cycle, data to today (draft)
python scripts/monthly_report.py --cycle 2026-11    # 24 Oct - 23 Nov 2026
```

It writes a Word report and an Excel annex (consultant summary, below-threshold lists, outside-LGA log, security and critical issues, record-level flags, daily attendance grid, activities by state) to `reports/`. **The report contains staff names, so `reports/` is gitignored and must never be committed.**

Validity rules (applied the same way every cycle): a submission is invalid if it is outside the assigned LGA with no redeployment code, has a date problem (finished another day, or phone clock set back), is dated outside the cycle, or is an extra check-in on a day already counted. Valid days = distinct days with at least one valid check-in. The expected-days threshold defaults to 22 of the cycle (as in the LC reports) and scales in proportion when only part of the cycle has data (a new form, or a draft before the 23rd). The dashboard's **Download report** button builds the same report in the browser, identifying consultants by post; the script version adds names and an Excel annex for internal use.

## Local development

```bash
npm install
mkdir -p public/data && cp data/*.json public/data/
npm run dev
```

To refresh the data locally: `KOBO_TOKEN=... python fetch_data.py`.

## Changing the form

`fetch_data.py` reads fields by name regardless of group, so moving questions between groups is safe. If you add an activity, output count or QA flag, add it to `ACTIVITIES` / `OUTPUTS` in `fetch_data.py` and to the matching label map in `src/utils/data.js`.
