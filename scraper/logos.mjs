// Downloads team logos, shrinks them to 80px WebP data URIs and picks each team's colours.
// Output (logos.json): { map: { leagueKey: { teamId: logoKey } }, logos: { logoKey: [dataUri, [primary, secondary, saturation]] } }
// Only logos not already in logos.json are downloaded, so nightly runs stay quick.

import sharp from "sharp";

const SIZE = 80;

// logo urls look like .../team-logo_url-722784-box-liquors-1792430098305656387-small.png
export function logoKeyFromUrl(url) {
  const m = /team-logo_url-(.+?)-(?:small|medium|large)\.png/.exec(url || "");
  return m ? m[1] : null;
}
function urlFor(sampleUrl, key, size) {
  return sampleUrl.replace(/team-logo_url-.+$/, `team-logo_url-${key}-${size}.png`);
}

function colours(data) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const k = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; buckets.set(k, e);
  }
  const arr = [...buckets.values()].map((e) => {
    const r = e.r / e.n, g = e.g / e.n, b = e.b / e.n;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return { n: e.n, r, g, b, sat: mx ? (mx - mn) / mx : 0, lum: 0.299 * r + 0.587 * g + 0.114 * b };
  });
  const total = arr.reduce((s, e) => s + e.n, 0) || 1;
  arr.forEach((e) => { e.share = e.n / total; e.score = e.share * (0.25 + e.sat * 1.5) * (e.lum > 235 || e.lum < 18 ? 0.25 : 1); });
  arr.sort((a, b) => b.score - a.score);
  const hex = (e) => "#" + [e.r, e.g, e.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const p = arr[0];
  if (!p) return null;
  const s = arr.slice(1).find((e) => Math.hypot(e.r - p.r, e.g - p.g, e.b - p.b) > 90 && e.share > 0.03);
  return [hex(p), s ? hex(s) : null, +p.sat.toFixed(2)];
}

async function fetchBuf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + " " + url);
  return Buffer.from(await r.arrayBuffer());
}

export async function processLogo(sampleUrl, key) {
  let buf;
  try { buf = await fetchBuf(urlFor(sampleUrl, key, "large")); }
  catch { buf = await fetchBuf(urlFor(sampleUrl, key, "medium")); }
  const resized = sharp(buf).resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const [webp, raw] = await Promise.all([
    resized.clone().webp({ quality: 80 }).toBuffer(),
    resized.clone().ensureAlpha().raw().toBuffer(),
  ]);
  return ["data:image/webp;base64," + webp.toString("base64"), colours(raw)];
}

// teams: [{ leagueKey, teamId, logoUrl }]
export async function updateLogos(previous, teams, { concurrency = 6, log = console.log } = {}) {
  const out = { map: {}, logos: { ...(previous?.logos || {}) } };
  const todo = new Map();
  for (const t of teams) {
    const key = logoKeyFromUrl(t.logoUrl);
    if (!key) continue;
    (out.map[t.leagueKey] ||= {})[t.teamId] = key;
    if (!out.logos[key] && !todo.has(key)) todo.set(key, t.logoUrl);
  }
  const queue = [...todo.entries()];
  let done = 0, failed = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const [key, url] = queue.shift();
      try { out.logos[key] = await processLogo(url, key); done++; } catch { failed++; }
    }
  }));
  // drop logos no team uses any more
  const used = new Set(Object.values(out.map).flatMap((m) => Object.values(m)));
  for (const k of Object.keys(out.logos)) if (!used.has(k)) delete out.logos[k];
  log(`logos: ${done} new, ${failed} failed, ${Object.keys(out.logos).length} total`);
  return out;
}
