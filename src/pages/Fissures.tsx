import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useGame } from "../components/ui";
import { farmLink } from "../components/farm";
import { isVaulted, pct, relicReward, runsFor90, REFINEMENTS, type Refinement } from "../lib/farm";
import { timeLeft, useFissures, useNow } from "../lib/fissures";
import { useStore } from "../lib/store";

const TIERS = ["Lith", "Meso", "Neo", "Axi", "Requiem", "Omnia"] as const;
type Mode = "normal" | "steel" | "storm";

export default function Fissures() {
  const { drops: d } = useGame();
  const { state } = useStore();
  const { fissures, error, fetchedAt } = useFissures();
  const now = useNow();
  const [mode, setMode] = useState<Mode>("normal");
  const [squad, setSquad] = useState(4);
  const [refine, setRefine] = useState<Refinement>(3);

  // Prime parts still needed from the wishlist
  const needed = useMemo(() => {
    const parts = new Set<string>();
    for (const w of state.wishlist) {
      if (w.done) continue;
      if (d.sets[w.name]) d.sets[w.name].parts.forEach(p => { const f = `${w.name} ${p}`; if (!state.parts[f]) parts.add(f); });
      else if (d.items[w.name]?.relics && !state.parts[w.name]) parts.add(w.name);
    }
    return [...parts];
  }, [state.wishlist, state.parts, d]);

  const plan = useMemo(() => {
    const relics: Record<string, { part: string; p: number }[]> = {};
    const stuck: string[] = [];
    for (const part of needed) {
      const open = (d.items[part]?.relics ?? []).filter(r => !isVaulted(d, r));
      if (!open.length) { stuck.push(part); continue; }
      for (const r of open) (relics[r] ??= []).push({ part, p: (relicReward(d, r, part)![refine + 1] as number) / 100 });
    }
    const rows = Object.entries(relics).map(([r, list]) => ({
      r, list, tier: r.split(" ")[0],
      pAny: 1 - list.reduce((acc, x) => acc * Math.pow(1 - x.p, squad), 1),
      src: d.relics[r].drops[0],
    })).sort((a, b) => b.pAny - a.pAny);
    const tiers = new Set(rows.map(x => x.tier));
    return { rows, stuck, tiers };
  }, [needed, d, squad, refine]);

  const live = (fissures ?? [])
    .filter(f => (mode === "storm" ? f.isStorm : mode === "steel" ? f.isHard && !f.isStorm : !f.isHard && !f.isStorm))
    .sort((a, b) => TIERS.indexOf(a.tier as typeof TIERS[number]) - TIERS.indexOf(b.tier as typeof TIERS[number]) || a.expiry.localeCompare(b.expiry));
  const wanted = (tier: string) => plan.tiers.has(tier) || (tier === "Omnia" && plan.tiers.size > 0);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Void Fissures</h1><p className="lede">Live fissures, with the tiers you need for your wishlist highlighted.</p></div>
        <div className="seg" role="group" aria-label="Fissure type">
          {(["normal", "steel", "storm"] as Mode[]).map(m => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === "normal" ? "Normal" : m === "steel" ? "Steel Path" : "Void Storms"}</button>)}
        </div>
      </div>

      <div className="tiers">
        {TIERS.slice(0, 5).map(t => {
          const n = plan.rows.filter(x => x.tier === t).length;
          const open = live.filter(f => f.tier === t).length;
          return (
            <div key={t} className={`tier${n ? " need" : ""}`}>
              <div className="row spread"><b>{t}</b><span className="n">{n}</span></div>
              <div className="note">{n ? `relic${n === 1 ? "" : "s"} to crack` : "nothing needed"} · {fissures ? `${open} open` : "…"}</div>
            </div>
          );
        })}
      </div>

      <div className="pane">
        <div className="row spread" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Open now</h3>
          <span className="note">{error ? `Couldn't load live fissures: ${error}.` : fetchedAt ? `Updated ${fetchedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, refreshes every minute` : "Loading…"}</span>
        </div>
        {fissures && (live.length ? (
          <div className="tblwrap"><table>
            <thead><tr><th>Tier</th><th>Mission</th><th>Node</th><th>Faction</th><th className="n">Ends in</th></tr></thead>
            <tbody>{live.map(f => (
              <tr key={f.id} className={wanted(f.tier) ? "hit" : ""}>
                <td><b>{f.tier}</b> {wanted(f.tier) && <span className="chip live">Needed</span>}</td>
                <td>{f.missionType}</td><td>{f.node}</td><td>{f.enemy}</td>
                <td className="n">{timeLeft(f.expiry, now)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty">No fissures of this type are open right now.</div>)}
      </div>

      <div className="pane">
        <div className="row spread" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Relics to crack</h3>
          <div className="row note">
            <label htmlFor="squad">Squad</label>
            <select id="squad" className="input" style={{ width: "auto" }} value={squad} onChange={e => setSquad(+e.target.value)}>
              <option value={1}>Solo</option><option value={4}>4 (radshare)</option>
            </select>
            <label htmlFor="refine">Refinement</label>
            <select id="refine" className="input" style={{ width: "auto" }} value={refine} onChange={e => setRefine(+e.target.value as Refinement)}>
              {REFINEMENTS.map((r, i) => <option key={r} value={i}>{r}</option>)}
            </select>
          </div>
        </div>
        {!needed.length && !plan.stuck.length ? (
          <div className="empty">Add a Prime set or part to your <Link to="/wishlist">wishlist</Link> and the relics you need show up here.</div>
        ) : (
          <>
            {plan.rows.length > 0 && (
              <div className="tblwrap"><table>
                <thead><tr><th>Relic</th><th>Parts you need from it</th><th className="n" title="Chance at least one needed part drops per run">Per run</th><th className="n">Runs for 90%</th><th>Farm the relic</th></tr></thead>
                <tbody>{plan.rows.map(x => (
                  <tr key={x.r}>
                    <td><Link className="relic" to={farmLink(x.r + " Relic")}>{x.r}</Link></td>
                    <td>{x.list.map(l => <div key={l.part}>{l.part} <span className="note">{pct(l.p * 100)}</span></div>)}</td>
                    <td className="n">{pct(x.pAny * 100)}</td>
                    <td className="n">{runsFor90(x.pAny)}</td>
                    <td className="note">{x.src ? x.src[0] : "—"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            <p className="note">Per-run odds assume everyone in the squad opens the same relic at the chosen refinement.</p>
            {plan.stuck.length > 0 && <p className="note"><b>Vaulted, no relic you can farm:</b> {plan.stuck.join(", ")}</p>}
          </>
        )}
      </div>
    </div>
  );
}
