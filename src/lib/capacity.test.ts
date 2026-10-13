import { describe, expect, it } from "vitest";
import { bonusCapacity, computeCapacity, formaCount, modDrain, normPolarity } from "./capacity";

// Serration: madurai, base drain 4, max rank 10 → 14 drain unpolarized.
const serration = { drain: 4, pol: "madurai" as const };
// Steel Charge: madurai aura, drain -4, max rank 5 → +9 capacity unpolarized.
const steelCharge = { drain: -4, pol: "madurai" as const };

describe("modDrain", () => {
  it("costs base + rank in an unpolarized slot", () => expect(modDrain(serration, 10, "")).toBe(14));
  it("halves and rounds up in a matching slot", () => {
    expect(modDrain(serration, 10, "madurai")).toBe(7);
    expect(modDrain(serration, 9, "madurai")).toBe(7); // 13 / 2 = 6.5 → 7
  });
  it("adds 25% and rounds up in a mismatched slot", () => expect(modDrain(serration, 10, "vazarin")).toBe(18)); // 17.5 → 18
  it("treats a universal slot as matching", () => expect(modDrain(serration, 10, "universal")).toBe(7));
});

describe("bonusCapacity", () => {
  it("gives drain-as-bonus unpolarized", () => expect(bonusCapacity(steelCharge, 5, "")).toBe(9));
  it("doubles when matched", () => expect(bonusCapacity(steelCharge, 5, "madurai")).toBe(18));
  it("drops 20% when mismatched", () => expect(bonusCapacity(steelCharge, 5, "naramon")).toBe(7)); // 7.2 → 7
});

describe("computeCapacity", () => {
  const mods = new Map([["serration", serration], ["steel", steelCharge]]);
  it("adds aura bonus and sums slot drains", () => {
    const r = computeCapacity({
      itemRank: 30, boosted: true, mods,
      bonusSlot: { mod: "steel", rank: 5, polarity: "madurai" },
      slots: [{ mod: "serration", rank: 10, polarity: "madurai" }, { mod: null, rank: 0, polarity: "" }],
    });
    expect(r).toMatchObject({ base: 60, bonus: 18, total: 78, used: 7, free: 71, perSlot: [7, 0] });
  });
  it("uses rank 40 for rank-40 items", () => {
    expect(computeCapacity({ itemRank: 40, boosted: true, mods, slots: [] }).total).toBe(80);
  });
});

describe("helpers", () => {
  it("cleans odd polarity strings", () => {
    expect(normPolarity("aura,vazarin")).toBe("vazarin");
    expect(normPolarity("aura")).toBe("");
  });
  it("counts forma for changed slots only", () => {
    expect(formaCount(["madurai", "", ""], ["madurai", "vazarin", ""])).toBe(1);
    expect(formaCount(["madurai"], ["naramon"])).toBe(1);
  });
});
