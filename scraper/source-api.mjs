// Placeholder for LUG's official data feed (DigitalShift / HockeyShift API).
//
// When LUG gets API access, fill in these functions using the API instead of the website.
// They must return the same shapes as lug-site.mjs, then run the job with DATA_SOURCE=api.
// Keep the key in a GitHub secret (DS_API_KEY) — never in the app, because the app is public.
//
// Shapes to return:
//   discoverLeagues(page, extra) -> [{ league_id, season_id }]
//   readStandings(page, L, S)    -> { season_label, tables: [{ division, headers, rows: [{ c, ids: ["L/team/ID"], logo }] }] }
//   readSchedule(page, L, S)     -> [{ headers: ["#","Away","vs","Home","Division","Score","Date","Time","Actions","Facility","Rink","GT"],
//                                     rows: [{ c, ids: ["L/game/ID"], label: "Away vs Home on YYYY-MM-DD at HH:MM" }] }]
//   readLeaders(page, L, S, type)-> { headers: ["Rk","Name","#","Team","Pos","GP","G","A","Pts",...], rows: [{ c, ids: ["player/ID","L/team/ID"] }] }
//   readRegistrations(page)      -> { "162": [["23389", "WINDSOR - WINTER HOCKEY - 2026 - 2027"], ...], ... }
//
// The simplest route is to map the API's JSON straight into these shapes so transform.mjs stays unchanged.

const KEY = process.env.DS_API_KEY;
const BASE = process.env.DS_API_BASE; // the API address DigitalShift gives LUG

function notReady() {
  throw new Error("DigitalShift API access isn't set up yet. Set DS_API_BASE and DS_API_KEY and implement source-api.mjs, or run with DATA_SOURCE=site.");
}

export async function openBrowser() {
  if (!KEY || !BASE) notReady();
  return { browser: { close: async () => {} }, page: null };
}

async function api(pathname) {
  const r = await fetch(BASE + pathname, { headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`API ${r.status} ${pathname}`);
  return r.json();
}

export async function discoverLeagues() { notReady(); }
export async function readStandings() { notReady(); }
export async function readSchedule() { notReady(); }
export async function readLeaders() { notReady(); }
export async function readRegistrations() { notReady(); }
export { api };
