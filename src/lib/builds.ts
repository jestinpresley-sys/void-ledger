// What a build looks like, and which mods/arcanes fit which item.
import type { Arcane, Category, CollectionItem, Mod, Polarity } from "./data";
import { normPolarity, type SlotState } from "./capacity";

export interface BuildData {
  version: 1;
  boosted: boolean;               // Orokin Reactor / Catalyst installed
  bonus: SlotState | null;        // aura (frames) or stance (melee); null when the item has none
  slots: SlotState[];             // regular slots
  exilus: SlotState | null;       // null when the item has no exilus slot
  arcanes: (string | null)[];
  shards: ({ color: string; stat: string; tau: boolean } | null)[];
  helminth: { frame: string; ability: string; replaces: string } | null;
}

export interface Build {
  id: string;
  item_id: string;
  item_name: string;
  item_cat: Category;
  title: string;
  notes: string;
  data: BuildData;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  user_id?: string;
}

interface Layout { slots: number; bonus: "aura" | "stance" | null; exilus: boolean; arcanes: number; shards: number; helminth: boolean }

export const LAYOUT: Partial<Record<Category, Layout>> = {
  warframe: { slots: 8, bonus: "aura", exilus: true, arcanes: 2, shards: 5, helminth: true },
  primary: { slots: 8, bonus: null, exilus: true, arcanes: 1, shards: 0, helminth: false },
  secondary: { slots: 8, bonus: null, exilus: true, arcanes: 1, shards: 0, helminth: false },
  melee: { slots: 8, bonus: "stance", exilus: true, arcanes: 1, shards: 0, helminth: false },
  necramech: { slots: 12, bonus: null, exilus: false, arcanes: 0, shards: 0, helminth: false },
  archwing: { slots: 8, bonus: null, exilus: false, arcanes: 0, shards: 0, helminth: false },
  archgun: { slots: 8, bonus: null, exilus: false, arcanes: 0, shards: 0, helminth: false },
  archmelee: { slots: 8, bonus: null, exilus: false, arcanes: 0, shards: 0, helminth: false },
  sentinel: { slots: 10, bonus: null, exilus: false, arcanes: 0, shards: 0, helminth: false },
  pet: { slots: 10, bonus: null, exilus: false, arcanes: 0, shards: 0, helminth: false },
};

export const canBuild = (item: CollectionItem) => !!LAYOUT[item.cat];

const empty = (polarity: Polarity = ""): SlotState => ({ mod: null, rank: 0, polarity });

export function newBuild(item: CollectionItem): BuildData {
  const l = LAYOUT[item.cat]!;
  const innate = (item.pol ?? []).map(normPolarity);
  return {
    version: 1,
    boosted: true,
    bonus: l.bonus === "aura" ? empty(normPolarity(item.aura)) : l.bonus === "stance" ? empty(normPolarity(item.stance)) : null,
    slots: Array.from({ length: l.slots }, (_, i) => empty(innate[i] ?? "")),
    exilus: l.exilus ? empty() : null,
    arcanes: Array(l.arcanes).fill(null),
    shards: Array(l.shards).fill(null),
    helminth: null,
  };
}

/** Item names with the variant prefix/suffix stripped, so "Kuva Bramma" matches mods for "Bramma". */
const baseNames = (item: CollectionItem) => {
  const n = item.name;
  const stripped = n.replace(/^(Kuva|Tenet|Coda|Prisma|Dex|Mk1-|Rakta|Sancti|Secura|Synoid|Telos|Vaykor|Mara|Carmine)\s?/, "")
    .replace(/\s(Prime|Vandal|Wraith|Umbra)$/, "");
  return new Set([n, stripped]);
};

