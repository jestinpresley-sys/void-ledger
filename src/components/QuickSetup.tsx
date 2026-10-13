// Fast ways to fill in a collection: paste a list, or mark whole groups by rule.
// Both only ever add or upgrade marks; they never remove or downgrade one.
import { useMemo, useState } from "react";
import { useGame, useToast } from "./ui";
import { CATEGORY_LABEL, type Category, type CollectionItem } from "../lib/data";
import { matchList } from "../lib/listImport";
import { useStore, type Status } from "../lib/store";

type Mode = "paste" | "rules";

const RULE_GROUPS: { key: string; label: string; cats: Category[] }[] = [
  { key: "all", label: "Everything", cats: ["warframe", "primary", "secondary", "melee", "sentinel", "pet", "companionweapon", "archwing", "archgun", "archmelee", "necramech"] },
  { key: "warframe", label: "Warframes", cats: ["warframe"] },
  { key: "weapons", label: "Weapons", cats: ["primary", "secondary", "melee"] },
  { key: "companions", label: "Companions", cats: ["sentinel", "pet", "companionweapon"] },
  { key: "vehicles", label: "Vehicles", cats: ["archwing", "archgun", "archmelee", "necramech"] },
];

/** Which ids a mark would actually change: "owned" never downgrades a mastered item. */
function changes(ids: string[], status: Status, current: Record<string, Status>) {
  return ids.filter(id => current[id] !== status && !(status === "owned" && current[id] === "mastered"));
}

