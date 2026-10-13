import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useGame } from "../components/ui";
import { WishButton, farmLink } from "../components/farm";
import { bestSource, isVaulted, rarityOf, relicReward } from "../lib/farm";
import { useStore } from "../lib/store";

type Filter = "open" | "all" | "mine";

export default function Primes() {
  const { drops: d, collection } = useGame();
  const { state, setPart, setStatus } = useStore();
  const [params, setParams] = useSearchParams();
  const cur = params.get("set") ?? "Voruna Prime";
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("open");

  const progress = (s: string) => d.sets[s].parts.filter(p => state.parts[`${s} ${p}`]).length;

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return Object.keys(d.sets)
      .filter(s => !t || s.toLowerCase().includes(t))
      .filter(s => {
        const set = d.sets[s];
        if (filter === "open") return set.farmable === set.parts.length;
        if (filter === "mine") { const h = set.parts.filter(p => state.parts[`${s} ${p}`]).length; return h > 0 && h < set.parts.length; }
        return true;
      })
      .sort();
  }, [q, filter, d.sets, state.parts]);

  const set = d.sets[cur];
  const item = collection.find(c => c.name === cur);
  const have = set ? progress(cur) : 0;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Prime sets</h1><p className="lede">Tick the parts you own. Struck-through relics are vaulted; those parts come from trading or Prime Resurgence.</p></div>
      </div>
      <div className="split">
        <div className="pane sticky stack" style={{ gap: 10 }}>
          <input type="search" className="input" placeholder="Filter sets" aria-label="Filter sets" value={q} onChange={e => setQ(e.target.value)} />
          <div className="seg" role="group" aria-label="Show">
            {(["open", "mine", "all"] as Filter[]).map(f => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "open" ? "Farmable now" : f === "mine" ? "In progress" : "All"}</button>
            ))}
          </div>
          <div className="setlist">
            {list.length ? list.map(s => {
              const st = d.sets[s], h = progress(s);
              return (
                <button key={s} className="setbtn" aria-current={s === cur} onClick={() => setParams({ set: s })}>
                  <span className="row spread"><strong>{s}</strong>{st.farmable < st.parts.length && <span className="chip vault">{st.farmable ? "Part vaulted" : "Vaulted"}</span>}</span>
                  <span className="pips">{st.parts.map((_, i) => <span key={i} className={i < h ? "on" : ""} />)}</span>
                </button>
              );
            }) : <div className="empty">{filter === "mine" ? "No sets in progress. Tick a part you own to start one." : "No sets match."}</div>}
          </div>
        </div>
        <div className="pane">
          {!set ? <div className="empty">Pick a set.</div> : (
            <>
              <div className="row spread" style={{ marginBottom: 6 }}>
                <div>
                  <h2>{cur}</h2>
                  <div className="note">{have} of {set.parts.length} parts owned · <Link to={farmLink(cur)}>Drop chances</Link></div>
                </div>
                <div className="row">
                  {item && have === set.parts.length && !state.collection[item.id] && (
                    <button className="btn" onClick={() => setStatus(item.id, "owned")}>Mark {cur} owned</button>
                  )}
                  <WishButton name={cur} />
                </div>
              </div>
              {set.parts.map(p => {
                const full = `${cur} ${p}`;
                const id = "own-" + full.replace(/\W+/g, "-");
                const relics = [...(d.items[full]?.relics ?? [])].sort((a, b) => Number(isVaulted(d, a)) - Number(isVaulted(d, b)));
                return (
                  <div className="part" key={p}>
                    <input type="checkbox" className="check" id={id} checked={!!state.parts[full]} onChange={e => setPart(full, e.target.checked)} style={{ marginTop: 3 }} />
                    <div className="row spread"><label htmlFor={id}><b>{p}</b></label><span className="note">{bestSource(d, full).text}</span></div>
                    <div className="relics">
                      {relics.map(r => {
                        const rw = relicReward(d, r, full);
                        const rar = rw ? rarityOf(rw[1]).label : "";
                        return <Link key={r} className={`relic${isVaulted(d, r) ? " vaulted" : ""}`} to={farmLink(r + " Relic")} title={rar}>{r} · {rar[0]}</Link>;
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
