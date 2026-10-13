// Final Warframe stats for a build.
//
// Rules (wiki.warframe.com):
//  - Rank 30 adds flat Health, Shields and Energy to the rank-0 base (usually +100 / +100 / +50).
//  - Mod percentages add together and multiply the rank-30 base: final = base × (1 + Σ%).
//  - A mod's bonus scales linearly with rank: value at rank r = max × (r + 1) / (maxRank + 1).
//  - Archon Shard percentages (Crimson strength/duration, Amber casting speed) add to the mod sum.
//  - Azure shard values are flat and added after everything else.
//  - Ability Efficiency caps at 175%; Duration can't go below 12.5%, Range below 34%.
// Conditional effects (arcanes, "on kill", "when damaged", set bonuses) are left out.
import type { CollectionItem, Mod, ShardColor } from "./data";
import type { BuildData } from "./builds";

export type StatKey = "health" | "shield" | "armor" | "energy" | "strength" | "duration" | "range" | "efficiency" | "casting" | "sprint";

export const STAT_LABEL: Record<StatKey, string> = {
  health: "Health", shield: "Shields", armor: "Armor", energy: "Energy",
  strength: "Ability Strength", duration: "Ability Duration", range: "Ability Range", efficiency: "Ability Efficiency",
  casting: "Casting Speed", sprint: "Sprint Speed",
};

const LINE_TO_KEY: Record<string, StatKey> = {
  "health": "health", "max health": "health",
  "shield capacity": "shield", "shields": "shield",
  "armor": "armor",
  "energy max": "energy", "max energy": "energy", "energy": "energy",
  "ability strength": "strength", "ability duration": "duration", "ability range": "range", "ability efficiency": "efficiency",
  "casting speed": "casting", "sprint speed": "sprint",
};
const LINE = /^([+-]\d+(?:\.\d+)?)(%?)\s+([A-Za-z ]+?)$/;

export interface Effect { key: StatKey; value: number; flat: boolean }

/** Plain always-on stat lines in a mod or shard description, e.g. "+99% Ability Strength". */
export function parseEffects(text: string, scale = 1): Effect[] {
  const out: Effect[] = [];
  for (const raw of text.split("\n")) {
    const m = raw.trim().match(LINE);
    if (!m) continue;
    const key = LINE_TO_KEY[m[3].toLowerCase()];
    if (!key) continue;
    out.push({ key, value: parseFloat(m[1]) * scale, flat: m[2] !== "%" });
  }
  return out;
}

/** Mod bonus at a given rank, as a fraction of its max-rank value. */
export const rankScale = (rank: number, maxRank: number) => (maxRank > 0 ? (rank + 1) / (maxRank + 1) : 1);

// Rank-up gains for Health / Shields / Armor / Energy. Most frames get +100 / +100 / 0 / +50.
const RANK_UP: Record<string, [number, number, number, number]> = {
  Nidus: [100, 0, 100, 50],
  Hildryn: [100, 500, 0, 0],
  Lavos: [200, 100, 100, 0],
  Grendel: [200, 0, 0, 50],
  Inaros: [200, 0, 0, 50],
  Kullervo: [200, 0, 100, 50],
  Dante: [90, 90, 0, 70],
  Xaku: [90, 90, 0, 70],
  Narin: [100, 100, 0, 90],
  Nezha: [100, 50, 0, 50],
  Valkyr: [100, 50, 0, 50],
};
const NO_SHIELDS = new Set(["Inaros", "Kullervo", "Nidus"]);
const NO_ENERGY = new Set(["Hildryn", "Lavos"]);
export const frameBase = (name: string) => name.replace(/ (Prime|Umbra)$/, "");

