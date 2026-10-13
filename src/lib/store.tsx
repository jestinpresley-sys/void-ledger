// The player's own data: collection, owned Prime parts, wishlist, builds.
// Signed in → stored in Supabase. Signed out (or no Supabase keys) → stored in this browser.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Build, BuildData } from "./builds";
import type { Category } from "./data";

export type Status = "owned" | "mastered";
export interface WishItem { name: string; done: boolean; added_at: string }

export interface UserState {
  collection: Record<string, Status>;
  parts: Record<string, true>;
  wishlist: WishItem[];
  builds: Build[];
}

const EMPTY: UserState = { collection: {}, parts: {}, wishlist: [], builds: [] };
const LOCAL_KEY = "void-ledger:v1";

function readLocal(): UserState {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}
function writeLocal(s: UserState) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}
const hasData = (s: UserState) => Object.keys(s.collection).length + Object.keys(s.parts).length + s.wishlist.length + s.builds.length > 0;

export interface BuildInput {
  id?: string;
  item_id: string;
  item_name: string;
  item_cat: Category;
  title: string;
  notes: string;
  data: BuildData;
  is_public: boolean;
}

interface Store {
  state: UserState;
  ready: boolean;
  session: Session | null;
  accountsEnabled: boolean;
  error: string | null;
  clearError(): void;
  setStatus(itemId: string, status: Status | null): void;
  setStatuses(itemIds: string[], status: Status | null): void;
  setPart(part: string, owned: boolean): void;
  addWish(name: string): boolean;
  setWishDone(name: string, done: boolean): void;
  removeWish(name: string): void;
  clearFinishedWishes(): number;
  saveBuild(b: BuildInput): Promise<Build | null>;
  deleteBuild(id: string): Promise<void>;
  /** Local progress that can be moved into the signed-in account. */
  localPending: boolean;
  importLocal(): Promise<void>;
  discardLocal(): void;
  signOut(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<UserState>(() => (supabase ? EMPTY : readLocal()));
  const [ready, setReady] = useState(!supabase);
  const [error, setError] = useState<string | null>(null);
  const [localPending, setLocalPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const cloud = !!(supabase && session);

  // Auth
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) { setState(readLocal()); setReady(true); }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the account's data whenever the signed-in user changes.
  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      const [c, p, w, b] = await Promise.all([
        supabase.from("collection_items").select("item_id,status"),
        supabase.from("owned_parts").select("part_name"),
        supabase.from("wishlist").select("name,done,added_at").order("added_at", { ascending: false }),
        supabase.from("builds").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
      ]);
      if (cancelled) return;
      const err = c.error ?? p.error ?? w.error ?? b.error;
      if (err) setError(`Couldn't load your account data: ${err.message}. Check that supabase/schema.sql has been run.`);
      setState({
        collection: Object.fromEntries((c.data ?? []).map(r => [r.item_id, r.status as Status])),
        parts: Object.fromEntries((p.data ?? []).map(r => [r.part_name, true as const])),
        wishlist: (w.data ?? []) as WishItem[],
        builds: (b.data ?? []) as Build[],
      });
      setLocalPending(hasData(readLocal()));
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [userId, reloadKey]);

  // Signed out: keep the browser copy in sync.
  useEffect(() => { if (ready && !cloud) writeLocal(state); }, [state, ready, cloud]);

  const fail = useCallback((what: string) => (e: { message: string } | null) => {
    if (e) setError(`${what} didn't save: ${e.message}`);
  }, []);

  const setStatuses = useCallback((ids: string[], status: Status | null) => {
    setState(s => {
      const collection = { ...s.collection };
      for (const id of ids) { if (status) collection[id] = status; else delete collection[id]; }
      return { ...s, collection };
    });
    if (!supabase || !session) return;
    if (status) supabase.from("collection_items").upsert(ids.map(item_id => ({ item_id, status }))).then(r => fail("Collection")(r.error));
    else supabase.from("collection_items").delete().in("item_id", ids).then(r => fail("Collection")(r.error));
  }, [session, fail]);
  const setStatus = useCallback((id: string, status: Status | null) => setStatuses([id], status), [setStatuses]);

  const setPart = useCallback((part: string, owned: boolean) => {
    setState(s => {
      const parts = { ...s.parts };
      if (owned) parts[part] = true; else delete parts[part];
      return { ...s, parts };
    });
    if (!supabase || !session) return;
    const q = owned ? supabase.from("owned_parts").upsert({ part_name: part }) : supabase.from("owned_parts").delete().eq("part_name", part);
    q.then(r => fail("Part")(r.error));
  }, [session, fail]);

