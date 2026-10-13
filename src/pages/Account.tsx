import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import { useToast } from "../components/ui";

export default function Account() {
  const { session, accountsEnabled, signOut, localPending, importLocal, discardLocal, state } = useStore();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!supabase || !session) return;
    supabase.from("profiles").select("display_name").eq("id", session.user.id).maybeSingle()
      .then(({ data }) => setDisplayName(data?.display_name ?? ""));
  }, [session]);

  if (!accountsEnabled || !supabase) {
    return (
      <div className="stack" style={{ maxWidth: 640 }}>
        <h1>Accounts are off</h1>
        <p className="lede">This copy of Void Ledger has no Supabase keys, so everything you track is saved in this browser only. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env</code> to turn on sign-in and cloud sync. The README walks through it.</p>
      </div>
    );
  }
  const sb = supabase;

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + "/account" } });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }
  async function discord() {
    const { error } = await sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: window.location.origin + "/account" } });
    if (error) setErr(error.message);
  }
  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const name = displayName.trim();
    const { error } = await sb.from("profiles").upsert({ id: session.user.id, display_name: name || null });
    if (error) setErr(error.message); else toast("Display name saved");
  }

  if (!session) {
    return (
      <div className="stack" style={{ maxWidth: 520 }}>
        <div><h1>Sign in</h1><p className="lede">Sign in to keep your collection, Prime parts, wishlist and builds on every device, and to share builds with a link.</p></div>
        <div className="pane stack">
          {sent ? (
            <p>Check <b>{email}</b> for a sign-in link. You can close this tab; the link opens Void Ledger signed in.</p>
          ) : (
            <form onSubmit={sendLink} className="stack">
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tenno@example.com" />
              <button className="btn solid" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
            </form>
          )}
          <div className="row" style={{ justifyContent: "center" }}><span className="note">or</span></div>
          <button className="btn" onClick={discord}>Continue with Discord</button>
          {err && <p className="note" style={{ color: "var(--bad)" }} role="alert">{err}</p>}
        </div>
        <p className="note">Not ready to sign in? Everything still works and saves in this browser. When you sign in later you can move it into your account.</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div><h1>Account</h1><p className="lede">Signed in as {session.user.email ?? "a Discord account"}.</p></div>
      {localPending && (
        <div className="banner">
          <span>This browser has progress from before you signed in.</span>
          <span className="row">
            <button className="btn solid small" onClick={async () => { await importLocal(); toast("Moved into your account"); }}>Move it into my account</button>
            <button className="btn quiet small" onClick={discardLocal}>Discard it</button>
          </span>
        </div>
      )}
      <div className="pane">
        <form onSubmit={saveName} className="stack">
          <label className="label" htmlFor="dname">Display name on shared builds</label>
          <div className="row">
            <input id="dname" className="input" style={{ flex: 1, minWidth: 180 }} maxLength={40} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your in-game name" />
            <button className="btn">Save</button>
          </div>
        </form>
      </div>
      <div className="pane row spread">
        <span className="note">{Object.keys(state.collection).length} items tracked · {state.builds.length} builds · {state.wishlist.length} on wishlist</span>
        <button className="btn quiet" onClick={signOut}>Sign out</button>
      </div>
      {err && <p className="note" style={{ color: "var(--bad)" }} role="alert">{err}</p>}
    </div>
  );
}
