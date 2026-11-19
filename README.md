# Field Team Dashboard

Dashboard for the eHA **Field Team Daily Check-in** KoboToolbox form (asset `aV89vgirjJgfzTNDBDGGzE`): one check-in per day from every LGA Coordinator and State Coordinator on the roster (347 staff, 15 states).

Live site: https://ehealthafrica.github.io/field_team_dashboard/

## How it works

```
KoboToolbox ──(hourly, :10)──▶ fetch_data.py ──▶ build ──▶ GitHub Pages
```

- `.github/workflows/deploy.yml` runs hourly (at :10) and on every merge to `main`. It needs the repo secret **`KOBO_TOKEN`**. It:
  1. starts from the data currently live on the site,
  2. runs `fetch_data.py` to refresh it from Kobo, writing
     - `data/data.json`: cleaned check-ins,
     - `data/roster.json`: everyone expected to check in, taken from the form's `c_data.csv` media file,
  3. builds the dashboard and publishes it.
- Data is **not committed back to the repository**, because `main` is protected (changes go through reviewed pull requests). If Kobo is briefly unavailable, the run publishes the last available data instead of failing.
- The files in `data/` in the repo are only a starting snapshot; the live data is on the site.
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

Validity rules (applied the same way every cycle): a submission is invalid if it is outside the assigned LGA with no redeployment code, has a date problem (finished another day, or phone clock set back), is dated outside the cycle, or is an extra check-in on a day already counted. Valid days = distinct days with at least one valid check-in. The expected-days threshold is 22 valid days, as set in the PM's report template. It is never scaled: in a draft before the 23rd the counts are "so far". The dashboard's **Download report** button builds the same report in the browser as **Word or PDF** (full report) or **PowerPoint** (summary deck), identifying consultants by post. Narrative, root causes, risks, priorities, owners and due dates are drafted from the data by fixed rules for the reviewer to confirm; only the reviewer's name, signatures and the supervisor's assessment are left blank. The script version adds names and an Excel annex for internal use.

## Login version (ERITAS)

The same code builds two ways:

- **Public (GitHub Pages):** static site, no login, reads `data/*.json`. Being retired once the login version is live.
- **Login (ERITAS):** `Dockerfile` builds the dashboard with `VITE_AUTH=1` and runs `server/` (Node + Express + PostgreSQL). People sign in with a username and password created by a Super Admin, and the server sends each person only the data their role allows, so changing filters in the browser cannot show other states.

| Role | Sees | Can manage users |
|---|---|---|
| State Coordinator | one state | no |
| Senior Supervisor | the states assigned to them | no |
| Admin | all states | no |
| Super Admin | all states | yes (Users page) |

ERITAS environment:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (ERITAS provides it). Tables are created in the `PGSCHEMA` schema (default `field_team`). |
| `kobo_token` | Kobo API token for the hourly data refresh |
| `superadmin_username`, `superadmin_password` | First start only: creates the first Super Admin when there are no users. Remove the password once signed in. |
| `pgssl` | `1` if the database requires SSL |
| `cookie_secure` | Default `1`: sign-in cookies are sent over HTTPS only. Set `0` only if the site is opened over plain `http://` (sign-in fails silently otherwise). |

Passwords are stored as bcrypt hashes; sessions are random tokens in an HttpOnly cookie (7 days), ended on sign-out, password change, or when a Super Admin changes the user. Ten failed sign-ins lock out an IP or username for 15 minutes. If every Super Admin is locked out, run inside the container: `NEW_PASSWORD='...' node server/manage.js set-password <username>`.

Try it locally (in-memory database, nothing saved):

```bash
cd server && npm install && cd ..
VITE_AUTH=1 BASE_PATH=/ npx vite build --outDir dist-auth
node server/dev.js          # http://localhost:4180 - accounts are listed at the top of server/dev.js
cd server && npm test       # API tests: role scoping, sessions, user management
```

## Local development

```bash
npm install
mkdir -p public/data && cp data/*.json public/data/
npm run dev
```

To refresh the data locally: `KOBO_TOKEN=... python fetch_data.py`.

## Changing the form

`fetch_data.py` reads fields by name regardless of group, so moving questions between groups is safe. If you add an activity, output count or QA flag, add it to `ACTIVITIES` / `OUTPUTS` in `fetch_data.py` and to the matching label map in `src/utils/data.js`.
