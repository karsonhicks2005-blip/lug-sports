// Reads LUG's public stats pages with a headless browser (Playwright).
// This is the stopgap data source until LUG gets DigitalShift API access (see source-api.mjs).
// Every step uses the same page behaviour that was tested by hand on lugsports.com in Oct 2026.

import { chromium } from "playwright";

const BASE = "https://www.lugsports.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openBrowser() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: "LUG-MyTeam-refresh (+contact LUG Sports)" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  return { browser, page };
}

async function setHash(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await sleep(1200);
}
async function waitFor(page, fnSrc, ms = 25000) {
  try { await page.waitForFunction(fnSrc, null, { timeout: ms, polling: 400 }); return true; } catch { return false; }
}

// Current league-seasons, from the Stats + Schedule menu on the home page.
export async function discoverLeagues(page, extra = []) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await sleep(2500);
  const pairs = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a[href*="/stats#/"]').forEach((a) => {
      const m = /stats#\/(\d+)\/(schedule|standings|scores|leaders)[^?]*\??(?:.*season_id=(\d+))?/.exec(a.getAttribute("href"));
      if (m) out.push([m[1], m[3] || null, m[2]]);
    });
    return out;
  });
  const seen = new Map();
  // Prefer the league number used by a season's schedule link: pickleball's standings link uses a
  // different league number (2859) than its schedule (3643) for the same season.
  const order = { schedule: 0, scores: 1, leaders: 2, standings: 3 };
  pairs.sort((a, b) => order[a[2]] - order[b[2]]);
  for (const [lid, sid, view] of pairs) {
    const k = sid ? "s" + sid : "l" + lid; // one entry per season (or per league when it has no season id)
    if (!seen.has(k) && (sid || view === "standings")) seen.set(k, { league_id: lid, season_id: sid });
  }
  for (const e of extra) seen.set(e.league_id + "_" + (e.season_id || "default"), e);
  return [...seen.values()];
}

