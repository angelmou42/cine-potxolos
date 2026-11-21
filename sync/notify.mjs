// Push notices: when one of you rates or reviews something (here or on Letterboxd), the other one's phones get a notice.
// Runs every few minutes from GitHub Actions. It compares what is saved now with what it saw last time (node "pushstate").
import webpush from "web-push";
import { D, norm, match, db, shallow } from "./common.mjs";

const PUBLIC = "BEvoesQgdGfv6Ytj8XEfaJYDEIw-lgr0Ju2ODa0rp4U9-uV1yF0MPuQ8P77ZoGEBSj8oAc_FxNXKGhoy3rjcRlI";
if (!process.env.VAPID_PRIVATE) { console.log("Falta el secreto VAPID_PRIVATE: no se mandan avisos."); process.exit(0); }
webpush.setVapidDetails("https://angelmou42.github.io/cine-potxolos/", PUBLIC, process.env.VAPID_PRIVATE);

const WHO = ["a", "b"];
const [state, diary, subs, prev, games] = await Promise.all([db("maraton"), db("letterboxd"), db("push"), db("pushstate"), db("juegos")]);
if (!state) throw new Error("El maratón ha llegado vacío: no se compara nada esta vez.");
const S = state, items = S.items || {};
const names = [(S.a || "").trim() || "Angel", (S.b || "").trim() || "Andrea"];
const at = (x, w) => (x == null ? undefined : x[w]);           // Firebase gives [a,b] or {"1":b}
const hash = s => { let h = 5381; for (const c of String(s)) h = (h * 33 + c.codePointAt(0)) >>> 0; return h.toString(36); };

// What is saved now, per person
const now = { r: { a: {}, b: {} }, rv: { a: {}, b: {} }, lb: { a: {}, b: {} }, gr: { a: {}, b: {} }, grv: { a: {}, b: {} }, gpend: { a: {}, b: {} } };
for (const [id, it] of Object.entries(items)) WHO.forEach((k, w) => {
  const r = +at(it.r, w) || 0, rv = at(it.rv, w) || "";
  if (r) now.r[k][id] = r;
  if (rv.trim()) now.rv[k][id] = hash(rv);
});
WHO.forEach((k, w) => { for (const [key, e] of Object.entries(at(diary, w) || {})) if (!match(e.t, e.y)) now.lb[k][key] = 1; });

const stars = r => "★".repeat(Math.floor(r)) + (r % 1 ? "½" : "");
const num = r => String(r).replace(".", ",");
const clip = (t, n = 110) => { t = t.replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const dn = d => Date.parse(d + "T12:00:00Z") / 864e5;

// Games: ratings count at once; a review only once it has stopped changing for a run (it is typed in the web)
const G = games || {};
const gNotices = { a: [], b: [] };
for (const [id, g] of Object.entries(G)) WHO.forEach((k, w) => {
  const r = +at(g.r, w) || 0, text = at(g.rv, w) || "", h = text.trim() ? hash(text) : "";
  const P = { r: prev?.gr?.[k]?.[id], rv: prev?.grv?.[k]?.[id], pend: prev?.gpend?.[k]?.[id] };
  if (r) now.gr[k][id] = r;
  let newRv = false;
  if (h && h !== P.rv) { if (h === P.pend || !prev) { now.grv[k][id] = h; newRv = !P.rv && !!prev; } else { now.gpend[k][id] = h; if (P.rv) now.grv[k][id] = P.rv; } }
  else if (h) now.grv[k][id] = h;
  if (!prev) return;
  const newR = r && r !== P.r;
  if (!newR && !newRv) return;
  const who = names[w], n = g.n || "un juego";
  const title = newR ? (P.r ? `${who} ha cambiado su nota de ${n}` : `${who} ha puntuado ${n}`) : `${who} ha escrito una reseña de ${n}`;
  const head = r ? `${stars(r)}  ${num(r)} de 5${newR && P.r ? ` (antes ${num(P.r)})` : ""}` : "";
  gNotices[k].push({ title, body: [head, newRv ? `«${clip(text)}»` : ""].filter(Boolean).join("\n") || "Juegos terminados", short: `${n}${r ? ` ${num(r)} ★` : ""}`, url: "./#juegos", tag: `game-${id}` });
});

// Photos in the game albums: only the keys are read (cheap); "who" is read just for new ones.
// A photo uploaded from a phone that has not said who it is (no notices set up) goes to both.
const toAll = [];
now.ph = {}; now.phOn = 1;
for (const gid of Object.keys(await shallow("fotos"))) {
  const pids = Object.keys(await shallow(`fotos/${gid}`)); if (!pids.length) continue;
  now.ph[gid] = Object.fromEntries(pids.map(p => [p, 1]));
  if (!prev?.phOn) continue; // first run with photos: just remember them
  const fresh = pids.filter(p => !prev.ph?.[gid]?.[p]); if (!fresh.length) continue;
  const by = { 0: 0, 1: 0, x: 0 };
  for (const p of fresh) { const w = await db(`fotos/${gid}/${p}/w`); by[w === 0 || w === 1 ? w : "x"]++; }
  const n = G[gid]?.n || "un juego";
  WHO.forEach((k, w) => { if (by[w]) gNotices[k].push({ title: `${names[w]} ha subido ${by[w] === 1 ? "una foto" : `${by[w]} fotos`} de ${n}`, body: "Están en el álbum del juego.", short: `${by[w]} 📷 ${n}`, url: "./#juegos", tag: `fotos-${gid}` }); });
  if (by.x) toAll.push({ title: `${by.x === 1 ? "Una foto nueva" : `${by.x} fotos nuevas`} de ${n}`, body: "Están en el álbum del juego.", url: "./#juegos", tag: `fotos-${gid}` });
}

// Year in review: on 31 December from 20:00 (Madrid time), one notice to every phone; if that run was missed, during January.
const P = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" })
  .formatToParts(new Date()).map(p => [p.type, +p.value]));
