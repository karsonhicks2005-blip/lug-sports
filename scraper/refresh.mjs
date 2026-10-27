// Refreshes the app's data files in site/data/.
//
//   node scraper/refresh.mjs --mode=fast   standings + this week's schedule and scores (every 15 min)
//   node scraper/refresh.mjs --mode=full   everything: full schedules, players, goalies, logos, sign-up programs (nightly)
//
// The previous data files are read first (see fetch-current.mjs), so a fast run only replaces what it re-read.
// Set DATA_SOURCE=api once LUG has DigitalShift API access (see source-api.mjs).

import fs from "node:fs";
import path from "node:path";
import { transformLeague, mergeLeague, leagueKey } from "./transform.mjs";
import { updateLogos } from "./logos.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const MODE = args.mode === "full" ? "full" : "fast";
const DATA_DIR = path.resolve(args.out || "site/data");
const SOURCE = process.env.DATA_SOURCE || "site";
fs.mkdirSync(DATA_DIR, { recursive: true });

// Seasons that exist but aren't linked from LUG's menu (Frat Hockey).
const EXTRA_SEASONS = [{ league_id: "162", season_id: "11250" }];

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8")); } catch { return fb; } };
const writeJson = (f, v) => { const tmp = path.join(DATA_DIR, f + ".tmp"); fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, path.join(DATA_DIR, f)); };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const t0 = Date.now();
  const prevData = readJson("data.json", { leagues: [] });
  const prevByKey = new Map(prevData.leagues.map((l) => [l.k, l]));
  const src = SOURCE === "api" ? await import("./source-api.mjs") : await import("./lug-site.mjs");
  const { browser, page } = await src.openBrowser();
  const leagues = [];
  const logoTeams = [];
  let failures = 0;
  try {
    const seasons = await src.discoverLeagues(page, EXTRA_SEASONS);
    log(`mode=${MODE} source=${SOURCE} seasons=${seasons.length}`);
    for (const s of seasons) {
      const key = leagueKey(s);
      try {
        const st = await src.readStandings(page, s.league_id, s.season_id);
        const raw = { ...s, season_label: st.season_label, standings: st.tables, schedule: [], players: null, goalies: null };
        if (s.season_id) {
          raw.schedule = await src.readSchedule(page, s.league_id, s.season_id, { full: MODE === "full" || !prevByKey.has(key) });
          if (MODE === "full" || !prevByKey.has(key)) {
            raw.players = await src.readLeaders(page, s.league_id, s.season_id, "players");
            raw.goalies = await src.readLeaders(page, s.league_id, s.season_id, "goalies");
          }
        }
        for (const tbl of st.tables) for (const r of tbl.rows) {
          const id = (r.ids[0] || "").split("/").pop();
          if (id && r.logo) logoTeams.push({ leagueKey: key, teamId: id, logoUrl: r.logo });
        }
        const fresh = transformLeague(raw);
        const prev = prevByKey.get(key);
        // A full run replaces the schedule; a fast run merges this week's games into it.
        const merged = MODE === "full" ? mergeLeague(prev, fresh, { keepPeople: true, mergeGames: false }) : mergeLeague(prev, fresh, { keepPeople: true, mergeGames: true });
        leagues.push(merged);
        log(`${key} ${merged.ss}: ${merged.dv.length} div, ${merged.dv.reduce((n, d) => n + d.t.length, 0)} teams, ${merged.g.length} games, ${merged.p.length} players`);
      } catch (e) {
        failures++;
        log(`${key} FAILED: ${e.message}`);
        if (prevByKey.has(key)) leagues.push(prevByKey.get(key)); // keep the last good copy
      }
    }

    if (MODE === "full") {
      try {
        const reg = await src.readRegistrations(page);
        if (Object.values(reg).some((v) => v.length)) writeJson("reg.json", reg);
        log("sign-up programs:", Object.fromEntries(Object.entries(reg).map(([k, v]) => [k, v.length])));
      } catch (e) { log("sign-up programs FAILED:", e.message); }
    }
  } finally {
    await browser.close();
  }

  if (!leagues.length) throw new Error("No leagues read; keeping previous data.");
  if (failures > leagues.length / 2) throw new Error(`${failures} leagues failed; keeping previous data.`);

  if (MODE === "full" || !fs.existsSync(path.join(DATA_DIR, "logos.json"))) {
    const logos = await updateLogos(readJson("logos.json", null), logoTeams, { log });
    writeJson("logos.json", logos);
  }

  const updated = new Date().toISOString();
  writeJson("data.json", { updated, mode: MODE, leagues });
  writeJson("version.json", { updated, logos: fs.statSync(path.join(DATA_DIR, "logos.json")).mtimeMs | 0 });
  log(`done in ${Math.round((Date.now() - t0) / 1000)}s, ${failures} failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
