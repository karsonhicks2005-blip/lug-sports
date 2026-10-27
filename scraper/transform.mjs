// Turns raw captures of LUG stats pages into the compact data file the app reads.
//
// Raw league-season shape (what lug-site.mjs produces):
// {
//   league_id, season_id, season_label,
//   standings: [{ division, headers, rows: [{ c: [...cells], ids: ["162/team/123"], logo? }] }],
//   schedule:  [{ headers, rows: [{ c: [...cells], ids: ["162/game/456"] }] }],
//   players:   { headers, rows: [{ c, ids }] },
//   goalies:   { headers, rows: [{ c, ids }] }
// }
//
// App shape (data.json):
// { updated, leagues: [{ k, lid, sp, lg, ss, dv: [{ n, t: [{ id, n, Rk, GP, W, ... }] }],
//   g: [[gameId, date, time, away, home, score, status, facility, rink, type]],
//   p: [[teamId, name, number, pos, gp, g, a, pts, pim]],
//   gk: [[teamId, name, number, gp, w, l, gaa, svPct, so]] }] }

export const SPORT_BY_LEAGUE = {
  "1439": ["Flag Football", "Flag Football"],
  "3348": ["Flag Football", "Flag Football Tournaments"],
  "162": ["Hockey", "College Hockey"],
  "1869": ["Hockey", "Adult (OA) Hockey"],
  "1709": ["Hockey", "Summer Hockey"],
  "2082": ["Hockey", "Summer Hockey Tournaments"],
  "481": ["Softball", "Fall Softball"],
  "1784": ["Softball", "Summer Softball"],
  "3587": ["Softball", "Softball Tournaments"],
  "3643": ["Pickleball", "Pickleball"],
  "2859": ["Pickleball", "Pickleball"],
  "1477": ["Soccer", "Soccer"],
};

const STAND_KEYS = ["Rk", "GP", "G", "MP", "W", "L", "T", "OT", "OTL", "Pts", "W%", "GF", "GA", "PF", "PA", "RS", "RA", "Streak", "Next Game"];
const HOCKEY_SKATER = ["Rk", "Name", "#", "Team", "Pos", "GP", "G", "A", "Pts", "PPGA", "PIM", "PPG", "SHG", "GWG"];

function num(v) {
  if (v == null) return v;
  const s = String(v).trim();
  if (/^[+-]?\d+$/.test(s)) return parseInt(s, 10);
  if (/^[+-]?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}
function idOf(ids, kind) {
  for (const i of ids || []) { const m = new RegExp(kind + "/(\\d+)").exec(i); if (m) return m[1]; }
  return null;
}
const BAD_HEADINGS = new Set(["", "Division", "All Divisions"]);

export function leagueKey(raw) { return `${raw.league_id}_${raw.season_id ?? "default"}`; }

export function transformLeague(raw, divmap = {}) {
  const lid = String(raw.league_id);
  const [sport, lname] = SPORT_BY_LEAGUE[lid] || ["Other", `League ${lid}`];
  const key = leagueKey(raw);
  const out = { k: key, lid, sp: sport, lg: lname, ss: raw.season_label || "", dv: [], g: [], p: [], gk: [] };

  // standings
  const seen = new Set();
  const teamDiv = {};
  for (const tbl of raw.standings || []) {
    const hdr = tbl.headers || [];
    for (const r of tbl.rows || []) {
      const id = idOf(r.ids, "team");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const cells = {};
      hdr.forEach((h, i) => { if (h) cells[h] = r.c[i]; });
      const div = divmap[id] || (!BAD_HEADINGS.has(tbl.division || tbl.heading || "") ? (tbl.division || tbl.heading) : "") || "All Divisions";
      const team = { id, n: cells.Team || "" };
      for (const k of STAND_KEYS) if (cells[k] != null && cells[k] !== "") team[k] = num(cells[k]);
      teamDiv[team.n] = div;
      let d = out.dv.find((x) => x.n === div);
      if (!d) { d = { n: div, t: [] }; out.dv.push(d); }
      d.t.push(team);
    }
  }

  // schedule
  const gseen = new Set();
  for (const tbl of raw.schedule || []) {
    const hdr = tbl.headers || [];
    for (const r of tbl.rows || []) {
      const gid = idOf(r.ids, "game");
      if (!gid || gseen.has(gid)) continue;
      const label = String(r.label || r.c[1] || "").replace(/(at \d{2}:\d{2}).*$/, "$1");
      const m = /^(.*?) vs (.*) on (\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2})$/.exec(label);
      if (!m) continue;
      gseen.add(gid);
      const cells = {};
      hdr.forEach((h, i) => { if (h) cells[h] = r.c[i]; });
      const score = cells.Score || "";
      out.g.push([gid, m[3], m[4], m[1], m[2], score, score ? (cells.Actions || "Final") : "Scheduled", cells.Facility || "", cells.Rink || cells.Field || "", cells.GT || ""]);
    }
  }
  out.g.sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2]));

  // players & goalies
  function people(block, isGoalie) {
    if (!block || !block.rows || !block.rows.length) return [];
    let hdr = block.headers || [];
    if (!hdr.includes("Name")) {
      if (!isGoalie && block.rows[0].c.length === HOCKEY_SKATER.length) hdr = HOCKEY_SKATER;
      else return []; // a 'top leaders' widget, not a full table
    }
    const res = [], pseen = new Set();
    for (const r of block.rows) {
      const cells = {};
      hdr.forEach((h, i) => { if (h) cells[h] = r.c[i]; });
      const pid = idOf(r.ids, "player"), tid = idOf(r.ids, "team");
      if (!tid || pseen.has(pid + "|" + tid)) continue;
      pseen.add(pid + "|" + tid);
      const name = String(cells.Name || "").replace(/#\w+$/, "").trim();
      if (isGoalie) res.push([tid, name, cells["#"] ?? "", num(cells.GP), num(cells.W), num(cells.L), num(cells.GAA), num(cells["Sv%"]), num(cells.SO)]);
      else res.push([tid, name, cells["#"] ?? "", cells.Pos ?? "", num(cells.GP), num(cells.G), num(cells.A), num(cells.Pts), num(cells.PIM ?? "")]);
    }
    return res;
  }
  out.p = people(raw.players, false);
  out.gk = people(raw.goalies, true);
  return out;
}

// Fast refresh: keep the previous league's players, and merge games by id so a
// "current week" schedule capture updates scores without dropping the rest of the season.
export function mergeLeague(prev, fresh, { keepPeople = true, mergeGames = true } = {}) {
  if (!prev) return fresh;
  const out = { ...fresh };
  // The season picker on a standings page sometimes shows another season's name (seen on
  // pickleball). In a fast refresh the season itself can't change, so keep the full read's name.
  if (mergeGames && prev.ss) out.ss = prev.ss;
  if (keepPeople) {
    if (!fresh.p.length) out.p = prev.p;
    if (!fresh.gk.length) out.gk = prev.gk;
  }
  if (mergeGames) {
    const byId = new Map(prev.g.map((g) => [g[0], g]));
    for (const g of fresh.g) byId.set(g[0], g);
    out.g = [...byId.values()].sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2]));
  }
  if (!fresh.dv.length && prev.dv.length) out.dv = prev.dv;
  return out;
}
