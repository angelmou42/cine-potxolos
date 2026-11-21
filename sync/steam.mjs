// Games added "as they are" (not found on Wikipedia/Wikidata) get their cover and sheet from Steam.
// The page cannot ask Steam itself (Steam does not allow it from other websites), so this runs from GitHub every 5 minutes.
// Only fills what is missing; a game not found on Steam is tried again a day later.
import { db } from "./common.mjs";

const DAY = 864e5, now = Date.now();
const simple = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const api = (m, input) => fetch(`https://api.steampowered.com/${m}/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`)
  .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)));
const ctx = { language: "spanish", country_code: "ES" };

async function find(name) {
  const r = await api("IStoreQueryService/SearchSuggestions", { search_term: name, max_results: 8, context: ctx, data_request: {} });
  const items = (r.response?.store_items || []).filter(x => x.type === 0 && x.visible !== false), want = simple(name);
  const hit = items.find(x => simple(x.name) === want)
    || (items.length === 1 && want.length >= 4 && (simple(items[0].name).startsWith(want) || want.startsWith(simple(items[0].name))) ? items[0] : null);
  return hit ? hit.appid || hit.id : null;
}
async function sheet(appid) {
  const r = await api("IStoreBrowseService/GetItems", { ids: [{ appid }], context: ctx, data_request: { include_assets: true, include_release: true, include_platforms: true, include_basic_info: true } });
  const it = r.response?.store_items?.[0] || {}, a = it.assets || {};
  const url = f => f && a.asset_url_format ? "https://shared.akamai.steamstatic.com/store_item_assets/" + a.asset_url_format.replace("${FILENAME}", f) : "";
  const out = { stm: `https://store.steampowered.com/app/${appid}/` };
  const cover = url(a.library_capsule_2x || a.library_capsule || a.hero_capsule_2x || a.hero_capsule), wide = url(a.header || a.main_capsule);
  if (cover) out.img = cover; if (wide) out.img2 = wide;
  const t = it.release?.steam_release_date || it.release?.original_release_date; if (t) out.y = new Date(t * 1000).getUTCFullYear();
  const p = it.platforms || {}; const plat = [p.windows && "Windows", p.mac && "macOS", p.steamos_linux && "Linux"].filter(Boolean); if (plat.length) out.plat = plat.join(", ");
  const devs = (it.basic_info?.developers || []).map(d => d.name).filter(Boolean); if (devs.length) out.dev = devs.slice(0, 2).join(", ");
  const sd = it.basic_info?.short_description; if (sd) out.ex = sd.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 600);
  try { // genres in Spanish only come from the older store endpoint
    const d = (await (await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=spanish&cc=ES&filters=genres`)).json())?.[appid]?.data;
    const gen = (d?.genres || []).map(g => g.description).filter(g => g && !/^(indie|casual|early access|acceso anticipado)$/i.test(g)).slice(0, 3);
    if (gen.length) out.gen = gen.join(", ").toLowerCase();
  } catch (e) {}
  return out;
}

const games = (await db("juegos")) || {};
const todo = Object.entries(games).filter(([, g]) => g && g.n && !g.img && !g.img2 && !g.sid && !(g.sx && now - g.sx < DAY)).slice(0, 6);
for (const [id, g] of todo) {
  try {
    const appid = await find(g.n);
    if (!appid) { await db(`juegos/${id}/sx`, "PUT", now); console.log(`${g.n}: no está en Steam (se reintenta mañana)`); continue; }
    const s = await sheet(appid), patch = { sid: appid, sx: now };
    for (const [k, v] of Object.entries(s)) if (v && !g[k]) patch[k] = v; // never overwrite what you wrote
    await db(`juegos/${id}`, "PATCH", patch);
    console.log(`${g.n}: ficha de Steam (${appid}): ${Object.keys(patch).join(", ")}`);
  } catch (e) { console.log(`${g.n}: Steam no responde ahora (${e.message})`); }
}
if (!todo.length) console.log("Steam: nada que rellenar.");