export function rank30Base(item: CollectionItem) {
  const [h, s, a, e] = RANK_UP[frameBase(item.name)] ?? [100, 100, 0, 50];
  return {
    health: (item.health ?? 0) + h,
    shield: (item.shield ?? 0) + (item.shield ? s : 0),
    armor: (item.armor ?? 0) + a,
    energy: (item.energy ?? 0) + (item.energy ? e : 0),
    strength: 100, duration: 100, range: 100, efficiency: 100, casting: 100, sprint: 100,
  } satisfies Record<StatKey, number>;
}

export interface StatRow {
  key: StatKey;
  base: number;
  final: number;
  pct: boolean; // shown as a percentage
  capped?: string;
  sources: { name: string; text: string }[];
}

export interface WarframeStats {
  rows: StatRow[];
  damageReduction: number; // 0–1, from armor
  effectiveHealth: number; // health scaled by armor, plus shields
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function warframeStats(item: CollectionItem, data: BuildData, mods: Map<string, Mod>, shards: ShardColor[]): WarframeStats {
  const base = rank30Base(item);
  const pctSum: Record<StatKey, number> = { health: 0, shield: 0, armor: 0, energy: 0, strength: 0, duration: 0, range: 0, efficiency: 0, casting: 0, sprint: 0 };
  const flatMod: Record<StatKey, number> = { ...pctSum };
  const flatAfter: Record<StatKey, number> = { ...pctSum };
  const sources: Record<StatKey, { name: string; text: string }[]> = { health: [], shield: [], armor: [], energy: [], strength: [], duration: [], range: [], efficiency: [], casting: [], sprint: [] };

  for (const slot of [...data.slots, data.exilus]) {
    const mod = slot?.mod ? mods.get(slot.mod) : undefined;
    if (!mod || !slot) continue;
    for (const e of parseEffects(mod.stats, rankScale(slot.rank, mod.ranks))) {
      (e.flat ? flatMod : pctSum)[e.key] += e.value;
      sources[e.key].push({ name: mod.name, text: `${e.value > 0 ? "+" : ""}${fmt(e.value)}${e.flat ? "" : "%"}` });
    }
  }

  const frame = frameBase(item.name);
  for (const s of data.shards) {
    if (!s) continue;
    const stat = shards.find(c => c.color === s.color)?.stats.find(x => x.id === s.stat);
    if (!stat) continue;
    const text = s.tau ? stat.tau || stat.text : stat.text;
    for (const e of parseEffects(text)) {
      if (e.flat && e.key === "shield" && NO_SHIELDS.has(frame)) continue;
      if (e.flat && e.key === "energy" && NO_ENERGY.has(frame)) continue;
      (e.flat ? flatAfter : pctSum)[e.key] += e.value;
      sources[e.key].push({ name: `${s.tau ? "Tauforged " : ""}${s.color} shard`, text: `${e.value > 0 ? "+" : ""}${fmt(e.value)}${e.flat ? "" : "%"}` });
    }
  }

  const rows: StatRow[] = (Object.keys(STAT_LABEL) as StatKey[]).map(key => {
    const pct = ["strength", "duration", "range", "efficiency", "casting", "sprint"].includes(key);
    let final = pct ? base[key] + pctSum[key] : base[key] * (1 + pctSum[key] / 100) + flatMod[key] + flatAfter[key];
    let capped: string | undefined;
    if (key === "efficiency" && final > 175) { final = 175; capped = "Capped at 175%"; }
    if (key === "duration" && final < 12.5) { final = 12.5; capped = "Can't go below 12.5%"; }
    if (key === "range" && final < 34) { final = 34; capped = "Can't go below 34%"; }
    if (!pct) final = Math.max(0, Math.round(final));
    return { key, base: base[key], final: pct ? Math.round(final * 10) / 10 : final, pct, capped, sources: sources[key] };
  });

  const get = (k: StatKey) => rows.find(r => r.key === k)!.final;
  const armor = get("armor");
  const damageReduction = armor / (armor + 300);
  return { rows, damageReduction, effectiveHealth: Math.round(get("health") / (1 - damageReduction) + get("shield")) };
}
