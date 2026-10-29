# LUG My Team: live version

This folder has two parts:

| Part | What it does |
|---|---|
| `site/` | The phone app. It's a website people "Add to Home Screen". It loads scores and schedules from `site/data/`. |
| `scraper/` and `.github/workflows/refresh.yml` | A job that runs on GitHub on a timer. It reads lugsports.com, rebuilds `site/data/`, and publishes the site to GitHub Pages. |

The app checks for new data every 5 minutes while it's open, whenever it's reopened, and when you pull down or tap **Refresh**.

## How often data updates

All times are Toronto time.

| When | What updates |
|---|---|
| 5pm–2am, every 15 min | Scores, results, standings, this week's schedule |
| Daytime, hourly | Same as above |
| 4:41am, nightly | Everything: full schedules, player and goalie stats, rosters, team logos, sign-up programs |

GitHub can start scheduled jobs a few minutes late when it's busy. To change the times, edit the `cron:` lines in `.github/workflows/refresh.yml`. Times there are in UTC.

## One-time setup (about 20 minutes)

### 1. Put the code on GitHub
1. Create a GitHub account, then a **new repository**, e.g. `lug-my-team`.
   - **Public is recommended**: scheduled jobs are free and unlimited on public repos.
   - A private repo gets 2,000 free minutes a month. The 15-minute schedule uses more than that.
2. Upload everything in this folder, including the hidden `.github` folder. Either:
   - drag the files into GitHub's "upload files" page, or
   - from a terminal: `git init && git add . && git commit -m "LUG My Team" && git branch -M main && git remote add origin https://github.com/YOU/lug-my-team.git && git push -u origin main`

### 2. Turn on GitHub Pages
In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**. The app will live at `https://YOU.github.io/REPO/`.
(GitHub Pages is free and has no limit that a 15-minute schedule hits. Netlify's free plan blocks new deploys once its monthly credits run out, which a 15-minute schedule does in about a day.)

### 3. Tell the job its address
In the repo, go to **Settings → Secrets and variables → Actions → Variables** and add `SITE_URL` = the Pages address, e.g. `https://YOU.github.io/lug-sports`.

### 4. First run
1. In the repo, open **Actions → Refresh LUG data → Run workflow**.
2. Choose mode **full** and run it. It takes roughly 30–90 minutes because it reads every league's players.
3. When it's green, open the app. The footer should say "Updated a few minutes ago".

From then on it runs by itself. If a run fails, GitHub emails you. The app keeps showing the last good data, and the footer turns red after 3 hours without an update.

## Running it on your own computer

You need Node 20+.

```
npm ci
npx playwright install chromium
npm run refresh:full     # or: npm run refresh  (fast mode)
npm run serve            # open the printed address on your phone/computer
```

## Safety nets built in
- If a league fails to load, it keeps that league's previous data.
- If more than half the leagues fail (for example, the site is down or has changed), nothing is published, so a bad read never wipes the app.
- Data files are written atomically, so a half-written file can't be served.
- Players' saved teams carry over to a new season when the team keeps the same name in the same league.

## Switching to LUG's official data feed (recommended)

Reading the public pages works, but it breaks if the website layout changes, and it's slower. LUG's stats run on **DigitalShift (HockeyShift)**, which has a data API. When LUG gets API access:

1. Fill in `scraper/source-api.mjs`. The file lists the exact shapes each function must return.
2. Add secrets `DS_API_BASE` and `DS_API_KEY`, and set the variable `DATA_SOURCE` to `api`.

Nothing in the app changes. The key stays on GitHub and is never shipped to phones.

## Permission
Get LUG Sports' OK before publishing this, since it republishes their schedules, stats, logos and photos. If the app becomes official, ask DigitalShift for API access (above).
