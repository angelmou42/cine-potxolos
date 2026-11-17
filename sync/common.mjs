// Shared by the sync scripts: the title list from the page and how Letterboxd titles are matched to it.
import { readFileSync } from "node:fs";

export const DB = (process.env.FB_DB || "https://maraton-ucm-default-rtdb.europe-west1.firebasedatabase.app").replace(/\/+$/, "");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
export const D = eval(html.match(/const D = (\[[\s\S]*?\n\]);/)[1]);

export const norm = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
  .replace(/^marvel'?s\s+/, "").replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
export function match(title, year) {
  const n = norm(title), y = +year;
  const hit = D.find(d => norm(d.en) === n && d.y === y); if (hit) return hit;
  const near = D.filter(d => norm(d.en) === n && Math.abs(d.y - y) <= 1); return near.length === 1 ? near[0] : null;
}
export async function db(path, method = "GET", body) {
  const r = await fetch(`${DB}/${path}.json`, method === "GET" ? {} : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? null) });
  if (!r.ok) throw new Error(`Firebase ${method} ${path}: HTTP ${r.status}`);
  return r.json();
}
