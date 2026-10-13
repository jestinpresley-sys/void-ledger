import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { imageUrl, loadGameData, type GameData, type Polarity } from "../lib/data";
import { normPolarity } from "../lib/capacity";

// ---------- game data ----------
const DataCtx = createContext<GameData | null>(null);
export function useGame(): GameData {
  const d = useContext(DataCtx);
  if (!d) throw new Error("useGame outside GameDataProvider");
  return d;
}
export function GameDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadGameData().then(setData, e => setError(String(e?.message ?? e))); }, []);
  if (error) return <div className="banner err" role="alert">{error}</div>;
  if (!data) return <div className="loading">Loading game data…</div>;
  return <DataCtx.Provider value={data}>{children}</DataCtx.Provider>;
}

// ---------- toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const toast = useCallback((m: string) => {
    setMsg(m); setShow(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShow(false), 2000);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className={`toast${show ? " show" : ""}`} role="status" aria-live="polite">{msg}</div>
    </ToastCtx.Provider>
  );
}

// ---------- item art ----------
export function Art({ img, name, className }: { img: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const url = imageUrl(img);
  return (
    <div className={className ?? "art"}>
      {url && !broken
        ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
        : <span className="art-fallback" aria-hidden="true">{name.charAt(0)}</span>}
    </div>
  );
}

// ---------- polarity glyph ----------
const GLYPH: Record<string, string> = { madurai: "V", vazarin: "D", naramon: "—", zenurik: "≈", unairu: "Y", penjaga: "P", umbra: "U", universal: "O" };
export const POLARITY_NAME: Record<string, string> = { madurai: "Madurai", vazarin: "Vazarin", naramon: "Naramon", zenurik: "Zenurik", unairu: "Unairu", penjaga: "Penjaga", umbra: "Umbra", universal: "Any" };
export function Pol({ p }: { p: Polarity | string | undefined }) {
  const n = normPolarity(p);
  return <span className={`pol${n ? "" : " none"}`} title={n ? POLARITY_NAME[n] + " polarity" : "No polarity"}>{n ? GLYPH[n] : "·"}</span>;
}

export const SHARD_COLORS: Record<string, string> = {
  Azure: "#3b7fd1", Crimson: "#c0392b", Amber: "#d99a1e", Topaz: "#d9701e", Violet: "#8e44ad", Emerald: "#239a55",
};
