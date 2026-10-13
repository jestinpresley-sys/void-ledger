import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CollectionItem, Mod, ShardColor } from "./data";
import { newBuild } from "./builds";
import { parseEffects, rank30Base, rankScale, warframeStats } from "./stats";

const load = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), "utf8"));
const items = load<CollectionItem[]>("collection.json");
const modList = load<Mod[]>("mods.json");
const shards = load<ShardColor[]>("shards.json");
const mods = new Map(modList.map(m => [m.id, m]));
const item = (n: string) => items.find(i => i.name === n)!;
const mod = (n: string) => modList.find(m => m.name === n && m.type === "Warframe Mod")!;

describe("parseEffects", () => {
  it("reads plain stat lines and skips conditional ones", () => {
    expect(parseEffects("+99% Ability Strength\n-55% Ability Efficiency")).toEqual([
      { key: "strength", value: 99, flat: false },
      { key: "efficiency", value: -55, flat: false },
    ]);
    expect(parseEffects("When Damaged:\n+10% Resistance to that Damage Type for 20s.")).toEqual([]);
    expect(parseEffects("+150 Armor")).toEqual([{ key: "armor", value: 150, flat: true }]);
  });
  it("scales linearly with rank", () => {
    expect(rankScale(0, 10)).toBeCloseTo(1 / 11);
    expect(rankScale(10, 10)).toBe(1);
  });
});

describe("rank30Base", () => {
  it("matches the wiki's rank 30 Rhino (370 health, 555 shields, 150 energy)", () => {
    expect(rank30Base(item("Rhino"))).toMatchObject({ health: 370, shield: 555, armor: 240, energy: 150 });
  });
  it("gives Inaros no shields", () => expect(rank30Base(item("Inaros")).shield).toBe(0));
});

describe("warframeStats", () => {
  const rhino = item("Rhino");
  const build = () => {
    const b = newBuild(rhino);
    const put = (i: number, name: string) => { const m = mod(name); b.slots[i] = { ...b.slots[i], mod: m.id, rank: m.ranks }; };
    put(0, "Vitality");      // +100% health at max rank
    put(1, "Steel Fiber");   // +100% armor
    put(2, "Blind Rage");    // +99% strength, -55% efficiency
    put(3, "Intensify");     // +30% strength
    put(4, "Streamline");    // +30% efficiency
    put(5, "Fleeting Expertise"); // +60% efficiency, -60% duration
    return b;
  };
  const row = (s: ReturnType<typeof warframeStats>, k: string) => s.rows.find(r => r.key === k)!;

  it("applies max-rank mods to rank 30 base stats", () => {
    const s = warframeStats(rhino, build(), mods, shards);
    expect(row(s, "health").final).toBe(740);
    expect(row(s, "armor").final).toBe(480);
    expect(row(s, "strength").final).toBe(229);
    expect(row(s, "efficiency").final).toBe(135);
    expect(row(s, "duration").final).toBe(40);
  });
  it("adds Crimson strength to the sum and Azure armor flat at the end", () => {
    const b = build();
    const crimson = shards.find(c => c.color === "Crimson")!.stats.find(x => /Ability Strength/.test(x.text))!;
    const azure = shards.find(c => c.color === "Azure")!.stats.find(x => /Armor/.test(x.text))!;
    b.shards = [{ color: "Crimson", stat: crimson.id, tau: true }, { color: "Azure", stat: azure.id, tau: false }, null, null, null];
    const s = warframeStats(rhino, b, mods, shards);
    expect(row(s, "strength").final).toBe(244);
    expect(row(s, "armor").final).toBe(630);
    expect(s.damageReduction).toBeCloseTo(630 / 930);
  });
  it("uses lower values at lower ranks", () => {
    const b = build();
    b.slots[0].rank = 0; // Vitality R0 = +100% × 1/11
    expect(row(warframeStats(rhino, b, mods, shards), "health").final).toBe(404);
  });
});
