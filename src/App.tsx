import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { GameDataProvider } from "./components/ui";
import { useStore } from "./lib/store";
import Farm from "./pages/Farm";
import Primes from "./pages/Primes";
import Fissures from "./pages/Fissures";
import Wishlist from "./pages/Wishlist";
import Collection from "./pages/Collection";
import Builds from "./pages/Builds";
import BuildEditor from "./pages/BuildEditor";
import Account from "./pages/Account";

const LINKS = [
  ["/collection", "Collection"],
  ["/builds", "Builds"],
  ["/farm", "Where to farm"],
  ["/primes", "Prime sets"],
  ["/fissures", "Fissures"],
  ["/wishlist", "Wishlist"],
] as const;

export default function App() {
  const { session, accountsEnabled, error, clearError, state } = useStore();
  const openWishes = state.wishlist.filter(w => !w.done).length;
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/collection" className="crest" aria-label="Void Ledger home">
          <svg viewBox="0 0 34 34" aria-hidden="true"><g fill="none" stroke="var(--gold)" strokeWidth="1.6"><path d="M17 2 L31 17 L17 32 L3 17 Z" /><path d="M17 8 L25 17 L17 26 L9 17 Z" fill="var(--gold-soft)" /><circle cx="17" cy="17" r="2.4" fill="var(--gold)" /></g></svg>
          <span>Void Ledger</span>
        </NavLink>
        <nav className="nav" aria-label="Main">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to}>{label}{to === "/wishlist" && openWishes > 0 ? ` · ${openWishes}` : ""}</NavLink>
          ))}
        </nav>
        <NavLink to="/account" className="who">
          {session ? <>Signed in as <b>{session.user.email ?? session.user.user_metadata?.full_name ?? "Tenno"}</b></> : accountsEnabled ? "Sign in" : "Saved in this browser"}
        </NavLink>
      </header>
      <main>
        {error && (
          <div className="banner err" role="alert">
            <span>{error}</span>
            <button className="btn small quiet" onClick={clearError}>Dismiss</button>
          </div>
        )}
        <GameDataProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/collection" replace />} />
            <Route path="/collection" element={<Collection />} />
            <Route path="/builds" element={<Builds />} />
            <Route path="/builds/new" element={<BuildEditor />} />
            <Route path="/builds/:id" element={<BuildEditor />} />
            <Route path="/b/:code" element={<BuildEditor />} />
            <Route path="/farm" element={<Farm />} />
            <Route path="/primes" element={<Primes />} />
            <Route path="/fissures" element={<Fissures />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<div className="empty">That page doesn't exist. <NavLink to="/collection">Go to your collection</NavLink>.</div>} />
          </Routes>
        </GameDataProvider>
      </main>
    </div>
  );
}