  const addWish = useCallback((name: string) => {
    if (stateRef.current.wishlist.some(w => w.name === name)) return false;
    const item: WishItem = { name, done: false, added_at: new Date().toISOString() };
    setState(s => ({ ...s, wishlist: [item, ...s.wishlist] }));
    if (supabase && session) supabase.from("wishlist").insert(item).then(r => fail("Wishlist")(r.error));
    return true;
  }, [session, fail]);

  const setWishDone = useCallback((name: string, done: boolean) => {
    setState(s => ({ ...s, wishlist: s.wishlist.map(w => (w.name === name ? { ...w, done } : w)) }));
    if (supabase && session) supabase.from("wishlist").update({ done }).eq("name", name).then(r => fail("Wishlist")(r.error));
  }, [session, fail]);

  const removeWish = useCallback((name: string) => {
    setState(s => ({ ...s, wishlist: s.wishlist.filter(w => w.name !== name) }));
    if (supabase && session) supabase.from("wishlist").delete().eq("name", name).then(r => fail("Wishlist")(r.error));
  }, [session, fail]);

  const clearFinishedWishes = useCallback(() => {
    const done = stateRef.current.wishlist.filter(w => w.done).map(w => w.name);
    if (!done.length) return 0;
    setState(s => ({ ...s, wishlist: s.wishlist.filter(w => !w.done) }));
    if (supabase && session) supabase.from("wishlist").delete().in("name", done).then(r => fail("Wishlist")(r.error));
    return done.length;
  }, [session, fail]);

  const saveBuild = useCallback(async (input: BuildInput): Promise<Build | null> => {
    const now = new Date().toISOString();
    if (supabase && session) {
      const row = { item_id: input.item_id, item_name: input.item_name, item_cat: input.item_cat, title: input.title, notes: input.notes, data: input.data, is_public: input.is_public };
      const res = input.id
        ? await supabase.from("builds").update(row).eq("id", input.id).select().single()
        : await supabase.from("builds").insert(row).select().single();
      if (res.error) { setError(`Build didn't save: ${res.error.message}`); return null; }
      const saved = res.data as Build;
      setState(s => ({ ...s, builds: [saved, ...s.builds.filter(b => b.id !== saved.id)] }));
      return saved;
    }
    const existing = input.id ? stateRef.current.builds.find(b => b.id === input.id) : undefined;
    const saved: Build = { ...input, id: input.id ?? crypto.randomUUID(), is_public: false, created_at: existing?.created_at ?? now, updated_at: now };
    setState(s => ({ ...s, builds: [saved, ...s.builds.filter(b => b.id !== saved.id)] }));
    return saved;
  }, [session]);

  const deleteBuild = useCallback(async (id: string) => {
    setState(s => ({ ...s, builds: s.builds.filter(b => b.id !== id) }));
    if (supabase && session) {
      const r = await supabase.from("builds").delete().eq("id", id);
      fail("Delete")(r.error);
    }
  }, [session, fail]);

  const importLocal = useCallback(async () => {
    if (!supabase || !session) return;
    const local = readLocal();
    const ops = [];
    const entries = Object.entries(local.collection);
    if (entries.length) ops.push(supabase.from("collection_items").upsert(entries.map(([item_id, status]) => ({ item_id, status }))));
    const parts = Object.keys(local.parts);
    if (parts.length) ops.push(supabase.from("owned_parts").upsert(parts.map(part_name => ({ part_name }))));
    if (local.wishlist.length) ops.push(supabase.from("wishlist").upsert(local.wishlist, { onConflict: "user_id,name", ignoreDuplicates: true }));
    if (local.builds.length) ops.push(supabase.from("builds").insert(local.builds.map(b => ({ item_id: b.item_id, item_name: b.item_name, item_cat: b.item_cat, title: b.title, notes: b.notes, data: b.data, is_public: false }))));
    const results = await Promise.all(ops);
    const err = results.find(r => r.error)?.error;
    if (err) { setError(`Import stopped: ${err.message}`); return; }
    try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
    setLocalPending(false);
    setReloadKey(k => k + 1); // reload from the server to show the merged data
  }, [session]);

  const discardLocal = useCallback(() => {
    try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
    setLocalPending(false);
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setState(readLocal());
    setReady(true);
  }, []);

  const value = useMemo<Store>(() => ({
    state, ready, session, accountsEnabled: !!supabase, error, clearError: () => setError(null),
    setStatus, setStatuses, setPart, addWish, setWishDone, removeWish, clearFinishedWishes, saveBuild, deleteBuild,
    localPending, importLocal, discardLocal, signOut,
  }), [state, ready, session, error, setStatus, setStatuses, setPart, addWish, setWishDone, removeWish, clearFinishedWishes, saveBuild, deleteBuild, localPending, importLocal, discardLocal, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
