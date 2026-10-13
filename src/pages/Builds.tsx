import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Art, useGame } from "../components/ui";
import { CATEGORY_LABEL } from "../lib/data";
import { canBuild, type Build } from "../lib/builds";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";

export default function Builds() {
  const { collection } = useGame();
  const { state, ready } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [pickQ, setPickQ] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [community, setCommunity] = useState<(Build & { author?: string })[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    (async () => {
      const { data } = await sb.from("builds").select("*").eq("is_public", true).order("updated_at", { ascending: false }).limit(30);
      const rows = (data ?? []) as Build[];
      const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[];
      const { data: profiles } = ids.length ? await sb.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
      const names = new Map((profiles ?? []).map(p => [p.id, p.display_name]));
      setCommunity(rows.map(r => ({ ...r, author: names.get(r.user_id!) ?? undefined })));
    })();
  }, []);

  const mine = useMemo(() => {
    const t = q.trim().toLowerCase();
    return state.builds.filter(b => !t || b.title.toLowerCase().includes(t) || b.item_name.toLowerCase().includes(t));
  }, [state.builds, q]);

  const candidates = useMemo(() => {
    const t = pickQ.trim().toLowerCase();
    if (!t) return [];
    return collection.filter(i => canBuild(i) && i.name.toLowerCase().includes(t) && (!ownedOnly || state.collection[i.id]))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(t)) - Number(!b.name.toLowerCase().startsWith(t)) || a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [pickQ, collection, ownedOnly, state.collection]);

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Builds</h1><p className="lede">Mod loadouts with real capacity math: polarities, Forma, aura and stance bonuses, arcanes, Archon Shards and Helminth.</p></div></div>

      <div className="pane stack" style={{ gap: 10 }}>
        <div className="row spread">
          <label className="label" htmlFor="pick">Start a new build</label>
          <label className="row note" style={{ gap: 6 }}><input type="checkbox" className="check" checked={ownedOnly} onChange={e => setOwnedOnly(e.target.checked)} /> Only items I own</label>
        </div>
        <input id="pick" type="search" className="input" placeholder="Search a Warframe, weapon, companion or vehicle" value={pickQ} onChange={e => setPickQ(e.target.value)} />
        {pickQ && (candidates.length ? (
          <ul className="results" style={{ marginTop: 0 }}>
            {candidates.map(i => (
              <li key={i.id}><button onClick={() => navigate(`/builds/new?item=${encodeURIComponent(i.id)}`)}><span>{i.name}</span><span className="kind">{CATEGORY_LABEL[i.cat]}</span></button></li>
            ))}
          </ul>
        ) : <p className="note">{ownedOnly && Object.keys(state.collection).length === 0 ? "You haven't marked anything as owned yet. Untick “Only items I own” or mark items in your collection." : "No buildable item matches."}</p>)}
      </div>

      <div className="row spread">
        <h2>My builds</h2>
        {state.builds.length > 3 && <input type="search" className="input" style={{ width: 240 }} placeholder="Filter my builds" aria-label="Filter my builds" value={q} onChange={e => setQ(e.target.value)} />}
      </div>
      {!ready ? <div className="loading">Loading builds…</div> : mine.length ? (
        <div className="cards">{mine.map(b => <BuildCard key={b.id} b={b} />)}</div>
      ) : <div className="pane empty">{state.builds.length ? "No builds match." : "No builds yet. Search an item above to make your first one."}</div>}

      {supabase && (
        <>
          <h2 style={{ marginTop: 12 }}>Recently shared</h2>
          {community === null ? <div className="loading">Loading…</div> : community.length ? (
            <div className="cards">{community.map(b => <BuildCard key={b.id} b={b} author={b.author ?? "A Tenno"} />)}</div>
          ) : <div className="pane empty">No public builds yet. Mark one of yours as public to share it here.</div>}
        </>
      )}
    </div>
  );
}

function BuildCard({ b, author }: { b: Build; author?: string }) {
  const { byId } = useGame();
  const item = byId.get(b.item_id);
  return (
    <Link className="card" to={`/builds/${b.id}`}>
      <Art img={item?.img ?? null} name={b.item_name} />
      <div className="t">{b.title}</div>
      <div className="note">{b.item_name} · {CATEGORY_LABEL[b.item_cat] ?? b.item_cat}</div>
      <div className="note">{author ? `by ${author} · ` : ""}{new Date(b.updated_at).toLocaleDateString()}{b.is_public && !author ? " · Public" : ""}</div>
    </Link>
  );
}
