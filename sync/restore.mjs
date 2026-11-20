// Puts a saved copy back: node sync/restore.mjs 2026-11-17  (replaces the marathon, the Letterboxd diaries and the games)
import { readFileSync, existsSync } from "node:fs";
import { db } from "./common.mjs";
import { open } from "./crypt.mjs";

const day = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) throw new Error("Indica la fecha de la copia, por ejemplo 2026-11-17.");
const file = new URL(`../backups/${day}.enc.json`, import.meta.url);
if (!existsSync(file)) throw new Error(`No hay copia del ${day}.`);
const data = JSON.parse(open(JSON.parse(readFileSync(file, "utf8"))));
for (const k of ["maraton", "letterboxd", "juegos"]) if (k in data) await db(k, "PUT", data[k] ?? null);
console.log(`Restaurada la copia del ${day}.`);
