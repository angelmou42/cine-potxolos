// Puts a saved copy back: node sync/restore.mjs 2026-11-17  (replaces the marathon and the Letterboxd diaries)
import { readFileSync } from "node:fs";

const DB = "https://maraton-ucm-default-rtdb.europe-west1.firebasedatabase.app";
const day = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) throw new Error("Indica la fecha de la copia, por ejemplo 2026-11-17.");
const data = JSON.parse(readFileSync(new URL(`../backups/${day}.json`, import.meta.url), "utf8"));
for (const k of ["maraton", "letterboxd", "juegos"]) {
  if (!(k in data)) continue; // older copies have no games
  const r = await fetch(`${DB}/${k}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data[k] ?? null) });
  if (!r.ok) throw new Error(`${k}: HTTP ${r.status}`);
}
console.log(`Restaurada la copia del ${day}.`);