export default function QuickSetup({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("paste");
  return (
    <div className="pane stack" style={{ gap: 12 }}>
      <div className="row spread">
        <div>
          <h2>Quick setup</h2>
          <p className="lede" style={{ marginTop: 2 }}>Fill in your collection in a few steps instead of item by item. This only adds marks; nothing you've already marked is removed.</p>
        </div>
        <button className="btn quiet small" onClick={onClose}>Close</button>
      </div>
      <div className="seg" role="tablist" aria-label="Setup method">
        <button role="tab" aria-selected={mode === "paste"} aria-pressed={mode === "paste"} onClick={() => setMode("paste")}>Paste a list</button>
        <button role="tab" aria-selected={mode === "rules"} aria-pressed={mode === "rules"} onClick={() => setMode("rules")}>Mark by rule</button>
      </div>
      {mode === "paste" ? <PasteList /> : <Rules />}
    </div>
  );
}

function PasteList() {
  const { collection } = useGame();
  const { state, setStatuses } = useStore();
  const toast = useToast();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("mastered");
  const [skipClose, setSkipClose] = useState<Set<string>>(new Set());
  const match = useMemo(() => (text.trim() ? matchList(text, collection) : null), [text, collection]);

  const picked = match ? [...match.exact.map(x => x.item.id), ...match.close.filter(x => !skipClose.has(x.item.id)).map(x => x.item.id)] : [];
  const willChange = changes(picked, status, state.collection);

  function apply() {
    if (!willChange.length) return;
    setStatuses(willChange, status);
    toast(`Marked ${willChange.length} item${willChange.length === 1 ? "" : "s"} ${status === "mastered" ? "mastered" : "owned"}`);
    setText(""); setSkipClose(new Set());
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="label" htmlFor="paste">Item names, one per line or separated by commas</label>
      <textarea id="paste" className="input" rows={6} value={text} onChange={e => { setText(e.target.value); setSkipClose(new Set()); }}
        placeholder={"Rhino Prime\nSoma Prime, Kuva Bramma\nCarrier Prime"} />
      <p className="note" style={{ margin: 0 }}>Tip: copy names from a spreadsheet, a notes app, or another tracker. Counts like "x2" and words like "(mastered)" are ignored.</p>

      {match && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="chip open">{match.exact.length} matched</span>
            {match.close.length > 0 && <span className="chip gold">{match.close.length} close spelling{match.close.length === 1 ? "" : "s"}</span>}
            {match.unknown.length > 0 && <span className="chip vault">{match.unknown.length} not found</span>}
          </div>
          {match.close.length > 0 && (
            <div>
              <h3>Check these</h3>
              <ul className="wl">
                {match.close.map(c => {
                  const id = "close-" + c.item.id.replace(/\W+/g, "-");
                  return (
                    <li key={c.item.id} style={{ gridTemplateColumns: "auto minmax(0,1fr)" }}>
                      <input type="checkbox" className="check" id={id} checked={!skipClose.has(c.item.id)}
                        onChange={e => setSkipClose(s => { const n = new Set(s); if (e.target.checked) n.delete(c.item.id); else n.add(c.item.id); return n; })} />
                      <label htmlFor={id}>“{c.input}” → <b>{c.item.name}</b> <span className="note">{CATEGORY_LABEL[c.item.cat]}</span></label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {match.unknown.length > 0 && (
            <p className="note" style={{ margin: 0 }}><b>Not found:</b> {match.unknown.slice(0, 20).join(", ")}{match.unknown.length > 20 ? ` and ${match.unknown.length - 20} more` : ""}. Check the spelling; mods, parts and resources aren't collection items.</p>
          )}
        </div>
      )}

      <div className="row">
        <span className="note">Mark as</span>
        <div className="seg" role="group" aria-label="Mark as">
          <button aria-pressed={status === "owned"} onClick={() => setStatus("owned")}>Own</button>
          <button aria-pressed={status === "mastered"} onClick={() => setStatus("mastered")}>Mastered</button>
        </div>
        <button className="btn solid" disabled={!willChange.length} onClick={apply}>
          {willChange.length ? `Mark ${willChange.length} item${willChange.length === 1 ? "" : "s"}` : picked.length ? "Already marked" : "Mark items"}
        </button>
      </div>
    </div>
  );
}

function Rules() {
  const { collection } = useGame();
  const { state, setStatuses } = useStore();
  const toast = useToast();
  const [group, setGroup] = useState("all");
  const [maxMr, setMaxMr] = useState(8);
  const [kind, setKind] = useState<"all" | "nonprime" | "prime">("nonprime");
  const [skipVaulted, setSkipVaulted] = useState(false);
  const [status, setStatus] = useState<Status>("mastered");
  const [confirm, setConfirm] = useState(false);

  const cats = RULE_GROUPS.find(g => g.key === group)!.cats;
  const targets: CollectionItem[] = useMemo(() => collection.filter(i =>
    cats.includes(i.cat) && i.mr <= maxMr
    && (kind === "all" || (kind === "prime" ? i.prime : !i.prime))
    && !(skipVaulted && i.vaulted)), [collection, cats, maxMr, kind, skipVaulted]);
  const willChange = changes(targets.map(i => i.id), status, state.collection);

  function apply() {
    setStatuses(willChange, status);
    toast(`Marked ${willChange.length} item${willChange.length === 1 ? "" : "s"} ${status}`);
    setConfirm(false);
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="note" style={{ margin: 0 }}>Good for veterans: most players have mastered nearly everything below their current Mastery Rank. Mark it all at once, then fix the few exceptions on the tiles.</p>
      <div className="row" style={{ alignItems: "end" }}>
        <div className="stack" style={{ gap: 4 }}>
          <label className="label" htmlFor="rule-group">Which items</label>
          <select id="rule-group" className="input" style={{ width: "auto" }} value={group} onChange={e => { setGroup(e.target.value); setConfirm(false); }}>
            {RULE_GROUPS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <label className="label" htmlFor="rule-kind">Type</label>
          <select id="rule-kind" className="input" style={{ width: "auto" }} value={kind} onChange={e => { setKind(e.target.value as typeof kind); setConfirm(false); }}>
            <option value="nonprime">Non-Prime only</option>
            <option value="prime">Primes only</option>
            <option value="all">Prime and non-Prime</option>
          </select>
        </div>
        <div className="stack" style={{ gap: 4, flex: "1 1 200px" }}>
          <label className="label" htmlFor="rule-mr">Needs Mastery Rank {maxMr} or lower</label>
          <input id="rule-mr" type="range" min={0} max={30} value={maxMr} onChange={e => { setMaxMr(+e.target.value); setConfirm(false); }} style={{ accentColor: "var(--gold)" }} />
        </div>
      </div>
      <div className="row">
        <label className="row note" style={{ gap: 6 }}><input type="checkbox" className="check" checked={skipVaulted} onChange={e => { setSkipVaulted(e.target.checked); setConfirm(false); }} /> Skip vaulted Primes</label>
        <span className="note">Mark as</span>
        <div className="seg" role="group" aria-label="Mark as">
          <button aria-pressed={status === "owned"} onClick={() => { setStatus("owned"); setConfirm(false); }}>Own</button>
          <button aria-pressed={status === "mastered"} onClick={() => { setStatus("mastered"); setConfirm(false); }}>Mastered</button>
        </div>
      </div>
      <div className="row spread">
        <span className="note">{targets.length} items match · {willChange.length} would change</span>
        {confirm ? (
          <span className="row">
            <span className="note">Mark {willChange.length} items {status}?</span>
            <button className="btn solid small" onClick={apply}>Yes, mark {willChange.length}</button>
            <button className="btn quiet small" onClick={() => setConfirm(false)}>Cancel</button>
          </span>
        ) : (
          <button className="btn solid" disabled={!willChange.length} onClick={() => setConfirm(true)}>{willChange.length ? `Mark ${willChange.length} items` : "Nothing to change"}</button>
        )}
      </div>
    </div>
  );
}
