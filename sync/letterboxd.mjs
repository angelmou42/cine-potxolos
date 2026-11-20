// Brings each member's Letterboxd ratings and reviews (from their public RSS) into the shared Firebase state.
// Letterboxd wins: a rating or review there overwrites the one in the web.
import { DB, norm, match } from "./common.mjs";

const FB = `${DB}/maraton`;
const decode = s => s.replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`)); return m ? m[1] : ""; };
function reviewText(desc) {
  let h = desc.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").replace(/<p>\s*<img[^>]*>\s*<\/p>/gi, "")
    .replace(/<p>\s*<em>\s*This review may contain spoilers\.?\s*<\/em>\s*<\/p>/gi, "");
  h = h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<[^>]+>/g, "");
  return decode(h).trim();
}

async function feed(user) {
  const res = await fetch(`https://letterboxd.com/${encodeURIComponent(user)}/rss/`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; rss-reader)" } });
  if (!res.ok) throw new Error(`${user}: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]).map(x => ({
    kind: (tag(x, "guid").match(/letterboxd-(\w+)-/) || [])[1],
    title: decode(tag(x, "letterboxd:filmTitle")), year: tag(x, "letterboxd:filmYear"),
    date: tag(x, "letterboxd:watchedDate"), rating: +tag(x, "letterboxd:memberRating") || 0,
    review: tag(x, "description"), link: tag(x, "link").trim(),
    img: (tag(x, "description").match(/<img src="(https:\/\/a\.ltrbxd\.com\/[^"]+)"/) || [])[1] || "",
  })).filter(e => e.title && (e.kind === "review" || e.kind === "watch"));
}
// Each member's diary is kept apart (node "letterboxd") so the page can find films you both logged the same day.
const diaryId = e => `${norm(e.title).replace(/ /g, "-")}_${e.year}_${e.date}`;
const diary = {};

const state = (await (await fetch(`${FB}.json`)).json()) || {};
const items = state.items || {};
const users = [state.lbA ?? "angelmou", state.lbB ?? "planetaryg0_"];
const patch = {}; let failures = 0;

for (const who of [0, 1]) {
  if (!users[who]) continue;
  let entries;
  try { entries = await feed(users[who]); } catch (e) { console.error(String(e)); failures++; continue; }
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // newest first
  for (const e of [...entries].reverse()) { // oldest first, so the newest log of a day wins
    if (!e.date) continue;
    const id = diaryId(e), prev = diary[`${who}/${id}`] || {};
    const rv = e.kind === "review" ? reviewText(e.review).slice(0, 6000) : "";
    diary[`${who}/${id}`] = { t: e.title, y: +e.year, d: e.date, r: e.rating || prev.r || 0, rv: rv || prev.rv || "", img: e.img || prev.img || "", lk: e.link };
  }
  const seen = new Set(), rated = new Set(), reviewed = new Set();
  for (const e of entries) { // newest entry per film decides
    const d = match(e.title, e.year); if (!d) continue;
    const it = items[d.id] || {}, cur = k => (it[k] || {})[who];
    if (e.rating && !rated.has(d.id)) { rated.add(d.id); if (cur("r") !== e.rating) patch[`items/${d.id}/r/${who}`] = e.rating; }
    if (e.kind === "review" && !reviewed.has(d.id)) {
      const t = reviewText(e.review).slice(0, 6000);
      if (t) { reviewed.add(d.id); if (cur("rv") !== t) patch[`items/${d.id}/rv/${who}`] = t; }
    }
    if (!seen.has(d.id)) { seen.add(d.id);
      if (state.lbFrom && e.date >= state.lbFrom && !it.st && !patch[`items/${d.id}/st`]) {
        patch[`items/${d.id}/st`] = "seen"; if (!it.d) patch[`items/${d.id}/d`] = e.date;
      }
    }
  }
}
const changed = Object.keys(patch).length;
patch.lbAt = Date.now(); if (changed) patch.upd = Date.now();
// Runtime of each film (for the hours watched together), read once from its Letterboxd page and kept in "lbfilms"
const filmSlug = lk => (String(lk).match(/\/film\/([^/]+)\//) || [])[1];
const runtimes = (await (await fetch(`${DB}/lbfilms.json`)).json()) || {}, newRuntimes = {};
for (const key of Object.keys(diary)) {
  const e = diary[key], slug = filmSlug(e.lk); if (!slug) continue;
  if (!(slug in runtimes) && !(slug in newRuntimes) && Object.keys(newRuntimes).length < 40) {
    try {
      const page = await (await fetch(`https://letterboxd.com/film/${slug}/`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; rss-reader)" } })).text();
      newRuntimes[slug] = +((page.match(/(\d+)&nbsp;mins/) || [])[1] || 0);
      await new Promise(r => setTimeout(r, 400));
    } catch (err) { console.error(`Duración de ${slug}: ${err}`); }
  }
  const m = runtimes[slug] ?? newRuntimes[slug]; if (m) e.m = m;
}
if (Object.keys(newRuntimes).length) {
  await fetch(`${DB}/lbfilms.json`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRuntimes) });
  console.log(`Duraciones nuevas: ${Object.keys(newRuntimes).length}.`);
}
const res = await fetch(`${FB}.json`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
if (!res.ok) throw new Error(`Firebase: HTTP ${res.status}`);
if (Object.keys(diary).length) {
  const r2 = await fetch(FB.replace(/\/maraton$/, "/letterboxd") + ".json", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(diary) });
  if (!r2.ok) throw new Error(`Firebase diary: HTTP ${r2.status}`);
  console.log(`Diary: ${Object.keys(diary).length} log(s) saved.`);
}
console.log(`Letterboxd: ${changed} change(s).`, changed ? Object.keys(patch).join(", ") : "");
if (failures === 2) process.exit(1);
