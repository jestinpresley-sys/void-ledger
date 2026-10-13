import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Arcane, CollectionItem, Mod } from "./data";
import { arcanesFor, decodeBuild, encodeBuild, modsFor, newBuild } from "./builds";

const load = <T,>(f: string): T => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), "utf8"));
const items = load<CollectionItem[]>("collection.json");
const mods = load<Mod[]>("mods.json");
const arcanes = load<Arcane[]>("arcanes.json");
const item = (n: string) => items.find(i => i.name === n)!;
const names = (list: { name: string }[]) => list.map(m => m.name);

describe("modsFor", () => {
  it("gives a frame its general mods and its own augments, not other frames' augments", () => {
    const list = names(modsFor(item("Rhino Prime"), mods, "regular"));
    expect(list).toContain("Intensify");
    expect(list).toContain("Iron Shrapnel");
    expect(list).not.toContain("Pillage");
    expect(list).not.toContain("Steel Charge"); // aura
  });
  it("only lists aura mods for the aura slot", () => {
    const list = names(modsFor(item("Rhino"), mods, "aura"));
    expect(list).toContain("Steel Charge");
    expect(list).not.toContain("Intensify");
  });
  it("splits rifle and shotgun mods", () => {
    expect(names(modsFor(item("Soma Prime"), mods, "regular"))).toContain("Serration");
    expect(names(modsFor(item("Soma Prime"), mods, "regular"))).not.toContain("Point Blank");
    expect(names(modsFor(item("Hek"), mods, "regular"))).toContain("Point Blank");
  });
  it("restricts the exilus slot to exilus mods", () => {
    const list = modsFor(item("Rhino"), mods, "exilus");
    expect(list.length).toBeGreaterThan(0);
    expect(list.every(m => m.exilus)).toBe(true);
  });
});

describe("arcanesFor", () => {
  it("gives frames warframe arcanes", () => expect(names(arcanesFor(item("Rhino"), arcanes))).toContain("Arcane Energize"));
});

describe("newBuild", () => {
  it("places innate polarities and the aura polarity", () => {
    const b = newBuild(item("Rhino"));
    expect(b.slots).toHaveLength(8);
    expect(b.slots[0].polarity).toBe("vazarin");
    expect(b.bonus?.polarity).toBe("madurai");
    expect(b.arcanes).toHaveLength(2);
    expect(b.shards).toHaveLength(5);
  });
});

describe("share codes", () => {
  it("round-trips a build", () => {
    const data = newBuild(item("Rhino"));
    const code = encodeBuild(item("Rhino").id, "Tanky Rhino ✓", data);
    expect(decodeBuild(code)).toEqual({ itemId: item("Rhino").id, title: "Tanky Rhino ✓", data });
  });
  it("rejects junk", () => expect(decodeBuild("not-a-build")).toBeNull());
});
