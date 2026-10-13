import { Link } from "react-router-dom";
import type { Drop, DropKind } from "../lib/data";
import { isVaulted, pct, rarityOf, relicReward, runsFor90 } from "../lib/farm";
import { useGame, useToast } from "./ui";
import { useStore } from "../lib/store";

export const farmLink = (name: string) => `/farm?item=${encodeURIComponent(name)}`;

const KIND_LABEL: Record<DropKind, string> = { mission: "Mission", bounty: "Bounty", enemy: "Enemy / container", special: "Event / quest" };

export function DropTable({ drops }: { drops: Drop[] }) {
  if (!drops.length) return null;
  const max = Math.max(...drops.map(d => d[1]));
  return (
    <>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Where</th><th>Type</th><th className="n">Chance</th><th className="n" title="Runs, kills or opens for a 90% chance of at least one">Runs for 90%</th></tr></thead>
          <tbody>
            {drops.map(([place, chance, kind]) => (
              <tr key={place}>
                <td>{place}<div className="bar"><i style={{ width: `${(chance / max) * 100}%` }} /></div></td>
                <td><span className="chip">{KIND_LABEL[kind] ?? kind}</span></td>
                <td className="n">{pct(chance)}</td>
                <td className="n">{runsFor90(chance / 100).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Mission chances are per reward rotation. Enemy and container chances are per kill or open.</p>
    </>
  );
}

export function RelicTable({ item, relics }: { item: string; relics: string[] }) {
  const { drops: d } = useGame();
  const rows = relics
    .map(r => ({ r, rw: relicReward(d, r, item)!, v: isVaulted(d, r) }))
    .filter(x => x.rw)
    .sort((a, b) => Number(a.v) - Number(b.v) || b.rw[4] - a.rw[4]);
  return (
    <div className="tblwrap">
      <table>
        <thead><tr><th>Relic</th><th>Rarity</th><th className="n">Intact</th><th className="n">Radiant</th><th>Best place to farm the relic</th></tr></thead>
        <tbody>
          {rows.map(({ r, rw, v }) => {
            const rar = rarityOf(rw[1]);
            const src = d.relics[r]?.drops[0];
            return (
              <tr key={r} className={v ? "dim" : ""}>
                <td><Link className={`relic${v ? " vaulted" : ""}`} to={farmLink(r + " Relic")}>{r}</Link> {v && <span className="chip vault">Vaulted</span>}</td>
                <td><span className={`chip ${rar.cls}`}>{rar.label}</span></td>
                <td className="n">{pct(rw[1])}</td>
                <td className="n">{pct(rw[4])}</td>
                <td className="note">{src ? `${src[0]}, ${pct(src[1])}` : "Not in any drop table"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function WishButton({ name }: { name: string }) {
  const { state, addWish } = useStore();
  const toast = useToast();
  const on = state.wishlist.some(w => w.name === name);
  return (
    <button className={`btn ${on ? "quiet" : "solid"}`} disabled={on} onClick={() => { if (addWish(name)) toast(`Added ${name} to your wishlist`); }}>
      {on ? "On wishlist" : "Add to wishlist"}
    </button>
  );
}
