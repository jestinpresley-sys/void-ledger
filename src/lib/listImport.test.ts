import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CollectionItem } from "./data";
import { matchList, splitList } from "./listImport";

const items: CollectionItem[] = JSON.parse(readFileSync(new URL("../../public/data/collection.json", import.meta.url), "utf8"));
const names = (l: { item: CollectionItem }[]) => l.map(x => x.item.name);

describe("splitList", () => {
  it("handles newlines, commas, bullets, counts and status words", () => {
    expect(splitList("1. Rhino Prime x2\n- Soma Prime (mastered), Kuva Bramma; • Gauss owned")).toEqual(
      ["Rhino Prime", "Soma Prime", "Kuva Bramma", "Gauss"],
    );
  });
});

describe("matchList", () => {
  it("matches names regardless of case and punctuation", () => {
    const r = matchList("rhino prime\nKUVA BRAMMA\nsoma-prime", items);
    expect(names(r.exact)).toEqual(["Rhino Prime", "Kuva Bramma", "Soma Prime"]);
    expect(r.unknown).toEqual([]);
  });
  it("offers close spellings separately", () => {
    const r = matchList("Rhino Prmie\nExcalibr", items);
    expect(names(r.close)).toEqual(["Rhino Prime", "Excalibur"]);
  });
  it("reports names it can't place", () => {
    expect(matchList("Definitely Not A Frame", items).unknown).toEqual(["Definitely Not A Frame"]);
  });
  it("ignores duplicates", () => {
    expect(matchList("Rhino\nrhino\nRHINO", items).exact).toHaveLength(1);
  });
});
