// Daily copy of everything you have saved (marathon, Letterboxd diaries, games, films to watch) into backups/YYYY-MM-DD.enc.json.
// The repository is public, so the copy is encrypted with the member code (AES-256-GCM); only restore.mjs with the code can read it.
// The same day's file is overwritten each run, so the history keeps one copy per day.
// Photos go apart: one encrypted file per photo in backups/fotos/, written once (they never change).
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { db, shallow } from "./common.mjs";
import { seal } from "./crypt.mjs";

const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;

const data = { maraton: await db("maraton"), letterboxd: await db("letterboxd"), juegos: await db("juegos"), pelis: await db("pelis") };
if (data.maraton) delete data.maraton.lbAt; // hourly timestamp: not worth a new copy
if (!data.maraton) throw new Error("La base de datos ha devuelto el maratón vacío: no se guarda la copia.");
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const dir = new URL("../backups/", import.meta.url); mkdirSync(dir, { recursive: true });
writeFileSync(new URL(`${day}.enc.json`, dir), JSON.stringify(seal(JSON.stringify(sorted(data)), day)) + "\n");
console.log(`Copia cifrada guardada: backups/${day}.enc.json`);

const fdir = new URL("fotos/", dir); let nuevas = 0;
for (const gid of Object.keys(await shallow("fotos"))) {
  for (const pid of Object.keys(await shallow(`fotos/${gid}`))) {
    if (!/^p[a-z0-9]{6,30}$/.test(pid)) continue;
    const file = new URL(`${pid}.enc.json`, fdir); if (existsSync(file)) continue;
    const [meta, full] = await Promise.all([db(`fotos/${gid}/${pid}`), db(`fotosg/${pid}`)]);
    if (!meta) continue;
    mkdirSync(fdir, { recursive: true });
    writeFileSync(file, JSON.stringify(seal(JSON.stringify({ g: gid, meta, full }), pid)) + "\n"); nuevas++;
  }
}
if (nuevas) console.log(`Fotos nuevas copiadas: ${nuevas}`);
