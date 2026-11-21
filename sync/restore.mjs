// Puts a saved copy back: node sync/restore.mjs 2026-11-17  (replaces the marathon, the Letterboxd diaries, the games and the films to watch)
// Photos are put back too, from backups/fotos/ (all of them: a photo deleted by mistake comes back).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { db } from "./common.mjs";
import { open } from "./crypt.mjs";

const day = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) throw new Error("Indica la fecha de la copia, por ejemplo 2026-11-17.");
const file = new URL(`../backups/${day}.enc.json`, import.meta.url);
if (!existsSync(file)) throw new Error(`No hay copia del ${day}.`);
const data = JSON.parse(open(JSON.parse(readFileSync(file, "utf8"))));
for (const k of ["maraton", "letterboxd", "juegos", "pelis"]) if (k in data) await db(k, "PUT", data[k] ?? null);
const fdir = new URL("../backups/fotos/", import.meta.url); let n = 0;
if (existsSync(fdir)) for (const f of readdirSync(fdir)) {
  const m = f.match(/^(p[a-z0-9]{6,30})\.enc\.json$/); if (!m) continue;
  const { g, meta, full } = JSON.parse(open(JSON.parse(readFileSync(new URL(f, fdir), "utf8"))));
  if (data.juegos && !data.juegos[g]) continue; // the game is not in this copy
  await db(`fotosg/${m[1]}`, "PUT", full); await db(`fotos/${g}/${m[1]}`, "PUT", meta); n++;
}
console.log(`Restaurada la copia del ${day}${n ? ` y ${n} fotos` : ""}.`);