const wrapY = P.month === 12 && P.day === 31 && P.hour >= 20 ? P.year : P.month === 1 ? P.year - 1 : 0;
now.wrap = prev?.wrap || 0;
if (wrapY && now.wrap < wrapY) {
  now.wrap = wrapY;
  if (prev) toAll.push({ title: `Ya está vuestro ${wrapY} en el videoclub 🎬`, body: "Horas juntos, lo mejor del año y en qué no estáis de acuerdo.", url: `./#resumen-${wrapY}`, tag: `resumen-${wrapY}` });
}

// Build the notices each person causes (they go to the OTHER person's phones)
const notices = { a: [], b: [] };
if (prev) WHO.forEach((k, w) => {
  const P = { r: prev.r?.[k] || {}, rv: prev.rv?.[k] || {}, lb: prev.lb?.[k] || {} }, who = names[w];
  const ids = new Set([...Object.keys(now.r[k]), ...Object.keys(now.rv[k])]);
  for (const id of ids) {
    const d = D.find(x => x.id === id); if (!d) continue;
    const r = now.r[k][id], newR = r && r !== P.r[id], newRv = now.rv[k][id] && now.rv[k][id] !== P.rv[id];
    if (!newR && !newRv) continue;
    const text = at(items[id].rv, w) || "";
    const title = newR ? (P.r[id] ? `${who} ha cambiado su nota de ${d.es}` : `${who} ha puntuado ${d.es}`) : `${who} ha escrito una reseña de ${d.es}`;
    const head = r ? `${stars(r)}  ${num(r)} de 5${newR && P.r[id] ? ` (antes ${num(P.r[id])})` : ""}` : "";
    const body = [head, newRv && text ? `«${clip(text)}»` : ""].filter(Boolean).join("\n");
    notices[k].push({ title, body, short: `${d.es}${r ? ` ${num(r)} ★` : ""}`, url: "./", tag: `ucm-${id}` });
  }
  const other = at(diary, 1 - w) || {};
  for (const key of Object.keys(now.lb[k])) {
    if (P.lb[key]) continue;
    const e = at(diary, w)[key], slug = key.replace(/_\d{4}-\d{2}-\d{2}$/, "");
    const both = Object.entries(other).some(([k2, e2]) => k2.startsWith(slug + "_") && Math.abs(dn(e2.d) - dn(e.d)) <= 1);
    const lines = [e.r ? `${stars(e.r)}  ${num(e.r)} de 5` : "", e.rv ? `«${clip(e.rv)}»` : "", both ? "La habéis visto juntos: ya está en Vistas juntos." : ""];
    notices[k].push({ title: `${who} ha visto ${e.t} (${e.y})`, body: lines.filter(Boolean).join("\n") || "Lo ha registrado en Letterboxd.",
      short: `${e.t}${e.r ? ` ${num(e.r)} ★` : ""}`, url: both ? "./#juntos" : "./", tag: `lb-${norm(e.t).replace(/ /g, "-")}` });
  }
});

WHO.forEach(k => notices[k].push(...gNotices[k]));
let sent = 0, dropped = 0;
async function send(k, id, sub, msg) {
  if (process.env.DEBUG) console.log(`→ ${k}:`, JSON.stringify(msg));
  try {
    if (process.env.PUSH_DRY) { // local test: encrypt for real, but do not deliver
      if (sub.endpoint.includes("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(msg)); sent++; return true;
    }
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(msg), { TTL: 86400, urgency: "normal" }); sent++; return true; }
  catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { await db(`push/${k}/${id}`, "DELETE"); dropped++; return false; }
    else console.error(`Aviso a ${k}/${id}: ${e.statusCode || ""} ${e.body || e.message}`);
    return true;
  }
}
for (const [w, k] of WHO.entries()) {
  const mine = Object.entries(subs?.[k] || {}), from = notices[WHO[1 - w]];
  let msgs = from;
  if (from.length > 3) msgs = [{ title: `${names[1 - w]} ha puntuado ${from.length} cosas`, body: from.map(n => n.short).slice(0, 6).join(" · ") + (from.length > 6 ? "…" : ""), url: "./", tag: "varios" }];
  msgs = [...msgs, ...toAll];
  for (const [id, sub] of mine) {
    if (sub.test) {
      if (!await send(k, id, sub, { title: "Avisos activados 🎬", body: `Así te llegará cuando ${names[1 - w]} puntúe o reseñe algo.`, url: "./", tag: "prueba" })) continue;
      await db(`push/${k}/${id}/test`, "DELETE");
    }
    for (const m of msgs) if (!await send(k, id, sub, m)) break;
  }
}
await db("pushstate", "PUT", now);
console.log(prev ? `Avisos: ${notices.a.length} de ${names[0]}, ${notices.b.length} de ${names[1]}; ${sent} enviados, ${dropped} móviles dados de baja.`
  : `Primera vez: guardado el punto de partida, ${sent} avisos de prueba enviados.`);
