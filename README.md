# Job Radar

A personal job-screening tool for Andy. Pulls 10–15 relevant Admin/EA/Ops/Customer
Service roles once a day (on demand) from two kinds of sources:

1. **Job APIs** — Jooble, Adzuna, Remotive, RemoteOK (legitimate, ToS-safe)
2. **Gmail alerts** — parses existing job-alert emails from Jobberman, LinkedIn,
   Jooble, Glassdoor, MyJobMag, Indeed using the labels already set up in Gmail.
   Messages get a `Processed` label after parsing so nothing is re-pulled twice.
   Nothing is archived, deleted, or moved — this is purely additive.

Output is a single `data/jobs.json` file, read by a static review page
(`public/index.html`) where each job can be marked **Apply / Skip / Saved**.

## Folder structure

```
job-radar/
├── config/
│   ├── filters.json      # role keywords, exclusions, location preferences
│   └── sources.json      # API keys (placeholders — fill in your own)
├── scripts/
│   ├── fetch-apis.js      # pulls from Jooble/Adzuna/Remotive/RemoteOK
│   ├── parse-gmail.js     # reads + labels Gmail alert emails
│   ├── merge-filter.js    # merges, dedups, filters, caps at 15
│   └── run.js             # orchestrates all of the above
├── public/
│   ├── index.html         # review board (the page you actually look at)
│   ├── style.css
│   └── app.js
├── data/
│   └── jobs.json          # today's feed (generated)
└── .github/workflows/
    └── fetch-jobs.yml      # manual "Run now" trigger (workflow_dispatch)
```

## Keeping credentials out of the public repo

`handyofmen.github.io` is a public repository, so real API keys must never be
committed to it. This project handles that as follows:

- `config/sources.json` — your **real** credentials, for local testing only.
  This file is listed in `.gitignore` and will never be pushed to GitHub.
- `config/sources.example.json` — a safe template with placeholder values,
  committed to the repo so the expected structure is visible.
- All scripts read credentials from environment variables **first**, falling
  back to `config/sources.json` only when those env vars aren't set. This
  means the exact same code works both locally (reading the gitignored file)
  and inside GitHub Actions (reading Secrets) with no changes needed.

### GitHub Secrets required for the Action to run

Add these under `Settings → Secrets and variables → Actions` in your repo:

| Secret name | Value |
|---|---|
| `JOOBLE_API_KEY` | from jooble.org/api/about |
| `ADZUNA_APP_ID` | from developer.adzuna.com dashboard |
| `ADZUNA_APP_KEY` | from developer.adzuna.com dashboard |
| `GOOGLE_CLIENT_ID` | from Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud OAuth client |
| `GOOGLE_REFRESH_TOKEN` | from running `get-refresh-token.js` locally |

## One-time setup

### 1. API keys (all free tier)
- Jooble: https://jooble.org/api/about — get a free API key
- Adzuna: https://developer.adzuna.com/ — free `app_id` + `app_key`
- Remotive / RemoteOK: no key needed, public JSON endpoints

Copy `config/sources.example.json` to `config/sources.json` and fill these in
for local testing.

### 2. Gmail API access
1. Create a Google Cloud project → enable the Gmail API
2. Create OAuth 2.0 credentials (Desktop app type)
3. Run the one-time auth flow locally to generate a refresh token
4. Store `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` as GitHub Actions secrets
   (Settings → Secrets and variables → Actions)

This only needs to be done once — the refresh token keeps working after that.

### 3. Filters
Edit `config/filters.json` with your target titles, exclusions, and location
preferences. Defaults are pre-filled for Admin Officer / Executive Assistant /
Customer Service, remote or Lagos-based.

## Running it

Locally:
```bash
npm install
node scripts/run.js
```

Or trigger the GitHub Action manually from the Actions tab (no fixed schedule —
you run it when you're ready to screen, inside your working window).

Then open `public/index.html` (or the deployed GitHub Pages version) to review.