// ---------- standings (with division names, team ids and logo urls) ----------
export async function readStandings(page, L, S) {
  await page.goto(`${BASE}/stats#/${L}/standings${S ? "?season_id=" + S : ""}`, { waitUntil: "domcontentloaded" });
  await waitFor(page, () => document.querySelector('main table tbody tr a[href*="/team/"]') || /disabled|no standings/i.test(document.querySelector("main")?.innerText || ""));
  await sleep(1500);
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const sel = document.querySelector('select[ng-model*="season"]');
    const season_label = sel?.options[sel.selectedIndex]?.textContent.trim() || "";
    let tables = [...main.querySelectorAll("div.table-scroll table")];
    if (!tables.length) tables = [...main.querySelectorAll("table")];
    const out = [];
    for (const tb of tables) {
      let el = tb, division = "";
      for (let i = 0; i < 6 && el && !division; i++) {
        el = el.parentElement;
        const pv = el?.previousElementSibling;
        if (pv && /pad-ph|title|heading/.test(pv.className) && pv.textContent.trim().length < 120) division = pv.textContent.trim();
      }
      const headers = [...(tb.tHead?.rows[0] || tb.rows[0]).cells].map((c) => c.textContent.trim());
      const body = tb.tBodies.length ? [...tb.tBodies].flatMap((b) => [...b.rows]) : [...tb.rows].slice(1);
      const rows = body.map((r) => {
        const c = [...r.cells].map((td) => { const a = td.querySelector('a[href*="/team/"]'); return (a && a.getAttribute("aria-label")?.replace(/ team page$/, "")) || td.textContent.trim().replace(/\s+/g, " "); });
        const a = r.querySelector('a[href*="/team/"]');
        const img = a?.querySelector("img")?.getAttribute("src") || null;
        return { c, ids: a ? [a.getAttribute("href").replace(/^.*#\//, "")] : [], logo: img };
      });
      out.push({ division, headers, rows });
    }
    return { season_label, tables: out };
  });
}

// ---------- schedule ----------
// full = every game of the season (slow, uses Load More); otherwise the site's "current schedule" window.
export async function readSchedule(page, L, S, { full = false } = {}) {
  await page.goto(`${BASE}/stats#/${L}/schedule?season_id=${S}${full ? "&all" : ""}`, { waitUntil: "domcontentloaded" });
  await waitFor(page, () => document.querySelector("main div.table-scroll table tbody tr") || /No games are scheduled/i.test(document.querySelector("main")?.innerText || ""));
  await sleep(1500);
  if (full) {
    let stuck = 0;
    for (let i = 0; i < 1000 && stuck < 4; i++) {
      const n = await page.evaluate(() => document.querySelectorAll("main div.table-scroll table tbody tr").length);
      const clicked = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight); window.dispatchEvent(new Event("scroll"));
        const b = [...document.querySelectorAll("main a")].find((x) => /Load More/i.test(x.textContent) && x.offsetParent !== null);
        if (b) b.click(); return !!b;
      });
      const grew = await waitFor(page, `document.querySelectorAll("main div.table-scroll table tbody tr").length > ${n}`, 8000);
      if (!grew) stuck += clicked ? 1 : 2; else stuck = 0;
    }
  }
  return page.evaluate(() => {
    const tb = document.querySelector("main div.table-scroll table");
    if (!tb) return [];
    const headers = [...(tb.tHead?.rows[0] || tb.rows[0]).cells].map((c) => c.textContent.trim());
    const rows = [...tb.tBodies].flatMap((b) => [...b.rows]).map((r) => ({
      c: [...r.cells].map((td) => td.textContent.trim().replace(/\s+/g, " ")),
      ids: [...new Set([...r.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /\/game\//.test(h)).map((h) => h.replace(/^.*#\//, "")))],
      label: [...r.querySelectorAll("[aria-label]")].map((a) => a.getAttribute("aria-label")).find((s) => / on 20\d\d-/.test(s)) || null,
    }));
    return [{ headers, rows }];
  });
}

// ---------- players / goalies (100 per page) ----------
// Each page is loaded fresh from the standings view and accepted only when its first rank is (page-1)*100+1.
export async function readLeaders(page, L, S, type) {
  const all = [];
  let headers = null;
  await page.goto(`${BASE}/stats#/${L}/standings?season_id=${S}`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  for (let p = 1; p < 400; p++) {
    let got = null;
    for (let attempt = 0; attempt < 2 && !got; attempt++) {
      await setHash(page, `/${L}/standings?season_id=${S}`);
      await setHash(page, `/${L}/leaders/table?game_type=Regular%20Season&player_type=${type}&page=${p}&season_id=${S}`);
      const want = String((p - 1) * 100 + 1);
      const ok = await waitFor(page, `(() => { const t=[...document.querySelectorAll("main div.table-scroll table")].find(t=>{const h=[...(t.tHead?.rows[0]||t.rows[0]||{cells:[]}).cells].map(c=>c.textContent.trim());return h.includes("Rk")&&h.includes("Name")}); return t && t.tBodies[0]?.rows[0]?.cells[0]?.textContent.trim()===${JSON.stringify(want)} && /leaders\\/table/.test(location.hash); })()`, 20000);
      if (!ok) continue;
      await sleep(400);
      got = await page.evaluate(() => {
        const t = [...document.querySelectorAll("main div.table-scroll table")].find((t) => { const h = [...(t.tHead?.rows[0] || t.rows[0]).cells].map((c) => c.textContent.trim()); return h.includes("Rk") && h.includes("Name"); });
        const headers = [...(t.tHead?.rows[0] || t.rows[0]).cells].map((c) => c.textContent.trim());
        const rows = [...t.tBodies[0].rows].map((r) => ({
          c: [...r.cells].map((td) => { const a = td.querySelector('a[href*="/team/"]'); return (a && a.getAttribute("aria-label")?.replace(/ team page$/, "")) || td.textContent.trim().replace(/\s+/g, " "); }),
          ids: [...new Set([...r.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /\/(team|player)\//.test(h)).map((h) => h.replace(/^.*#\//, "")))],
        }));
        return { headers, rows };
      });
    }
    if (!got) break;
    headers = got.headers;
    all.push(...got.rows);
    if (got.rows.length < 100) break;
  }
  return { headers, rows: all };
}

// ---------- player sign-up programs ----------
export async function readRegistrations(page, leagueIds = ["1439", "162", "1869", "481"]) {
  const out = {};
  for (const L of leagueIds) {
    await page.goto(`${BASE}/register#/${L}/team_player`, { waitUntil: "domcontentloaded" });
    await waitFor(page, () => [...document.querySelectorAll("a")].some((x) => /INFO & REGISTER/i.test(x.textContent)), 20000);
    await sleep(1000);
    out[L] = await page.evaluate(() => [...document.querySelectorAll("a")].filter((x) => /INFO & REGISTER/i.test(x.textContent)).map((x) => {
      let el = x, name = "";
      for (let i = 0; i < 6 && el && !name; i++) { el = el.parentElement; const h = el.querySelector("h2,h3,h4"); if (h && !/info & register/i.test(h.textContent)) name = h.textContent.trim(); }
      return [x.getAttribute("href").split("/").pop(), name.replace(/^[^A-Za-z0-9]+/, "")];
    }).filter((p) => !/EXTRA PLAYER/i.test(p[1])));
  }
  return out;
}
