import { Link } from "react-router-dom";
import { useGame, useToast } from "../components/ui";
import { farmLink } from "../components/farm";
import { bestSource } from "../lib/farm";
import { useStore } from "../lib/store";

export default function Wishlist() {
  const { drops: d, collection } = useGame();
  const { state, setWishDone, removeWish, clearFinishedWishes } = useStore();
  const toast = useToast();
  const kindOf = (n: string) => d.sets[n] ? "Prime set" : d.items[n]?.relics ? "Prime part" : n.endsWith(" Relic") ? "Relic" : collection.some(c => c.name === n) ? "Item" : "Drop";

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Wishlist</h1><p className="lede">Everything you're chasing, with the best place to get each one. Prime parts here drive the fissure plan.</p></div>
        <div className="row">
          <Link className="btn" to="/fissures">Fissure plan</Link>
          <button className="btn quiet" onClick={() => { const n = clearFinishedWishes(); toast(n ? `Cleared ${n} finished` : "Nothing finished yet"); }}>Clear finished</button>
        </div>
      </div>
      <div className="pane">
        {!state.wishlist.length ? (
          <div className="empty">Nothing here yet. Add items from <Link to="/farm">Where to farm</Link> or <Link to="/primes">Prime sets</Link>.</div>
        ) : (
          <ul className="wl">
            {state.wishlist.map(w => {
              const src = bestSource(d, w.name, state.parts);
              const id = "wish-" + w.name.replace(/\W+/g, "-");
              return (
                <li key={w.name} className={w.done ? "done" : ""}>
                  <input type="checkbox" className="check" id={id} checked={w.done} onChange={e => setWishDone(w.name, e.target.checked)} aria-label={`Got ${w.name}`} style={{ marginTop: 3 }} />
                  <div>
                    <Link className="nm" to={farmLink(w.name)} style={{ fontWeight: 600 }}>{w.name}</Link> <span className="chip">{kindOf(w.name)}</span>
                    <div className="note">{src.vaulted && <span className="chip vault">Vaulted</span>} {src.text}</div>
                  </div>
                  <button className="btn small quiet" onClick={() => removeWish(w.name)} aria-label={`Remove ${w.name}`}>Remove</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
