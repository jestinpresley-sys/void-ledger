import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useGame } from "../components/ui";
import { DropTable, RelicTable, WishButton, farmLink } from "../components/farm";
import { REFINEMENTS, componentDrops, pct, rarityOf, setOfPart } from "../lib/farm";

type Kind = "Prime set" | "Prime part" | "Relic" | "Drop" | "Item";

export default function Farm() {
  const game = useGame();
  const d = game.drops;
  const [params, setParams] = useSearchParams();
  const current = params.get("item") ?? "Voruna Prime";
  const [q, setQ] = useState("");

  const index = useMemo(() => {
    const out: [string, Kind][] = [];
    const seen = new Set<string>();
    const add = (n: string, k: Kind) => { if (!seen.has(n)) { seen.add(n); out.push([n, k]); } };
    Object.keys(d.sets).forEach(n => add(n, "Prime set"));
    game.collection.forEach(c => add(c.name, "Item"));
    Object.entries(d.items).forEach(([n, v]) => add(n, v.relics ? "Prime part" : "Drop"));
    Object.keys(d.relics).forEach(n => add(n + " Relic", "Relic"));
    return out.sort((a, b) => a[0].localeCompare(b[0]));
  }, [d, game.collection]);

  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return index.filter(([n, k]) => k === "Prime set" && d.sets[n].farmable === d.sets[n].parts.length).slice(0, 60);
    const words = t.split(/\s+/);
    return index
      .filter(([n]) => { const l = n.toLowerCase(); return words.every(w => l.includes(w)); })
      .sort((a, b) => Number(!a[0].toLowerCase().startsWith(t)) - Number(!b[0].toLowerCase().startsWith(t)) || a[0].length - b[0].length)
      .slice(0, 60);
  }, [q, index, d.sets]);

  const pick = (n: string) => setParams({ item: n });

  return (
    <div className="split">
      <div className="pane sticky">
        <label className="label" htmlFor="q">Search items, mods, parts and relics</label>
        <input id="q" type="search" className="input" autoComplete="off" placeholder="Voruna Prime, Oxium, Primed Flow…" value={q} onChange={e => setQ(e.target.value)} style={{ marginTop: 6 }} />
        {!q && <p className="note" style={{ margin: "8px 0 0" }}>Prime sets you can farm right now:</p>}
        <ul className="results">
          {hits.length ? hits.map(([n, k]) => (
            <li key={n}><button aria-current={n === current} onClick={() => pick(n)}><span>{n}</span><span className="kind">{k}</span></button></li>
          )) : <li className="empty">No match. Try fewer words.</li>}
        </ul>
      </div>
      <div className="pane"><Detail name={current} /></div>
    </div>
  );
}

function Head({ name, sub }: { name: string; sub?: ReactNode }) {
  return (
    <div className="row spread" style={{ marginBottom: 16 }}>
      <div><h1>{name}</h1>{sub && <div className="note" style={{ marginTop: 4 }}>{sub}</div>}</div>
      <WishButton name={name} />
    </div>
  );
}

function Detail({ name }: { name: string }) {
  const game = useGame();
  const d = game.drops;

  if (d.sets[name]) {
    const s = d.sets[name];
    const status = s.farmable === s.parts.length ? <span className="chip open">Farmable now</span>
      : s.farmable ? <span className="chip vault">{s.parts.length - s.farmable} parts vaulted</span> : <span className="chip vault">Vaulted</span>;
    return (
      <>
        <Head name={name} sub={<>{s.parts.length} parts from relics · {status} · <Link to={`/primes?set=${encodeURIComponent(name)}`}>Track parts</Link></>} />
        {s.parts.map(p => (
          <section key={p} style={{ marginBottom: 18 }}>
            <h3>{p}</h3>
            <RelicTable item={`${name} ${p}`} relics={d.items[`${name} ${p}`]?.relics ?? []} />
          </section>
        ))}
      </>
    );
  }

  const relicKey = name.replace(/ Relic$/, "");
  if (name.endsWith(" Relic") && d.relics[relicKey]) {
    const r = d.relics[relicKey];
    return (
      <>
        <Head name={name} sub={r.vaulted ? <><span className="chip vault">Vaulted</span> No mission drops it right now.</> : <span className="chip open">Dropping now</span>} />
        <h3>Rewards</h3>
        <div className="tblwrap">
          <table>
            <thead><tr><th>Reward</th><th>Rarity</th>{REFINEMENTS.map(x => <th key={x} className="n">{x}</th>)}</tr></thead>
            <tbody>
              {[...r.rewards].sort((a, b) => a[1] - b[1]).map(x => {
                const rar = rarityOf(x[1]);
                return (
                  <tr key={x[0]}>
                    <td><Link to={farmLink(x[0])}>{x[0]}</Link></td>
                    <td><span className={`chip ${rar.cls}`}>{rar.label}</span></td>
                    {[1, 2, 3, 4].map(i => <td key={i} className="n">{pct(x[i] as number)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {r.drops.length > 0 && <><h3 style={{ marginTop: 20 }}>Where the relic drops</h3><DropTable drops={r.drops} /></>}
      </>
    );
  }

  const coll = game.collection.find(c => c.name === name);
  const it = d.items[name];
  if (coll && !it) {
    const parts = componentDrops(d, name);
    return (
      <>
        <Head name={name} sub={<>Mastery rank {coll.mr} to build{coll.wiki && <> · <a href={coll.wiki} target="_blank" rel="noreferrer">Wiki</a></>}</>} />
        {parts.length ? (
          <>
            <h3>Component drops</h3>
            <div className="tblwrap"><table>
              <thead><tr><th>Part</th><th>Best source</th><th className="n">Chance</th></tr></thead>
              <tbody>{parts.map(p => <tr key={p.part}><td><Link to={farmLink(`${name} ${p.part}`)}>{p.part}</Link></td><td>{p.best[0]}</td><td className="n">{pct(p.best[1])}</td></tr>)}</tbody>
            </table></div>
          </>
        ) : <p className="note">This isn't in the drop tables. It comes from the Market, a quest, a Dojo lab, a vendor or an event; check the wiki for the exact source.</p>}
      </>
    );
  }

  if (!it) return <div className="empty">Pick something from the list.</div>;
  const set = setOfPart(d, name);
  return (
    <>
      <Head name={name} sub={set ? <>Part of <Link to={farmLink(set)}>{set}</Link></> : undefined} />
      {it.relics && <><h3>From relics</h3><RelicTable item={name} relics={it.relics} /></>}
      {it.drops.length > 0 && <><h3 style={{ marginTop: it.relics ? 20 : 0 }}>Drop locations</h3><DropTable drops={it.drops} /></>}
    </>
  );
}
