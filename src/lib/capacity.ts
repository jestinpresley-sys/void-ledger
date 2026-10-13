// Mod capacity rules (wiki.warframe.com/w/Polarity):
//  - A mod's drain at rank r is baseDrain + r.
//  - Matching slot polarity halves drain, rounding up. Mismatched raises it 25%, rounding up.
//  - Aura and stance mods have negative drain and *add* capacity. A matching slot doubles that
//    bonus; a mismatched slot cuts it by 20%.
//  - Item capacity equals its rank, doubled by an Orokin Reactor or Catalyst.
import type { Mod, Polarity } from "./data";

export const POLARITIES: Exclude<Polarity, "" | "any">[] = ["madurai", "vazarin", "naramon", "zenurik", "unairu", "penjaga", "umbra", "universal"];

/** Normalises the odd polarity strings in the item data ("aura", "aura,vazarin") to a real polarity or "". */
export function normPolarity(p: string | undefined | null): Polarity {
  if (!p) return "";
  const parts = p.split(",").map(s => s.trim()).filter(s => (POLARITIES as string[]).includes(s));
  return (parts.at(-1) as Polarity) ?? "";
}

export type Match = "match" | "mismatch" | "none";

export function polarityMatch(slot: Polarity, mod: Polarity): Match {
  const s = normPolarity(slot), m = normPolarity(mod);
  if (!s) return "none";
  if (s === "universal") return m === "umbra" ? "mismatch" : "match"; // any-polarity slot
  if (s === "umbra") return m === "umbra" ? "match" : "mismatch";
  if (!m) return "mismatch";
  return s === m ? "match" : "mismatch";
}

/** Capacity a regular mod costs in a slot. */
export function modDrain(mod: Pick<Mod, "drain" | "pol">, rank: number, slot: Polarity): number {
  const base = mod.drain + rank;
  switch (polarityMatch(slot, mod.pol)) {
    case "match": return Math.ceil(base / 2);
    case "mismatch": return Math.ceil(base * 1.25);
    default: return base;
  }
}

/** Capacity an aura or stance mod adds in its slot (a positive number). */
export function bonusCapacity(mod: Pick<Mod, "drain" | "pol">, rank: number, slot: Polarity): number {
  const base = -(mod.drain - rank); // drain is negative and grows more negative with rank
  switch (polarityMatch(slot, mod.pol)) {
    case "match": return base * 2;
    case "mismatch": return Math.round(base * 0.8);
    default: return base;
  }
}

export interface SlotState { mod: string | null; rank: number; polarity: Polarity }

export interface CapacityResult {
  base: number;
  bonus: number;
  total: number;
  used: number;
  free: number;
  perSlot: number[]; // drain per regular slot (exilus included at the end), 0 when empty
}

export function computeCapacity(opts: {
  itemRank: number;
  boosted: boolean; // Orokin Reactor / Catalyst
  bonusSlot?: SlotState | null; // aura or stance
  slots: SlotState[]; // regular + exilus
  mods: Map<string, Pick<Mod, "drain" | "pol">>;
}): CapacityResult {
  const base = opts.itemRank * (opts.boosted ? 2 : 1);
  const b = opts.bonusSlot;
  const bonusMod = b?.mod ? opts.mods.get(b.mod) : undefined;
  const bonus = b && bonusMod ? bonusCapacity(bonusMod, b.rank, b.polarity) : 0;
  const perSlot = opts.slots.map(s => {
    const m = s.mod ? opts.mods.get(s.mod) : undefined;
    return m ? modDrain(m, s.rank, s.polarity) : 0;
  });
  const used = perSlot.reduce((a, n) => a + n, 0);
  const total = base + bonus;
  return { base, bonus, total, used, free: total - used, perSlot };
}

/** How many Forma a build needs: every slot whose polarity differs from the item's innate one. */
export function formaCount(innate: Polarity[], chosen: Polarity[]): number {
  let n = 0;
  chosen.forEach((p, i) => { if (normPolarity(p) && normPolarity(p) !== normPolarity(innate[i] ?? "")) n++; });
  return n;
}
