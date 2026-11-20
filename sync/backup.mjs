// Daily copy of everything you have saved (marathon + Letterboxd diaries) into backups/YYYY-MM-DD.json.
// The same day's file is overwritten each run, so the history keeps one copy per day.
import { writeFileSync, mkdirSync } from "node:fs";

const DB = "https://maraton-ucm-default-rtdb.europe-west1.firebasedatabase.app";
const get = async p => { const r = await fetch(`${DB}/${p}.json`); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); };
const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;

const data = { maraton: await get("maraton"), letterboxd: await get("letterboxd"), juegos: await get("juegos") };
if (data.maraton) delete data.maraton.lbAt; // hourly timestamp: not worth a new copy
if (!data.maraton) throw new Error("La base de datos ha devuelto el maratón vacío: no se guarda la copia.");
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const dir = new URL("../backups/", import.meta.url); mkdirSync(dir, { recursive: true });
writeFileSync(new URL(`${day}.json`, dir), JSON.stringify(sorted(data), null, 1) + "\n");
console.log(`Copia guardada: backups/${day}.json`);
