// Farming math and lookups over the drop tables.
import type { DropsData, RelicReward } from "./data";

export const pct = (n: number) => (n >= 10 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toPrecision(2)) + "%";

/** Runs (or kills/opens) for a 90% chance of at least one drop, given per-run probability p (0–1). */
export const runsFor90 = (p: number) => (p >= 1 ? 1 : p <= 0 ? Infinity : Math.ceil(Math.log(0.1) / Math.log(1 - p)));

export const REFINEMENTS = ["Intact", "Exceptional", "Flawless", "Radiant"] as const;
export type Refinement = 0 | 1 | 2 | 3;

export function rarityOf(intact: number): { label: "Common" | "Uncommon" | "Rare"; cls: "c" | "u" | "r" } {
  if (intact >= 20) return { label: "Common", cls: "c" };
  if (intact >= 8) return { label: "Uncommon", cls: "u" };
  return { label: "Rare", cls: "r" };
}

export const relicReward = (d: DropsData, relic: string, item: string): RelicReward | undefined =>
  d.relics[relic]?.rewards.find(r => r[0] === item);
export const isVaulted = (d: DropsData, relic: string) => !d.relics[relic] || d.relics[relic].vaulted;
export const setOfPart = (d: DropsData, part: string) => {
  const m = part.match(/^(.+? Prime) (.+)$/);
  return m && d.sets[m[1]] ? m[1] : null;
};

export interface Source { text: string; vaulted?: boolean }

/** One line saying where to get something, for lists. */
export function bestSource(d: DropsData, name: string, ownedParts: Record<string, true> = {}): Source {
  const it = d.items[name];
  if (it?.relics) {
    const open = it.relics.filter(r => !isVaulted(d, r));
    if (!open.length) return { text: "Vaulted. Trade for it or wait for Prime Resurgence.", vaulted: true };
    const best = open.map(r => [r, relicReward(d, r, name)![4]] as const).sort((a, b) => b[1] - a[1])[0];
    return { text: `${best[0]} relic, ${pct(best[1])} at Radiant` };
  }
  if (it?.drops.length) return { text: `${it.drops[0][0]}, ${pct(it.drops[0][1])}` };
  const relicKey = name.replace(/ Relic$/, "");
  if (d.relics[relicKey]) {
    const r = d.relics[relicKey];
    return r.drops.length ? { text: `${r.drops[0][0]}, ${pct(r.drops[0][1])}` } : { text: "Vaulted relic", vaulted: true };
  }
  if (d.sets[name]) {
    const s = d.sets[name];
    const have = s.parts.filter(p => ownedParts[`${name} ${p}`]).length;
    const vaultNote = s.farmable === 0 ? ", vaulted" : s.farmable < s.parts.length ? ", some parts vaulted" : "";
    return { text: `${have} of ${s.parts.length} parts owned${vaultNote}`, vaulted: s.farmable === 0 };
  }
  return { text: "Not in the drop tables (market, quest, Dojo or vendor)" };
}

/** Component drops for a non-Prime item, e.g. "Rhino" → Rhino Neuroptics Blueprint from Venus/Fossa. */
export function componentDrops(d: DropsData, itemName: string) {
  const prefix = itemName + " ";
  return Object.entries(d.items)
    .filter(([n, v]) => n.startsWith(prefix) && /(Blueprint|Neuroptics|Chassis|Systems|Barrel|Receiver|Stock|Blade|Handle|Hilt|Link|Grip|String|Head|Harness|Wings|Engine|Carapace|Cerebrum)/.test(n.slice(prefix.length)) && v.drops.length)
    .map(([n, v]) => ({ part: n.slice(prefix.length), best: v.drops[0] }));
}