const GENERIC: Partial<Record<Category, { types: string[]; compat: string[] }>> = {
  warframe: { types: ["Warframe Mod"], compat: ["WARFRAME"] },
  necramech: { types: ["Necramech Mod"], compat: ["NECRAMECH", "Necramech", ""] },
  secondary: { types: ["Secondary Mod"], compat: ["Pistol", "Pistol (No Aoe)", "SECONDARY", ""] },
  melee: { types: ["Melee Mod"], compat: ["Melee", "MELEE", ""] },
  archwing: { types: ["Archwing Mod"], compat: ["Archwing", "ARCHWING", ""] },
  archgun: { types: ["Arch-Gun Mod"], compat: ["Archgun", "Arch-Gun", ""] },
  archmelee: { types: ["Arch-Melee Mod"], compat: ["Archmelee", "Arch-Melee", ""] },
  sentinel: { types: ["Companion Mod"], compat: ["COMPANION", "Sentinel", "ROBOTIC", ""] },
  pet: { types: ["Companion Mod"], compat: ["COMPANION", "BEAST", ""] },
};

function primaryRule(item: CollectionItem) {
  if (item.type === "Shotgun") return { types: ["Shotgun Mod"], compat: ["Shotgun", "SHOTGUN", ""] };
  const compat = ["Rifle", "PRIMARY", ""];
  if (item.type !== "Launcher") compat.push("Rifle (No Aoe)");
  if (item.type === "Sniper") compat.push("Sniper");
  if (item.type === "Bow") compat.push("Bow");
  return { types: ["Primary Mod"], compat };
}

/** Mods that can go in this item's regular slots (and exilus, if flagged). */
export function modsFor(item: CollectionItem, mods: Mod[], slot: "regular" | "exilus" | "aura" | "stance"): Mod[] {
  if (slot === "aura") return mods.filter(m => m.type === "Warframe Mod" && m.compat === "AURA");
  if (slot === "stance") return mods.filter(m => m.type === "Stance Mod");
  const rule = item.cat === "primary" ? primaryRule(item) : GENERIC[item.cat];
  if (!rule) return [];
  const names = baseNames(item);
  // Companion mods aimed at one family ("Kavat", "Hound", "Moa"…) only fit that family.
  const fits = (m: Mod) => rule.compat.includes(m.compat) || names.has(m.compat) || item.name.includes(m.compat) && m.compat.length > 2;
  return mods.filter(m => rule.types.includes(m.type) && m.compat !== "AURA" && fits(m) && (slot === "regular" || m.exilus));
}

export function arcanesFor(item: CollectionItem, arcanes: Arcane[]): Arcane[] {
  const types: Partial<Record<Category, string[]>> = {
    warframe: ["Warframe Arcane"],
    primary: item.type === "Shotgun" ? ["Primary Arcane", "Shotgun Arcane"] : item.type === "Bow" ? ["Primary Arcane", "Bow Arcane"] : ["Primary Arcane"],
    secondary: ["Secondary Arcane"],
    melee: ["Melee Arcane"],
  };
  const t = types[item.cat] ?? [];
  return arcanes.filter(a => t.includes(a.type));
}

/** The same mod can't be equipped twice; also blocks two mods that share a name family like Serration/Amalgam Serration. */
export function equippedNames(b: BuildData, mods: Map<string, Mod>): Set<string> {
  const names = new Set<string>();
  for (const s of [b.bonus, ...b.slots, b.exilus]) {
    const m = s?.mod ? mods.get(s.mod) : undefined;
    if (m) names.add(familyOf(m.name));
  }
  return names;
}
export const familyOf = (name: string) => name.replace(/^(Primed|Amalgam|Archon|Galvanized|Umbral|Sacrificial|Spectral|Flawed) /, "");

/** Short code for sharing a build without an account. */
export function encodeBuild(itemId: string, title: string, data: BuildData): string {
  const json = JSON.stringify({ i: itemId, t: title, d: data });
  return btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeBuild(code: string): { itemId: string; title: string; data: BuildData } | null {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    if (obj?.d?.version !== 1 || typeof obj.i !== "string") return null;
    return { itemId: obj.i, title: String(obj.t ?? ""), data: obj.d };
  } catch {
    return null;
  }
}
