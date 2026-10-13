import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Art, POLARITY_NAME, Pol, SHARD_COLORS, useGame, useToast } from "../components/ui";
import { CATEGORY_LABEL, type CollectionItem, type Mod } from "../lib/data";
import { POLARITIES, computeCapacity, formaCount, modDrain, bonusCapacity, normPolarity, polarityMatch, type SlotState } from "../lib/capacity";
import { LAYOUT, arcanesFor, decodeBuild, encodeBuild, equippedNames, familyOf, modsFor, newBuild, type Build, type BuildData } from "../lib/builds";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";

type Sel =
  | { kind: "bonus" } | { kind: "slot"; i: number } | { kind: "exilus" }
  | { kind: "arcane"; i: number } | { kind: "shard"; i: number } | { kind: "helminth" };

interface Loaded { item: CollectionItem; data: BuildData; title: string; notes: string; isPublic: boolean; id?: string; mine: boolean; author?: string }

export default function BuildEditor() {
  const game = useGame();
  const store = useStore();
  const { id, code } = useParams();
  const [params] = useSearchParams();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Work out which build we're looking at.
  useEffect(() => {
    setProblem(null);
    if (code) {
      const dec = decodeBuild(code);
      const item = dec && game.byId.get(dec.itemId);
      if (!dec || !item) { setProblem("This share link is broken or for an item that no longer exists."); return; }
      setLoaded({ item, data: dec.data, title: dec.title || `${item.name} build`, notes: "", isPublic: false, mine: false });
      return;
    }
    if (id) {
      const own = store.state.builds.find(b => b.id === id);
      if (own) { setLoaded(fromBuild(own, true)); return; }
      if (!store.ready) return;
      if (!supabase) { setProblem("That build isn't in this browser."); return; }
      supabase.from("builds").select("*").eq("id", id).maybeSingle().then(async ({ data, error }) => {
        if (error || !data) { setProblem("That build doesn't exist, or it's private."); return; }
        const b = data as Build;
        const { data: prof } = await supabase!.from("profiles").select("display_name").eq("id", b.user_id).maybeSingle();
        setLoaded({ ...fromBuild(b, b.user_id === store.session?.user.id), author: prof?.display_name ?? undefined });
      });
      return;
    }
    const item = game.byId.get(params.get("item") ?? "");
    if (!item || !LAYOUT[item.cat]) { setProblem("Pick an item to build from the Builds page."); return; }
    setLoaded({ item, data: newBuild(item), title: `${item.name} build`, notes: "", isPublic: false, mine: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, code, params, store.ready]);

  function fromBuild(b: Build, mine: boolean): Loaded {
    const item = game.byId.get(b.item_id);
    if (!item) throw new Error("Unknown item");
    return { item, data: b.data, title: b.title, notes: b.notes, isPublic: b.is_public, id: b.id, mine };
  }

  if (problem) return <div className="pane empty">{problem} <Link to="/builds">Back to builds</Link></div>;
  if (!loaded) return <div className="loading">Loading build…</div>;
  return <Editor key={loaded.id ?? code ?? loaded.item.id} initial={loaded} />;
}

function Editor({ initial }: { initial: Loaded }) {
  const game = useGame();
  const { saveBuild, deleteBuild, session, accountsEnabled } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const item = initial.item;
  const layout = LAYOUT[item.cat]!;
  const [data, setData] = useState<BuildData>(initial.data);
  const [title, setTitle] = useState(initial.title);
  const [notes, setNotes] = useState(initial.notes);
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [buildId, setBuildId] = useState(initial.id);
  const [sel, setSel] = useState<Sel>({ kind: layout.bonus ? "bonus" : "slot", i: 0 } as Sel);
  const [dirty, setDirty] = useState(!initial.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editable = initial.mine;
  const pickerRef = useRef<HTMLDivElement>(null);
  const firstSel = useRef(true);
  // On narrow screens the picker sits below the slots; bring it into view when a slot is chosen.
  useEffect(() => {
    if (firstSel.current) { firstSel.current = false; return; }
    if (window.matchMedia("(max-width: 900px)").matches) pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sel]);

  const edit = (fn: (d: BuildData) => BuildData) => { if (!editable) return; setData(d => fn(structuredClone(d))); setDirty(true); };

  const cap = computeCapacity({
    itemRank: item.rank, boosted: data.boosted, bonusSlot: data.bonus,
    slots: [...data.slots, ...(data.exilus ? [data.exilus] : [])], mods: game.modsById,
  });
  const innate = [...(item.pol ?? []).map(normPolarity)];
  const forma = formaCount(innate, data.slots.map(s => s.polarity))
    + (data.bonus && normPolarity(data.bonus.polarity) !== normPolarity(layout.bonus === "aura" ? item.aura : item.stance) ? 1 : 0)
    + (data.exilus && data.exilus.polarity ? 1 : 0);

  const slotOf = (s: Sel): SlotState | null =>
    s.kind === "bonus" ? data.bonus : s.kind === "exilus" ? data.exilus : s.kind === "slot" ? data.slots[s.i] : null;
  const setSlot = (s: Sel, fn: (x: SlotState) => SlotState) => edit(d => {
    if (s.kind === "bonus" && d.bonus) d.bonus = fn(d.bonus);
    else if (s.kind === "exilus" && d.exilus) d.exilus = fn(d.exilus);
    else if (s.kind === "slot") d.slots[s.i] = fn(d.slots[s.i]);
    return d;
  });

  async function save(copy = false) {
    const saved = await saveBuild({
      id: copy ? undefined : buildId, item_id: item.id, item_name: item.name, item_cat: item.cat,
      title: title.trim() || `${item.name} build`, notes, data, is_public: !!session && isPublic,
    });
    if (!saved) return;
    setDirty(false);
    toast(copy ? "Saved a copy to your builds" : "Build saved");
    if (saved.id !== buildId) { setBuildId(saved.id); navigate(`/builds/${saved.id}`, { replace: !copy }); }
  }

  async function share() {
    const url = session && isPublic && buildId && !dirty
      ? `${location.origin}/builds/${buildId}`
      : `${location.origin}/b/${encodeBuild(item.id, title, data)}`;
    try { await navigator.clipboard.writeText(url); toast("Share link copied"); }
    catch { window.prompt("Copy this link", url); }
  }

  const isWarframe = item.cat === "warframe";
  const bonusLabel = layout.bonus === "aura" ? "Aura" : "Stance";

  return (
    <div className="stack">
      <div className="row spread">
        <div className="row" style={{ gap: 14 }}>
          <Art img={item.img} name={item.name} className="art" />
          <div>
            <div className="label">{CATEGORY_LABEL[item.cat]} · {item.name}{initial.author ? ` · by ${initial.author}` : ""}</div>
            {editable
              ? <input className="input" aria-label="Build name" value={title} maxLength={80} onChange={e => { setTitle(e.target.value); setDirty(true); }} style={{ fontFamily: "var(--f-display)", fontSize: "1.5rem", padding: "2px 6px", marginTop: 2 }} />
              : <h1>{title}</h1>}
          </div>
        </div>
        <div className="row">
          {editable ? (
            <>
              {accountsEnabled && session && (
                <label className="row note" style={{ gap: 6 }}><input type="checkbox" className="check" checked={isPublic} onChange={e => { setIsPublic(e.target.checked); setDirty(true); }} /> Public</label>
              )}
              <button className="btn quiet" onClick={share}>Copy share link</button>
              <button className="btn solid" onClick={() => save()} disabled={!dirty}>{dirty ? "Save build" : "Saved"}</button>
            </>
          ) : (
            <>
              <button className="btn quiet" onClick={share}>Copy share link</button>
              <button className="btn solid" onClick={() => save(true)}>Save a copy</button>
            </>
          )}
        </div>
      </div>

      <div className="editor">
        <div className="stack">
          {/* Capacity */}
          <div className="pane">
            <div className="row spread" style={{ marginBottom: 6 }}>
              <span className="label">Mod capacity</span>
              <span className="num" style={{ color: cap.free < 0 ? "var(--bad)" : undefined, fontSize: "1.1rem" }}>{cap.used} / {cap.total}{cap.free < 0 ? ` · ${-cap.free} over` : ` · ${cap.free} free`}</span>
            </div>
            <div className={`capbar${cap.free < 0 ? " over" : ""}`}><i style={{ width: `${Math.min(100, (cap.used / Math.max(1, cap.total)) * 100)}%` }} /></div>
            <div className="row note" style={{ marginTop: 8 }}>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" className="check" checked={data.boosted} disabled={!editable} onChange={e => edit(d => ({ ...d, boosted: e.target.checked }))} />
                {["primary", "secondary", "melee", "archgun", "archmelee", "companionweapon"].includes(item.cat) ? "Orokin Catalyst" : "Orokin Reactor"}
              </label>
              <span>Rank {item.rank}: {cap.base} base{cap.bonus ? ` + ${cap.bonus} from ${bonusLabel.toLowerCase()}` : ""}</span>
              <span>{forma} Forma</span>
            </div>
          </div>

          {/* Slots */}
          <div className="pane stack" style={{ gap: 10 }}>
            {(layout.bonus || layout.exilus) && (
              <div className="slots top">
                {layout.bonus && <SlotButton label={bonusLabel} state={data.bonus!} selected={sel.kind === "bonus"} onClick={() => setSel({ kind: "bonus" })} bonus />}
                {layout.exilus && <SlotButton label="Exilus" state={data.exilus!} selected={sel.kind === "exilus"} onClick={() => setSel({ kind: "exilus" })} drain={cap.perSlot[data.slots.length]} />}
              </div>
            )}
            <div className="slots">
              {data.slots.map((s, i) => (
                <SlotButton key={i} label={`Slot ${i + 1}`} state={s} selected={sel.kind === "slot" && sel.i === i} onClick={() => setSel({ kind: "slot", i })} drain={cap.perSlot[i]} />
              ))}
            </div>
          </div>

          {(layout.arcanes > 0 || layout.shards > 0 || layout.helminth) && (
            <div className="pane stack">
              {layout.arcanes > 0 && (
                <div>
                  <h3>Arcanes</h3>
                  <div className="slots" style={{ gridTemplateColumns: `repeat(${Math.max(2, layout.arcanes)}, minmax(0, 1fr))`, maxWidth: layout.arcanes === 1 ? "50%" : undefined }}>
                    {data.arcanes.map((a, i) => (
                      <button key={i} className={`slot${a ? " filled" : ""}${sel.kind === "arcane" && sel.i === i ? " picked" : ""}`} onClick={() => setSel({ kind: "arcane", i })} style={{ minHeight: 60 }}>
                        <span className="slabel">Arcane {layout.arcanes > 1 ? i + 1 : ""}</span>
                        <span className="sname">{a ?? <span className="note">Empty</span>}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {layout.shards > 0 && (
                <div>
                  <h3>Archon Shards</h3>
                  <div className="shards">
                    {data.shards.map((s, i) => (
                      <button key={i} className={`shard${s ? " filled" : ""}${sel.kind === "shard" && sel.i === i ? " picked" : ""}`} style={s ? { background: SHARD_COLORS[s.color] } : undefined}
                        onClick={() => setSel({ kind: "shard", i })} title={s ? `${s.tau ? "Tauforged " : ""}${s.color}: ${shardText(game.shards, s)}` : "Empty shard slot"} aria-label={s ? `${s.color} shard` : `Empty shard slot ${i + 1}`}>
                        {s ? (s.tau ? "Tau" : s.color.slice(0, 3)) : "+"}
                      </button>
                    ))}
                  </div>
                  <ul className="note" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {data.shards.filter(Boolean).map((s, i) => <li key={i}>{s!.tau ? "Tauforged " : ""}{s!.color}: {shardText(game.shards, s!)}</li>)}
                  </ul>
                </div>
              )}
              {layout.helminth && (
                <div>
                  <h3>Helminth</h3>
                  <button className={`slot${data.helminth ? " filled" : ""}${sel.kind === "helminth" ? " picked" : ""}`} onClick={() => setSel({ kind: "helminth" })} style={{ minHeight: 56, maxWidth: 360 }}>
                    <span className="slabel">Subsumed ability</span>
                    <span className="sname">{data.helminth ? `${data.helminth.ability} (from ${data.helminth.frame}) replacing ${item.abilities?.find(a => a.name === data.helminth!.replaces)?.name ?? "—"}` : <span className="note">None</span>}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="pane">
            <label className="label" htmlFor="notes">Notes</label>
            {editable
              ? <textarea id="notes" className="input" maxLength={4000} value={notes} onChange={e => { setNotes(e.target.value); setDirty(true); }} placeholder="What it's for, how to play it, what to swap in Steel Path…" style={{ marginTop: 6 }} />
              : <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{notes || <span className="note">No notes.</span>}</p>}
          </div>

          {editable && buildId && (
            <div className="row">
              {confirmDelete ? (
                <>
                  <span className="note">Delete “{title}” for good?</span>
                  <button className="btn danger small" onClick={async () => { await deleteBuild(buildId); toast("Build deleted"); navigate("/builds"); }}>Delete</button>
                  <button className="btn quiet small" onClick={() => setConfirmDelete(false)}>Keep it</button>
                </>
              ) : <button className="btn quiet small" onClick={() => setConfirmDelete(true)}>Delete build</button>}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="pane sticky" ref={pickerRef} style={{ scrollMarginTop: 12 }}>
          {editable
            ? <Picker sel={sel} item={item} data={data} slot={slotOf(sel)} setSlot={fn => setSlot(sel, fn)} edit={edit} />
            : <ReadOnlySummary item={item} data={data} />}
          {isWarframe && item.health !== undefined && (
            <div style={{ marginTop: 16 }}>
              <h3>Base stats at rank 30</h3>
              <dl className="statgrid">
                <dt>Health</dt><dd>{item.health}</dd><dt>Shields</dt><dd>{item.shield}</dd>
                <dt>Armor</dt><dd>{item.armor}</dd><dt>Energy</dt><dd>{item.energy}</dd>
              </dl>
              <p className="note" style={{ marginBottom: 0 }}>Before mods, shards and arcanes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function shardText(shards: { color: string; stats: { id: string; text: string; tau: string }[] }[], s: { color: string; stat: string; tau: boolean }) {
  const st = shards.find(c => c.color === s.color)?.stats.find(x => x.id === s.stat);
  return st ? (s.tau ? st.tau || st.text : st.text) : "no bonus picked";
}

function SlotButton({ label, state, selected, onClick, drain, bonus }: { label: string; state: SlotState; selected: boolean; onClick: () => void; drain?: number; bonus?: boolean }) {
  const { modsById } = useGame();
  const mod = state.mod ? modsById.get(state.mod) : undefined;
  const match = mod ? polarityMatch(state.polarity, mod.pol) : "none";
  const value = mod ? (bonus ? `+${bonusCapacity(mod, state.rank, state.polarity)}` : String(drain ?? modDrain(mod, state.rank, state.polarity))) : "";
  return (
    <button className={`slot${mod ? " filled" : ""}${selected ? " picked" : ""}`} onClick={onClick} aria-pressed={selected}>
      <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><span className="slabel">{label}</span><span className={`cost ${match}`}>{value}</span></span>
      <span className="sname">{mod ? mod.name : <span className="note">Empty</span>}</span>
      <span className="foot"><Pol p={state.polarity} />{mod && <span className="note">R{state.rank}/{mod.ranks}</span>}{mod && <span style={{ marginLeft: "auto" }}><Pol p={mod.pol} /></span>}</span>
    </button>
  );
}

function Picker({ sel, item, data, slot, setSlot, edit }: {
  sel: Sel; item: CollectionItem; data: BuildData; slot: SlotState | null;
  setSlot: (fn: (s: SlotState) => SlotState) => void; edit: (fn: (d: BuildData) => BuildData) => void;
}) {
  const game = useGame();
  const [q, setQ] = useState("");
  useEffect(() => setQ(""), [sel.kind, "i" in sel ? sel.i : 0]);
  const t = q.trim().toLowerCase();

  if (sel.kind === "arcane") {
    const current = data.arcanes[sel.i];
    const taken = new Set(data.arcanes.filter((a, i) => a && i !== sel.i));
    const list = arcanesFor(item, game.arcanes).filter(a => !t || a.name.toLowerCase().includes(t) || a.stats.toLowerCase().includes(t));
    return (
      <div>
        <div className="row spread"><h3 style={{ margin: 0 }}>Arcane</h3>{current && <button className="btn small quiet" onClick={() => edit(d => { d.arcanes[sel.i] = null; return d; })}>Remove</button>}</div>
        <input type="search" className="input" placeholder="Search arcanes or effects" aria-label="Search arcanes" value={q} onChange={e => setQ(e.target.value)} style={{ marginTop: 8 }} />
        <div className="picker">
          {list.map(a => (
            <button key={a.name} disabled={taken.has(a.name)} aria-pressed={a.name === current} onClick={() => edit(d => { d.arcanes[sel.i] = a.name; return d; })}>
              <span className="chip">{a.rarity.slice(0, 1) || "·"}</span><b>{a.name}</b><span className="note">R{a.ranks}</span>
              <span className="stats">{a.stats}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (sel.kind === "shard") {
    const cur = data.shards[sel.i];
    const setShard = (v: BuildData["shards"][number]) => edit(d => { d.shards[sel.i] = v; return d; });
    const color = game.shards.find(c => c.color === cur?.color);
    return (
      <div className="stack" style={{ gap: 10 }}>
        <div className="row spread"><h3 style={{ margin: 0 }}>Archon Shard {sel.i + 1}</h3>{cur && <button className="btn small quiet" onClick={() => setShard(null)}>Remove</button>}</div>
        <div className="row" style={{ gap: 6 }}>
          {game.shards.map(c => (
            <button key={c.color} className="btn small" style={{ borderColor: SHARD_COLORS[c.color], color: cur?.color === c.color ? "#fff" : SHARD_COLORS[c.color], background: cur?.color === c.color ? SHARD_COLORS[c.color] : "none" }}
              onClick={() => setShard({ color: c.color, stat: c.stats[0].id, tau: cur?.tau ?? false })}>{c.color}</button>
          ))}
        </div>
        {cur && color && (
          <>
            <label className="row note" style={{ gap: 6 }}><input type="checkbox" className="check" checked={cur.tau} onChange={e => setShard({ ...cur, tau: e.target.checked })} /> Tauforged</label>
            <div className="picker" style={{ marginTop: 0 }}>
              {color.stats.map(s => (
                <button key={s.id} aria-pressed={s.id === cur.stat} onClick={() => setShard({ ...cur, stat: s.id })} style={s.id === cur.stat ? { background: "var(--gold-soft)" } : undefined}>
                  <span /><span>{cur.tau ? s.tau || s.text : s.text}</span><span />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  if (sel.kind === "helminth") return <HelminthPicker item={item} data={data} edit={edit} />;

  // Mod slots
  if (!slot) return null;
  const which = sel.kind === "bonus" ? (LAYOUT[item.cat]!.bonus as "aura" | "stance") : sel.kind === "exilus" ? "exilus" : "regular";
  const current = slot.mod ? game.modsById.get(slot.mod) : undefined;
  const taken = equippedNames(data, game.modsById);
  if (current) taken.delete(familyOf(current.name));
  const list = modsFor(item, game.mods, which).filter(m => !t || m.name.toLowerCase().includes(t) || m.stats.toLowerCase().includes(t));
  const costIn = (m: Mod) => which === "aura" || which === "stance" ? `+${bonusCapacity(m, m.ranks, slot.polarity)}` : String(modDrain(m, m.ranks, slot.polarity));
  const label = sel.kind === "bonus" ? (which === "aura" ? "Aura" : "Stance") : sel.kind === "exilus" ? "Exilus" : `Slot ${sel.i + 1}`;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row spread"><h3 style={{ margin: 0 }}>{label}</h3>{current && <button className="btn small quiet" onClick={() => setSlot(s => ({ ...s, mod: null, rank: 0 }))}>Remove mod</button>}</div>

      <div>
        <div className="label" style={{ marginBottom: 4 }}>Slot polarity (Forma)</div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn small quiet" aria-pressed={!slot.polarity} onClick={() => setSlot(s => ({ ...s, polarity: "" }))} title="No polarity">None</button>
          {POLARITIES.filter(p => which === "stance" || p !== "universal" || which === "regular").map(p => (
            <button key={p} className="btn small quiet" aria-pressed={normPolarity(slot.polarity) === p} onClick={() => setSlot(s => ({ ...s, polarity: p }))}
              style={normPolarity(slot.polarity) === p ? { background: "var(--gold-soft)", color: "var(--gold)", borderColor: "var(--gold)" } : undefined} title={POLARITY_NAME[p]}>
              <Pol p={p} />
            </button>
          ))}
        </div>
      </div>

      {current && current.ranks > 0 && (
        <div>
          <label className="label" htmlFor="rank">Rank {slot.rank} of {current.ranks}</label>
          <input id="rank" type="range" min={0} max={current.ranks} value={slot.rank} onChange={e => setSlot(s => ({ ...s, rank: +e.target.value }))} style={{ width: "100%", accentColor: "var(--gold)" }} />
          {current.stats && <p className="note" style={{ whiteSpace: "pre-line", margin: 0 }}>At max rank: {current.stats}</p>}
        </div>
      )}

      <input type="search" className="input" placeholder={`Search ${list.length} mods or effects`} aria-label="Search mods" value={q} onChange={e => setQ(e.target.value)} />
      <div className="picker" style={{ marginTop: 0 }}>
        {list.map(m => {
          const blocked = taken.has(familyOf(m.name)) && m.id !== current?.id;
          return (
            <button key={m.id} disabled={blocked} title={blocked ? "A version of this mod is already equipped" : undefined}
              onClick={() => setSlot(s => ({ ...s, mod: m.id, rank: m.ranks }))} style={m.id === current?.id ? { background: "var(--gold-soft)" } : undefined}>
              <Pol p={m.pol} /><b>{m.name}</b><span className={`num cost ${polarityMatch(slot.polarity, m.pol)}`}>{costIn(m)}</span>
              <span className="stats">{m.stats}</span>
            </button>
          );
        })}
        {!list.length && <p className="note">No mods match.</p>}
      </div>
    </div>
  );
}

function HelminthPicker({ item, data, edit }: { item: CollectionItem; data: BuildData; edit: (fn: (d: BuildData) => BuildData) => void }) {
  const game = useGame();
  const [frame, setFrame] = useState(data.helminth?.frame ?? "");
  const donors = useMemo(() => game.collection.filter(c => c.cat === "warframe" && !c.prime && !/Umbra$/.test(c.name) && c.name !== item.name.replace(/ Prime$/, "") && c.abilities?.length), [game.collection, item.name]);
  const donor = donors.find(d => d.name === frame);
  const replaces = data.helminth?.replaces ?? item.abilities?.[0]?.name ?? "";
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row spread"><h3 style={{ margin: 0 }}>Helminth</h3>{data.helminth && <button className="btn small quiet" onClick={() => edit(d => ({ ...d, helminth: null }))}>Remove</button>}</div>
      <label className="label" htmlFor="replace">Replaces</label>
      <select id="replace" className="input" value={replaces} onChange={e => edit(d => ({ ...d, helminth: d.helminth ? { ...d.helminth, replaces: e.target.value } : d.helminth }))} disabled={!data.helminth}>
        {(item.abilities ?? []).slice(0, 4).map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
      </select>
      <label className="label" htmlFor="donor">Subsumed Warframe</label>
      <select id="donor" className="input" value={frame} onChange={e => setFrame(e.target.value)}>
        <option value="">Pick a Warframe</option>
        {donors.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
      </select>
      {donor && (
        <div className="picker" style={{ marginTop: 0 }}>
          {donor.abilities!.slice(0, 4).map(a => (
            <button key={a.name} onClick={() => edit(d => ({ ...d, helminth: { frame: donor.name, ability: a.name, replaces } }))}
              style={data.helminth?.ability === a.name ? { background: "var(--gold-soft)" } : undefined}>
              <span /><b>{a.name}</b><span /><span className="stats">{a.desc}</span>
            </button>
          ))}
        </div>
      )}
      <p className="note" style={{ margin: 0 }}>Each Warframe gives Helminth one specific ability. Pick the one you subsumed; Helminth's own abilities aren't listed yet.</p>
    </div>
  );
}

function ReadOnlySummary({ item, data }: { item: CollectionItem; data: BuildData }) {
  const { modsById } = useGame();
  const all = [data.bonus, ...data.slots, data.exilus].filter((s): s is SlotState => !!s?.mod);
  return (
    <div>
      <h3>Mods</h3>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {all.map((s, i) => { const m = modsById.get(s.mod!); return <li key={i}>{m?.name ?? "Unknown mod"} <span className="note">R{s.rank}</span></li>; })}
      </ul>
      {data.arcanes.some(Boolean) && <><h3 style={{ marginTop: 14 }}>Arcanes</h3><p style={{ margin: 0 }}>{data.arcanes.filter(Boolean).join(", ")}</p></>}
      <p className="note">Viewing a {CATEGORY_LABEL[item.cat].toLowerCase()} build. Save a copy to change it.</p>
    </div>
  );
}
