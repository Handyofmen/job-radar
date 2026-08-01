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

## One-time setup

### 1. API keys (all free tier)
- Jooble: https://jooble.org/api/about — get a free API key
- Adzuna: https://developer.adzuna.com/ — free `app_id` + `app_key`
- Remotive / RemoteOK: no key needed, public JSON endpoints

Put these in `config/sources.json`.

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
