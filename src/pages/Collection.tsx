import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Art, useGame, useToast } from "../components/ui";
import { farmLink } from "../components/farm";
import { CATEGORY_LABEL, masteryPoints, type Category, type CollectionItem } from "../lib/data";
import { canBuild } from "../lib/builds";
import { useStore, type Status } from "../lib/store";
import QuickSetup from "../components/QuickSetup";

const GROUPS: { key: string; label: string; cats: Category[] }[] = [
  { key: "warframe", label: "Warframes", cats: ["warframe"] },
  { key: "primary", label: "Primary", cats: ["primary"] },
  { key: "secondary", label: "Secondary", cats: ["secondary"] },
  { key: "melee", label: "Melee", cats: ["melee"] },
  { key: "companions", label: "Companions", cats: ["sentinel", "pet", "companionweapon"] },
  { key: "vehicles", label: "Vehicles", cats: ["archwing", "archgun", "archmelee", "necramech"] },
];
type Show = "all" | "missing" | "owned" | "mastered";
type Sort = "name" | "mr" | "new";

export default function Collection() {
  const { collection } = useGame();
  const { state, setStatus, setStatuses, ready } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const group = GROUPS.find(g => g.key === params.get("type")) ?? GROUPS[0];
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [primeOnly, setPrimeOnly] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<Status | "clear" | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  // Open Quick setup once for players who haven't marked anything; it stays open until they close it.
  const emptyOnLoad = ready && Object.keys(state.collection).length === 0;
  useEffect(() => { if (emptyOnLoad) setSetupOpen(true); }, [emptyOnLoad]);

  const statusOf = (i: CollectionItem) => state.collection[i.id];

  // Mastery summary across everything
  const summary = useMemo(() => {
    let mastered = 0, owned = 0, xp = 0, totalXp = 0;
    for (const i of collection) {
      const s = state.collection[i.id];
      const pts = masteryPoints(i);
      totalXp += pts;
      if (s === "mastered") { mastered++; xp += pts; }
      if (s) owned++;
    }
    return { mastered, owned, total: collection.length, xp, totalXp };
  }, [collection, state.collection]);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = collection.filter(i => group.cats.includes(i.cat)
      && (!t || i.name.toLowerCase().includes(t))
      && (!primeOnly || i.prime)
      && (show === "all" || (show === "missing" ? !state.collection[i.id] : show === "owned" ? !!state.collection[i.id] : state.collection[i.id] === "mastered")));
    return list.sort((a, b) => sort === "mr" ? a.mr - b.mr || a.name.localeCompare(b.name)
      : sort === "new" ? (b.released ?? "").localeCompare(a.released ?? "") || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name));
  }, [collection, group, q, primeOnly, show, sort, state.collection]);

  const groupStats = (g: typeof GROUPS[number]) => {
    const all = collection.filter(i => g.cats.includes(i.cat));
    return { have: all.filter(i => state.collection[i.id]).length, total: all.length };
  };

  function applyBulk() {
    if (!confirmBulk) return;
    setStatuses(items.map(i => i.id), confirmBulk === "clear" ? null : confirmBulk);
    toast(`Updated ${items.length} items`);
    setConfirmBulk(null);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Collection</h1><p className="lede">Mark what you own and what you've mastered. Missing items link to where they drop.</p></div>
        {!setupOpen && <button className="btn" onClick={() => setSetupOpen(true)}>Quick setup</button>}
      </div>

      {setupOpen && <QuickSetup onClose={() => setSetupOpen(false)} />}

      <div className="meters">
        <div className="meter"><div className="label">Owned</div><div className="big">{summary.owned}<span className="note"> / {summary.total}</span></div><div className="bar gold"><i style={{ width: `${(summary.owned / summary.total) * 100}%` }} /></div></div>
        <div className="meter"><div className="label">Mastered</div><div className="big">{summary.mastered}<span className="note"> / {summary.total}</span></div><div className="bar gold"><i style={{ width: `${(summary.mastered / summary.total) * 100}%` }} /></div></div>
        <div className="meter"><div className="label">Mastery from items</div><div className="big">{summary.xp.toLocaleString()}</div><div className="note">of {summary.totalXp.toLocaleString()} available</div></div>
      </div>

      <div className="seg" role="tablist" aria-label="Item type">
        {GROUPS.map(g => { const s = groupStats(g); return (
          <button key={g.key} role="tab" aria-pressed={g.key === group.key} aria-selected={g.key === group.key} onClick={() => setParams({ type: g.key })}>
            {g.label} <span className="note">{s.have}/{s.total}</span>
          </button>
        ); })}
      </div>

      <div className="row">
        <input type="search" className="input" style={{ flex: "1 1 220px", width: "auto" }} placeholder={`Search ${group.label.toLowerCase()}`} aria-label="Search" value={q} onChange={e => setQ(e.target.value)} />
        <div className="seg" role="group" aria-label="Show">
          {(["all", "missing", "owned", "mastered"] as Show[]).map(s => <button key={s} aria-pressed={show === s} onClick={() => setShow(s)}>{s}</button>)}
        </div>
        <select className="input" style={{ width: "auto" }} aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as Sort)}>
          <option value="name">A–Z</option><option value="mr">Mastery rank</option><option value="new">Newest</option>
        </select>
        <label className="row note" style={{ gap: 6 }}><input type="checkbox" className="check" checked={primeOnly} onChange={e => setPrimeOnly(e.target.checked)} /> Primes only</label>
      </div>

      <div className="row spread">
        <span className="note">{items.length} shown</span>
        {confirmBulk ? (
          <span className="row">
            <span className="note">{confirmBulk === "clear" ? "Clear" : `Mark ${confirmBulk}`} all {items.length} shown items?</span>
            <button className="btn small solid" onClick={applyBulk}>Yes, update {items.length}</button>
            <button className="btn small quiet" onClick={() => setConfirmBulk(null)}>Cancel</button>
          </span>
        ) : items.length > 0 && (
          <span className="row">
            <span className="note">All shown:</span>
            <button className="btn small quiet" onClick={() => setConfirmBulk("owned")}>Owned</button>
            <button className="btn small quiet" onClick={() => setConfirmBulk("mastered")}>Mastered</button>
            <button className="btn small quiet" onClick={() => setConfirmBulk("clear")}>Clear</button>
          </span>
        )}
      </div>

      {!ready ? <div className="loading">Loading your collection…</div> : items.length ? (
        <div className="tiles">
          {items.map(i => {
            const s = statusOf(i);
            return (
              <div key={i.id} className={`tile ${s ?? "missing"}`}>
                <Art img={i.img} name={i.name} />
                <div className="nm">{i.name}</div>
                <div className="meta">
                  <span className="note">{group.cats.length > 1 ? CATEGORY_LABEL[i.cat] : `MR ${i.mr}`}</span>
                  {i.prime && <span className={`chip ${i.vaulted ? "vault" : "gold"}`}>{i.vaulted ? "Vaulted" : "Prime"}</span>}
                </div>
                <div className="state" role="group" aria-label={`${i.name} status`}>
                  <button aria-pressed={!s} onClick={() => setStatus(i.id, null)}>Need</button>
                  <button aria-pressed={s === "owned"} onClick={() => setStatus(i.id, "owned")}>Own</button>
                  <button aria-pressed={s === "mastered"} onClick={() => setStatus(i.id, "mastered")}>Mastered</button>
                </div>
                <div className="row" style={{ gap: 6, fontSize: ".82rem" }}>
                  {!s && <Link to={farmLink(i.name)}>Where to get</Link>}
                  {s && canBuild(i) && <Link to={`/builds/new?item=${encodeURIComponent(i.id)}`}>New build</Link>}
                </div>
              </div>
            );
          })}
        </div>
      ) : <div className="empty">Nothing matches these filters.</div>}
    </div>
  );
}
