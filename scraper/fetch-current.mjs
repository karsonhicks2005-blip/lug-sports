// Downloads the data files currently live on your site, so a fast refresh can build on them.
// Usage: SITE_URL=https://your-site.netlify.app node scraper/fetch-current.mjs
// If the site isn't live yet, the starter files in site/data/ are used as they are.

import fs from "node:fs";
import path from "node:path";

const SITE = (process.env.SITE_URL || "").replace(/\/$/, "");
const DIR = path.resolve("site/data");
fs.mkdirSync(DIR, { recursive: true });

if (!SITE) {
  console.log("SITE_URL not set; using the files already in site/data.");
  process.exit(0);
}
for (const f of ["data.json", "logos.json", "reg.json"]) {
  try {
    const r = await fetch(`${SITE}/data/${f}?t=${Date.now()}`);
    if (!r.ok) throw new Error(String(r.status));
    const text = await r.text();
    const live = JSON.parse(text); // only replace with valid JSON
    if (f === "logos.json") {
      // Union with the logos kept in the repo, so a run that missed some logos can't lose them for good.
      let local = null;
      try { local = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch {}
      if (local) {
        const map = JSON.parse(JSON.stringify(local.map || {}));
        for (const [lk, m] of Object.entries(live.map || {})) Object.assign((map[lk] ||= {}), m);
        const merged = { map, logos: { ...(local.logos || {}), ...(live.logos || {}) } };
        fs.writeFileSync(path.join(DIR, f), JSON.stringify(merged));
        console.log(`fetched ${f}, merged with the repo copy: ${Object.keys(merged.logos).length} logos`);
        continue;
      }
    }
    fs.writeFileSync(path.join(DIR, f), text);
    console.log(`fetched ${f} (${(text.length / 1e6).toFixed(2)} MB)`);
  } catch (e) {
    console.log(`kept local ${f} (${e.message})`);
  }
}
