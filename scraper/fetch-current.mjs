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
    JSON.parse(text); // only replace with valid JSON
    fs.writeFileSync(path.join(DIR, f), text);
    console.log(`fetched ${f} (${(text.length / 1e6).toFixed(2)} MB)`);
  } catch (e) {
    console.log(`kept local ${f} (${e.message})`);
  }
}
