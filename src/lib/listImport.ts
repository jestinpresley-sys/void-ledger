// Match a pasted list of item names ("Rhino Prime, soma prime\nKuva Bramma x1") to collection items.
import type { CollectionItem } from "./data";

export const normName = (s: string) =>
  s.toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Splits pasted text into candidate names, dropping counts, ticks and status words people add. */
export function splitList(text: string): string[] {
  return text
    .split(/[\n,;\t•·|]+/)
    .map(s => s
      .replace(/^\s*[-*\d.)\]]+\s+/, "")                       // "1. ", "- ", "* "
      .replace(/\b(x\s*\d+|\d+\s*x)\b/gi, "")                   // "x2", "2x"
      .replace(/\((owned|mastered|done|have|built|lvl?\s*\d+|rank\s*\d+|r\d+)\)/gi, "")
      .replace(/\b(mastered|owned)\b\s*$/i, "")
      .trim())
    .filter(s => s.length >= 2);
}

/** Edit distance where swapping two neighbouring letters counts as one typo ("Prmie" → "Prime"). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

export interface ListMatch {
  exact: { input: string; item: CollectionItem }[];
  close: { input: string; item: CollectionItem }[]; // likely typos, shown for the player to confirm
  unknown: string[];
}

export function matchList(text: string, items: CollectionItem[]): ListMatch {
  const byName = new Map<string, CollectionItem>();
  for (const i of items) byName.set(normName(i.name), i);
  const seen = new Set<string>();
  const out: ListMatch = { exact: [], close: [], unknown: [] };

  for (const input of splitList(text)) {
    const n = normName(input);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    const hit = byName.get(n) ?? byName.get(n.replace(/ p$/, " prime")); // "Rhino P"
    if (hit) { if (!out.exact.some(e => e.item.id === hit.id)) out.exact.push({ input, item: hit }); continue; }
    // Close spelling: allow 1 typo per 6 characters, max 2, and only one best candidate.
    const max = Math.min(2, Math.floor(n.length / 6));
    let best: CollectionItem | null = null, bestD = max + 1, tie = false;
    if (max > 0) {
      for (const [k, item] of byName) {
        const d = editDistance(n, k, max);
        if (d < bestD) { best = item; bestD = d; tie = false; } else if (d === bestD && d <= max) tie = true;
      }
    }
    if (best && bestD <= max && !tie && !out.exact.some(e => e.item.id === best!.id)) out.close.push({ input, item: best });
    else out.unknown.push(input);
  }
  return out;
}
