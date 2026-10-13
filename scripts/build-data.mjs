// Builds the static game data the app ships with, into public/data/.
//
//   npm run data
//
// Sources
//   - Drop chances: WFCD's mirror of Digital Extremes' official PC drop tables
//     (https://github.com/WFCD/warframe-drop-data). Downloaded fresh each run;
//     if the download fails, the last downloaded copy in scripts/.cache is used.
//   - Items, mods, arcanes: the @wfcd/items npm package (bump its version to refresh).
//   - Archon shard stats: the warframe-worldstate-data npm package.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "public", "data");
const CACHE = path.join(ROOT, "scripts", ".cache");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const pkgDir = name => path.join(ROOT, "node_modules", name);
const itemsDir = path.join(pkgDir("@wfcd/items"), "data", "json");
const wf = name => JSON.parse(fs.readFileSync(path.join(itemsDir, name + ".json"), "utf8"));
const write = (name, data) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data));
  console.log(`  ${name.padEnd(16)} ${(fs.statSync(path.join(OUT, name)).size / 1024).toFixed(0)} KB`);
};

// ---------------------------------------------------------------- drop tables
const DROP_URL = "https://raw.githubusercontent.com/WFCD/warframe-drop-data/gh-pages/data/";
async function fetchCached(file) {
  const cached = path.join(CACHE, file);
  try {
    const res = await fetch(DROP_URL + file);
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    const text = await res.text();
    fs.writeFileSync(cached, text);
    return JSON.parse(text);
  } catch (err) {
    if (!fs.existsSync(cached)) throw new Error(`Could not download ${file} (${err.message}) and no cached copy exists.`);
    console.warn(`  ! Using cached ${file}: ${err.message}`);
    return JSON.parse(fs.readFileSync(cached, "utf8"));
  }
}

const rows = await fetchCached("all.slim.json");
const info = await fetchCached("info.json");

const clean = s => s.replace(/<\/?b>/g, "").trim();
const TIER = "(?:Lith|Meso|Neo|Axi|Requiem|Vanguard)";
const relicPlace = new RegExp(`^(${TIER} \\S+) Relic(?: \\((Exceptional|Flawless|Radiant)\\))?$`);
const relicItem = new RegExp(`^(${TIER} \\S+) Relic$`);
const REFINE = { Intact: 0, Exceptional: 1, Flawless: 2, Radiant: 3 };
const kindOf = p => {
  if (/Bounty|Isolation Vault|Arcana|Conservation|Plague Star/i.test(p)) return "bounty";
  if (/^[A-Z][\w' -]*\/.+\(/.test(p)) return "mission";
  if (/Rotation [ABC]$/.test(p)) return "special";
  return "enemy";
};

const relics = {}; // "Axi A21" -> { rewards: {item: [i,e,f,r]}, drops: [] }
const drops = {};  // item -> [[place, chance, kind]]
for (const r of rows) {
  const place = clean(r.place), item = clean(r.item), chance = parseFloat(r.chance);
  const pm = place.match(relicPlace);
  if (pm) {
    const rel = (relics[pm[1]] ??= { rewards: {}, drops: [] });
    (rel.rewards[item] ??= [0, 0, 0, 0])[REFINE[pm[2] ?? "Intact"]] = chance;
    continue;
  }
  const im = item.match(relicItem);
  if (im) { (relics[im[1]] ??= { rewards: {}, drops: [] }).drops.push([place, chance, kindOf(place)]); continue; }
  (drops[item] ??= []).push([place, chance, kindOf(place)]);
}

const topDrops = (list, n) => {
  const best = new Map();
  for (const x of list) { const p = best.get(x[0]); if (!p || p[1] < x[1]) best.set(x[0], x); }
  return [...best.values()].sort((a, b) => b[1] - a[1]).slice(0, n);
};

const relicsOut = {};
const partRelics = {};
for (const [name, rel] of Object.entries(relics)) {
  const rewards = Object.entries(rel.rewards).map(([item, odds]) => [item, ...odds]);
  relicsOut[name] = { vaulted: rel.drops.length === 0, rewards, drops: topDrops(rel.drops, 12) };
  for (const [item] of rewards) (partRelics[item] ??= []).push(name);
}

const PART_ORDER = ["Blueprint", "Neuroptics Blueprint", "Chassis Blueprint", "Systems Blueprint"];
const sets = {};
for (const item of Object.keys(partRelics)) {
  const m = item.match(/^(.+? Prime) (.+)$/);
  if (m) (sets[m[1]] ??= []).push(m[2]);
}
const setsOut = {};
for (const [set, parts] of Object.entries(sets)) {
  parts.sort((a, b) => (PART_ORDER.indexOf(a) + 1 || 9) - (PART_ORDER.indexOf(b) + 1 || 9) || a.localeCompare(b));
  const farmable = parts.filter(p => partRelics[`${set} ${p}`].some(r => !relicsOut[r].vaulted)).length;
  setsOut[set] = { parts, farmable };
}

const dropItems = {};
for (const [item, list] of Object.entries(drops)) dropItems[item] = { drops: topDrops(list, 12) };
for (const [item, rl] of Object.entries(partRelics)) (dropItems[item] ??= { drops: [] }).relics = rl;

write("drops.json", { updated: info.modified, items: dropItems, relics: relicsOut, sets: setsOut });

// ---------------------------------------------------------------- collection
const groups = [
  ["Warframes", x => x.type === "Warframe" && x.productCategory === "Suits", "warframe"],
  ["Warframes", x => x.type === "Necramech", "necramech"],
  ["Primary", x => true, "primary"],
  ["Secondary", x => true, "secondary"],
  ["Melee", x => x.type === "Melee", "melee"],
  ["Arch-Gun", x => true, "archgun"],
  ["Arch-Melee", x => true, "archmelee"],
  ["Archwing", x => true, "archwing"],
  ["Sentinels", x => true, "sentinel"],
  ["Pets", x => x.type === "Pets", "pet"],
  ["SentinelWeapons", x => true, "companionweapon"],
];
const collection = [];
for (const [file, keep, cat] of groups) {
  for (const x of wf(file)) {
    if (!keep(x) || x.masterable === false) continue;
    const e = {
      id: x.uniqueName, name: x.name, cat, type: x.type,
      mr: x.masteryReq ?? 0, rank: x.maxLevelCap ?? 30,
      img: x.imageName ?? null, prime: !!x.isPrime, vaulted: !!x.vaulted,
      released: x.releaseDate ?? null,
    };
    if (x.polarities?.length) e.pol = x.polarities;
    if (x.aura) e.aura = x.aura;
    if (x.stancePolarity) e.stance = x.stancePolarity;
    if (x.abilities) e.abilities = x.abilities.map(a => ({ name: a.name, desc: a.description, img: a.imageName }));
    if (cat === "warframe" || cat === "necramech") Object.assign(e, { health: x.health, shield: x.shield, armor: x.armor, energy: x.power });
    if (x.wikiaUrl) e.wiki = x.wikiaUrl.replace("warframe.fandom.com/wiki", "wiki.warframe.com/w");
    collection.push(e);
  }
}
collection.sort((a, b) => a.name.localeCompare(b.name));
write("collection.json", collection);

// ---------------------------------------------------------------- mods
const MOD_TYPES = new Set(["Warframe Mod", "Primary Mod", "Shotgun Mod", "Secondary Mod", "Melee Mod", "Stance Mod",
  "Companion Mod", "Archwing Mod", "Arch-Gun Mod", "Arch-Melee Mod", "Necramech Mod"]);
const lastStats = x => (x.levelStats?.at(-1)?.stats ?? []).join("\n")
  .replace(/\\n/g, "\n").replace(/<[A-Z_]+>/g, "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim()
  .split("\n").filter((l, i, all) => all.indexOf(l) === i).join("\n");
const mods = [];
const seenMods = new Set();
for (const m of wf("Mods")) {
  if (!MOD_TYPES.has(m.type) || m.baseDrain === undefined || /Riven|Flawed /.test(m.name)) continue;
  const key = m.name + "|" + m.compatName;
  if (seenMods.has(key)) continue; // a few mods are listed twice (beginner copies)
  seenMods.add(key);
  mods.push({
    id: m.uniqueName, name: m.name, type: m.type, compat: (m.compatName ?? "").trim(),
    pol: m.polarity ?? "", rarity: m.rarity ?? "Common", drain: m.baseDrain, ranks: m.fusionLimit ?? 0,
    exilus: !!m.isExilus, augment: !!m.isAugment, img: m.imageName ?? null, stats: lastStats(m),
  });
}
mods.sort((a, b) => a.name.localeCompare(b.name));
write("mods.json", mods);

// ---------------------------------------------------------------- arcanes
const ARC_TYPES = new Set(["Warframe Arcane", "Primary Arcane", "Shotgun Arcane", "Bow Arcane", "Secondary Arcane", "Melee Arcane"]);
const arcanes = wf("Arcanes")
  .filter(a => ARC_TYPES.has(a.type))
  .map(a => ({ name: a.name, type: a.type, rarity: a.rarity ?? "", ranks: Math.max(0, (a.levelStats?.length ?? 1) - 1), img: a.imageName ?? null, stats: lastStats(a) }))
  .sort((a, b) => a.name.localeCompare(b.name));
write("arcanes.json", arcanes);

// ---------------------------------------------------------------- archon shards
const shardFile = path.join(pkgDir("warframe-worldstate-data"), "dist", "data", "archonShards.json");
const shardsRaw = JSON.parse(fs.readFileSync(shardFile, "utf8"));
const fixText = s => s.replace(/Sheild/g, "Shield").replace(/Enery/g, "Energy").replace(/DmgCorrosiveSmall64 /g, "").replace(/\s+/g, " ").trim();
// The source lists Azure's health bonus as a percentage; in game it's flat (+150 / +225), like its other stats.
const shardText = (color, text) => {
  const t = fixText(text).replace(/^(\d)/, "+$1"); // a few lines are missing their "+"
  return color === "Azure" ? t.replace(/^\+(\d+(?:\.\d+)?)% Health$/, "+$1 Health") : t;
};
const shards = [];
for (const [key, v] of Object.entries(shardsRaw)) {
  if (key.endsWith("_MYTHIC")) continue;
  const tau = shardsRaw[key + "_MYTHIC"];
  shards.push({
    color: v.value,
    // tauforged stats are listed in the same order as the regular ones
    stats: Object.entries(v.upgradeTypes).map(([id, u], i) => ({
      id, text: shardText(v.value, u.value), tau: tau ? shardText(v.value, Object.values(tau.upgradeTypes)[i]?.value ?? "") : "",
    })),
  });
}
write("shards.json", shards);

console.log(`Done. Drop tables last changed ${new Date(info.modified).toISOString().slice(0, 10)}; ${collection.length} collection items, ${mods.length} mods, ${arcanes.length} arcanes.`);
